import { FRAME_H, FRAME_W, MARGIN, TACTA_DECK, TACTA_START, type ShapeKind, type TactaCard } from './deck/tacta';
import {
  AREA_EPS,
  ORIENTATIONS,
  apply,
  bbox,
  cardTransform,
  convexOverlapArea,
  insideConvex,
  polygonArea,
  translationBetween,
  unionRect,
  type Orientation,
  type Pt,
  type Rect,
} from './geometry';

/** Gap left around the board when a card has to be played on its own. */
const FREE_GAP = 3;

export interface Player {
  colorId: string;
  /** Card ids; index 0 is the top of the stack, the last is the bottom. */
  deck: string[];
}

export interface Placed {
  cardId: string;
  /** Player index, or -1 for the starting card. */
  owner: number;
  o: Orientation;
  x: number;
  y: number;
}

export interface GameState {
  players: Player[];
  /** Cards in the order they were played; later cards lie on top. */
  board: Placed[];
  current: number;
  over: boolean;
}

export interface Placement {
  o: Orientation;
  x: number;
  y: number;
  /** Board index of the card connected to, or null for a free placement. */
  target: number | null;
  /** The target's shape that gets covered (board coordinates). */
  shape: Pt[] | null;
}

export type Side = 'top' | 'bottom';

export interface WorldShape {
  kind: ShapeKind;
  points: Pt[];
  dots: Pt[];
}

/** A card laid on the board, in board coordinates. */
export interface WorldCard {
  /** The printed area inside the white frame line. */
  frame: Pt[];
  /** The whole card, including the colored margin. */
  outline: Pt[];
  shapes: WorldShape[];
}

const FRAME: Pt[] = [
  { x: 0, y: 0 },
  { x: FRAME_W, y: 0 },
  { x: FRAME_W, y: FRAME_H },
  { x: 0, y: FRAME_H },
];
const OUTLINE: Pt[] = [
  { x: -MARGIN, y: -MARGIN },
  { x: FRAME_W + MARGIN, y: -MARGIN },
  { x: FRAME_W + MARGIN, y: FRAME_H + MARGIN },
  { x: -MARGIN, y: FRAME_H + MARGIN },
];

const START_ID = 'start';
export const idOf = (card: TactaCard): string => (card.n === 0 ? START_ID : `c${card.n}`);
const CARDS = new Map<string, TactaCard>([...TACTA_DECK, TACTA_START].map((c) => [idOf(c), c]));

export function cardById(id: string): TactaCard {
  const card = CARDS.get(id);
  if (!card) throw new Error(`Unknown card ${id}`);
  return card;
}

function cardValue(id: string): number {
  return cardById(id).printed ?? 0;
}

export function transformOf(p: Pick<Placed, 'o' | 'x' | 'y'>) {
  return cardTransform(p.o, p, FRAME_W / 2);
}

export function worldCard(cardId: string, p: Pick<Placed, 'o' | 'x' | 'y'>): WorldCard {
  const m = transformOf(p);
  const map = (pts: Pt[]) => pts.map((q) => apply(m, q));
  return {
    frame: map(FRAME),
    outline: map(OUTLINE),
    shapes: cardById(cardId).shapes.map((s) => ({ kind: s.kind, points: map(s.points), dots: map(s.dots) })),
  };
}

function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function newGame(colorIds: string[], rng: () => number = Math.random): GameState {
  const players = colorIds.map((colorId) => ({
    colorId,
    deck: shuffle(TACTA_DECK.map(idOf), rng),
  }));
  const start: Placed = { cardId: START_ID, owner: -1, o: 0, x: -FRAME_W / 2, y: -FRAME_H / 2 };
  return { players, board: [start], current: firstPlayer(players), over: false };
}

/**
 * Lowest outermost card goes first; ties go to the lowest sum of both
 * outermost cards. Remaining ties go to the earliest seat.
 */
export function firstPlayer(players: Player[]): number {
  let best = 0;
  let bestKey: [number, number] = [Infinity, Infinity];
  players.forEach((pl, i) => {
    const values = outermost(pl).map((s) => cardValue(s.cardId));
    const key: [number, number] = [Math.min(...values), values.reduce((a, b) => a + b, 0)];
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      best = i;
      bestKey = key;
    }
  });
  return best;
}

/** The cards a player may play: the top and bottom of their stack. */
export function outermost(player: Player): Array<{ side: Side; cardId: string }> {
  const { deck } = player;
  if (deck.length === 0) return [];
  if (deck.length === 1) return [{ side: 'top', cardId: deck[0] }];
  return [
    { side: 'top', cardId: deck[0] },
    { side: 'bottom', cardId: deck[deck.length - 1] },
  ];
}

function worldsOf(board: Placed[]): WorldCard[] {
  return board.map((p) => worldCard(p.cardId, p));
}

/** Shapes no later card lies over. */
function openShapes(board: Placed[], worlds = worldsOf(board)): Array<{ target: number; shape: WorldShape }> {
  const open: Array<{ target: number; shape: WorldShape }> = [];
  worlds.forEach((w, i) => {
    for (const shape of w.shapes) {
      const covered = worlds.slice(i + 1).some((later) => convexOverlapArea(later.outline, shape.points) > AREA_EPS);
      if (!covered) open.push({ target: i, shape });
    }
  });
  return open;
}

/**
 * Every legal way to connect the card. One of its shapes must exactly cover a
 * matching open shape (any 45° turn, either side up), and:
 * - its printed area overlaps the target's printed area only inside that
 *   shape, so the outline underneath stays intact. This is also what makes
 *   triangles connect only edge-to-corner on a 45° turn;
 * - it covers none of the target's other dots;
 * - it covers no other card's printed area (margins may touch).
 */
export function legalPlacements(board: Placed[], cardId: string): Placement[] {
  const worlds = worldsOf(board);
  const card = cardById(cardId);
  const found = new Map<string, Placement>();

  for (const { target, shape } of openShapes(board, worlds)) {
    const area = polygonArea(shape.points);
    const under = worlds[target];
    for (const o of ORIENTATIONS) {
      const m = cardTransform(o, { x: 0, y: 0 }, FRAME_W / 2);
      for (const own of card.shapes) {
        if (own.kind !== shape.kind) continue;
        const t = translationBetween(
          own.points.map((p) => apply(m, p)),
          shape.points,
        );
        if (!t) continue;

        const placement: Placement = { o, x: t.x, y: t.y, target, shape: shape.points };
        const id = `${o}:${t.x.toFixed(4)}:${t.y.toFixed(4)}`;
        if (found.has(id)) continue;

        const top = worldCard(cardId, placement);
        if (convexOverlapArea(top.frame, under.frame) > area + AREA_EPS) continue;
        if (under.shapes.some((s) => s !== shape && s.dots.some((d) => insideConvex(d, top.outline)))) continue;
        if (worlds.some((w, i) => i !== target && convexOverlapArea(top.outline, w.frame) > AREA_EPS)) continue;
        found.set(id, placement);
      }
    }
  }
  return [...found.values()];
}

/** With no legal move, a card goes anywhere it touches nothing. */
function freePlacements(board: Placed[]): Placement[] {
  const b = boardBounds(board);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const spots: Array<{ o: Orientation; place: (size: Rect) => Pt }> = [
    { o: 0, place: (s) => ({ x: b.x + b.w + FREE_GAP, y: cy - s.h / 2 }) },
    { o: 0, place: (s) => ({ x: b.x - FREE_GAP - s.w, y: cy - s.h / 2 }) },
    { o: 2, place: (s) => ({ x: cx - s.w / 2, y: b.y - FREE_GAP - s.h }) },
    { o: 2, place: (s) => ({ x: cx - s.w / 2, y: b.y + b.h + FREE_GAP }) },
  ];
  return spots.map(({ o, place }) => {
    // Find where the card's bounds land at the origin, then shift them into the spot.
    const at0 = bbox(worldCard(START_ID, { o, x: 0, y: 0 }).outline);
    const want = place(at0);
    return { o, x: want.x - at0.x, y: want.y - at0.y, target: null, shape: null };
  });
}

/**
 * Where the given outermost card may go. Free placement is only allowed when
 * neither outermost card has a legal connection.
 */
export function placementsFor(state: GameState, cardId: string): { placements: Placement[]; free: boolean } {
  const legal = legalPlacements(state.board, cardId);
  if (legal.length > 0) return { placements: legal, free: false };
  const anyLegal = outermost(state.players[state.current]).some(
    (s) => s.cardId !== cardId && legalPlacements(state.board, s.cardId).length > 0,
  );
  return anyLegal ? { placements: [], free: false } : { placements: freePlacements(state.board), free: true };
}

export function applyMove(state: GameState, side: Side, placement: Placement): GameState {
  const players = state.players.map((p) => ({ ...p, deck: [...p.deck] }));
  const me = players[state.current];
  const cardId = side === 'top' ? me.deck.shift() : me.deck.pop();
  if (!cardId) throw new Error('No card to play');
  const board = [...state.board, { cardId, owner: state.current, o: placement.o, x: placement.x, y: placement.y }];

  let next = state.current;
  let over = true;
  for (let step = 1; step <= players.length; step++) {
    const i = (state.current + step) % players.length;
    if (players[i].deck.length > 0) {
      next = i;
      over = false;
      break;
    }
  }
  return { players, board, current: next, over };
}

/** Visible dots per player. A dot is hidden once any later card lies over it. */
export function scores(board: Placed[], playerCount: number): number[] {
  const totals = new Array(playerCount).fill(0);
  const worlds = worldsOf(board);
  board.forEach((p, i) => {
    if (p.owner < 0) return;
    for (const shape of worlds[i].shapes) {
      for (const dot of shape.dots) {
        if (!worlds.slice(i + 1).some((w) => insideConvex(dot, w.outline))) totals[p.owner]++;
      }
    }
  });
  return totals;
}

export function boardBounds(board: Placed[]): Rect {
  return worldsOf(board)
    .map((w) => bbox(w.outline))
    .reduce(unionRect);
}
