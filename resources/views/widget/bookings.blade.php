<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ $workplace->name }} — nächste Buchungen</title>
  {{-- Self-contained so it works dropped into any page's <iframe>. It brings no
       colours of its own: `CanvasText` on a transparent ground follows the host
       page's light or dark setting, and the palette of the SPA is a frontend
       build concern that does not reach here. --}}
  <style>
    :root { color-scheme: light dark; }

    body {
      margin: 0;
      background: transparent;
      color: CanvasText;
      /* Matches the site this widget is embedded in. Raleway only renders where
         the host page has already loaded it — otherwise it falls back. */
      font-family: "Raleway", sans-serif;
      font-size: 14px;
      line-height: 1.5;
    }

    ul { margin: 0; padding: 0; list-style: none; }

    li {
      padding: 0.4rem 0;
      border-bottom: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
    }

    li:last-child { border-bottom: 0; }

    .when { font-weight: 700; }

    .empty { margin: 0; padding: 0.4rem 0; opacity: 0.7; }
  </style>
</head>
<body>
@if ($entries->isEmpty())
  <p class="empty">Keine bevorstehenden Buchungen.</p>
@else
  <ul>
    @foreach ($entries as $entry)
      <li><span class="when">{{ $entry['when'] }}</span> {{ $entry['name'] }}</li>
    @endforeach
  </ul>
@endif
</body>
</html>
