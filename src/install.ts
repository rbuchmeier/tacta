/**
 * "Install app" support. Chrome (Android and desktop) fires
 * beforeinstallprompt when the site is installable; we hold on to it so a
 * button can open the native install dialog. iOS has no such prompt, and
 * Chrome sometimes withholds it, so on phones we fall back to instructions.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallOption =
  | { kind: 'none' }
  | { kind: 'prompt' }
  | { kind: 'instructions'; platform: 'ios' | 'android' };

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((fn) => fn());

/** Call once at startup, before the event has a chance to fire. */
export function initInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button instead of Chrome's mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  // iPadOS reports itself as a Mac, so also check for touch.
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isMobile(): boolean {
  const hint = (navigator as Navigator & { userAgentData?: { mobile: boolean } }).userAgentData?.mobile;
  return hint === true || isIos() || /Android|Mobi/i.test(navigator.userAgent);
}

export function installOption(): InstallOption {
  if (installed || isStandalone()) return { kind: 'none' };
  if (deferred) return { kind: 'prompt' };
  if (isIos()) return { kind: 'instructions', platform: 'ios' };
  if (isMobile()) return { kind: 'instructions', platform: 'android' };
  return { kind: 'none' };
}

/** Opens the browser's install dialog. Resolves once the player has chosen. */
export async function promptInstall(): Promise<void> {
  const event = deferred;
  if (!event) return;
  deferred = null; // a prompt event can only be used once
  await event.prompt();
  await event.userChoice;
  notify();
}
