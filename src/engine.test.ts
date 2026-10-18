import { describe, expect, it } from 'vitest';
import { TACTA_DECK } from './deck/tacta';
import {
  applyMove,
  firstPlayer,
  idOf,
  legalPlacements,
  newGame,
  outermost,
  placementsFor,
  scores,
  worldCard,
  type GameState,
  type Placed,
} from './engine';
import { AREA_EPS, apply, cardTransform, convexOverlapArea, polygonArea } from './geometry';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

const START: Placed[] = newGame(['red', 'blue']).board;
const card = (n: number) => `c${n}`;

describe('cardTransform', () => {
  it('turns clockwise in 45° steps', () => {
    const m = cardTransform(2, { x: 0, y: 0 }, 7);
    const p = apply(m, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(1, 9);
  });
  it('mirrors across the card center line when flipped', () => {
    const p = apply(cardTransform(8, { x: 0, y: 0 }, 7), { x: 0, y: 3 });
    expect(p).toEqual({ x: 14, y: 3 });
  });
});

describe('legal placements', () => {
  it('every card can connect to the starting card', () => {
    for (const c of TACTA_DECK) expect(legalPlacements(START, idOf(c)).length, `card ${c.n}`).toBeGreaterThan(0);
  });

  it('triangles only connect on a 45° turn', () => {
    // Card 8 has an edge triangle; the start card's corner triangles take it diagonally.
    const tri = legalPlacements(START, card(8)).filter((p) => p.shape!.length === 3);
    expect(tri.length).toBeGreaterThan(0);
    for (const p of tri) expect(p.o % 2, 'odd = diagonal').toBe(1);
  });

  it('bands and squares connect square-on', () => {
    const square = legalPlacements(START, card(1)).filter((p) => p.shape!.length === 4);
    expect(square.length).toBeGreaterThan(0);
    for (const p of square) expect(p.o % 2).toBe(0);
  });

  it('a 14×3 band covers a short side band', () => {
    // Card 1's top band onto the start card's right short band (x 11-14).
    const onRight = legalPlacements(START, card(1)).filter((p) => p.shape!.every((q) => q.x >= 11 - 7 - 1e-9));
    expect(onRight.length).toBeGreaterThan(0);
  });

  it('a placed card overlaps the printed area underneath only inside the covered shape', () => {
    let g: GameState = newGame(['red', 'blue', 'green'], seeded(3));
    for (let turn = 0; turn < 20 && !g.over; turn++) {
      const [s] = outermost(g.players[g.current]);
      const { placements } = placementsFor(g, s.cardId);
      for (const p of placements.filter((q) => q.target !== null)) {
        const top = worldCard(s.cardId, p);
        g.board.forEach((b, i) => {
          const frame = worldCard(b.cardId, b).frame;
          if (i === p.target) {
            expect(convexOverlapArea(top.frame, frame)).toBeLessThanOrEqual(polygonArea(p.shape!) + AREA_EPS);
          } else {
            expect(convexOverlapArea(top.outline, frame)).toBeLessThanOrEqual(AREA_EPS);
          }
        });
      }
      if (placements.length === 0) {
        g = applyMove(g, outermost(g.players[g.current]).at(-1)!.side, placementsFor(g, outermost(g.players[g.current]).at(-1)!.cardId).placements[0]);
      } else {
        g = applyMove(g, s.side, placements[Math.floor(placements.length / 2)]);
      }
    }
  });
});

describe('full game', () => {
  it('plays to the end with every card on the board', () => {
    let g: GameState = newGame(['red', 'blue', 'green'], seeded(42));
    let turns = 0;
    let diagonal = 0;
    while (!g.over) {
      const option = outermost(g.players[g.current])
        .map((s) => ({ s, ...placementsFor(g, s.cardId) }))
        .find((o) => o.placements.length > 0);
      expect(option, 'a playable option exists').toBeTruthy();
      const pick = option!.placements[turns % option!.placements.length];
      if (pick.o % 2) diagonal++;
      g = applyMove(g, option!.s.side, pick);
      turns++;
    }
    expect(turns).toBe(54);
    expect(g.board).toHaveLength(55);
    expect(diagonal).toBeGreaterThan(0);
    const total = TACTA_DECK.reduce((a, c) => a + c.printed!, 0);
    for (const v of scores(g.board, 3)) expect(v).toBeLessThanOrEqual(total);
  });

  it('covering a dotted shape removes those points', () => {
    let g = newGame(['red', 'blue'], seeded(7));
    const red = g.current;
    // Red plays card 1 (3-dot top band, 2-dot square) onto the start card by its square.
    g.players[red].deck = [card(1), ...g.players[red].deck.filter((c) => c !== card(1))];
    const p = legalPlacements(g.board, card(1)).find((q) => Math.abs(polygonArea(q.shape!) - 49) < 1e-6)!;
    g = applyMove(g, 'top', p);
    expect(scores(g.board, 2)[red]).toBe(5);
    // Blue covers the band with card 9's band.
    const cover = legalPlacements(g.board, card(9)).find((q) => q.target === 1 && q.shape!.length === 4 && Math.abs(polygonArea(q.shape!) - 42) < 1e-6);
    expect(cover).toBeTruthy();
    const blue = g.current;
    g.players[blue].deck = [card(9), ...g.players[blue].deck.filter((c) => c !== card(9))];
    g = applyMove(g, 'top', cover!);
    expect(scores(g.board, 2)[red]).toBe(2);
  });
});

describe('firstPlayer', () => {
  it('picks the lowest outermost card', () => {
    const players = [
      { colorId: 'red', deck: [card(2), card(11)] },
      { colorId: 'blue', deck: [card(2), card(10)] },
    ];
    expect(firstPlayer(players)).toBe(1);
  });
});
