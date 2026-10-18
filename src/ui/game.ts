import { COLORS, type DeckColor } from '../colors';
import {
  applyMove,
  boardBounds,
  cardById,
  outermost,
  placementsFor,
  scores,
  transformOf,
  worldCard,
  type GameState,
  type Placement,
  type Side,
} from '../engine';
import { bbox, distanceToConvex, insideConvex, svgMatrix, unionRect, type Pt, type Rect } from '../geometry';
import { BoardView } from './board';
import { tactaCardSvg, tactaCardThumb } from './tactaCardSvg';

export interface GameCallbacks {
  /** Persist after every change. */
  save(state: GameState, history: GameState[]): void;
  playAgain(colorIds: string[]): void;
  quit(): void;
}

interface Option {
  side: Side;
  cardId: string;
  placements: Placement[];
  free: boolean;
}

export class GameScreen {
  readonly el: HTMLElement;
  private readonly board: BoardView;
  private readonly header: HTMLElement;
  private readonly tray: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly modal: HTMLElement;

  private options: Option[] = [];
  private side: Side = 'top';
  private preview: Placement | null = null;
  private quitArmed = false;
  private toastTimer = 0;

  constructor(
    private state: GameState,
    private history: GameState[],
    private readonly cb: GameCallbacks,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'game';
    this.el.innerHTML = `
      <header class="scores"></header>
      <div class="board-wrap">
        <div class="hint" aria-live="polite"></div>
        <button class="icon-btn fit-btn" data-action="fit" aria-label="Fit board to screen">${FIT_ICON}</button>
        <div class="toast" role="status"></div>
      </div>
      <footer class="tray"></footer>
      <div class="modal" hidden></div>`;
    this.header = this.el.querySelector('.scores')!;
    this.tray = this.el.querySelector('.tray')!;
    this.hint = this.el.querySelector('.hint')!;
    this.toast = this.el.querySelector('.toast')!;
    this.modal = this.el.querySelector('.modal')!;

    this.board = new BoardView((p, reach) => this.tap(p, reach));
    this.el.querySelector('.board-wrap')!.prepend(this.board.el);
    this.el.addEventListener('click', (e) => this.click(e));
  }

  /** Call once the element is in the document so the board can measure itself. */
  start(): void {
    this.newTurn({ forceFit: true });
    if (!this.state.over && this.state.board.length === 1) {
      this.showToast(`${this.color(this.state.current).name} goes first: lowest card`);
    }
  }

  private color(player: number): DeckColor {
    return COLORS.find((c) => c.id === this.state.players[player].colorId)!;
  }

  private newTurn({ forceFit = false } = {}): void {
    this.preview = null;
    this.quitArmed = false;
    this.options = this.state.over
      ? []
      : outermost(this.state.players[this.state.current]).map((s) => ({ ...s, ...placementsFor(this.state, s.cardId) }));
    // Default to the top card unless only the bottom one can go somewhere.
    const top = this.options.find((o) => o.side === 'top');
    const bottom = this.options.find((o) => o.side === 'bottom');
    this.side = top && top.placements.length === 0 && bottom && bottom.placements.length > 0 ? 'bottom' : 'top';

    this.render();
    const area = this.focusArea();
    if (forceFit || !this.board.shows(area)) this.board.fit(area);
    if (this.state.over) this.showResults();
  }

  private get selected(): Option | undefined {
    return this.options.find((o) => o.side === this.side);
  }

  /** Board outline of a spot for the selected card. */
  private outline(pl: Placement): Pt[] {
    return worldCard(this.selected!.cardId, pl).outline;
  }

  /**
   * The board plus room for a card around it (so previews mostly land on
   * screen), and the previewed card if any.
   */
  private focusArea(): Rect {
    const b = boardBounds(this.state.board);
    const pad = 14;
    const area = { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
    return this.preview ? unionRect(area, bbox(this.outline(this.preview))) : area;
  }

  private tap(p: Pt, reach: number): void {
    if (this.state.over) return;
    // Spots are picked by tapping the shape they cover (free spots by their
    // outline). Taps just outside a shape still count, so small triangles are
    // easy to hit with a finger.
    const placements = this.selected?.placements ?? [];
    const target = (pl: Placement) => pl.shape ?? this.outline(pl);
    let hits = placements.filter((pl) => insideConvex(p, target(pl)));
    if (hits.length === 0) {
      const near = placements.map((pl) => ({ pl, d: distanceToConvex(p, target(pl)) })).filter((h) => h.d <= reach);
      const closest = Math.min(...near.map((h) => h.d));
      hits = near.filter((h) => h.d === closest).map((h) => h.pl);
    }
    const onPreviewCard = this.preview !== null && insideConvex(p, this.outline(this.preview));
    if (onPreviewCard && !hits.includes(this.preview!)) {
      this.commit();
      return;
    }
    if (hits.length === 0) {
      this.preview = null;
    } else {
      // Repeat taps on the same shape cycle through the ways to play onto it.
      const at = this.preview ? hits.indexOf(this.preview) : -1;
      this.preview = hits[(at + 1) % hits.length];
    }
    // Never move the board here: the same spot must stay under the finger so a
    // second tap cycles instead of landing somewhere else.
    this.render();
  }

  private commit(): void {
    if (!this.preview) return;
    this.history = [...this.history, this.state];
    this.state = applyMove(this.state, this.side, this.preview);
    this.cb.save(this.state, this.history);
    this.newTurn();
    if (!this.state.over) this.showToast(`${this.color(this.state.current).name}'s turn`);
  }

  private undo(): void {
    const prev = this.history.at(-1);
    if (!prev) return;
    this.history = this.history.slice(0, -1);
    this.state = prev;
    this.modal.hidden = true;
    this.cb.save(this.state, this.history);
    this.newTurn();
  }

  private click(e: MouseEvent): void {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'select':
        this.side = btn.dataset.side as Side;
        this.preview = null;
        this.render();
        if (!this.board.shows(this.focusArea())) this.board.fit(this.focusArea());
        break;
      case 'place':
        this.commit();
        break;
      case 'cancel':
        this.preview = null;
        this.render();
        break;
      case 'undo':
        this.undo();
        break;
      case 'fit':
        this.board.fit(this.focusArea());
        break;
      case 'quit':
        if (this.quitArmed) {
          this.cb.quit();
        } else {
          this.quitArmed = true;
          this.renderTray();
        }
        break;
      case 'again':
        this.cb.playAgain(this.state.players.map((p) => p.colorId));
        break;
      case 'new':
        this.cb.quit();
        break;
    }
  }

  private render(): void {
    this.renderBoard();
    this.renderScores();
    this.renderTray();
    this.renderHint();
  }

  private renderBoard(): void {
    const { board } = this.state;
    const cards = board
      .map((p) => {
        const fill = p.owner < 0 ? null : this.color(p.owner).fill;
        return `<g transform="${svgMatrix(transformOf(p))}">${tactaCardSvg(cardById(p.cardId), fill)}</g>`;
      })
      .join('');
    const lastPlaced = board.length > 1 ? board[board.length - 1] : null;
    const lastRing = lastPlaced ? `<polygon points="${pts(worldCard(lastPlaced.cardId, lastPlaced).outline)}" class="last-ring"/>` : '';

    const sel = this.selected;
    // One highlight per coverable shape; free spots show the whole card outline.
    const shapes = new Map<Pt[], boolean>();
    const free: string[] = [];
    for (const pl of sel?.placements ?? []) {
      if (pl.shape) shapes.set(pl.shape, shapes.get(pl.shape) || pl === this.preview);
      else free.push(`<polygon points="${pts(this.outline(pl))}" class="ghost-card ghost${pl === this.preview ? ' active' : ''}"/>`);
    }
    const ghosts =
      [...shapes].map(([shape, active]) => `<polygon points="${pts(shape)}" class="ghost-shape ghost${active ? ' active' : ''}"/>`).join('') +
      free.join('');

    let preview = '';
    if (this.preview && sel) {
      preview = `<g class="preview"><g transform="${svgMatrix(transformOf(this.preview))}">${tactaCardSvg(
        cardById(sel.cardId),
        this.color(this.state.current).fill,
      )}</g><polygon points="${pts(this.outline(this.preview))}" class="preview-ring"/></g>`;
    }
    this.board.setContent(
      `<g class="cards">${cards}</g>${lastRing}<g class="ghosts${this.preview ? ' dim' : ''}">${ghosts}</g>${preview}`,
    );
  }

  private renderScores(): void {
    const now = scores(this.state.board, this.state.players.length);
    let next: number[] | null = null;
    if (this.preview) next = scores(applyMove(this.state, this.side, this.preview).board, this.state.players.length);

    this.header.innerHTML = this.state.players
      .map((pl, i) => {
        const c = this.color(i);
        const delta = next ? next[i] - now[i] : 0;
        const badge = delta ? `<span class="delta ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${delta}</span>` : '';
        const current = i === this.state.current && !this.state.over ? ' current' : '';
        return `<div class="chip${current}" style="--c:${c.fill}">
          <span class="swatch"></span>
          <span class="chip-name">${c.name}</span>
          <span class="chip-score">${now[i]}</span>${badge}
          <span class="chip-left" title="Cards left">${pl.deck.length}</span>
        </div>`;
      })
      .join('');
  }

  private renderTray(): void {
    if (this.state.over) {
      this.tray.innerHTML = `<div class="turn">Game over</div><div class="tray-actions">${this.undoBtn()}</div>`;
      return;
    }
    const c = this.color(this.state.current);
    const left = this.state.players[this.state.current].deck.length;
    const hand = this.options
      .map((o) => {
        const n = o.placements.length;
        const label = o.free ? 'play apart' : n === 0 ? 'no spots' : `${n} spot${n === 1 ? '' : 's'}`;
        return `<button class="hand-card${o.side === this.side ? ' selected' : ''}${n === 0 ? ' blocked' : ''}"
            data-action="select" data-side="${o.side}" aria-pressed="${o.side === this.side}">
          ${tactaCardThumb(cardById(o.cardId), c.fill)}
          <span class="hand-label"><b>${o.side === 'top' ? 'Top' : 'Bottom'}</b> ${label}</span>
        </button>`;
      })
      .join('');
    const confirm = `<button class="btn primary grow" data-action="place">Place card</button><button class="btn grow" data-action="cancel">Cancel</button>`;
    this.tray.innerHTML = `
      <div class="turn" style="--c:${c.fill}"><span class="swatch"></span><b>${c.name}'s turn</b><span class="muted">${left} card${left === 1 ? '' : 's'} left</span></div>
      <div class="hand">${hand}</div>
      <div class="tray-actions">
        ${
          // While previewing, only placing or cancelling makes sense (and it fits a phone).
          this.preview
            ? confirm
            : `<span class="spacer"></span>${this.undoBtn()}
              <button class="btn ghost-btn${this.quitArmed ? ' danger' : ''}" data-action="quit">${this.quitArmed ? 'Tap again to quit' : 'Quit'}</button>`
        }
      </div>`;
  }

  private undoBtn(): string {
    return `<button class="btn ghost-btn" data-action="undo" ${this.history.length ? '' : 'disabled'}>Undo</button>`;
  }

  private renderHint(): void {
    const sel = this.selected;
    let text = '';
    if (this.state.over) text = '';
    else if (this.preview) {
      const ways = sel?.placements.filter((pl) => pl.shape && pl.shape === this.preview!.shape).length ?? 0;
      text = ways > 1 ? `Tap the card to place it, or the shape for other ways (${ways})` : 'Tap the card to place it';
    }
    else if (sel?.free) text = 'No matching shapes: tap a spot to play this card on its own';
    else if (sel && sel.placements.length === 0) text = 'This card has no spot. Use your other card.';
    else text = 'Tap a green shape to try your card there';
    this.hint.textContent = text;
    this.hint.hidden = !text;
  }

  private showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 1600);
  }

  private showResults(): void {
    const final = scores(this.state.board, this.state.players.length);
    const best = Math.max(...final);
    const ranked = this.state.players.map((_, i) => i).sort((a, b) => final[b] - final[a]);
    const winners = ranked.filter((i) => final[i] === best);
    const title =
      winners.length === 1 ? `${this.color(winners[0]).name} wins!` : `Shared win: ${winners.map((i) => this.color(i).name).join(' & ')}`;
    const rows = ranked
      .map((i) => {
        const c = this.color(i);
        return `<li class="${final[i] === best ? 'winner' : ''}" style="--c:${c.fill}">
          <span class="swatch"></span><span class="chip-name">${c.name}</span><span class="final">${final[i]}</span>
        </li>`;
      })
      .join('');
    this.modal.innerHTML = `
      <div class="sheet" role="dialog" aria-labelledby="result-title">
        <h2 id="result-title">${title}</h2>
        <p class="muted">Visible dots at the end of the game</p>
        <ol class="results">${rows}</ol>
        <div class="sheet-actions">
          <button class="btn primary" data-action="again">Play again</button>
          <button class="btn" data-action="new">New setup</button>
          <button class="btn ghost-btn" data-action="undo">Undo last move</button>
        </div>
      </div>`;
    this.modal.hidden = false;
  }
}

function pts(points: Pt[]): string {
  return points.map((q) => `${q.x},${q.y}`).join(' ');
}

const FIT_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`;
