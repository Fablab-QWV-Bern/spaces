import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { map, of, switchMap } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { getConfig, updateConfig } from '../api/functions';
// Umbenannt, damit das generierte Modell das globale Error nicht verdeckt.
import { Config, Error as ApiError } from '../api/models';
import { SessionService } from '../shared/session-service';
import { AdminHeader } from './admin-header';

interface ConfigFormValue {
  opensAt: string;
  closesAt: string;
  /** Wie überall im Formular als String — das liefert ein `<input>`. */
  maxBookingEndOffsetDays: string;
  timezone: string;
}

@Component({
  selector: 'app-config-form',
  imports: [AdminHeader, FormField],
  templateUrl: './config-form.html',
  styleUrl: './config-form.scss',
})
export class ConfigForm {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;
  protected readonly session = inject(SessionService);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  /** Kurze Bestätigung: die Ansicht bleibt stehen, es gibt keine Liste zurück. */
  protected readonly saved = signal(false);

  protected readonly model = signal<ConfigFormValue>({
    opensAt: '08:00',
    closesAt: '21:00',
    maxBookingEndOffsetDays: '30',
    timezone: 'Europe/Zurich',
  });

  /** Wie im Buchungsformular: nur Pflichtfelder hier, alles Weitere im Backend. */
  protected readonly configForm = form(this.model, (path) => {
    required(path.opensAt, { message: 'Bitte eine Öffnungszeit angeben.' });
    required(path.closesAt, { message: 'Bitte eine Schlusszeit angeben.' });
    required(path.timezone, { message: 'Bitte eine Zeitzone wählen.' });
  });

  /**
   * Die Zeitzonen kommen von der Plattform, nicht aus einer mitgeführten Liste —
   * sie ändern sich, und der Browser weiss es besser als wir. Der gespeicherte
   * Wert steht vorne, falls ihn diese Laufzeit nicht kennt.
   */
  protected readonly timezones = computed(() => {
    const current = this.model().timezone;
    const known = Intl.supportedValuesOf?.('timeZone') ?? [];

    return known.includes(current) ? [...known] : [current, ...known];
  });

  /** Das Zeitraster ist fix 15 Minuten; dazwischen gäbe es keine Spalte. */
  protected readonly offGrid = computed(() => {
    const { opensAt, closesAt } = this.model();

    return [opensAt, closesAt].some((time) => time !== '' && !/^\d{2}:(00|15|30|45)$/.test(time));
  });

  protected readonly wrongOrder = computed(() => {
    const { opensAt, closesAt } = this.model();

    // "HH:MM" lässt sich als Zeichenkette vergleichen, beide sind zweistellig.
    return opensAt !== '' && closesAt !== '' && closesAt <= opensAt;
  });

  protected readonly canSubmit = computed(
    () => !this.saving() && this.configForm().valid() && !this.offGrid() && !this.wrongOrder(),
  );

  constructor() {
    // Lesen darf die Konfiguration jeder; ob sie sich ändern lässt, entscheidet
    // die Sitzung.
    this.session
      .load()
      .pipe(switchMap(() => getConfig(this.http, this.rootUrl).pipe(map((r) => r.body))))
      .subscribe({
        next: (config) => {
          this.model.set(toFormValue(config));
          this.loading.set(false);
        },
        error: () => {
          this.loadError.set('Die Konfiguration liess sich nicht laden.');
          this.loading.set(false);
        },
      });
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    this.saved.set(false);

    updateConfig(this.http, this.rootUrl, { body: toWrite(this.model()) }).subscribe({
      next: (response) => {
        this.model.set(toFormValue(response.body));
        this.saving.set(false);
        this.saved.set(true);
      },
      error: (response: HttpErrorResponse) => {
        this.saving.set(false);
        this.saveError.set(
          (response.error as ApiError | null)?.message ?? 'Speichern fehlgeschlagen.',
        );
      },
    });
  }

  /** Jede Eingabe macht die Bestätigung des letzten Speicherns hinfällig. */
  protected touched(): void {
    this.saved.set(false);
  }
}

function toFormValue(config: Config): ConfigFormValue {
  return {
    opensAt: config.opensAt,
    closesAt: config.closesAt,
    maxBookingEndOffsetDays: String(config.maxBookingEndOffsetDays),
    timezone: config.timezone,
  };
}

function toWrite(value: ConfigFormValue): Config {
  return {
    opensAt: value.opensAt,
    closesAt: value.closesAt,
    maxBookingEndOffsetDays: Number(value.maxBookingEndOffsetDays),
    timezone: value.timezone,
  };
}
