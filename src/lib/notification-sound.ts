// The alert tone played when a notification that needs someone's attention arrives — today, a new
// online order landing while nobody is looking at the screen.
//
// Synthesised with the Web Audio API rather than shipping an .mp3: the tone is two sine beeps, the
// file would be the largest static asset in the bundle for a third of a second of sound, and an
// <audio> element pointed at a bundled URL is one more thing to get wrong in a strict-CSP or
// offline context. Nothing is fetched and nothing is decoded.

const STORAGE_KEY = "mimony.notificationSound";

// Muting is stored per BROWSER, not per user account: whether sound is wanted is a property of the
// machine (a back-office PC with speakers vs. a shared tablet on the shop floor), and the same
// manager logging in at both wants different answers. That also keeps it off the settings screen
// and out of a migration.
export function isNotificationSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    // Private-mode / storage-blocked browsers: default to audible, which is the safer failure —
    // a missed order costs more than an unwanted beep.
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Nothing to do — the toggle simply won't persist across reloads.
  }
}

// One AudioContext reused for the life of the tab. Browsers cap how many a page may create, and
// creating one per beep leaks them.
let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  return audioContext;
}

// Browsers refuse to start audio until the user has interacted with the page, leaving the context
// "suspended" — a beep fired before that is silently dropped. Any click/keypress anywhere in the
// app is enough to resume it, so the first one the user makes arms the sound for the whole session.
// Called once from the notification bell's mount.
export function primeNotificationSound(): () => void {
  if (typeof window === "undefined") return () => {};
  const resume = () => {
    const ctx = getContext();
    if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", resume, { passive: true });
  window.addEventListener("keydown", resume, { passive: true });
  return () => {
    window.removeEventListener("pointerdown", resume);
    window.removeEventListener("keydown", resume);
  };
}

// Two rising beeps — distinct enough from a barcode scanner's single flat tone that staff won't
// confuse "an order arrived" with "that scan worked".
const TONE = [
  { frequency: 880, startAt: 0, duration: 0.14 },     // A5
  { frequency: 1174.66, startAt: 0.18, duration: 0.2 }, // D6
];

export function playNotificationSound(): void {
  if (!isNotificationSoundEnabled()) return;

  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    // Not yet armed by a user gesture (see primeNotificationSound). Try, but never throw — the
    // notification itself has already appeared in the bell either way.
    void ctx.resume().catch(() => {});
  }

  try {
    for (const { frequency, startAt, duration } of TONE) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      // Ramped rather than switched on and off: a square-edged gain change produces an audible
      // click at both ends of the note.
      const begin = ctx.currentTime + startAt;
      const end = begin + duration;
      gain.gain.setValueAtTime(0.0001, begin);
      gain.gain.exponentialRampToValueAtTime(0.18, begin + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(begin);
      oscillator.stop(end + 0.02);
    }
  } catch {
    // Audio is a nicety layered on top of the visible notification; it must never be able to break
    // the bell that renders it.
  }
}
