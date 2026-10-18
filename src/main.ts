import './styles.css';
import { newGame, type GameState } from './engine';
import { initInstall } from './install';
import { GameScreen } from './ui/game';
import { SetupScreen } from './ui/setup';

initInstall();

const STORAGE_KEY = 'tacta:game:v2';
const app = document.getElementById('app')!;

interface Saved {
  state: GameState;
  history: GameState[];
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function save(saved: Saved | null): void {
  try {
    if (saved) localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode etc.): the game still works, it just won't survive a reload.
  }
}

function showSetup(initial: string[] = []): void {
  save(null);
  app.replaceChildren(new SetupScreen(startGame, initial).el);
}

function startGame(colorIds: string[]): void {
  const state = newGame(colorIds);
  save({ state, history: [] });
  showGame({ state, history: [] });
}

function showGame({ state, history }: Saved): void {
  const screen = new GameScreen(state, history, {
    save: (s, h) => save({ state: s, history: h }),
    playAgain: startGame,
    quit: () => showSetup(state.players.map((p) => p.colorId)),
  });
  app.replaceChildren(screen.el);
  screen.start();
}

const saved = load();
if (saved) {
  try {
    showGame(saved);
  } catch {
    showSetup(); // saved game from an incompatible deck version
  }
} else {
  showSetup();
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`));
}
