{{-- Raleway for the widgets, served from here. An iframe is a document of its
     own and never sees the fonts of the page around it, so the host having
     loaded Raleway does nothing for us — only a machine with it installed ever
     showed it. Self-hosted rather than from Google, so an embed sends its
     visitors nowhere else. Latin only (umlauts included), just the weights the
     widgets use, and woff beside woff2 for the iPads from before iOS 10. From
     @fontsource/raleway; licence in public/fonts/raleway/OFL.txt. --}}
@foreach ([400, 600, 700] as $weight)
    @font-face {
      font-family: "Raleway";
      font-style: normal;
      font-weight: {{ $weight }};
      font-display: swap;
      src: url("/fonts/raleway/raleway-latin-{{ $weight }}-normal.woff2") format("woff2"),
        url("/fonts/raleway/raleway-latin-{{ $weight }}-normal.woff") format("woff");
    }
@endforeach
