import { COLORS } from '../colors';
import { installOption, onInstallChange, promptInstall } from '../install';

/** Players tap colors in seat order; seat order is turn order. */
export class SetupScreen {
  readonly el: HTMLElement;
  private seats: string[];
  private showInstallHelp = false;

  constructor(
    private readonly onStart: (colorIds: string[]) => void,
    initial: string[] = [],
  ) {
    this.seats = [...initial];
    this.el = document.createElement('div');
    this.el.className = 'setup';
    this.el.addEventListener('click', (e) => this.click(e));
    const stop = onInstallChange(() => (this.el.isConnected ? this.render() : stop()));
    this.render();
  }

  private click(e: MouseEvent): void {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-color], [data-action]');
    if (!btn) return;
    const color = btn.dataset.color;
    if (color) {
      this.seats = this.seats.includes(color) ? this.seats.filter((c) => c !== color) : [...this.seats, color];
      this.render();
    } else if (btn.dataset.action === 'start' && this.seats.length >= 2) {
      this.onStart(this.seats);
    } else if (btn.dataset.action === 'install') {
      if (installOption().kind === 'prompt') {
        void promptInstall();
      } else {
        this.showInstallHelp = !this.showInstallHelp;
        this.render();
      }
    }
  }

  private render(): void {
    const tiles = COLORS.map((c) => {
      const seat = this.seats.indexOf(c.id);
      return `<button class="color-tile${seat >= 0 ? ' picked' : ''}" style="--c:${c.fill}" data-color="${c.id}" aria-pressed="${seat >= 0}">
        <span class="seat">${seat >= 0 ? seat + 1 : ''}</span>
        <span>${c.name}</span>
      </button>`;
    }).join('');
    const n = this.seats.length;
    this.el.innerHTML = `
      <div class="setup-inner">
        <div class="setup-head">
          <h1 class="logo">Tacta</h1>
          ${this.installButton()}
        </div>
        ${this.installHelp()}
        <p class="muted">Pass-and-play on one phone. Each player taps a color, in seat order around the table.</p>
        <div class="color-grid">${tiles}</div>
        <button class="btn primary big" data-action="start" ${n >= 2 ? '' : 'disabled'}>
          ${n >= 2 ? `Start game · ${n} players` : 'Pick at least 2 colors'}
        </button>
        <details class="how">
          <summary>How to play</summary>
          <ul>
            <li>On your turn, play the top or bottom card of your stack.</li>
            <li>One of its shapes must exactly cover a matching open shape on the table. Green outlines show every legal spot, including diagonal ones: triangles always connect with the card turned 45°.</li>
            <li>Tap a green shape to preview your card there (tap it again to see other ways), then tap the card to place it.</li>
            <li>Cover your opponents' dots and protect your own. The most visible dots in your color at the end wins.</li>
          </ul>
        </details>
        <p class="notice">Unofficial, fan-made companion for people who own the physical game. Tacta is designed by Jason Tremblay and published by The Op; this app isn’t affiliated with or endorsed by them.</p>
      </div>`;
  }

  private installButton(): string {
    const option = installOption();
    if (option.kind === 'none') return '';
    const expanded = option.kind === 'instructions' ? ` aria-expanded="${this.showInstallHelp}"` : '';
    return `<button class="btn install-btn" data-action="install"${expanded}>${DOWNLOAD_ICON} Install</button>`;
  }

  private installHelp(): string {
    const option = installOption();
    if (option.kind !== 'instructions' || !this.showInstallHelp) return '';
    const steps =
      option.platform === 'ios'
        ? 'Tap the <b>Share</b> button (the square with an arrow), then <b>Add to Home Screen</b>.'
        : 'Open the browser menu <b>⋮</b>, then tap <b>Install app</b> or <b>Add to Home screen</b>.';
    return `<p class="install-help">${steps} Tacta then opens full screen from your home screen and works offline.</p>`;
  }
}

const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>`;
