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
import { Router } from '@angular/router';

import { Workplace } from '../api/models';
import { BookingCard } from '../calendar/booking-card';
import { CalendarStore } from '../calendar/calendar-store';
import { CalendarToolbar } from '../calendar/calendar-toolbar';
import { SIGN_IN_NOTICE } from '../calendar/day-track';
import { GRID_MINUTES, formatTime, toLocalIso } from '../calendar/time-axis';
import { Icon } from '../shared/icon';
import { agendaFor } from './agenda';
import { Box, standingOn } from './map-geometry';
import { Occupancy, occupancyAt } from './occupancy';
import { OBSTACLE_LAYER_ID, PLAN_URL, WORKPLACE_LAYER_ID } from './plan';

/** How often the map asks again who is here now. */
const REFRESH_MS = 60_000;

/**
 * The figure's identifier in the plan. Part of the contract with the file, just
 * as the workplace identifiers are: the map brings one figure along, and we place
 * it as often as somebody is present.
 */
const FIGURE_ID = 'figur';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * The overview map: the floor plan of the workshop, with every workplace marked
 * according to whether somebody is at it. A click on one opens the same detail
 * card as a bar in the calendar.
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
 *
 * The state sits on the workplace's own shape as a class, so the marking is a
 * matter for `map-view.scss` and not for the code. On top of that comes the
 * figure, and it is the only thing here that needs arithmetic — one translation,
 * within the plan's own coordinate system, so nothing has to be recomputed when
 * the window changes size.
 */
@Component({
  selector: 'app-map-view',
  imports: [BookingCard, CalendarToolbar, Icon],
  templateUrl: './map-view.html',
  styleUrl: './map-view.scss',
})
export class MapView {
  protected readonly store = inject(CalendarStore);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  /** The surface the anchor's coordinates count from, and the box the floor plan
   *  is grafted into — two elements, because grafting replaces the children. */
  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('plan');
  private readonly drawing = viewChild.required<ElementRef<HTMLElement>>('drawing');

  private readonly card = viewChild.required('card', { read: ElementRef<HTMLElement> });

  protected readonly now = signal(new Date());
  protected readonly planError = signal<string | null>(null);

  /** The plan as fetched, and the same thing once it hangs in the document. */
  private readonly source = signal<string | null>(null);
  private readonly plan = signal<SVGSVGElement | null>(null);

  /** The workplace whose card is open — as an identifier rather than as a card,
   *  so that the open card follows the minutely refresh instead of freezing at
   *  the moment of the click. */
  private readonly selectedId = signal<string | null>(null);

  /** Where the card docks: the clicked shape's box, relative to the plan. An
   *  SVG shape cannot be an anchor itself — it generates no CSS box, so
   *  `anchor-name` is parsed there and ignored. */
  protected readonly anchor = signal<Anchor>({ left: 0, top: 0, width: 0, height: 0 });

  /** The figure's box, measured once while it was still drawn; null when the
   *  plan brings none along. */
  private readonly figureBox = signal<Box | null>(null);

  /** The layer the standing figures are hung into — the one the plan drew its
   *  figure in, moved to the top of the stack. Null while no plan is grafted or
   *  the plan brings no figure along. */
  private layer: Element | null = null;

  /** The figures currently standing, by workplace. Not a signal: they are not
   *  rendered but hung into the grafted tree, and this is only the note of what
   *  is already there. */
  private readonly figures = new Map<string, SVGUseElement>();

  constructor() {
    // The calendar store loads one day — today. That makes available the bookings
    // from which the present moment follows.
    this.store.span.set('day');
    this.store.goToToday();

    this.http.get(PLAN_URL, { responseType: 'text' }).subscribe({
      next: (svg) => this.source.set(svg),
      error: () => this.planError.set('Der Grundriss konnte nicht geladen werden.'),
    });

    // Across midnight `goToToday` also switches the loaded day; a bare `load()`
    // would stay stuck on yesterday's.
    const timer = setInterval(() => {
      this.now.set(new Date());
      this.store.goToToday();
    }, REFRESH_MS);

    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    effect(() => {
      const source = this.source();

      if (source && !this.plan()) {
        this.graft(source);
      }
    });

    // The marking, kept in step: it depends on the occupancy, and that changes
    // with every refresh. Written into the grafted tree rather than rendered,
    // because that tree does not belong to any template.
    effect(() => this.mark(this.plan(), this.occupancy()));
  }

  protected readonly heading = computed(() => `Jetzt, ${formatTime(this.now())} Uhr`);

  /** Whether the floor plan is hanging in the document. */
  protected readonly ready = computed(() => this.plan() !== null);

  /**
   * The day's remaining occupancy for the column beside the plan. Built from the
   * same bookings the map is coloured from, so the two cannot disagree.
   */
  protected readonly agenda = computed(() =>
    agendaFor(this.store.bookings(), this.store.nameOf(), this.now()),
  );

  /** Every area's colour, by area — the same value the calendar's blocks carry. */
  private readonly colorOfArea = computed(
    () => new Map(this.store.areas().map((area) => [area.id, area.color])),
  );

  /** Which workplaces are occupied or about to be, and by whom. */
  private readonly occupancy = computed(() =>
    occupancyAt(
      {
        bookings: this.store.bookingsByWorkplace(),
        blockages: this.store.blockagesByWorkplace(),
        nameOf: this.store.nameOf(),
      },
      this.now(),
    ),
  );

  private readonly selected = computed(() => {
    const id = this.selectedId();

    return id ? (this.store.workplaceById().get(id) ?? null) : null;
  });

  /** The card's content, or null while the selected workplace is free. */
  protected readonly details = computed(() => {
    const id = this.selectedId();

    return id ? (this.occupancy().get(id)?.details ?? null) : null;
  });

  /** The heading for that free case — the card then has no booking to name. */
  protected readonly freeHeading = computed(() => this.selected()?.name ?? null);

  /**
   * Why nothing can be created on the selected workplace — or null when the
   * button may appear.
   *
   * The booking horizon does not come up here: the map only ever shows today, and
   * today lies within every horizon. What remains is the state of the workplace
   * and the question of who is asking.
   */
  protected readonly notice = computed(() => {
    const workplace = this.selected();

    if (!workplace) {
      return null;
    }

    if (workplace.status !== 'OK') {
      return {
        DEFECT: 'Dieser Arbeitsplatz ist defekt.',
        DISABLED: 'Dieser Arbeitsplatz ist ausgeblendet.',
      }[workplace.status];
    }

    return null;
  });

  /**
   * A click anywhere on the plan. One listener for all workplaces rather than one
   * per shape — the event finds its way up by itself, and `popovertarget` was
   * never an option: that attribute exists on HTML buttons, not on SVG shapes.
   */
  protected onPick(event: Event): void {
    const shape = this.shapeUnder(event.target);

    if (shape) {
      this.select(shape.workplace, shape.element);
    }
  }

  /** SVG shapes are not buttons; Enter and Space have to be taken by hand. */
  protected onKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const shape = this.shapeUnder(event.target);

    if (shape) {
      // Otherwise Space scrolls the plan away underneath the card.
      event.preventDefault();
      this.select(shape.workplace, shape.element);
    }
  }

  protected createBooking(): void {
    const workplace = this.selected();

    if (!workplace) {
      return;
    }

    this.router.navigate(['/buchen'], {
      queryParams: {
        workplace: workplace.id,
        start: toLocalIso(currentSlot(this.now())),
        // Do not pass a duration: the form sets its own default.
      },
    });
  }

  private select(workplace: Workplace, element: SVGGraphicsElement): void {
    const plan = this.surface().nativeElement.getBoundingClientRect();
    const box = element.getBoundingClientRect();

    // Both rectangles are relative to the viewport, so their difference holds
    // however far the stage has been scrolled.
    this.anchor.set({
      left: box.left - plan.left,
      top: box.top - plan.top,
      width: box.width,
      height: box.height,
    });

    this.selectedId.set(workplace.id);

    const card = this.card().nativeElement;

    // A click beside the card has already dismissed it by the time we get here —
    // the guard is for the rare case where it has not, because showPopover()
    // throws on an already open popover.
    if (!card.matches(':popover-open')) {
      card.showPopover();
    }
  }

  /** The workplace the event started on — the shape itself or something drawn
   *  inside it. Everything else on the plan is scenery and stays silent. */
  private shapeUnder(
    target: EventTarget | null,
  ): { workplace: Workplace; element: SVGGraphicsElement } | null {
    const byId = this.store.workplaceById();

    for (let node = target as Element | null; node; node = node.parentElement) {
      const workplace = byId.get(node.id);

      if (workplace) {
        return { workplace, element: node as SVGGraphicsElement };
      }
    }

    return null;
  }

  private graft(source: string): void {
    const root = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;

    if (root.nodeName !== 'svg') {
      this.planError.set('Der Grundriss ist kein lesbares SVG.');

      return;
    }

    const plan = document.importNode(root, true) as unknown as SVGSVGElement;

    // The file carries width="100%" height="100%" — sensible for a document of
    // its own, useless in a box whose height it is supposed to determine. Without
    // them the viewBox alone decides the ratio and the stylesheet the width.
    plan.removeAttribute('width');
    plan.removeAttribute('height');

    this.drawing().nativeElement.replaceChildren(plan);
    this.stow(plan);
    this.plan.set(plan);
  }

  /**
   * Measures the figure the plan brings along, puts it away, and keeps the layer
   * it was drawn in as the place the standing figures go.
   *
   * Measure first, then stow: what is not drawn has no bounding box either. In
   * the `defs` it is no longer drawn but stays reachable for `<use>` — without
   * this it would go on standing at the one spot the designer parked it.
   *
   * The layer it leaves behind is empty afterwards and moves to the end of the
   * stack, because SVG knows no `z-index`: what is to be drawn over everything
   * else has to stand last in the document. In this plan that is where its
   * `#personen` already sits, so the move changes nothing — it only says that
   * the figures belong on top, whatever order the next file is saved in.
   *
   * A plan without a figure is not an error; then the marking on the shapes has
   * to carry the state on its own. That is the same tolerance the ids get: what
   * is on the plan is used, what is missing is missing.
   */
  private stow(plan: SVGSVGElement): void {
    const figure = plan.querySelector<SVGGraphicsElement>(`#${CSS.escape(FIGURE_ID)}`);

    if (!figure) {
      return;
    }

    this.figureBox.set(boxOf(figure));

    const layer = figure.parentElement;
    defsOf(plan).append(figure);

    if (layer) {
      layer.parentElement?.append(layer);
      this.layer = layer;
    }
  }

  /**
   * Sets the state on the workplace shapes: the area's colour, a class for the
   * marking, and the attributes that make a shape reachable by keyboard.
   *
   * The colour comes from the configuration and not from the file. The plan draws
   * its benches in colours of its own, but which area a bench belongs to is
   * decided in the admin area — and a colour that says something different there
   * from what it says in the calendar is worse than none at all. So the area's
   * colour is handed over as `--area-color` and the stylesheet paints with it,
   * over the one the designer set: whoever moves a bench into another area sees
   * it on the map without the plan having to be redrawn.
   *
   * A workplace with no shape on the plan is skipped, and a shape with no
   * workplace is greyed out — neither is an error, but the expected state of a map
   * that is drawn by hand. A workplace whose area is unknown keeps the drawn
   * colour rather than losing its fill.
   */
  private mark(plan: SVGSVGElement | null, occupancy: Map<string, Occupancy>): void {
    if (!plan) {
      return;
    }

    const colorOfArea = this.colorOfArea();

    this.greyStrays(plan);

    for (const workplace of this.store.workplaces()) {
      const element = plan.querySelector<SVGGraphicsElement>(`#${CSS.escape(workplace.id)}`);

      if (!element) {
        continue;
      }

      const color = colorOfArea.get(workplace.areaId);

      // The colour goes in as a variable, and the fill itself is set in the
      // stylesheet. There it can be reasoned about — a hover, a state, a defect
      // may reach the fill, which a paint written here would have shut out for
      // good. The class is what says the fill is ours: without a colour it stays
      // off, and the bench keeps the one the plan drew it in rather than losing
      // its fill to a variable nobody defined.
      element.classList.toggle('tinted', color !== undefined);

      if (color) {
        element.style.setProperty('--area-color', color);
      }

      const state = occupancy.get(workplace.id);

      // The mark that this shape is one of ours — the stylesheet hangs the
      // pointer and the outline off it, and so needs to know nothing about how
      // the plan groups its layers.
      element.classList.add('workplace');
      element.classList.toggle('busy', state?.state === 'busy');
      element.classList.toggle('soon-busy', state?.state === 'soon');

      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      element.setAttribute('aria-label', describe(workplace, state));

      this.stand(workplace.id, element, state);
    }
  }

  /**
   * Marks the benches the configuration does not know.
   *
   * They are drawn like the others — the four 3D printers where there are three,
   * a machine that stands in the room without being bookable — and in the plan's
   * colours they look like a workplace of some area. But nothing opens when they
   * are clicked and nobody is ever shown at them: a promise the map cannot keep.
   * So they take the colour of the Striebig and the saw and are read as what
   * they are, part of the room.
   *
   * That colour is taken from the plan and not from the palette. Two greys that
   * are nearly but not quite the same look like a mistake, and the drawing is
   * where this one is decided. Where the plan carries neither layer, the shapes
   * stay as they were drawn — the same tolerance the identifiers get.
   *
   * Ordering: this runs before the workplaces are marked, so a shape that arrives
   * in the configuration later loses the mark again in the same pass.
   */
  private greyStrays(plan: SVGSVGElement): void {
    const shapes = plan.querySelectorAll<SVGElement>(`#${CSS.escape(WORKPLACE_LAYER_ID)} > *`);
    const obstacle = plan.querySelector<SVGElement>(`#${CSS.escape(OBSTACLE_LAYER_ID)} > *`);

    if (!shapes.length || !obstacle) {
      return;
    }

    // Computed rather than read from the style attribute: how the plan writes its
    // fill — attribute, inline style, a rule of its own — is the drawing's
    // business, and the browser has already settled it by the time we ask. It is
    // read once and handed to the stylesheet as a variable; what marks a shape is
    // then a class, not a colour written onto it forty times over.
    plan.style.setProperty('--obstacle-fill', getComputedStyle(obstacle).fill);

    const known = this.store.workplaceById();

    for (const shape of shapes) {
      shape.classList.toggle('stray', !known.has(shape.id));
    }
  }

  /**
   * Puts a figure on the workplace, or takes it away again.
   *
   * Only where somebody is actually standing: not for what is merely coming, and
   * not for a blockage either — there the bench is unusable because somebody is
   * at another one. A figure there would place a person where none is. Both cases
   * keep their outline; only the figure is reserved for presence.
   *
   * The `<use>` goes into the figures' layer, on top of everything, and not
   * beside the shape it belongs to: beside it, the layers the plan draws
   * afterwards — the arrows and the workplace names — would run across the
   * figure, and a person half behind a label reads as a drawing error. What that
   * costs is a shared coordinate system: the shape is measured in its own layer
   * and placed in another, so the two have to be the same user space. In this
   * plan they are, because none of its layers carries a transform.
   */
  private stand(
    workplaceId: string,
    element: SVGGraphicsElement,
    state: Occupancy | undefined,
  ): void {
    const figure = this.figureBox();
    const wanted = figure !== null && state?.state === 'busy' && !state.details.isBlockage;
    const standing = this.figures.get(workplaceId);

    if (wanted && !standing && this.layer) {
      const use = document.createElementNS(SVG_NAMESPACE, 'use');

      use.setAttribute('href', `#${FIGURE_ID}`);
      use.setAttribute('transform', standingOn(boxOf(element), figure));
      this.layer.append(use);
      this.figures.set(workplaceId, use);
    } else if (!wanted && standing) {
      standing.remove();
      this.figures.delete(workplaceId);
    }
  }
}

/** Where the card docks, in pixels within the plan. */
interface Anchor {
  left: number;
  top: number;
  width: number;
  height: number;
}

function boxOf(element: SVGGraphicsElement): Box {
  const { x, y, width, height } = element.getBBox();

  return { x, y, width, height };
}

/** The plan brings no `defs` along, so one is put in front of it. */
function defsOf(plan: SVGSVGElement): SVGDefsElement {
  const existing = plan.querySelector('defs');

  if (existing) {
    return existing;
  }

  const defs = document.createElementNS(SVG_NAMESPACE, 'defs');
  plan.prepend(defs);

  return defs;
}

/** What a screen reader gets to hear instead of the colour. */
function describe(workplace: Workplace, state: Occupancy | undefined): string {
  if (!state) {
    return `${workplace.name}: frei`;
  }

  const when = state.state === 'busy' ? 'belegt' : 'bald belegt';

  return `${workplace.name}: ${when}, ${state.details.timeRange}, ${state.details.booking.name}`;
}

/**
 * The present moment on the calendar's quarter-hour grid, rounded down — the same
 * time a click on the day view would hand to the form. Downwards and not to the
 * nearest, so that the start never lies after the moment one meant.
 */
function currentSlot(now: Date): Date {
  const slot = new Date(now);
  slot.setMinutes(Math.floor(now.getMinutes() / GRID_MINUTES) * GRID_MINUTES, 0, 0);

  return slot;
}
