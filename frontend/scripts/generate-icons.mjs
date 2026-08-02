/**
 * Erzeugt `src/app/shared/icon-paths.ts` aus den Originaldateien von Lucide.
 *
 * Warum generiert und nicht abgetippt: Pfaddaten von Hand zu übernehmen geht
 * lange gut und dann still schief — Lucide zeichnet Symbole zwischendurch neu,
 * und ein um ein Pixel verschobenes Rechteck fällt niemandem auf.
 *
 * Warum nicht `lucide-angular`: dessen Peer-Bereich endet bei Angular 21. Als
 * Entwicklungsabhängigkeit stellt sich die Frage gar nicht — in den Bundle
 * kommt nur die erzeugte Tabelle.
 *
 * Alles wird zu `<path>`: so bleibt die Vorlage der Komponente eine einzige
 * Schleife, statt für jede Elementart einen Zweig zu tragen.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(here, '../node_modules/lucide-static/icons');
const target = resolve(here, '../src/app/shared/icon-paths.ts');

/**
 * Unsere Namen, links, sagen wozu — Lucides Namen, rechts, sagen was. Die
 * Zuordnung ist der eigentliche Inhalt dieser Datei: `series` heisst hier so,
 * weil eine Serienbuchung gemeint ist, und nicht `repeat`.
 */
const ICONS = {
  login: 'log-in',
  logout: 'log-out',
  back: 'chevron-left',
  forward: 'chevron-right',
  settings: 'settings',
  calendar: 'calendar',
  map: 'map',
  series: 'repeat',
  edit: 'pencil',
  external: 'arrow-up-right',
  remove: 'x',
  photo: 'image',
};

/** Zahl aus einem Attribut, mit 0 als Vorgabe — Lucide lässt `x`/`y` weg, wenn sie 0 sind. */
const num = (attrs, name, fallback = 0) => {
  const match = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? Number(match[1]) : fallback;
};

const round = (n) => Number(n.toFixed(3));

/** Ein Kreis als zwei Halbbögen — ein voller Bogen wäre entartet. */
function circleToPath(attrs) {
  const cx = num(attrs, 'cx');
  const cy = num(attrs, 'cy');
  const r = num(attrs, 'r');
  return `M${round(cx - r)} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
}

function rectToPath(attrs) {
  const x = num(attrs, 'x');
  const y = num(attrs, 'y');
  const w = num(attrs, 'width');
  const h = num(attrs, 'height');
  const rx = num(attrs, 'rx');
  const ry = num(attrs, 'ry', rx);

  if (!rx && !ry) {
    return `M${x} ${y}h${w}v${h}h${-w}z`;
  }

  const arc = (dx, dy) => `a${rx} ${ry} 0 0 1 ${round(dx)} ${round(dy)}`;

  return [
    `M${round(x + rx)} ${y}`,
    `h${round(w - 2 * rx)}`,
    arc(rx, ry),
    `v${round(h - 2 * ry)}`,
    arc(-rx, ry),
    `h${round(-(w - 2 * rx))}`,
    arc(-rx, -ry),
    `v${round(-(h - 2 * ry))}`,
    arc(rx, -ry),
    'z',
  ].join('');
}

const lineToPath = (attrs) =>
  `M${num(attrs, 'x1')} ${num(attrs, 'y1')}L${num(attrs, 'x2')} ${num(attrs, 'y2')}`;

function polylineToPath(attrs) {
  const points = attrs.match(/\bpoints="([^"]*)"/)?.[1] ?? '';
  const pairs = points.trim().split(/[\s,]+/);
  const steps = [];

  for (let i = 0; i < pairs.length; i += 2) {
    steps.push(`${i === 0 ? 'M' : 'L'}${pairs[i]} ${pairs[i + 1]}`);
  }

  return steps.join('');
}

function toPaths(svg) {
  const paths = [];

  for (const [, tag, attrs] of svg.matchAll(/<(path|circle|rect|line|polyline)\b([^>]*)>/g)) {
    if (tag === 'path') {
      paths.push(attrs.match(/\bd="([^"]*)"/)[1]);
    } else if (tag === 'circle') {
      paths.push(circleToPath(attrs));
    } else if (tag === 'rect') {
      paths.push(rectToPath(attrs));
    } else if (tag === 'line') {
      paths.push(lineToPath(attrs));
    } else {
      paths.push(polylineToPath(attrs));
    }
  }

  if (!paths.length) {
    throw new Error('Keine zeichenbaren Elemente gefunden');
  }

  return paths;
}

const entries = Object.entries(ICONS).map(([name, lucideName]) => {
  const svg = readFileSync(resolve(iconsDir, `${lucideName}.svg`), 'utf8');
  const paths = toPaths(svg).map((d) => `    '${d}',`);
  return `  // ${lucideName}\n  ${name}: [\n${paths.join('\n')}\n  ],`;
});

const source = `// Erzeugt von scripts/generate-icons.mjs — nicht von Hand ändern.
// Quelle: lucide-static (ISC), Raster 24×24, Strichstärke 2, runde Enden.
// Neues Symbol: im Skript eintragen, dann \`npm run icons:generate\`.

export type IconName =
${Object.keys(ICONS)
  .map((name) => `  | '${name}'`)
  .join('\n')};

export const ICON_PATHS: Record<IconName, readonly string[]> = {
${entries.join('\n')}
};
`;

writeFileSync(target, source);
console.log(`${Object.keys(ICONS).length} Symbole geschrieben nach ${target}`);
