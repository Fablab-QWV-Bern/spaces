<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  {{-- Reloads once a minute so an embed stays current without scripting — the
       same cadence the overview map refreshes itself at. --}}
  <meta http-equiv="refresh" content="60">
  <title>{{ $isToday ? 'Belegungen heute' : "Belegungen · {$date}" }}</title>
  {{-- The agenda column from the overview map, on its own for embedding. Self-
       contained and deliberately old-browser friendly: a float layout instead of
       grid, and literal colours instead of `color-mix()` — an embed can end up in
       a very old Safari, and this page has no script to fall back on. One ink
       (black, white in the dark), everything else an alpha of it, which keeps the
       "CanvasText at N%" idea without the function. Dark mode follows the host
       through `prefers-color-scheme`; a browser without it stays on the light
       default. `?mode=` overrides that: the dark rules below are written once and
       only their wrapper changes — the media query, none, or left out. --}}
  <style>
    :root { color-scheme: {{ $mode ?? 'light dark' }}; }

    body {
      margin: 0;
      background: #f4f4f5;
      color: #18181b;
      /* Matches the site this widget is embedded in. Raleway only renders where
         the host page has already loaded it — otherwise it falls back. */
      font-family: "Raleway", sans-serif;
      font-size: 14px;
      line-height: 1.5;
      /* Room for the fixed footer, so the last row can scroll out from under it. */
      padding: 0 1rem 4rem;
    }

    /* Stays in view while the list scrolls, like the heading beside the map.
       The prefix is for the Safari that needs the float layout in the first
       place; without it the heading just scrolls away there. */
    h1 {
      position: -webkit-sticky;
      position: sticky;
      top: 0;
      margin: 0;
      background: #f4f4f5;
      padding: 1rem 0 0.5rem;
      font-size: 1rem;
      font-weight: 600;
    }

    /* The group heading carries the meaning of the lines under it, so it is set
       apart rather than merely made bold. */
    h2 {
      margin: 1rem 0 0.35rem;
      color: rgba(0, 0, 0, 0.55);
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    ul { margin: 0; padding: 0; list-style: none; }

    /* `overflow: hidden` contains the two floated spans; `.who` clears them onto
       its own line below. The time keeps to the right so the rows line up under
       one another; the name has no predictable length and takes the full width. */
    li {
      overflow: hidden;
      border-top: 1px solid rgba(0, 0, 0, 0.12);
      padding: 0.4rem 0;
    }

    .where { float: left; font-weight: 600; }

    .when {
      float: right;
      color: rgba(0, 0, 0, 0.55);
      font-variant-numeric: tabular-nums;
    }

    .who {
      clear: both;
      display: block;
      color: rgba(0, 0, 0, 0.45);
    }

    .empty {
      margin: 0.5rem 0 0;
      color: rgba(0, 0, 0, 0.55);
    }

    /* Fixed rather than sticky: sticky would ride up under a short list, and the
       footer belongs at the bottom of the frame. The text-align centres the date;
       the arrows float to either side of it. */
    footer {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      background: #f4f4f5;
      border-top: 1px solid rgba(0, 0, 0, 0.12);
      text-align: center;
      line-height: 2.75rem;
    }

    footer a {
      color: inherit;
      text-decoration: none;
    }

    .date { font-weight: 600; }

    .step {
      width: 2.75rem;
      height: 2.75rem;
    }

    .step svg {
      width: 1.25rem;
      height: 1.25rem;
      vertical-align: middle;
    }

    .previous { float: left; }
    .next { float: right; }

    @if ($mode === null)
    /* Modern browsers only; an old Safari ignores the query and keeps the light
       default, which is also all iOS 9 ever had. */
    @media (prefers-color-scheme: dark) {
    @endif
    @if ($mode !== 'light')
      body { background: #1a1a1c; color: #f2f2f2; }
      h1, footer { background: #1a1a1c; }
      h2, .when, .empty { color: rgba(255, 255, 255, 0.55); }
      li, footer { border-top-color: rgba(255, 255, 255, 0.14); }
      .who { color: rgba(255, 255, 255, 0.45); }
    @endif
    @if ($mode === null)
    }
    @endif
  </style>
</head>
<body>
  <h1>{{ $isToday ? 'Belegungen heute' : 'Belegungen' }}</h1>

  @forelse ($groups as $group)
    <h2>{{ $group['heading'] }}</h2>
    <ul>
      @foreach ($group['entries'] as $entry)
        <li>
          <span class="where">{{ $entry['where'] }}</span>
          <span class="when">{{ $entry['when'] }}</span>
          <span class="who">{{ $entry['who'] }}</span>
        </li>
      @endforeach
    </ul>
  @empty
    <p class="empty">
      {{ $isToday ? 'Für heute ist nichts mehr eingetragen.' : 'An diesem Tag ist nichts eingetragen.' }}
    </p>
  @endforelse

  {{-- The chevrons are Lucide's, like the SPA's icons, in currentColor. --}}
  <footer>
    <a class="step previous" href="{{ $previous }}" aria-label="Vorheriger Tag">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
    </a>
    <a class="step next" href="{{ $next }}" aria-label="Nächster Tag">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
    </a>
    <a class="date" href="{{ $today }}" title="Zurück zu heute">{{ $date }}</a>
  </footer>
</body>
</html>
