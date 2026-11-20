<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  {{-- Once a minute, like the map asks again who is here. A reload rather than
       a request from script: the old Safari this page is for then has nothing
       to keep running, and a page that hung would mend itself a minute later. --}}
  <meta http-equiv="refresh" content="60">
  {{-- For an old iPad on the wall, added to the home screen and opened full
       screen from there. It goes by these tags alone; a manifest it never reads. --}}
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Tafel">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <title>Tafel — wer jetzt da ist</title>
  {{-- Written for Safari 10 (iOS 10.3, the last an iPad 4 gets): no grid, no
       flex gap, no color-mix(), no custom properties needed — positioned boxes
       and literal colours, as in widget/agenda.blade.php. The plan's width comes
       from its own aspect ratio against the window's height, so that it fits
       without scrolling: a wall display has nobody to scroll it. --}}
  <style>
    @include('widget.raleway')

    html, body {
      margin: 0;
      height: 100%;
      overflow: hidden;
    }

    body {
      background: #f4f4f5;
      color: #18181b;
      font-family: "Raleway", sans-serif;
      /* Read from a step away, like the agenda as a home-screen app. */
      font-size: 1.2rem;
      line-height: 1.45;
    }

    .plan {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      /* As wide as the drawing at full height, but never so wide that the
         column beside it gets less than its minimum. */
      width: calc((100vh - 3rem) * {{ round($plan['ratio'] ?? 1, 4) }});
      max-width: calc(100vw - 13.5rem);
      /* The title's strip; the drawing fills what is below it. */
      padding-top: 3rem;
      line-height: 0;
      background: #fff;
    }

    .plan svg { display: block; }

    /* In the white above the drawing, centred over it. */
    h1 {
      position: absolute;
      top: 0;
      right: 0;
      left: 0;
      margin: 0;
      font-size: 1.8rem;
      font-weight: 600;
      line-height: 3rem;
      text-align: center;
      /* Half-veiled rather than solid, so that in landscape the plan scrolling
         under it stays faintly visible. */
      background: rgba(255, 255, 255, 0.7);
    }

    .agenda {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      /* Exactly what the plan leaves — its width and max-width mirrored as
         width and min-width, so the two always meet without a gap. */
      box-sizing: border-box;
      width: calc(100vw - (100vh - 3rem) * {{ round($plan['ratio'] ?? 1, 4) }});
      min-width: 13.5rem;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 0 0.5rem 1.5rem;
      font-size: 1.05rem;
    }

    /* Where the plan at full height would leave the column less than 13.5rem
       — an iPad in portrait — the column keeps that and the plan takes what is
       left, standing on the bottom of the screen with the slack above it. That
       is min() and max() spelt as width and max-width, min-width: Safari only
       learnt the functions in 11.1. A media query on the aspect ratio did this
       before and broke in between: the switch cannot know the 13.5rem, so the
       plan's box jumped wider than its drawing and left a white gap. */

    /* Landscape: rather than shrink the plan to the height, it takes all the
       width the column leaves and scrolls down — EG on top, UG below. The
       column keeps a fixed width. The drawing's height is set here rather
       than left to height: auto, which an old Safari does not derive from
       the viewBox. */
    @media (min-aspect-ratio: 1/1) {
      .plan {
        width: calc(100vw - 13.5rem);
        max-width: none;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }

      /* Back in the flow and sticky, so the date stays at the top while the
         plan scrolls; the strip it takes is the one the padding kept free. */
      .plan { padding-top: 0; }

      h1 {
        position: -webkit-sticky;
        position: sticky;
      }

      .plan svg { height: calc((100vw - 13.5rem) / {{ round($plan['ratio'] ?? 1, 4) }}); }

      .agenda {
        width: 13.5rem;
        min-width: 0;
      }
    }

    /* Narrower than that, as on the map: the column disappears rather than
       squeezing the plan — everything in it is on the plan too. */
    @media (max-width: 40rem) {
      .plan { max-width: 100%; }
      .agenda { display: none; }
    }

    h2 {
      margin: 1rem 0 0.35rem 0.6rem;
      color: rgba(0, 0, 0, 0.55);
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    ul { margin: 0; padding: 0; list-style: none; }

    /* The float layout of the agenda widget: workplace left, time right, the
       name on a line of its own below. */
    /* Each row on its area's colour, as the blocks are in the calendar and
       the benches on the plan; the colours are light enough for the ink. */
    li {
      overflow: hidden;
      padding: 0.2rem 0.5rem;
      margin-top: 0.6rem;
      border-radius: 6px;
    }

    .where { float: left; font-weight: 600; }

    .when {
      float: right;
      color: rgba(0, 0, 0, 0.85);
      font-variant-numeric: tabular-nums;
    }

    .who {
      clear: both;
      display: block;
      color: rgba(0, 0, 0, 0.65);
    }

    .empty, .missing {
      margin: 0.5rem 0 0 0.6rem;
      color: rgba(0, 0, 0, 0.55);
    }

    .missing { padding: 1rem; line-height: 1.45; }
  </style>
</head>
<body>
  <div class="plan">
    <h1>{{ $heading }}</h1>

    @if ($plan)
      {!! $plan['markup'] !!}
    @else
      <p class="missing">Der Grundriss konnte nicht geladen werden.</p>
    @endif
  </div>

  <aside class="agenda">
    @forelse ($groups as $group)
      <h2>{{ $group['heading'] }}</h2>
      <ul>
        @foreach ($group['entries'] as $entry)
          <li @isset($areaColors[$entry['areaId']]) style="background-color: {{ $areaColors[$entry['areaId']] }}" @endisset>
            <span class="where">{{ $entry['where'] }}</span>
            <span class="when">{{ $entry['when'] }}</span>
            <span class="who">{{ $entry['who'] }}</span>
          </li>
        @endforeach
      </ul>
    @empty
      <p class="empty">Für heute ist nichts mehr eingetragen.</p>
    @endforelse
  </aside>

  {{-- The marking, a port of mark(), greyStrays() and stand() in the frontend's
       map/map-view.ts — what is decided is decided on the server, this only
       writes it into the drawing. In ES5 for Safari 10: no arrow functions, no
       classList on SVG, no children on SVG elements, and the figure referenced
       through xlink:href, because the bare href of SVG 2 only arrived in Safari
       12.1. The fills go in as important inline styles, since the plan writes
       its own fills inline and nothing else could outrank them. --}}
  <script>
    (function () {
      var marking = @json($marking);
      var SVG = 'http://www.w3.org/2000/svg';
      var XLINK = 'http://www.w3.org/1999/xlink';
      // As FOOT_OVERLAP in map/map-geometry.ts: the feet a little into the bench.
      var FOOT_OVERLAP = 15;
      var plan = document.querySelector('.plan svg');

      if (!plan) {
        return;
      }

      function elementsIn(parent) {
        var found = [];

        for (var node = parent.firstChild; node; node = node.nextSibling) {
          if (node.nodeType === 1) {
            found.push(node);
          }
        }

        return found;
      }

      function paint(element, color) {
        element.style.setProperty('fill', color, 'important');
      }

      // Benches the configuration does not know take the obstacles' grey, read
      // off the plan. Before the workplaces, as on the map.
      var benches = document.getElementById('Arbeitsplätze');
      var obstacles = document.getElementById('Hindernisse');
      var obstacle = obstacles && elementsIn(obstacles)[0];

      if (benches && obstacle) {
        var grey = window.getComputedStyle(obstacle).fill;

        elementsIn(benches).forEach(function (shape) {
          if (!marking.colors.hasOwnProperty(shape.id)) {
            paint(shape, grey);
          }
        });
      }

      Object.keys(marking.colors).forEach(function (id) {
        var shape = document.getElementById(id);

        if (shape && marking.colors[id]) {
          paint(shape, marking.colors[id]);
        }
      });

      // The figure: measured while it is still drawn, then stowed in the defs
      // and its layer moved last, so the standing figures are drawn over
      // everything — see stow() on the map.
      var figure = document.getElementById('figur');

      if (!figure) {
        return;
      }

      var person = figure.getBBox();
      var layer = figure.parentNode;
      var defs = plan.querySelector('defs');

      if (!defs) {
        defs = document.createElementNS(SVG, 'defs');
        plan.insertBefore(defs, plan.firstChild);
      }

      defs.appendChild(figure);
      layer.parentNode.appendChild(layer);

      Object.keys(marking.taken).forEach(function (id) {
        var shape = document.getElementById(id);

        if (!shape || !marking.colors.hasOwnProperty(id)) {
          return;
        }

        // standingOn() in map/map-geometry.ts: centred across, feet on the
        // middle of the bench.
        var bench = shape.getBBox();
        var dx = bench.x + bench.width / 2 - (person.x + person.width / 2);
        var dy = bench.y + bench.height / 2 - (person.y + person.height - FOOT_OVERLAP);
        var use = document.createElementNS(SVG, 'use');

        use.setAttributeNS(XLINK, 'xlink:href', '#figur');
        use.setAttribute('transform', 'translate(' + dx.toFixed(3) + ' ' + dy.toFixed(3) + ')');
        use.setAttribute('opacity', marking.taken[id] === 'soon' ? '0.5' : '1');
        layer.appendChild(use);
      });
    })();

    // A home-screen app on iOS bounces the whole page when swiped; only the
    // agenda column, and in landscape the plan, have anything to scroll.
    document.addEventListener('touchmove', function (event) {
      for (var node = event.target; node; node = node.parentNode) {
        if (node.className === 'agenda' || node.className === 'plan') {
          return;
        }
      }

      event.preventDefault();
    }, { passive: false });
  </script>
</body>
</html>
