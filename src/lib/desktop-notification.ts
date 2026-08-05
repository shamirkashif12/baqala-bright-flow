// OS-level desktop notifications — the toast that appears in the corner of the screen even when the
// browser is minimised or the user is in another application.
//
// Scope is deliberately narrow: this exists for the one event nobody is present for, a new online
// order arriving. Every other notification type is adequately served by the bell, and an OS toast
// that fires for routine events is one the user turns off within a day — taking the online-order
// alert down with it.
//
// Requires a secure context (https:// or localhost). Served over plain http:// from a LAN address,
// `Notification` is simply absent from `window` and every function here degrades to a no-op, leaving
// the in-app bell and beep as they were.

const STORAGE_KEY = "mimony.desktopNotifications";

export type DesktopNotificationPermission = "unsupported" | "default" | "granted" | "denied";

function isSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function desktopNotificationPermission(): DesktopNotificationPermission {
  if (!isSupported()) return "unsupported";
  return Notification.permission;
}

// Stored per BROWSER rather than per user account, matching the sound toggle in
// notification-sound.ts and for the same reason: whether desktop toasts are wanted is a property of
// the machine — the back-office PC that watches for orders wants them, the shared shop-floor tablet
// passing between cashiers does not — and the same manager signing in at both wants different
// answers.
export function isDesktopNotificationEnabled(): boolean {
  if (!isSupported()) return false;
  try {
    // Default ON. The preference alone shows nothing: the browser permission below is the real
    // gate, and it starts at "default" until the user grants it.
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setDesktopNotificationEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Private-mode / storage-blocked: the toggle just won't survive a reload.
  }
}

// Must be called from a user gesture — Safari rejects the request outright otherwise, and Chrome
// downgrades an unprompted request to a muted permission chip the user never sees. Both callers
// satisfy this: flipping the toggle, and opening the notifications popover for the first time.
export async function requestDesktopNotificationPermission(): Promise<DesktopNotificationPermission> {
  if (!isSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    // Older Safari resolves the callback form only; treat a throw as "still undecided".
    return Notification.permission;
  }
}

type ShowOptions = {
  title: string;
  body: string;
  // Collapses repeats into one toast instead of stacking them. Passing the notification's id means
  // a re-poll that somehow re-reports the same order replaces its toast rather than adding a second.
  tag: string;
  silent: boolean;
  // Resolved URL of the app logo. Passed in rather than hard-coded because it is a bundled asset
  // whose hashed filename only the importing module knows; there is no /favicon.ico to point at.
  icon?: string;
  onClick?: () => void;
};

/**
 * Shows an OS toast. Returns whether one was actually raised, so the caller can fall back to the
 * in-app beep when it wasn't.
 */
export function showDesktopNotification({ title, body, tag, silent, icon, onClick }: ShowOptions): boolean {
  if (!isSupported()) return false;
  if (Notification.permission !== "granted") return false;
  if (!isDesktopNotificationEnabled()) return false;

  // Note there is deliberately no "skip it while the app is focused" rule here, which is what a
  // messaging app would do. A cashier looking at the product grid will miss a bell badge and a
  // third of a second of beep; an unapproved online order is worth interrupting for whatever
  // screen they are on. The narrow allow-list of types upstream is what keeps that from being
  // noise.

  try {
    const notification = new Notification(title, {
      body,
      tag,
      silent,
      // The app logo rather than the browser's generic globe, so the toast is identifiable at a
      // glance from across the counter.
      icon,
    });

    notification.onclick = () => {
      // Raises the browser window from the taskbar/tray. Blocked in a few configurations, which is
      // why the navigation below runs regardless — the app is then already on the right screen when
      // the user switches to it by hand.
      try { window.focus(); } catch { /* pop-up blocker */ }
      notification.close();
      onClick?.();
    };
    return true;
  } catch {
    // Android Chrome throws here: it only permits notifications raised from a service worker.
    // Falling through to `false` keeps the in-app beep as the alert on those devices.
    return false;
  }
}
