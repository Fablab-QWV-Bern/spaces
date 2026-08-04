import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { map } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { getConfig, updateConfig } from '../api/functions';
// Renamed so that the generated model does not shadow the global Error.
import { Config, Error as ApiError } from '../api/models';

interface ConfigFormValue {
  opensAt: string;
  closesAt: string;
  /** As a string, as everywhere in the form — that is what an `<input>` delivers. */
  maxBookingEndOffsetDays: string;
  timezone: string;
}

@Component({
  selector: 'app-config-form',
  imports: [FormField],
  templateUrl: './config-form.html',
  styleUrl: './config-form.scss',
})
export class ConfigForm {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  /** A brief confirmation: the view stays put, there is no list to return to. */
  protected readonly saved = signal(false);

  protected readonly model = signal<ConfigFormValue>({
    opensAt: '08:00',
    closesAt: '21:00',
    maxBookingEndOffsetDays: '30',
    timezone: 'Europe/Zurich',
  });

  /** As in the booking form: only required fields here, everything else in the backend. */
  protected readonly configForm = form(this.model, (path) => {
    required(path.opensAt, { message: 'Bitte eine Öffnungszeit angeben.' });
    required(path.closesAt, { message: 'Bitte eine Schlusszeit angeben.' });
    required(path.timezone, { message: 'Bitte eine Zeitzone wählen.' });
  });

  /**
   * The timezones come from the platform, not from a list we carry along — they
   * change, and the browser knows better than we do. The stored value goes first,
   * in case this runtime does not know it.
   */
  protected readonly timezones = computed(() => {
    const current = this.model().timezone;
    const known = Intl.supportedValuesOf?.('timeZone') ?? [];

    return known.includes(current) ? [...known] : [current, ...known];
  });

  /** The time grid is fixed at 15 minutes; in between there would be no column. */
  protected readonly offGrid = computed(() => {
    const { opensAt, closesAt } = this.model();

    return [opensAt, closesAt].some((time) => time !== '' && !/^\d{2}:(00|15|30|45)$/.test(time));
  });

  protected readonly wrongOrder = computed(() => {
    const { opensAt, closesAt } = this.model();

    // "HH:MM" can be compared as a string, both parts being two digits.
    return opensAt !== '' && closesAt !== '' && closesAt <= opensAt;
  });

  protected readonly canSubmit = computed(
    () => !this.saving() && this.configForm().valid() && !this.offGrid() && !this.wrongOrder(),
  );

  constructor() {
    getConfig(this.http, this.rootUrl)
      .pipe(map((r) => r.body))
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

  /** Any input makes the confirmation of the last save obsolete. */
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
