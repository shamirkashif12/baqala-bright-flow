# Delivery Zones — Test & Demo Guide

Everything here lives in **POS Settings → (pick a branch, top right) → Online Ordering tab**.

The idea in one line: **what delivery costs depends on where the customer actually is.** You draw
areas on a map, give each one a price, and the checkout page works out which one the customer's pin
falls in. Areas you don't serve can be refused outright.

Everything below is clicking. No terminal, no code.

**Run the whole thing:** ~15 min. **Just the demo:** [§4](#4-five-minute-demo).

---

## 1. Setup (once, 2 minutes)

| # | Do                                                                                                        |
| - | --------------------------------------------------------------------------------------------------------- |
| 1 | **POS Settings** → pick your test branch in the **top-right branch picker**                                |
| 2 | **Online Ordering** tab → switch on **"Enable online ordering for this branch"** → **Save**                |
| 3 | **Branches** → open the same branch → **"Online Ordering QR"** panel → copy the customer link             |

Keep the customer link open in a **second browser tab, in a private/incognito window** — that's the
shopper's view you'll switch to throughout. It looks like `http://localhost:3000/order/<branch-id>`.

> If the customer link says *"not available for this branch"*, step 2 didn't save.

---

## 2. How it decides — read this before demoing

There are two layers, and the demo is much easier to narrate if you keep them apart.

**Layer 1 — the branch default.** Two boxes near the top of the Online Ordering tab: **Default
delivery fee** and **Free delivery above**. This alone is the whole setup for a shop with one flat
citywide fee, which is most shops. No zones needed.

**Layer 2 — zones.** Only worth adding once the fee actually varies by area. A zone is: a name, a
shape, and a price.

- **Distance from a point** — click the map to drop the centre (normally your shop), then say From
  0 km To 5 km. Build rings by stacking several: 0–5, then 5–20, and so on.
- **Map area (rectangle)** — four boundary coordinates, for a district a circle can't describe
  (one side of a highway, a walled compound).
- **Flat** — applies to every delivery, pin or no pin.

**When several zones match one address, the winner is picked in this order:**

1. A zone belonging to **this branch** beats a chain-wide one.
2. Higher **Priority** wins. This is your deliberate override — a bad-weather surcharge across
   every area, without deleting anything.
3. A **map/distance** zone beats a **flat** one — anything that actually located the address is
   more specific than a catch-all.
4. The **tightest** zone wins — of two overlapping rings, the smaller one is the more precise
   statement about that address.
5. Failing all that, the **newest** zone.

**If no zone matches, the branch default fee applies.** If there's no default either, delivery is
free.

**Zones can only match an address they actually located.** A customer who typed their address by
hand and never opened the map picker has no pin, so distance and area zones can't apply to them —
they get the branch default. Charging or refusing an address the system never located would be a
guess, which is also why the map pin stays optional at checkout: making it mandatory would turn a
fee feature into a barrier to ordering at all.

### "Test an address" — what it's for

The panel under the zone list. Drop a pin, and it tells you **what that address would be charged,
and which zone decided it** — without anyone placing an order.

It runs the *real* resolver, not a simulation. So it's the same answer the customer would get.

It exists because overlapping map areas have no readable combined effect. Three rings and a
priority override do not add up to something you can work out by staring at the list — without a
way to test a pin, you find out you got it wrong from a customer. Use it after every change.

The **Order subtotal** box next to it is there so you can also test free-delivery thresholds: set it
above and below the threshold and watch the fee flip.

---

## 3. Test cases

Do them in order — each one builds on the last.

### T1 — A flat fee, no zones at all

| Step | Do                                                                     |
| ---- | ---------------------------------------------------------------------- |
| 1    | Online Ordering tab → **Default delivery fee (SAR)** = `15`             |
| 2    | **Free delivery above (SAR)** = `100` → **Save**                        |
| 3    | Customer tab → add ~2 items (keep the basket well under 100) → open cart |

**Expect:** a **Delivery** line of **15.00**, included in the total.

### T2 — Free delivery kicks in

| Step | Do                                                    |
| ---- | ----------------------------------------------------- |
| 1    | Same cart — raise quantities until the subtotal ≥ 100 |

**Expect:** the Delivery line turns into a green **"Free delivery"** and the total drops by 15.

> It says "Free delivery" rather than `0.00` on purpose — a silent zero reads as "not decided yet".
> The threshold compares the **goods subtotal**, not the grand total.

### T3 — Build two rings ⭐

| Step | Do                                                                                        |
| ---- | ----------------------------------------------------------------------------------------- |
| 1    | Scroll to **Delivery zones** → **New zone**                                               |
| 2    | Name `Inner city`, Applies to **Distance from a point**                                   |
| 3    | **Click your shop's location on the map** — the pin drops, coordinates appear underneath   |
| 4    | From `0` km, To `5` km, Delivery fee `10` → **Create rule**                                |
| 5    | **New zone** again: `Outer city`, same centre, From `5`, To `20`, fee `25` → **Create rule** |

**Expect:** both listed, each showing its range (*"0–5 km from the pin"*) and its fee.

> Zones save **immediately** on Create — they are their own records, not part of the page's Save
> button.

### T4 — Test an address ⭐ (the one to show)

| Step | Do                                              |
| ---- | ----------------------------------------------- |
| 1    | In **Test an address**, click **very close** to your shop |
| 2    | Read the result box                             |
| 3    | Zoom out, click somewhere **~10 km away**       |
| 4    | Click somewhere **~50 km away**                 |

**Expect:**

| Pin    | Result                                            |
| ------ | ------------------------------------------------- |
| ~2 km  | **10.00** · *Matched "Inner city" · 2.2 km away*   |
| ~10 km | **25.00** · *Matched "Outer city" · 10.x km away*  |
| ~50 km | *No rule matched — branch default fee* (15.00 from T1) |

### T5 — Overlapping zones: the tightest wins

| Step | Do                                                              |
| ---- | --------------------------------------------------------------- |
| 1    | **New zone**: `Citywide`, same centre, From `0`, To `50`, fee `40` |
| 2    | Test an address ~2 km out again                                  |

**Expect:** still **10.00** (`Inner city`). Three zones now match that pin; the smallest one wins.

### T6 — Priority overrides that

| Step | Do                                           |
| ---- | -------------------------------------------- |
| 1    | Edit `Citywide` → **Priority = 10** → Save   |
| 2    | Test the ~2 km address again                 |

**Expect:** now **40.00** (`Citywide`). That's how you'd run a surge rate over everything at once.

> Put `Citywide` back to Priority `0`, or switch it off with the power icon, before continuing.

### T7 — Refuse an area you don't serve ⭐

| Step | Do                                                                            |
| ---- | ----------------------------------------------------------------------------- |
| 1    | **New zone**: `Out of range`, distance, same centre, From `20`, To **blank**   |
| 2    | Switch **"We deliver here" OFF**                                              |
| 3    | Message: `Sorry — we don't deliver that far yet. Collection in store is welcome.` |
| 4    | **Create rule** → then test an address ~50 km out                             |

**Expect:** red result with your exact message and no fee. The zone shows a red **"Not deliverable"**
badge in the list.

> With "We deliver here" off, **To (km)** becomes optional — "beyond 20 km, anywhere" is exactly
> what you want to say.

### T8 — The customer sees the fee follow their pin ⭐⭐

| Step | Do                                                              |
| ---- | --------------------------------------------------------------- |
| 1    | Customer tab → add items → **Checkout** → fill name, phone, address |
| 2    | **"Choose from map"** → drop the pin **close to the shop**       |
| 3    | Drag the pin **~10 km away**                                    |
| 4    | Drag it **~50 km away**                                         |

**Expect:**

| Pin    | Summary                                                        |
| ------ | -------------------------------------------------------------- |
| ~2 km  | **Delivery (Inner city) 10.00**, total updates live             |
| ~10 km | **Delivery (Outer city) 25.00**, total updates live             |
| ~50 km | Red warning with your message, **Place order button greyed out** |

The zone's **name is shown to the customer** next to the charge — so name zones something a shopper
would understand, not "Zone 2".

### T9 — No pin still works

| Step | Do                                                                     |
| ---- | ---------------------------------------------------------------------- |
| 1    | New order. **Type the address by hand, never open the map picker.** Place it. |

**Expect:** it goes through, charged the **branch default fee** (15.00), not a distance zone.

### T10 — Staff can override the fee on the order

| Step | Do                                                              |
| ---- | --------------------------------------------------------------- |
| 1    | **Orders → Online Orders tab** → open a **pending** order        |
| 2    | Click **Change** next to Delivery → amount `0`, reason `Regular customer` → **Save fee** |

**Expect:** delivery becomes 0.00, the total drops by exactly that amount, and an italic note reads
*"Fee changed by staff — Regular customer"*. The Change button disappears once the order is
approved, and every change is written to the audit trail.

---

## 4. Five-minute demo

| # | Say this                                                     | Do this                                                                          |
| - | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 1 | *"Most shops just want one flat fee, and that's two boxes."*  | Show Default delivery fee + Free delivery above.                                  |
| 2 | *"But delivery really costs more the further you go."*        | Show the zone list: `Inner city` 0–5 km @ 10, `Outer city` 5–20 km @ 25.          |
| 3 | *"We can price any address before a single customer orders."* | **Test an address** — click near, then far. Watch the fee and the matched zone name change. |
| 4 | *"And the customer sees it move as they place their pin."*    | Customer checkout → drag the pin near, then far. Fee updates live.                |
| 5 | *"Anywhere we don't serve, we simply refuse — politely."*     | Drag the pin 50 km out. Your message appears, Place order goes grey.              |
| 6 | *"Staff can still waive it for a regular, and it's audited."* | Orders → Online Orders → Change the fee to 0 with a reason.                       |

---

## 5. If something looks wrong

| Symptom                                                  | Cause                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Customer link 404s / "not available for this branch"      | Online ordering isn't enabled for that branch — §1 step 2.                                  |
| Always shows the default fee, never a zone                | The customer dropped no map pin, or the zone's centre isn't where you think. Use Test an address. |
| A zone is listed but never applies                        | It's switched off (greyed, power icon), or another zone outranks it — check Priority and ring sizes. |
| **New zone** button is disabled                           | No branch picked at the top right, or your role lacks **Online Orders → Edit**.             |
| Two zones both match and the "wrong" one wins             | Work down the precedence list in §2 — usually it's Priority, or a ring wider than you meant. |
| Fee didn't change after editing a zone                    | Re-run Test an address; zone edits save instantly but the customer tab needs a reload.      |
