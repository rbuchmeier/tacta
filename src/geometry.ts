export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tolerance for coordinates. */
const EPS = 1e-6;
/** Overlaps smaller than this (in square units) count as touching. */
export const AREA_EPS = 1e-3;

/**
 * Orientation of a card: rotation in 45° steps (0-7), clockwise because y
 * points down, plus 8 when the card is flipped over (the back mirrors the
 * front, so flipping mirrors the layout).
 */
export type Orientation = number;
export const ORIENTATIONS: Orientation[] = Array.from({ length: 16 }, (_, i) => i);

/** Affine map p → (a·x + c·y + e, b·x + d·y + f), laid out like SVG's matrix(). */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * Card-local → board transform. Flipping mirrors across the vertical line
 * x = mirrorAt (the card's center line) before rotating about the origin;
 * then the result is translated by `at`.
 */
export function cardTransform(o: Orientation, at: Pt, mirrorAt: number): Affine {
  const theta = ((o % 8) * Math.PI) / 4;
  const cos = snap(Math.cos(theta));
  const sin = snap(Math.sin(theta));
  const flip = o >= 8;
  // Flip: x → 2·mirrorAt − x.
  const fa = flip ? -1 : 1;
  const fe = flip ? 2 * mirrorAt : 0;
  return {
    a: cos * fa,
    b: sin * fa,
    c: -sin,
    d: cos,
    e: cos * fe + at.x,
    f: sin * fe + at.y,
  };
}

export function apply(m: Affine, p: Pt): Pt {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

export function svgMatrix(m: Affine): string {
  return `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
}

function snap(n: number): number {
  return Math.abs(n) < 1e-12 ? 0 : n;
}

export function bbox(points: Pt[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function rectsTouch(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function polygonArea(points: Pt[]): number {
  return Math.abs(signedArea(points));
}

function signedArea(points: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Sutherland–Hodgman clip of a polygon against a convex polygon (either winding). */
function clipConvex(subject: Pt[], clip: Pt[]): Pt[] {
  const sign = signedArea(clip) >= 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length > 0; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const side = (p: Pt) => sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const sc = side(cur);
      const sp = side(prev);
      if (sc >= -EPS) {
        if (sp < -EPS) out.push(lerp(prev, cur, sp / (sp - sc)));
        out.push(cur);
      } else if (sp >= -EPS) {
        out.push(lerp(prev, cur, sp / (sp - sc)));
      }
    }
  }
  return out;
}

function lerp(p: Pt, q: Pt, t: number): Pt {
  return { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
}

/** Area shared by two convex polygons. */
export function convexOverlapArea(a: Pt[], b: Pt[]): number {
  if (!rectsTouch(bbox(a), bbox(b))) return 0;
  const clipped = clipConvex(a, b);
  return clipped.length < 3 ? 0 : polygonArea(clipped);
}

/** Point strictly inside a convex polygon (on the edge does not count). */
export function insideConvex(p: Pt, poly: Pt[]): boolean {
  const sign = signedArea(poly) >= 0 ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) <= EPS) return false;
  }
  return true;
}

/**
 * When `b` is an exact translated copy of `a` (same vertices in any order),
 * returns the translation taking a onto b; otherwise null.
 */
export function translationBetween(a: Pt[], b: Pt[]): Pt | null {
  if (a.length !== b.length) return null;
  const ba = bbox(a);
  const bb = bbox(b);
  if (Math.abs(ba.w - bb.w) > 1e-6 || Math.abs(ba.h - bb.h) > 1e-6) return null;
  const dx = bb.x - ba.x;
  const dy = bb.y - ba.y;
  const ok = a.every((p) => b.some((q) => Math.abs(p.x + dx - q.x) < 1e-6 && Math.abs(p.y + dy - q.y) < 1e-6));
  return ok ? { x: dx, y: dy } : null;
}

/** Distance from a point to a convex polygon (0 when inside or on it). */
export function distanceToConvex(p: Pt, poly: Pt[]): number {
  if (insideConvex(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y))));
  }
  return best;
}
