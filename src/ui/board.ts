import type { Pt, Rect } from '../geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TAP_SLOP = 10; // px a pointer may wander and still count as a tap
// Board units are card frame units (a card is about 16 × 22).
const MIN_SCALE = 1.2;
const MAX_SCALE = 70;

/**
 * Pannable, pinch-zoomable SVG surface in board coordinates. Content is set
 * as markup; taps are reported in board coordinates, along with how far
 * TAP_SLOP pixels reach at the current zoom (for forgiving hit tests).
 */
export class BoardView {
  readonly el: SVGSVGElement;
  private readonly layer: SVGGElement;
  private view = { x: -30, y: -30, scale: 8 };
  private pointers = new Map<number, Pt>();
  private dragged = false;
  private downAt: Pt | null = null;
  /** The pointer that may still turn out to be a tap. */
  private tapId: number | null = null;

  constructor(private readonly onTap: (p: Pt, reach: number) => void) {
    this.el = document.createElementNS(SVG_NS, 'svg');
    this.el.classList.add('board');
    this.layer = document.createElementNS(SVG_NS, 'g');
    this.el.append(this.layer);

    this.el.addEventListener('pointerdown', this.down);
    this.el.addEventListener('pointermove', this.move);
    this.el.addEventListener('pointerup', this.up);
    this.el.addEventListener('pointercancel', this.cancel);
    this.el.addEventListener('wheel', this.wheel, { passive: false });
    new ResizeObserver(() => this.applyView()).observe(this.el);
  }

  setContent(markup: string): void {
    this.layer.innerHTML = markup;
  }

  /** Zoom and center so the rect fills the view with some margin. */
  fit(r: Rect, margin = 24): void {
    const { width, height } = this.size();
    if (width === 0 || height === 0) return;
    const scale = clamp(Math.min((width - margin * 2) / r.w, (height - margin * 2) / r.h), MIN_SCALE, 22);
    this.view = {
      scale,
      x: r.x + r.w / 2 - width / scale / 2,
      y: r.y + r.h / 2 - height / scale / 2,
    };
    this.applyView();
  }

  /** True when the rect is entirely on screen. */
  shows(r: Rect): boolean {
    const { width, height } = this.size();
    const { x, y, scale } = this.view;
    return r.x >= x && r.y >= y && r.x + r.w <= x + width / scale && r.y + r.h <= y + height / scale;
  }

  private size(): { width: number; height: number } {
    const b = this.el.getBoundingClientRect();
    return { width: b.width, height: b.height };
  }

  private applyView(): void {
    const { width, height } = this.size();
    const { x, y, scale } = this.view;
    this.el.setAttribute('viewBox', `${x} ${y} ${width / scale} ${height / scale}`);
  }

  private toBoard(clientX: number, clientY: number): Pt {
    const b = this.el.getBoundingClientRect();
    return { x: this.view.x + (clientX - b.left) / this.view.scale, y: this.view.y + (clientY - b.top) / this.view.scale };
  }

  private zoomAt(clientX: number, clientY: number, factor: number): void {
    const before = this.toBoard(clientX, clientY);
    this.view.scale = clamp(this.view.scale * factor, MIN_SCALE, MAX_SCALE);
    const after = this.toBoard(clientX, clientY);
    this.view.x += before.x - after.x;
    this.view.y += before.y - after.y;
    this.applyView();
  }

  private down = (e: PointerEvent): void => {
    if (e.isPrimary) {
      // A primary pointer starts a new gesture. Anything still tracked is a
      // pointer whose 'up' never arrived; with touch every contact gets a new
      // id, so stale entries would make every later tap look like a pinch.
      this.pointers.clear();
      this.dragged = false;
      this.downAt = { x: e.clientX, y: e.clientY };
      this.tapId = e.pointerId;
    } else {
      this.dragged = true; // a second finger means a pinch, never a tap
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // Capture only keeps drags smooth when they leave the board; taps don't need it.
    }
  };

  private move = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };

    if (this.pointers.size === 1) {
      if (!this.dragged && this.downAt && dist(cur, this.downAt) > TAP_SLOP) this.dragged = true;
      if (this.dragged) {
        this.view.x -= (cur.x - prev.x) / this.view.scale;
        this.view.y -= (cur.y - prev.y) / this.view.scale;
        this.applyView();
      }
    } else if (this.pointers.size === 2) {
      const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)![1];
      const mid = { x: (cur.x + other.x) / 2, y: (cur.y + other.y) / 2 };
      const prevMid = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
      this.zoomAt(mid.x, mid.y, dist(cur, other) / Math.max(dist(prev, other), 1));
      this.view.x -= (mid.x - prevMid.x) / this.view.scale;
      this.view.y -= (mid.y - prevMid.y) / this.view.scale;
      this.applyView();
    }
    this.pointers.set(e.pointerId, cur);
  };

  private up = (e: PointerEvent): void => {
    const wasTap = e.pointerId === this.tapId && !this.dragged;
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.tapId) this.tapId = null;
    if (wasTap) this.onTap(this.toBoard(e.clientX, e.clientY), TAP_SLOP / this.view.scale);
  };

  private cancel = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.dragged = true;
  };

  private wheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  };
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
