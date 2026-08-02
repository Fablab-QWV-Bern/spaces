# Kennungen in der Übersichtskarte

Arbeitsliste für `frontend/public/karte.svg`. Die Karte setzt auf jeden belegten
Arbeitsplatz eine Figur; gefunden wird der Platz über das `id`-Attribut seines
Elements, das der Arbeitsplatz-Kennung entsprechen muss. Wo die beiden
auseinanderlaufen, bleibt der Platz auf der Karte leer — kein Fehler, aber auch
keine Auskunft.

Es zählt allein `id`. Das `serif:id` daneben ist die Beschriftung aus dem
Zeichenprogramm und wird nicht gelesen; beim Umbenennen einer Ebene schreibt
Affinity beide neu, das ist in Ordnung.

Erledigt ist diese Liste, wenn die Tabelle abgearbeitet und die Frage zu den
3D-Druckern entschieden ist. Danach kann sie weg.

## Umzubenennen

| bisher im SVG   | neu (= Arbeitsplatz-Kennung) | Arbeitsplatz         |
| --------------- | ---------------------------- | -------------------- |
| `drechseln`     | `drechselbank`               | Drechselbank         |
| `drehbank`      | `drehbank-emco`              | Drehbank Emco        |
| `metall-fräse`  | `fraese-deckel`              | Fräse Deckel         |
| `holz-cnc`      | `cnc-holz`                   | CNC Holz (UG)        |
| `shaper`        | `shaper-origin`              | Shaper Origin (UG)   |
| `lasercutter`   | `lasercutter-akj`            | Lasercutter AKJ      |
| `foliencutter`  | `folienschneider`            | Folienschneider (UG) |
| `_3d-harzdruck` | `resin-drucker`              | Resin-Drucker        |
| `elektronik-1`  | `loeten-1`                   | Löten 1 (UG)         |
| `elektronik-2`  | `loeten-2`                   | Löten 2 (UG)         |

## Stimmt bereits

`holz-1` bis `holz-7`, `metall-vorne`, `metall-hinten`, `parkplatz-1`,
`parkplatz-2`, `velo`, `spritzkabine`, `prusa-xl`, `gravurlaser` — fünfzehn
Elemente, die heute schon belebt werden.

## Offene Frage: die vier 3D-Drucker

`_3d-drucker-1` bis `_3d-drucker-4` stehen vier nebeneinander im UG. Die
Konfiguration kennt dort neben dem XL aber nur drei: `prusa-mini-links`,
`prusa-mini-mitte`, `prusa-mk3s`. Welche Kiste welche ist, weiss nur, wer davor
gestanden hat.

Zwei Auswege:

- die drei Kennungen verteilen und die vierte Box ohne lassen — sie bleibt dann
  ein gezeichnetes Rechteck ohne Belegung, und
- oder es fehlt ein Arbeitsplatz in der Konfiguration und die vierte Box bekommt
  dessen Kennung.

## Arbeitsplätze ohne Ort auf dem Plan

Diese drei haben kein Element und erscheinen darum nie auf der Karte. Falls sie
einen festen Platz in der Werkstatt haben, gehört je ein Rechteck mit dieser
Kennung dazu:

- `metall-cnc` — MetallCNC (steht als defekt)
- `pc-3d-druck` — PC 3D-Druck
- `naeharbeitsplatz` — Näharbeitsplatz

Nicht gemeint sind die Spezial- und Kurseinträge (`spezial`, `werkstattpflege`,
`ruhetag`, `betreuung-offene-ws`, `kurse-holz`, `kurse-metall`, `kurse-fablab`).
Das sind keine Orte und sollen keinen bekommen.
