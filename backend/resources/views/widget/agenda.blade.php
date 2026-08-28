<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  {{-- Reloads once a minute so an embed stays current without scripting — the
       same cadence the overview map refreshes itself at. --}}
  <meta http-equiv="refresh" content="60">
  <title>Belegungen heute</title>
  {{-- The agenda column from the overview map, on its own for embedding. Self-
       contained and deliberately old-browser friendly: a float layout instead of
       grid, and literal colours instead of `color-mix()` — an embed can end up in
       a very old Safari, and this page has no script to fall back on. One ink
       (black, white in the dark), everything else an alpha of it, which keeps the
       "CanvasText at N%" idea without the function. Dark mode follows the host
       through `prefers-color-scheme`; a browser without it stays on the light
       default. --}}
  <style>
    :root { color-scheme: light dark; }

    body {
      margin: 0;
      background: #f4f4f5;
      color: #18181b;
      /* Matches the site this widget is embedded in. Raleway only renders where
         the host page has already loaded it — otherwise it falls back. */
      font-family: "Raleway", sans-serif;
      font-size: 14px;
      line-height: 1.5;
      padding: 0 1rem 1.5rem;
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

    /* Modern browsers only; an old Safari ignores the query and keeps the light
       default, which is also all iOS 9 ever had. */
    @media (prefers-color-scheme: dark) {
      body { background: #1a1a1c; color: #f2f2f2; }
      h1 { background: #1a1a1c; }
      h2, .when, .empty { color: rgba(255, 255, 255, 0.55); }
      li { border-top-color: rgba(255, 255, 255, 0.14); }
      .who { color: rgba(255, 255, 255, 0.45); }
    }
  </style>
</head>
<body>
  <h1>Belegungen heute</h1>

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
    <p class="empty">Für heute ist nichts mehr eingetragen.</p>
  @endforelse
</body>
</html>
