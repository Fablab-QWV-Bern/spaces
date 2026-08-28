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
       contained, and with no colours of its own: everything is mixed from
       `CanvasText` on `Canvas`, so it follows the host page's light or dark
       setting. --}}
  <style>
    :root {
      color-scheme: light dark;
      --line: color-mix(in srgb, CanvasText 15%, transparent);
      --muted: color-mix(in srgb, CanvasText 55%, Canvas);
      --soft: color-mix(in srgb, CanvasText 40%, Canvas);
      --sunken: color-mix(in srgb, CanvasText 4%, Canvas);
    }

    body {
      margin: 0;
      background: var(--sunken);
      color: CanvasText;
      /* Matches the site this widget is embedded in. Raleway only renders where
         the host page has already loaded it — otherwise it falls back. */
      font-family: "Raleway", sans-serif;
      font-size: 14px;
      line-height: 1.5;
      padding: 0 1rem 1.5rem;
    }

    /* Stays in view while the list scrolls, like the heading beside the map. */
    h1 {
      position: sticky;
      top: 0;
      margin: 0;
      background: var(--sunken);
      padding: 1rem 0 0.5rem;
      font-size: 1rem;
      font-weight: 600;
    }

    /* The group heading carries the meaning of the lines under it, so it is set
       apart rather than merely made bold. */
    h2 {
      margin: 1rem 0 0.35rem;
      color: var(--muted);
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    ul { margin: 0; padding: 0; list-style: none; }

    li {
      display: grid;
      /* The time keeps a column of its own so the rows line up; the name takes
         the whole width beneath, having no predictable length. */
      grid-template-columns: 1fr auto;
      gap: 0 0.5rem;
      border-top: 1px solid var(--line);
      padding: 0.4rem 0;
    }

    .where { font-weight: 600; }

    .when {
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }

    .who {
      grid-column: 1 / -1;
      color: var(--soft);
    }

    .empty {
      margin: 0.5rem 0 0;
      color: var(--muted);
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
