import { describe, expect, it } from 'vitest';
import { convexOverlapArea, polygonArea, translationBetween } from '../geometry';
import { SLOTS, TACTA_DECK, dotCount, type Slot } from './tacta';

describe('transcribed deck', () => {
  it('has 18 cards, 6 of each suit', () => {
    expect(TACTA_DECK).toHaveLength(18);
    for (const suit of ['circle', 'square', 'triangle']) {
      expect(TACTA_DECK.filter((c) => c.suit === suit)).toHaveLength(6);
    }
  });

  it('every card has as many dots as its printed number', () => {
    for (const c of TACTA_DECK) expect(dotCount(c), `card ${c.n}`).toBe(c.printed);
  });

  it('shapes on a card never overlap', () => {
    for (const c of TACTA_DECK) {
      for (let i = 0; i < c.shapes.length; i++) {
        for (let j = i + 1; j < c.shapes.length; j++) {
          const area = convexOverlapArea(c.shapes[i].points, c.shapes[j].points);
          expect(area, `card ${c.n}: ${c.shapes[i].slot} / ${c.shapes[j].slot}`).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('dots sit inside their shapes', () => {
    for (const c of TACTA_DECK) {
      for (const s of c.shapes) {
        for (const d of s.dots) {
          const probe = [
            { x: d.x - 0.01, y: d.y - 0.01 },
            { x: d.x + 0.01, y: d.y - 0.01 },
            { x: d.x + 0.01, y: d.y + 0.01 },
            { x: d.x - 0.01, y: d.y + 0.01 },
          ];
          expect(convexOverlapArea(probe, s.points), `card ${c.n} ${s.slot}`).toBeCloseTo(polygonArea(probe), 6);
        }
      }
    }
  });
});

describe('slot geometry', () => {
  const slots = Object.keys(SLOTS) as Slot[];
  it('edge and corner triangles have the same area', () => {
    const areas = slots.filter((s) => SLOTS[s].kind === 'triangle').map((s) => polygonArea(SLOTS[s].points));
    for (const a of areas) expect(a).toBeCloseTo(areas[0], 6);
  });

  it('a top band is the same rectangle as a short side band', () => {
    const top = SLOTS['band-top'].points;
    const side = SLOTS['band-right'].points.map((p) => ({ x: p.y, y: p.x }));
    expect(translationBetween(side, top)).not.toBeNull();
  });

  it('edge triangles start exactly where corner triangle legs end', () => {
    const cornerEnd = SLOTS['corner-tl'].points[2];
    const edgeStart = SLOTS['edge-left'].points[0];
    expect(edgeStart.x).toBeCloseTo(cornerEnd.x, 9);
    expect(edgeStart.y).toBeCloseTo(cornerEnd.y, 9);
  });
});
