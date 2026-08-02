import { HttpClient } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { Workplace } from '../api/models';
import { CalendarStore } from '../calendar/calendar-store';
import { CalendarToolbar } from '../calendar/calendar-toolbar';
import { formatTime } from '../calendar/time-axis';
import { FIGURE_ID, Box, parseViewBox, placeCentered } from './map-geometry';
import { MapFigure } from './map-figure';
import { occupancyAt } from './occupancy';

/** Wie oft die Karte nachfragt, wer jetzt da ist. */
const REFRESH_MS = 60_000;

/** Wo der Grundriss liegt. Er wird als Datei ausgeliefert, siehe unten. */
const PLAN_URL = '/karte.svg';

/**
 * Die Übersichtskarte: der Grundriss der Werkstatt, und auf jedem belegten
 * Arbeitsplatz eine Figur. Ein Klick darauf zeigt dieselbe Detailkarte wie ein
 * Balken im Kalender.
 *
 * Anders als die Kalenderansichten kennt sie kein Datum — sie zeigt den
 * Augenblick und fragt ihn jede Minute neu nach. Deshalb trägt ihre Kopfleiste
 * kein Blättern und keine Datumswahl, nur den Weg zurück in den Kalender.
 *
 * Der Grundriss wird zur Laufzeit geholt und nicht mit übersetzt: er ist eine
 * ausgelieferte Datei, kein Quelltext. Wer die Werkstatt umstellt, tauscht
 * `public/karte.svg` und baut nichts neu — und die 300 kB des Plans belasten
 * nicht das Bündel jeder anderen Ansicht.
 *
 * Eingehängt wird er von Hand statt über `innerHTML`: Angulars Bereinigung
 * entfernt `id`-Attribute, und die sind hier der ganze Punkt — an ihnen hängt
 * die Zuordnung zu den Arbeitsplätzen.
 */
@Component({
  selector: 'app-map-view',
  imports: [CalendarToolbar, MapFigure],
  templateUrl: './map-view.html',
  styleUrl: './map-view.scss',
})
export class MapView {
  protected readonly store = inject(CalendarStore);
  private readonly http = inject(HttpClient);

  private readonly drawing = viewChild<ElementRef<HTMLElement>>('drawing');

  protected readonly now = signal(new Date());
  protected readonly planError = signal<string | null>(null);

  private readonly plan = signal<string | null>(null);
  private readonly geometry = signal<PlanGeometry | null>(null);

  /** Kein Signal: „schon eingehängt" ist kein Zustand der Ansicht, sondern die
   *  Bremse des Effekts. Als Signal läse er, was er selbst schreibt. */
  private mounted = false;

  constructor() {
    // Der Kalenderspeicher lädt einen Tag — heute. Damit stehen die Buchungen
    // bereit, aus denen sich der Augenblick ergibt.
    this.store.span.set('day');
    this.store.goToToday();

    this.http.get(PLAN_URL, { responseType: 'text' }).subscribe({
      next: (svg) => this.plan.set(svg),
      error: () => this.planError.set('Der Grundriss konnte nicht geladen werden.'),
    });

    // Über Mitternacht hinweg wechselt `goToToday` auch den geladenen Tag; ein
    // blosses `load()` bliebe am gestrigen hängen.
    const timer = setInterval(() => {
      this.now.set(new Date());
      this.store.goToToday();
    }, REFRESH_MS);

    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // Einhängen, sobald alle drei da sind: der Plan, sein Behälter und die
    // Arbeitsplätze — ohne letztere wüsste das Messen nicht, wonach es sucht.
    effect(() => {
      const plan = this.plan();
      const drawing = this.drawing()?.nativeElement;
      const workplaces = this.store.workplaces();

      if (this.mounted || !plan || !drawing || workplaces.length === 0) {
        return;
      }

      this.mounted = true;
      this.mountPlan(plan, drawing, workplaces);
    });
  }

  protected readonly heading = computed(() => `Jetzt, ${formatTime(this.now())} Uhr`);

  /** Das Seitenverhältnis des Plans, als blosse Zahl — `map-view.scss` rechnet damit. */
  protected readonly aspect = computed(() => {
    const geometry = this.geometry();

    return geometry ? geometry.viewBox.width / geometry.viewBox.height : null;
  });

  protected readonly figureBox = computed(() => this.geometry()?.figure ?? null);

  /**
   * Die Figuren: für jeden belegten Arbeitsplatz, der auf dem Plan vorkommt,
   * eine. Ein Arbeitsplatz ohne Element auf der Karte erscheint nicht, ein
   * Element ohne Arbeitsplatz bleibt, wie es gezeichnet ist — beides ist kein
   * Fehler, sondern der erwartete Zustand einer Karte, die von Hand entsteht.
   */
  protected readonly figures = computed(() => {
    const geometry = this.geometry();

    if (!geometry) {
      return [];
    }

    const occupancy = occupancyAt(
      {
        bookings: this.store.bookingsByWorkplace(),
        blockages: this.store.blockagesByWorkplace(),
        nameOf: this.store.nameOf(),
      },
      this.now(),
    );

    return [...occupancy]
      .filter(([workplaceId]) => geometry.boxes.has(workplaceId))
      .map(([workplaceId, details]) => ({
        workplaceId,
        details,
        placement: placeCentered(
          geometry.viewBox,
          geometry.boxes.get(workplaceId)!,
          geometry.figure,
        ),
      }));
  });

  /**
   * Hängt den Plan ein und misst ihn — einmal, sobald beides da ist.
   *
   * Gemessen wird am eingehängten Dokument und nicht am Quelltext: `getBBox()`
   * kennt Gruppen, Transformationen und Kurven, ein Ausrechnen aus den
   * Pfaddaten hiesse, den Renderer nachzubauen.
   */
  private mountPlan(svg: string, drawing: HTMLElement, workplaces: Workplace[]): void {
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;

    if (root.nodeName !== 'svg') {
      this.planError.set('Der Grundriss ist kein lesbares SVG.');

      return;
    }

    const plan = document.importNode(root, true) as unknown as SVGSVGElement;
    const viewBox = parseViewBox(plan.getAttribute('viewBox'));

    if (!viewBox) {
      this.planError.set('Dem Grundriss fehlt eine viewBox.');

      return;
    }

    drawing.replaceChildren(plan);

    const figure = plan.querySelector<SVGGraphicsElement>(`#${CSS.escape(FIGURE_ID)}`);

    if (!figure) {
      this.planError.set('Der Grundriss enthält keine Figur.');

      return;
    }

    const figureBox = boxOf(figure);
    const boxes = new Map<string, Box>();

    for (const workplace of workplaces) {
      const element = plan.querySelector<SVGGraphicsElement>(`#${CSS.escape(workplace.id)}`);

      if (element) {
        boxes.set(workplace.id, boxOf(element));
      }
    }

    // Die Vorlage wandert nach dem Messen in die `defs`: dort wird sie nicht
    // mehr gezeichnet, bleibt für `<use>` aber erreichbar. Ohne das stünde auf
    // dem Plan eine Figur ohne Arbeitsplatz herum. Erst messen, dann verstecken
    // — was nicht gezeichnet wird, hat auch keinen Kasten.
    defsOf(plan).append(figure);

    this.geometry.set({ viewBox, figure: figureBox, boxes });
  }
}

interface PlanGeometry {
  viewBox: Box;
  /** Der Kasten der Vorlage, aus der jede Figur entsteht. */
  figure: Box;
  /** Der Kasten je Arbeitsplatz, den der Plan zeigt. */
  boxes: Map<string, Box>;
}

function boxOf(element: SVGGraphicsElement): Box {
  const { x, y, width, height } = element.getBBox();

  return { x, y, width, height };
}

function defsOf(plan: SVGSVGElement): SVGDefsElement {
  const existing = plan.querySelector('defs');

  if (existing) {
    return existing;
  }

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  plan.prepend(defs);

  return defs;
}
