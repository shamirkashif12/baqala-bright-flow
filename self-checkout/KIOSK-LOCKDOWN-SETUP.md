# Self-Checkout Kiosk Lockdown

Two layers work together here. Only the first one is built into this repo — the second is a
one-time setup step on each physical kiosk PC, and it's the layer that actually matters for
stopping a customer from reaching the OS or the internet.

## Layer 1 — in-app fullscreen + PIN (this repo)

- Staff set a 4–6 digit **Fullscreen Lockdown PIN** per terminal: Terminals admin page → the
  key icon ("Self-Checkout Pairing") on a terminal's row → **Fullscreen Lockdown PIN** section
  at the bottom of that sheet. No PIN set = the feature does nothing on that kiosk.
- On the kiosk itself, there is **no visible button** for this — by design, so a browsing
  customer never even sees an "exit" affordance to poke at. Staff press **Ctrl+Shift+L**
  anywhere in the app, type the PIN on the on-screen pad, and the kiosk toggles into (or out
  of) fullscreen (`requestFullscreen()` / `exitFullscreen()`).
- The PIN itself is never sent to or stored on the browser — only its hash lives in the
  database (`Terminal.KioskLockdownPinHash`), checked by `POST /api/kiosk/verify-lockdown-pin`.
  Same pattern as the kiosk pairing secret already used for terminal setup.

### The hard limit of layer 1 — read this before assuming it's enough

Every major browser **hard-codes the Esc key to instantly exit fullscreen**, and no page's
JavaScript can intercept, delay, or block that — it's a deliberate browser security rule so a
malicious site can never trap a visitor in a fake fullscreen overlay. It applies here too:
a customer who presses Esc pops straight back to the normal browser window, PIN or not.

`kiosk-lockdown.tsx` fights back as best it can: the moment it notices fullscreen ended without
an authorized PIN-exit, it immediately calls `requestFullscreen()` again to re-lock. This
sometimes works and sometimes doesn't — browsers deliberately throttle or refuse rapid, repeated
fullscreen requests as an anti-abuse measure, precisely to stop pages doing this exact thing to
trap a visitor. There is no reliable way around that throttling from page-level JavaScript; it's
not a bug in this code, it's the browser refusing to let a webpage win that fight. Esc will
always at least *flash* the normal browser chrome for an instant even when the re-lock succeeds.

Likewise, in a normal (non-kiosk-mode) browser window, OS-level shortcuts — Alt+Tab, the
Windows key, Ctrl+Alt+Del — still work exactly as they would on any other PC. A right-click
block and a hidden exit shortcut deter a casual customer; they do not stop someone who knows
to press Esc.

**Conclusion: layer 1 alone is a deterrent, not a lockdown.** For an actual guarantee that the
kiosk can only run this one app, layer 2 below is required.

## Layer 2 — locking down the kiosk PC itself (Windows)

This is a one-time setup per physical terminal, done by whoever images/provisions the kiosk
PC — not something the web app can do for itself.

1. **Launch the browser in native kiosk mode**, not just a maximized window:
   ```
   chrome.exe --kiosk --app=https://<your-self-checkout-url> --edge-kiosk-type=fullscreen
   ```
   (Edge: `msedge.exe --kiosk https://... --edge-kiosk-type=fullscreen`.) In this mode the
   browser itself has no address bar, no tabs, and — unlike a page-invoked
   `requestFullscreen()` — Esc does not exit it.

2. **Create a dedicated, unprivileged Windows account** for the kiosk (standard user, not an
   admin), and set it to auto-login and auto-launch the browser command above on boot
   (`shell:startup` shortcut, or a scheduled task at logon).

3. **Use Windows Assigned Access** to lock that account to only the kiosk browser:
   Settings → Accounts → Other users → Set up a kiosk, or (Pro/Enterprise) configure via
   `Settings > Family & other users > Set up a kiosk` / the `AssignedAccessSettings` policy in
   Group Policy / Intune. Assigned Access is what actually removes access to the Start menu,
   taskbar, and other apps for that account — it's the direct equivalent of the "OS-level
   restriction" this app's layer 1 cannot provide.

4. **Disable the shortcuts that would otherwise let someone break out**, scoped to the kiosk
   account via Local Group Policy (`gpedit.msc`, Windows Pro/Enterprise) or the registry:
   - Disable Task Manager (`DisableTaskMgr`)
   - Disable Alt+Tab / the Windows key (Assigned Access already suppresses most of this)
   - Disable the lock screen / Ctrl+Alt+Del options where feasible
   - Disable USB mass storage if the kiosk has exposed USB ports customers could reach

5. **Staff recovery path**: to do maintenance, staff use Ctrl+Shift+L + the PIN inside the app
   to drop out of the in-app fullscreen first, then use the account's configured Assigned
   Access exit gesture (or simply reboot into the admin account) to reach Windows itself.

If dedicated IT time for the above isn't available, a turnkey alternative is a purpose-built
kiosk-lockdown product (e.g. the Microsoft Store "Kiosk Browser" app, or a third-party kiosk
lock tool) instead of hand-rolling steps 1–4 — the end goal is the same: the browser launches
in true kiosk mode under a Windows account that cannot reach anything else.
