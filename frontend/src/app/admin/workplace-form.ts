import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import {
  createWorkplace,
  deleteWorkplacePhoto,
  getWorkplace,
  listAreas,
  listWorkplaces,
  updateWorkplace,
  uploadWorkplacePhoto,
} from '../api/functions';
// Renamed so that the generated model does not shadow the global Error.
import { Area, Error as ApiError, Workplace, WorkplaceCreate } from '../api/models';
import { formatDuration } from '../calendar/time-axis';
import { refinePageTitle } from '../shared/page-title';
import { TagInput } from './tag-input';

/** The limit is in the spec too — here only to warn early and clearly. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

interface WorkplaceFormValue {
  id: string;
  name: string;
  areaId: string;
  status: 'OK' | 'DEFECT' | 'DISABLED';
  location: string;
  description: string;
  usageRules: string;
  wikiUrl: string;
  /** Separate from the value so that "the area's value applies" is checkable. */
  useAreaDuration: boolean;
  maxBookingDurationMinutes: string;
  sortOrder: string;
}

@Component({
  selector: 'app-workplace-form',
  imports: [FormField, TagInput],
  templateUrl: './workplace-form.html',
  styleUrl: './workplace-form.scss',
})
export class WorkplaceForm {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Set when an existing workplace is being edited. */
  protected readonly editing = signal<Workplace | null>(null);

  protected readonly areas = signal<Area[]>([]);
  protected readonly others = signal<Workplace[]>([]);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  /**
   * The blocked workplaces live beside the form model: a list of checkboxes is
   * easier to carry as a set than as a field.
   */
  protected readonly blockedIds = signal<string[]>([]);

  /** Likewise the two tag lists — `app-tag-input` carries them as a field. */
  protected readonly tags = signal<string[]>([]);
  protected readonly blocksWithTag = signal<string[]>([]);

  /**
   * All tags assigned anywhere so far, for the completion. From both lists: what
   * one workplace carries, another blocks, and vice versa.
   */
  protected readonly knownTags = computed(() => {
    const seen = new Map<string, string>();
    const workplaces = [...this.others(), ...(this.editing() ? [this.editing()!] : [])];

    for (const workplace of workplaces) {
      for (const tag of [...workplace.tags, ...workplace.blocksWorkplacesWithTag]) {
        // The first spelling wins, as it does when saving in the backend.
        seen.set(tag.toLowerCase(), seen.get(tag.toLowerCase()) ?? tag);
      }
    }

    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'de-CH'));
  });

  // --- Photo ----------------------------------------------------------------

  /** The selected file, not yet uploaded. */
  protected readonly pickedFile = signal<File | null>(null);
  protected readonly photoError = signal<string | null>(null);

  /** Preview of the selected file, otherwise the stored photo. */
  protected readonly photoPreview = computed(() => {
    const file = this.pickedFile();

    return file ? URL.createObjectURL(file) : (this.editing()?.photoUrl ?? null);
  });

  protected readonly model = signal<WorkplaceFormValue>({
    id: '',
    name: '',
    areaId: '',
    status: 'OK',
    location: '',
    description: '',
    usageRules: '',
    wikiUrl: '',
    useAreaDuration: true,
    maxBookingDurationMinutes: '240',
    sortOrder: '0',
  });

  /** As in the booking form: only required fields here, everything else in the backend. */
  protected readonly workplaceForm = form(this.model, (path) => {
    required(path.name, { message: 'Bitte einen Namen angeben.' });
    required(path.areaId, { message: 'Bitte einen Bereich wählen.' });
  });

  protected readonly canSubmit = computed(
    () => !this.saving() && this.workplaceForm().valid() && this.idValue() !== '',
  );

  /** The typed identifier when creating, the existing one when editing. */
  protected readonly idValue = computed(() => this.editing()?.id ?? this.model().id.trim());

  /** The identifier has to fit into a URL and into an SVG. */
  protected readonly idLooksWrong = computed(() => {
    const id = this.model().id.trim();

    return id !== '' && !/^[a-z0-9][a-z0-9-]*$/.test(id);
  });

  protected readonly durationLabel = computed(() => {
    const minutes = Number(this.model().maxBookingDurationMinutes);

    return Number.isFinite(minutes) && minutes >= 15 ? formatDuration(minutes) : '';
  });

  /** What the selected area dictates — otherwise the checkbox would be a black box. */
  protected readonly areaDurationLabel = computed(() => {
    const area = this.areas().find((candidate) => candidate.id === this.model().areaId);

    return area ? formatDuration(area.maxBookingDurationMinutes) : '';
  });

  constructor() {
    // The name first: which workplace is being edited is the real information in
    // the tab. When creating there is none, and then the route's title stays.
    refinePageTitle(() => {
      const editing = this.editing();

      return editing ? `Arbeitsplatz ${editing.name} bearbeiten` : null;
    });

    const id = this.route.snapshot.paramMap.get('id');

    forkJoin({
      areas: listAreas(this.http, this.rootUrl).pipe(map((r) => r.body)),
      workplaces: listWorkplaces(this.http, this.rootUrl, { includeDisabled: true }).pipe(
        map((r) => r.body),
      ),
      workplace: id
        ? getWorkplace(this.http, this.rootUrl, { id }).pipe(map((r) => r.body))
        : of(null),
    }).subscribe({
      next: ({ areas, workplaces, workplace }) => {
        this.areas.set(areas);
        this.others.set(workplaces.filter((other) => other.id !== id));

        if (workplace) {
          this.editing.set(workplace);
          this.model.set(toFormValue(workplace));
          this.blockedIds.set(workplace.blocksWorkplaceIds);
          this.tags.set(workplace.tags);
          this.blocksWithTag.set(workplace.blocksWorkplacesWithTag);
        } else {
          this.model.update((value) => ({ ...value, areaId: areas[0]?.id ?? '' }));
        }

        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Der Arbeitsplatz liess sich nicht laden.');
        this.loading.set(false);
      },
    });
  }

  /** The workplaces to choose from, grouped by area as in the calendar. */
  protected readonly blockChoices = computed(() => {
    const byArea = new Map<string, Workplace[]>();

    for (const workplace of this.others()) {
      const list = byArea.get(workplace.areaId) ?? [];
      list.push(workplace);
      byArea.set(workplace.areaId, list);
    }

    return this.areas()
      .map((area) => ({ area, workplaces: byArea.get(area.id) ?? [] }))
      .filter((group) => group.workplaces.length > 0);
  });

  protected blocks(workplaceId: string): boolean {
    return this.blockedIds().includes(workplaceId);
  }

  protected toggleBlock(workplaceId: string, blocked: boolean): void {
    this.blockedIds.update((ids) =>
      blocked ? [...ids, workplaceId] : ids.filter((id) => id !== workplaceId),
    );
  }

  /**
   * Suggests an identifier while the name is typed — but only for as long as it
   * has not been touched by hand.
   */
  protected onNameInput(): void {
    if (this.editing() || this.idTouched) {
      return;
    }

    this.model.update((value) => ({ ...value, id: slug(value.name) }));
  }

  protected onIdInput(): void {
    this.idTouched = true;
  }

  private idTouched = false;

  // --- Photo ----------------------------------------------------------------

  protected onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.photoError.set(null);

    if (file && file.size > MAX_PHOTO_BYTES) {
      this.photoError.set('Das Bild ist grösser als 5 MB.');
      input.value = '';

      return;
    }

    this.pickedFile.set(file);
  }

  protected clearPick(): void {
    this.pickedFile.set(null);
    this.photoError.set(null);
  }

  protected removePhoto(): void {
    const workplace = this.editing();

    if (!workplace || !confirm('Das Foto wirklich entfernen?')) {
      return;
    }

    deleteWorkplacePhoto(this.http, this.rootUrl, { id: workplace.id }).subscribe({
      next: () => {
        this.pickedFile.set(null);
        this.editing.set({ ...workplace, photoUrl: null, photoThumbnailUrl: null });
      },
      error: () => this.photoError.set('Das Foto liess sich nicht entfernen.'),
    });
  }

  // --- Saving ---------------------------------------------------------------

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }

    const workplace = this.editing();
    const body = toWrite(this.model(), this.idValue(), {
      blocksWorkplaceIds: this.blockedIds(),
      tags: this.tags(),
      blocksWorkplacesWithTag: this.blocksWithTag(),
    });

    this.saving.set(true);
    this.saveError.set(null);

    const saved: Observable<Workplace> = workplace
      ? updateWorkplace(this.http, this.rootUrl, { id: workplace.id, body }).pipe(
          map((r) => r.body),
        )
      : createWorkplace(this.http, this.rootUrl, { body }).pipe(map((r) => r.body));

    // The photo follows as a separate request — when creating, there is only an
    // identifier to attach it to after the save.
    saved.pipe(switchMap((stored) => this.uploadPicked(stored))).subscribe({
      next: () => this.router.navigate(['/verwaltung/arbeitsplaetze']),
      error: (response: HttpErrorResponse) => {
        this.saving.set(false);
        this.saveError.set(
          (response.error as ApiError | null)?.message ?? 'Speichern fehlgeschlagen.',
        );
      },
    });
  }

  private uploadPicked(workplace: Workplace): Observable<unknown> {
    const file = this.pickedFile();

    return file
      ? uploadWorkplacePhoto(this.http, this.rootUrl, {
          id: workplace.id,
          body: { file },
        })
      : of(workplace);
  }

  protected cancel(): void {
    this.router.navigate(['/verwaltung/arbeitsplaetze']);
  }
}

function toFormValue(workplace: Workplace): WorkplaceFormValue {
  return {
    id: workplace.id,
    name: workplace.name,
    areaId: workplace.areaId,
    status: workplace.status,
    location: workplace.location ?? '',
    description: workplace.description ?? '',
    usageRules: workplace.usageRules ?? '',
    wikiUrl: workplace.wikiUrl ?? '',
    useAreaDuration: workplace.maxBookingDurationMinutes == null,
    maxBookingDurationMinutes: String(workplace.maxBookingDurationMinutes ?? 240),
    sortOrder: String(workplace.sortOrder),
  };
}

/** @param lists The list fields carried beside the form model. */
function toWrite(
  value: WorkplaceFormValue,
  id: string,
  lists: Pick<WorkplaceCreate, 'blocksWorkplaceIds' | 'tags' | 'blocksWorkplacesWithTag'>,
): WorkplaceCreate {
  return {
    ...lists,
    id,
    name: value.name.trim(),
    areaId: value.areaId,
    status: value.status,
    location: value.location.trim(),
    description: value.description.trim(),
    usageRules: value.usageRules.trim() === '' ? null : value.usageRules.trim(),
    wikiUrl: value.wikiUrl.trim() === '' ? null : value.wikiUrl.trim(),
    maxBookingDurationMinutes: value.useAreaDuration
      ? null
      : Number(value.maxBookingDurationMinutes),
    sortOrder: Number(value.sortOrder),
  };
}

/** "Hobelbank 1 (UG)" → "hobelbank-1-ug" */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      // The accents separated out by NFD.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}
