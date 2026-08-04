import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { refinePageTitle } from '../shared/page-title';
import { Block, blocksFor } from './blocks';
import { leadTimeNotice } from './booking-horizon';
import { CalendarStore, IsoDate, isoDate } from './calendar-store';
import { CalendarToolbar } from './calendar-toolbar';
import { syncDateWithUrl } from './date-in-url';
import { DayTrack, SIGN_IN_NOTICE } from './day-track';
import { HourHeader } from './hour-header';
import { DEFAULT_DURATION_MINUTES, instantAt, percentOfAxis, toLocalIso } from './time-axis';

/** Eine Tageszeile des Monats, fertig beschriftet. */
interface DayRow {
  date: IsoDate;
  /** "Mo., 27. Juli" */
  label: string;
  isWeekend: boolean;
  isToday: boolean;
}

/**
 * Der Kalender eines einzelnen Arbeitsplatzes: ein Monat, ein Tag je Zeile.
 *
 * Gegenüber der Tagesansicht sind nur die Achsen vertauscht — dort steht ein
 * Tag über allen Arbeitsplätzen, hier ein Arbeitsplatz über allen Tagen des
 * Monats. Die Zellen sind dieselben `app-day-track` mit demselben Massstab,
 * darum wird hier auch gebucht wie im Tag.
 *
 * Eine Zoomstufe gibt es nicht: die Ansicht *ist* der Monat. Hierher führt der
 * Name in einer Arbeitsplatzzeile, zurück der Knopf "Alle Arbeitsplätze" in der
 * Kopfleiste. Der Arbeitsplatz steht in der Adresszeile, von wo ihn diese
 * Ansicht liest — die Adresse ist die einzige Quelle, sonst gäbe es zwei, die
 * auseinanderlaufen könnten.
 */
@Component({
  selector: 'app-workplace-calendar',
  imports: [CalendarToolbar, DayTrack, HourHeader],
  templateUrl: './workplace-calendar.html',
  styleUrl: './workplace-calendar.scss',
})
export class WorkplaceCalendar {
  protected readonly store = inject(CalendarStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly now = signal(new Date());

  /** Länge der Vorschau unter dem Zeiger — wie in der Tagesansicht. */
  protected readonly previewMinutes = DEFAULT_DURATION_MINUTES;

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly workplaceId = computed(() => this.queryParams().get('arbeitsplatz'));

  constructor() {
    this.store.span.set('month');
    syncDateWithUrl();
    this.store.load();

    // Ohne Arbeitsplatz bliebe vom Titel nur der Monat übrig — der sähe im
    // Reiter aus wie eine Monatsansicht, die es nicht gibt. Dann lieber der
    // Titel der Route.
    refinePageTitle(() => (this.selection() ? this.heading() : null));

    setInterval(() => this.now.set(new Date()), 60_000);
  }

  /**
   * "Werkbank / Juli 2026". Der Name steht in der Überschrift, weil ihn sonst
   * nichts mehr nennt: hierher führt der Klick auf eine Arbeitsplatzzeile.
   * Solange keiner feststeht, bleibt der Monat allein stehen.
   */
  protected readonly heading = computed(() => {
    const month = new Date(`${this.store.date()}T12:00:00`).toLocaleDateString('de-CH', {
      month: 'long',
      year: 'numeric',
    });

    const selection = this.selection();

    return selection ? `${selection.workplace.name} / ${month}` : month;
  });

  protected readonly days = computed<DayRow[]>(() => {
    const today = isoDate(this.now());

    return this.store.days().map((date) => {
      const day = new Date(`${date}T12:00:00`);

      return {
        date,
        label: day.toLocaleDateString('de-CH', {
          weekday: 'short',
          day: 'numeric',
          month: 'long',
        }),
        isWeekend: day.getDay() === 0 || day.getDay() === 6,
        isToday: date === today,
      };
    });
  });

  /**
   * Der gewählte Arbeitsplatz samt seinem Bereich, oder null solange keiner
   * gewählt ist bzw. die Kennung zu keinem passt.
   */
  protected readonly selection = computed(() => {
    const workplaceId = this.workplaceId();

    for (const group of this.store.rows()) {
      const workplace = group.workplaces.find((candidate) => candidate.id === workplaceId);

      if (workplace) {
        return { workplace, area: group.area };
      }
    }

    return null;
  });

  /** Die Balken je Tag, einmal berechnet — wie in den anderen Zoomstufen. */
  private readonly blocksByDay = computed(() => {
    const axis = this.store.axis();
    const selection = this.selection();
    const map = new Map<IsoDate, Block[]>();

    if (!axis || !selection) {
      return map;
    }

    const { workplace, area } = selection;
    const nameOf = this.store.nameOf();
    const bookings = this.store.bookingsByWorkplace().get(workplace.id) ?? [];
    const blockages = this.store.blockagesByWorkplace().get(workplace.id) ?? [];

    for (const date of this.store.days()) {
      const context = {
        axis,
        day: new Date(`${date}T12:00:00`),
        workplaceName: workplace.name,
        color: area.color,
        nameOf,
      };

      map.set(date, blocksFor(context, bookings, blockages));
    }

    return map;
  });

  protected blocks(date: IsoDate): Block[] {
    return this.blocksByDay().get(date) ?? [];
  }

  /**
   * Die Lage der Jetzt-Linie auf der Achse. Gezeichnet wird sie nur in der
   * Zeile des heutigen Tages — die anderen Zeilen sind andere Tage.
   */
  protected readonly nowPercent = computed<number | null>(() => {
    const axis = this.store.axis();
    const now = this.now();

    return axis ? percentOfAxis(axis, now.getHours() * 60 + now.getMinutes()) : null;
  });

  protected readonly isBookable = computed(() => {
    const selection = this.selection();

    return selection?.workplace.status === 'OK' && this.store.canManageBookings();
  });

  /**
   * Der Hinweis je Tag, der noch jenseits des Vorlaufs liegt — sonst null.
   *
   * Anders als in der Tagesansicht steht hier ein Monat untereinander, der
   * Hinweis nennt also je Zeile ein anderes Datum. Die Sätze entstehen einmal
   * und nicht bei jedem Abgleich, sonst sähe die Bindung im Template über
   * einunddreissig Zeilen hinweg immer neue Zeichenketten.
   */
  private readonly noticeByDay = computed(() => {
    const config = this.store.config();
    const selection = this.selection();
    const map = new Map<IsoDate, string | null>();

    if (!config || !selection || !this.isBookable()) {
      return map;
    }

    const unrestricted = this.store.noTimeRestrictions();

    for (const date of this.store.days()) {
      map.set(date, leadTimeNotice(config, selection.area, unrestricted, date));
    }

    return map;
  });

  /**
   * Warum ein Klick in dieser Zeile nichts anlegt — wie in der Tagesansicht.
   *
   * Die anonyme Rolle sieht statt des Vorlaufs die Anmeldung: ab wann dieser
   * Tag freigäbe, hilft niemandem, der zuerst ein Kennwort braucht. Genannt
   * wird sie nur an einem Arbeitsplatz mit Status OK — sonst wäre sie ein
   * Versprechen, das die Anmeldung nicht einlöst.
   */
  protected notice(date: IsoDate): string | null {
    if (this.selection()?.workplace.status !== 'OK') {
      return null;
    }

    if (this.store.isAnonymous()) {
      return SIGN_IN_NOTICE;
    }

    return this.noticeByDay().get(date) ?? null;
  }

  protected clickable(date: IsoDate): boolean {
    return this.isBookable() && this.notice(date) === null;
  }

  protected onSlotClick(date: IsoDate, minutes: number): void {
    const selection = this.selection();

    if (!selection) {
      return;
    }

    void this.router.navigate(['/buchen'], {
      queryParams: {
        workplace: selection.workplace.id,
        start: toLocalIso(instantAt(date, minutes)),
      },
    });
  }

  protected onDateChange(value: string): void {
    this.store.date.set(value);
    this.store.load();
  }
}
