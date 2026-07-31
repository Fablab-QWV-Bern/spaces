import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

/**
 * Platzhalter für "Buchung erstellen". Zeigt vorerst nur, was die
 * Kalenderansicht vorbelegt hat — das eigentliche Formular kommt als
 * eigener Schritt.
 */
@Component({
  selector: 'app-booking-form',
  imports: [RouterLink],
  template: `
    <section>
      <h1>Buchung</h1>

      @if (params().booking) {
        <p>Bearbeiten der Buchung <code>{{ params().booking }}</code>.</p>
      } @else {
        <dl>
          <dt>Arbeitsplatz</dt>
          <dd>{{ params().workplace }}</dd>
          <dt>Beginn</dt>
          <dd>{{ params().start }}</dd>
          <dt>Dauer</dt>
          <dd>{{ params().durationMinutes }} Minuten</dd>
        </dl>
      }

      <p class="hint">Das Formular ist noch nicht gebaut.</p>
      <a routerLink="/">Zurück zur Kalenderansicht</a>
    </section>
  `,
  styles: `
    section {
      padding: 1.5rem;
      font-family: system-ui, sans-serif;
    }
    dt {
      font-weight: 600;
      margin-top: 0.5rem;
    }
    .hint {
      color: #64748b;
      font-style: italic;
    }
  `,
})
export class BookingForm {
  private readonly route = inject(ActivatedRoute);
  private readonly queryParams = toSignal(this.route.queryParams, {
    initialValue: {} as Record<string, string | undefined>,
  });

  protected readonly params = computed(() => {
    const query = this.queryParams();

    return {
      booking: query['booking'],
      workplace: query['workplace'],
      start: query['start'],
      durationMinutes: query['durationMinutes'],
    };
  });
}
