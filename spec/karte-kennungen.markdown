# Identifiers in the overview map

Work list for `frontend/public/karte.svg`. The map places a figure on every
occupied workplace; the workplace is found via the `id` attribute of its element,
which has to match the workplace identifier. Where the two diverge, the workplace
stays empty on the map — not an error, but no information either.

Only `id` counts. The `serif:id` next to it is the label from the drawing program
and is not read; when a layer is renamed, Affinity rewrites both, which is fine.

This list is done once the table has been worked through and the question about
the 3D printers has been decided. After that it can go.

## To be renamed

| currently in the SVG | new (= workplace identifier) | Workplace            |
| -------------------- | ---------------------------- | -------------------- |
| `drechseln`          | `drechselbank`               | Drechselbank         |
| `drehbank`           | `drehbank-emco`              | Drehbank Emco        |
| `metall-fräse`       | `fraese-deckel`              | Fräse Deckel         |
| `holz-cnc`           | `cnc-holz`                   | CNC Holz (UG)        |
| `shaper`             | `shaper-origin`              | Shaper Origin (UG)   |
| `lasercutter`        | `lasercutter-akj`            | Lasercutter AKJ      |
| `foliencutter`       | `folienschneider`            | Folienschneider (UG) |
| `_3d-harzdruck`      | `resin-drucker`              | Resin-Drucker        |
| `elektronik-1`       | `loeten-1`                   | Löten 1 (UG)         |
| `elektronik-2`       | `loeten-2`                   | Löten 2 (UG)         |

## Already correct

`holz-1` to `holz-7`, `metall-vorne`, `metall-hinten`, `parkplatz-1`,
`parkplatz-2`, `velo`, `spritzkabine`, `prusa-xl`, `gravurlaser` — fifteen
elements that already come alive today.

## Open question: the four 3D printers

`_3d-drucker-1` to `_3d-drucker-4` stand four side by side in the basement. The
configuration, however, knows only three there besides the XL:
`prusa-mini-links`, `prusa-mini-mitte`, `prusa-mk3s`. Which box is which is known
only to whoever has stood in front of them.

Two ways out:

- distribute the three identifiers and leave the fourth box without one — it then
  stays a drawn rectangle with no occupancy, or
- a workplace is missing from the configuration and the fourth box gets its
  identifier.

## Workplaces with no place on the plan

These three have no element and therefore never appear on the map. If they have a
fixed place in the workshop, a rectangle with the respective identifier belongs
with them:

- `metall-cnc` — MetallCNC (marked as broken)
- `pc-3d-druck` — PC 3D-Druck
- `naeharbeitsplatz` — Näharbeitsplatz

Not meant here are the special and course entries (`spezial`, `werkstattpflege`,
`ruhetag`, `betreuung-offene-ws`, `kurse-holz`, `kurse-metall`, `kurse-fablab`).
Those are not places and should not be given one.
