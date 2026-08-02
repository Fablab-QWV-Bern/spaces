/**
 * Das Rechnen der Übersichtskarte: aus Kästen im Koordinatensystem des SVG
 * werden Prozentwerte auf dessen Fläche.
 *
 * Wie die Zeitachse bewusst frei von Angular und frei vom DOM — hereingereicht
 * werden nur Zahlen. Gemessen wird an einer Stelle, im `MapView`; gerechnet
 * hier, wo man es prüfen kann.
 *
 * Prozent und nicht Bildpunkte, weil die Karte mit dem Fenster wächst. Das geht
 * nur auf, solange die dargestellte Fläche genau das Seitenverhältnis der
 * `viewBox` hat — sonst bliebe ein Rand, den die Prozente nicht kennen. Dafür
 * sorgt `map-view.scss`.
 */

/** Ein Kasten im Koordinatensystem des SVG — die Form von `getBBox()`. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Platzierung auf der Karte, in Prozent ihrer Breite bzw. Höhe. */
export interface Placement {
  leftPercent: number;
  topPercent: number;
  widthPercent: number;
  heightPercent: number;
}

/**
 * Die Kennung der Figur im SVG. Sie ist Teil des Vertrags mit der Datei, so wie
 * es die Kennungen der Arbeitsplätze sind: die Karte bringt eine Figur mit, wir
 * setzen sie so oft, wie jemand da ist.
 */
export const FIGURE_ID = 'figur';

/** `viewBox="0 0 1184 2082"` als Kasten; null, wenn das Attribut fehlt oder unlesbar ist. */
export function parseViewBox(value: string | null | undefined): Box | null {
  if (!value) {
    return null;
  }

  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);

  if (parts.length !== 4 || parts.some(Number.isNaN) || parts[2] <= 0 || parts[3] <= 0) {
    return null;
  }

  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

/**
 * Setzt die Figur mittig auf einen Arbeitsplatz — in ihrer natürlichen Grösse.
 *
 * Nicht auf die Grösse des Arbeitsplatzes gestreckt: die Figur ist im Massstab
 * der Karte gezeichnet, und eine Werkbank ist breiter als ein Mensch. Gestreckt
 * stünde auf der Hobelbank ein Riese und am Lötplatz ein Zwerg.
 */
export function placeCentered(viewBox: Box, target: Box, figure: Box): Placement {
  return {
    leftPercent: ((centerX(target) - figure.width / 2 - viewBox.x) / viewBox.width) * 100,
    topPercent: ((centerY(target) - figure.height / 2 - viewBox.y) / viewBox.height) * 100,
    widthPercent: (figure.width / viewBox.width) * 100,
    heightPercent: (figure.height / viewBox.height) * 100,
  };
}

/** Der Ausschnitt, den die Figur allein füllt — die `viewBox` ihres eigenen SVG. */
export function figureViewBox(figure: Box): string {
  return `${figure.x} ${figure.y} ${figure.width} ${figure.height}`;
}

function centerX(box: Box): number {
  return box.x + box.width / 2;
}

function centerY(box: Box): number {
  return box.y + box.height / 2;
}
