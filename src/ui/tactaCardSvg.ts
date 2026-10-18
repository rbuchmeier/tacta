import { FRAME_H, FRAME_W, MARGIN, dotCount, type TactaCard } from '../deck/tacta';

const START_FILL = '#111214';
const FIELD = '#141619';
const LINE = 0.3;

/** SVG markup for a card in frame units: frame at (0,0)-(14,20), margin outside it. */
export function tactaCardSvg(card: TactaCard, fill: string | null): string {
  const color = fill ?? START_FILL;
  const start = fill === null;
  const filled = card.shapes
    .filter((s) => s.dots.length > 0)
    .map((s) => `<polygon points="${poly(s.points)}" fill="${color}"/>`)
    .join('');
  const outlines = card.shapes.map((s) => `<polygon points="${poly(s.points)}"/>`).join('');
  const dots = card.shapes
    .flatMap((s) => s.dots)
    .map((d) => `<circle cx="${r(d.x)}" cy="${r(d.y)}" r="0.42"/>`)
    .join('');
  return `
    <rect x="${-MARGIN}" y="${-MARGIN}" width="${FRAME_W + 2 * MARGIN}" height="${FRAME_H + 2 * MARGIN}" rx="0.75" fill="${color}"/>
    <rect x="0" y="0" width="${FRAME_W}" height="${FRAME_H}" rx="0.5" fill="${start ? START_FILL : FIELD}"/>
    ${filled}
    <g fill="none" stroke="#f4f4f6" stroke-width="${LINE}" stroke-linejoin="round">
      ${outlines}
      <rect x="0" y="0" width="${FRAME_W}" height="${FRAME_H}" rx="0.5"/>
    </g>
    <g fill="#f4f4f6">${dots}</g>
    ${center(card, color)}`;
}

function center(card: TactaCard, color: string): string {
  const cx = FRAME_W / 2;
  const cy = FRAME_H / 2;
  const ring = `stroke="#f4f4f6" stroke-width="0.2" fill="${card.suit ? color : 'none'}"`;
  if (!card.suit) {
    return `<rect x="${cx - 1.5}" y="${cy - 1.5}" width="3" height="3" rx="0.5" ${ring}/>
      <text x="${cx}" y="${cy + 0.05}" class="card-num" font-size="1.8">X</text>`;
  }
  const symbol =
    card.suit === 'circle'
      ? `<circle cx="${cx}" cy="${cy}" r="1.55" ${ring}/>`
      : card.suit === 'square'
        ? `<rect x="${cx - 1.45}" y="${cy - 1.45}" width="2.9" height="2.9" rx="0.45" ${ring}/>`
        : `<polygon points="${cx},${cy - 1.9} ${cx + 1.95},${cy + 1.35} ${cx - 1.95},${cy + 1.35}" stroke-linejoin="round" ${ring}/>`;
  const ty = card.suit === 'triangle' ? cy + 0.3 : cy + 0.05;
  const value = card.printed ?? dotCount(card);
  // The number and its little tab are printed upside down on some cards.
  const flip = card.labelFlipped ? ` transform="rotate(180 ${cx} ${cy})"` : '';
  return `<g${flip}>${symbol}<text x="${cx}" y="${ty}" class="card-num" font-size="1.65">${value}</text>
    <rect x="${cx - 0.3}" y="${cy + 2.05}" width="0.6" height="0.45" fill="#f4f4f6"/></g>`;
}

export function tactaCardThumb(card: TactaCard, fill: string | null, cls = 'card-svg'): string {
  const m = MARGIN + 0.1;
  return `<svg viewBox="${-m} ${-m} ${FRAME_W + 2 * m} ${FRAME_H + 2 * m}" class="${cls}" role="img" aria-label="Card ${card.n}">${tactaCardSvg(card, fill)}</svg>`;
}

function poly(points: Array<{ x: number; y: number }>): string {
  return points.map((p) => `${r(p.x)},${r(p.y)}`).join(' ');
}

function r(n: number): number {
  return Math.round(n * 1000) / 1000;
}
