import type { Pt } from '../geometry';

/*
 * The real Tacta deck, transcribed from photos of one color's 18 cards and
 * the starting card. Every color has the same 18 cards.
 *
 * Coordinates are in "frame units": the white inner frame of a card is
 * 14 × 20 units with its top-left corner at (0,0). The colored margin outside
 * the frame is MARGIN units wide, so a whole card is 15.6 × 21.6 (≈ 63 × 88 mm).
 *
 * Every shape sits on the grid drawn on the starting card: columns at 3, 7, 11;
 * rows at 3, 7, 13, 17; plus the triangle diagonals.
 */

export const FRAME_W = 14;
export const FRAME_H = 20;
export const MARGIN = 0.8;

/**
 * Corner-triangle leg. The starting card shows an edge triangle's base
 * beginning exactly where a corner triangle's leg ends, which makes the two
 * triangles congruent: leg = 20 − 10√2 ≈ 5.86.
 */
const LEG = 20 - 10 * Math.SQRT2;
/** Depth of an edge triangle (half its base). */
const DEPTH = LEG / Math.SQRT2;

/**
 * Shapes that can cover each other are congruent, so they share a kind:
 * - band:     14 × 3 rectangle (top/bottom bands and the short side bands)
 * - longBand: 3 × 20 rectangle (full-height side bands)
 * - square:   7 × 7 corner square
 * - triangle: right isosceles triangle (edge triangles and corner triangles)
 */
export type ShapeKind = 'band' | 'longBand' | 'square' | 'triangle';

export type Slot =
  | 'band-top' | 'band-bottom' | 'band-left' | 'band-right'
  | 'long-left' | 'long-right'
  | 'square-tl' | 'square-tr' | 'square-bl' | 'square-br'
  | 'edge-top' | 'edge-bottom' | 'edge-left' | 'edge-right'
  | 'corner-tl' | 'corner-tr' | 'corner-bl' | 'corner-br';

export type Suit = 'circle' | 'square' | 'triangle';

export interface Shape {
  slot: Slot;
  kind: ShapeKind;
  points: Pt[];
  /** Dot centers. Shapes with dots are filled with the deck color; empty ones are outlines. */
  dots: Pt[];
}

export interface TactaCard {
  /** Position in the reference photo, left-to-right, top-to-bottom (1-18). */
  n: number;
  suit: Suit | null;
  /** The number printed in the center, which should equal the dot count. */
  printed: number | null;
  /** The center number is printed upside down (its little tab sits above it). */
  labelFlipped: boolean;
  shapes: Shape[];
}

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const pts = (...xy: number[]): Pt[] =>
  Array.from({ length: xy.length / 2 }, (_, i) => ({ x: xy[2 * i], y: xy[2 * i + 1] }));

const W = FRAME_W;
const H = FRAME_H;
const CX = W / 2;
const CY = H / 2;

export const SLOTS: Record<Slot, { kind: ShapeKind; label: string; points: Pt[] }> = {
  'band-top': { kind: 'band', label: 'Top band', points: rect(0, 0, W, 3) },
  'band-bottom': { kind: 'band', label: 'Bottom band', points: rect(0, H - 3, W, H) },
  'band-left': { kind: 'band', label: 'Left short band', points: rect(0, 3, 3, H - 3) },
  'band-right': { kind: 'band', label: 'Right short band', points: rect(W - 3, 3, W, H - 3) },
  'long-left': { kind: 'longBand', label: 'Left full band', points: rect(0, 0, 3, H) },
  'long-right': { kind: 'longBand', label: 'Right full band', points: rect(W - 3, 0, W, H) },
  'square-tl': { kind: 'square', label: 'Top-left square', points: rect(0, 0, 7, 7) },
  'square-tr': { kind: 'square', label: 'Top-right square', points: rect(W - 7, 0, W, 7) },
  'square-bl': { kind: 'square', label: 'Bottom-left square', points: rect(0, H - 7, 7, H) },
  'square-br': { kind: 'square', label: 'Bottom-right square', points: rect(W - 7, H - 7, W, H) },
  'edge-top': { kind: 'triangle', label: 'Top edge triangle', points: pts(CX - DEPTH, 0, CX + DEPTH, 0, CX, DEPTH) },
  'edge-bottom': { kind: 'triangle', label: 'Bottom edge triangle', points: pts(CX - DEPTH, H, CX, H - DEPTH, CX + DEPTH, H) },
  'edge-left': { kind: 'triangle', label: 'Left edge triangle', points: pts(0, CY - DEPTH, DEPTH, CY, 0, CY + DEPTH) },
  'edge-right': { kind: 'triangle', label: 'Right edge triangle', points: pts(W, CY - DEPTH, W, CY + DEPTH, W - DEPTH, CY) },
  'corner-tl': { kind: 'triangle', label: 'Top-left corner triangle', points: pts(0, 0, LEG, 0, 0, LEG) },
  'corner-tr': { kind: 'triangle', label: 'Top-right corner triangle', points: pts(W, 0, W, LEG, W - LEG, 0) },
  'corner-bl': { kind: 'triangle', label: 'Bottom-left corner triangle', points: pts(0, H, 0, H - LEG, LEG, H) },
  'corner-br': { kind: 'triangle', label: 'Bottom-right corner triangle', points: pts(W, H, W - LEG, H, W, H - LEG) },
};

/** Where the dots sit inside each slot, matching the printed cards. */
function dotsFor(slot: Slot, count: number): Pt[] {
  if (count === 0) return [];
  const spread = (n: number, from: number, to: number) =>
    Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / (n + 1));
  const check = (expected: number) => {
    if (count !== expected) throw new Error(`${slot} holds ${expected} dots when filled, got ${count}`);
  };
  switch (slot) {
    case 'band-top':
    case 'band-bottom': {
      check(3);
      const y = slot === 'band-top' ? 1.5 : H - 1.5;
      return spread(3, 0, W).map((x) => ({ x, y }));
    }
    case 'band-left':
    case 'band-right': {
      check(3);
      const x = slot === 'band-left' ? 1.5 : W - 1.5;
      return spread(3, 3, H - 3).map((y) => ({ x, y }));
    }
    case 'long-left':
    case 'long-right': {
      check(4);
      const x = slot === 'long-left' ? 1.5 : W - 1.5;
      return [4.4, 8.13, 11.87, 15.6].map((y) => ({ x, y }));
    }
    case 'square-tl':
    case 'square-tr':
    case 'square-bl':
    case 'square-br': {
      check(2);
      // Dots run along the diagonal from the square's inner corner to the card corner.
      const sx = slot.endsWith('l') ? -1 : 1;
      const sy = slot.includes('-t') ? -1 : 1;
      return [0.33, 0.7].map((f) => ({ x: CX + sx * 7 * f, y: CY + sy * (3 + 7 * f) }));
    }
    default: {
      check(1);
      const p = SLOTS[slot].points;
      // Edge triangles: halfway in from the edge. Corner triangles: centroid.
      if (slot.startsWith('edge')) {
        const apex = p.find((q) => q.x !== 0 && q.x !== W && q.y !== 0 && q.y !== H)!;
        const base = { x: (p[0].x + p[1].x + p[2].x - apex.x) / 2, y: (p[0].y + p[1].y + p[2].y - apex.y) / 2 };
        return [{ x: base.x + (apex.x - base.x) * 0.45, y: base.y + (apex.y - base.y) * 0.45 }];
      }
      return [{ x: (p[0].x + p[1].x + p[2].x) / 3, y: (p[0].y + p[1].y + p[2].y) / 3 }];
    }
  }
}

function card(n: number, suit: Suit, printed: number, labelFlipped: boolean, spec: Partial<Record<Slot, number>>): TactaCard {
  const shapes = (Object.entries(spec) as Array<[Slot, number]>).map(([slot, dots]) => ({
    slot,
    kind: SLOTS[slot].kind,
    points: SLOTS[slot].points,
    dots: dotsFor(slot, dots),
  }));
  return { n, suit, printed, labelFlipped, shapes };
}

/** Numbers are dot counts; 0 means an empty (outline-only) shape. */
export const TACTA_DECK: TactaCard[] = [
  card(1, 'square', 5, true, { 'band-top': 3, 'edge-left': 0, 'square-br': 2 }),
  card(2, 'circle', 6, true, { 'band-top': 3, 'edge-left': 1, 'edge-right': 1, 'edge-bottom': 1 }),
  card(3, 'triangle', 3, true, { 'edge-top': 0, 'band-right': 3, 'corner-bl': 0 }),
  card(4, 'square', 3, false, { 'square-tr': 2, 'edge-left': 0, 'corner-br': 1 }),
  card(5, 'square', 2, true, { 'band-top': 0, 'edge-right': 0, 'square-bl': 2 }),
  card(6, 'circle', 4, false, { 'long-right': 4, 'corner-tl': 0, 'corner-bl': 0 }),
  card(7, 'circle', 3, false, { 'corner-tl': 0, 'edge-right': 0, 'band-bottom': 3 }),
  card(8, 'triangle', 5, true, { 'edge-left': 1, 'long-right': 4 }),
  card(9, 'triangle', 4, true, { 'band-top': 3, 'edge-left': 0, 'corner-br': 1 }),
  card(10, 'circle', 1, true, { 'band-top': 0, 'edge-left': 1, 'square-br': 0 }),
  card(11, 'square', 6, true, { 'long-right': 4, 'corner-tl': 0, 'square-bl': 2 }),
  card(12, 'triangle', 1, true, { 'band-left': 0, 'corner-tr': 1, 'square-br': 0 }),
  card(13, 'square', 1, false, { 'corner-tl': 1, 'corner-bl': 0, 'long-right': 0 }),
  card(14, 'square', 4, false, { 'edge-top': 1, 'band-right': 3, 'corner-bl': 0 }),
  card(15, 'triangle', 6, false, { 'corner-tl': 1, 'corner-bl': 1, 'long-right': 4 }),
  card(16, 'circle', 2, false, { 'square-tl': 0, 'edge-right': 1, 'corner-bl': 1 }),
  card(17, 'circle', 5, false, { 'edge-top': 1, 'band-right': 3, 'corner-bl': 1 }),
  card(18, 'triangle', 2, true, { 'corner-tl': 1, 'edge-right': 0, 'edge-bottom': 1 }),
];

/** The black-and-white starting card shows every slot as an outline. */
export const TACTA_START: TactaCard = {
  n: 0,
  suit: null,
  printed: null,
  labelFlipped: false,
  shapes: (Object.keys(SLOTS) as Slot[]).map((slot) => ({ slot, kind: SLOTS[slot].kind, points: SLOTS[slot].points, dots: [] })),
};

export function dotCount(card: TactaCard): number {
  return card.shapes.reduce((sum, s) => sum + s.dots.length, 0);
}
