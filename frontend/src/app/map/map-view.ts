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

/** How often the map asks again who is here now. */
const REFRESH_MS = 60_000;

/** Where the floor plan lives. It is shipped as a file, see below. */
const PLAN_URL = '/karte.svg';

/**
 * The overview map: the floor plan of the workshop, with a figure on every
 * occupied workplace. Clicking one shows the same detail card as a bar in the
 * calendar.
 *
 * Unlike the calendar views it knows no date — it shows the present moment and
 * asks for it afresh every minute. That is why its header carries no paging and
 * no date picker, only the way back into the calendar.
 *
 * The floor plan is fetched at runtime and not compiled in: it is a shipped file,
 * not source code. Rearranging the workshop means swapping `public/karte.svg` and
 * rebuilding nothing — and the plan's 300 kB do not burden the bundle of every
 * other view.
 *
 * It is grafted in by hand rather than via `innerHTML`: Angular's sanitisation
 * strips `id` attributes, and those are the whole point here — the mapping to the
 * workplaces hangs off them.
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

  /** Not a signal: "already grafted in" is not a state of the view but the
   *  effect's brake. As a signal it would read what it writes itself. */
  private mounted = false;

  constructor() {
    // The calendar store loads one day — today. That makes available the bookings
    // from which the present moment follows.
    this.store.span.set('day');
    this.store.goToToday();

    this.http.get(PLAN_URL, { responseType: 'text' }).subscribe({
      next: (svg) => this.plan.set(svg),
      error: () => this.planError.set('Der Grundriss konnte nicht geladen werden.'),
    });

    // Across midnight `goToToday` also switches the loaded day; a bare `load()`
    // would stay stuck on yesterday's.
    const timer = setInterval(() => {
      this.now.set(new Date());
      this.store.goToToday();
    }, REFRESH_MS);

    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // Graft it in as soon as all three are there: the plan, its container and the
    // workplaces — without the last, the measuring would not know what to look
    // for.
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

  /** The plan's aspect ratio, as a bare number — `map-view.scss` computes with it. */
  protected readonly aspect = computed(() => {
    const geometry = this.geometry();

    return geometry ? geometry.viewBox.width / geometry.viewBox.height : null;
  });

  protected readonly figureBox = computed(() => this.geometry()?.figure ?? null);

  /**
   * The figures: one for every occupied workplace that appears on the plan. A
   * workplace with no element on the map does not appear, and an element with no
   * workplace stays as it is drawn — neither is an error, but the expected state
   * of a map that is produced by hand.
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
   * Grafts the plan in and measures it — once, as soon as both are there.
   *
   * Measuring happens on the grafted document rather than on the source text:
   * `getBBox()` knows about groups, transforms and curves, whereas computing from
   * the path data would mean reimplementing the renderer.
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

    // After measuring, the template moves into the `defs`: there it is no longer
    // drawn but stays reachable for `<use>`. Without this a figure with no
    // workplace would stand around on the plan. Measure first, then hide — what is
    // not drawn has no bounding box either.
    defsOf(plan).append(figure);

    this.geometry.set({ viewBox, figure: figureBox, boxes });
  }
}

interface PlanGeometry {
  viewBox: Box;
  /** The box of the template every figure is made from. */
  figure: Box;
  /** The box for each workplace the plan shows. */
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
