import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';

import { ApiConfiguration } from '../api/api-configuration';
import { deleteFloorPlan, listWorkplaces, uploadFloorPlan } from '../api/functions';
// Renamed so that the generated model does not shadow the global Error.
import { Error as ApiError, FloorPlan, Workplace } from '../api/models';
import { PlanSource } from '../map/plan-source';
import { PlanMatch, matchPlan } from './plan-match';

/** The spec's limit, repeated here only to say no early and clearly. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * The floor plan in the admin area: which one is in use, replacing it, and what
 * it and the configuration have to say to each other.
 *
 * The plan used to be a shipped file and nothing else — rearranging the workshop
 * meant a commit and a deployment. It still ships with the interface, and that
 * stays the fallback, but an uploaded one takes precedence.
 *
 * The comparison is the actual reason for this page. The map cannot report what
 * it does not find: a workplace nobody drew is simply absent from it, and a
 * bench the configuration does not know sits there as an obstacle — both look
 * like a decision rather than an oversight. Here they are named, for the plan in
 * use and, before saving, for the one about to replace it: whoever swaps the
 * file sees what it will cost before it costs it.
 */
@Component({
  selector: 'app-map-admin',
  templateUrl: './map-admin.html',
  styleUrl: './map-admin.scss',
})
export class MapAdmin {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;
  private readonly plans = inject(PlanSource);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected readonly plan = signal<FloorPlan | null>(null);
  private readonly workplaces = signal<Workplace[]>([]);

  /** The plan in use, as text — the drawing is compared, not the URL. */
  private readonly source = signal<string | null>(null);

  /** The picked file and its text, before anything is uploaded. */
  protected readonly picked = signal<File | null>(null);
  private readonly pickedSource = signal<string | null>(null);

  constructor() {
    this.load();
  }

  /** How the plan in use and the configuration stand to each other. */
  protected readonly match = computed(() => this.matchOf(this.source()));

  /** The same for the picked file — the report before the save. */
  protected readonly pickedMatch = computed(() => this.matchOf(this.pickedSource()));

  /**
   * The moment when a picked file is worth a warning: it draws nothing this
   * configuration knows. Then either the layer is missing or its shapes carry
   * other names — in both cases the map would come out empty, and that is worth
   * seeing before the upload rather than after it.
   */
  protected readonly pickedIsBlank = computed(() => {
    const match = this.pickedMatch();

    return match !== null && match.matched.length === 0;
  });

  protected readonly canUpload = computed(() => !this.saving() && this.picked() !== null);

  /** When the plan in use was stored, in the workshop's own notation. */
  protected readonly storedAt = computed(() => {
    const at = this.plan()?.updatedAt;

    return at
      ? new Date(at).toLocaleString('de-CH', { dateStyle: 'long', timeStyle: 'short' })
      : null;
  });

  protected onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.saveError.set(null);
    this.saved.set(false);
    this.pickedSource.set(null);

    if (file && file.size > MAX_BYTES) {
      this.saveError.set('Die Datei ist grösser als 5 MB.');
      input.value = '';
      this.picked.set(null);

      return;
    }

    this.picked.set(file);

    // Read here rather than on upload: the report below is the point of picking
    // a file at all, and it needs the drawing, not the file handle.
    file?.text().then((text) => this.pickedSource.set(text));
  }

  protected clearPick(): void {
    this.picked.set(null);
    this.pickedSource.set(null);
    this.saveError.set(null);
  }

  protected upload(): void {
    const file = this.picked();

    if (!file || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    uploadFloorPlan(this.http, this.rootUrl, { body: { file } }).subscribe({
      next: (response) => this.adopt(response.body),
      error: (response: HttpErrorResponse) => this.failed(response),
    });
  }

  protected reset(): void {
    if (this.saving() || !confirm('Wieder den mitgelieferten Plan verwenden?')) {
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    deleteFloorPlan(this.http, this.rootUrl).subscribe({
      next: (response) => this.adopt(response.body),
      error: (response: HttpErrorResponse) => this.failed(response),
    });
  }

  private matchOf(source: string | null): PlanMatch | null {
    return source === null ? null : matchPlan(source, this.workplaces());
  }

  /** After a save: the stored plan is the one in use, everywhere. */
  private adopt(plan: FloorPlan): void {
    this.plan.set(plan);
    this.saving.set(false);
    this.saved.set(true);
    this.clearPick();

    // The map and the area form hold the old drawing; without this they would
    // go on showing it for as long as the tab stays open.
    this.plans.refresh();
    this.readSource();
  }

  private failed(response: HttpErrorResponse): void {
    this.saving.set(false);
    this.saveError.set((response.error as ApiError | null)?.message ?? 'Speichern fehlgeschlagen.');
  }

  private load(): void {
    // Through `PlanSource` and not through the API directly, so that the page
    // asks the same question the map asks — once, and answered from the same
    // place. Two calls here would be one request too many and, after an upload,
    // one chance to disagree.
    this.plans.plan().subscribe({
      next: (plan) => {
        this.plan.set(plan);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Die Karte liess sich nicht laden.');
        this.loading.set(false);
      },
    });

    listWorkplaces(this.http, this.rootUrl, {}).subscribe({
      next: (response) => this.workplaces.set(response.body),
      error: () => this.loadError.set('Die Arbeitsplätze liessen sich nicht laden.'),
    });

    this.readSource();
  }

  /** A plan that will not load costs the comparison and nothing else. */
  private readSource(): void {
    this.source.set(null);
    this.plans.read().subscribe({
      next: (text) => this.source.set(text),
      error: () => this.source.set(null),
    });
  }
}
