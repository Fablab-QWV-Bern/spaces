import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay, switchMap } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { getFloorPlan } from '../api/functions';
import { FloorPlan } from '../api/models';

/**
 * Hands out the floor plan as text, to whoever needs to read it.
 *
 * Two questions, in this order: where does the plan lie, and what is in it. The
 * first is the API's to answer now that the plan can be replaced — an uploaded
 * one lies on the storage disk, and only until somebody uploads one is it the
 * file shipped with the interface. Nobody asking for the drawing should have to
 * know that, so the two requests are one call here.
 *
 * The answer is shared: the map reads the plan, the area form reads the colours
 * out of it, the admin area holds its identifiers against the configuration —
 * three readers, 300 kB, one request. `refresh()` is what an upload calls;
 * without it the page would go on handing out the plan that was just replaced.
 */
@Injectable({ providedIn: 'root' })
export class PlanSource {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;

  private cachedPlan: Observable<FloorPlan> | null = null;
  private cachedText: Observable<string> | null = null;

  /** Which plan is in use — the admin area shows it, the rest only follows it. */
  plan(): Observable<FloorPlan> {
    return (this.cachedPlan ??= getFloorPlan(this.http, this.rootUrl, {}).pipe(
      map((response) => response.body),
      // So that the second reader gets the answer instead of a second request.
      shareReplay({ bufferSize: 1, refCount: false }),
    ));
  }

  /** The plan's text, from wherever it currently lies. */
  read(): Observable<string> {
    return (this.cachedText ??= this.plan().pipe(
      switchMap((plan) => this.http.get(plan.url, { responseType: 'text' })),
      shareReplay({ bufferSize: 1, refCount: false }),
    ));
  }

  /** Forget what was read — what lies on the disk is no longer what we hold. */
  refresh(): void {
    this.cachedPlan = null;
    this.cachedText = null;
  }
}
