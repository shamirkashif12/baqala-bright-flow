# Test & Demo Guide — Units, Pack Breaking & Brand Substitution

Companion to [inventory-units-brand-plan-2026-08-04.md](./inventory-units-brand-plan-2026-08-04.md).
Everything below is manual, UI-driven, and written so anyone on the team can follow it without reading code.

**Time to run the whole suite:** ~40 min. **Time for the 5-minute team demo:** see [§7](#7-five-minute-team-demo).

---

## 0. Before you start

### 0.1 Start the system

```bash
# Terminal 1 — API
dotnet run --project api/BaqalaPOS.Api.csproj

# Terminal 2 — frontend
npm run dev
```

The migration has already been applied to the local `ecr` database. If you're testing on a
different machine or a fresh database, run this once first:

```bash
dotnet ef database update --project api/BaqalaPOS.Api.csproj
```

### 0.2 One-time sanity check (30 seconds)

Before testing features, confirm the migration landed and your existing catalogue survived it.

```bash
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p ecr -t -e "
SELECT unit_of_measure, weight_based, COUNT(*) AS products FROM products GROUP BY 1,2;
SELECT COUNT(*) AS should_be_zero FROM products
 WHERE (unit_of_measure IN ('kilogram','gram','liter','milliliter','meter')) <> (weight_based=1);"
```

**Expected:** the second query returns `0`. Every product's unit and its `weight_based` flag agree.
If it returns anything other than 0, stop — the backfill didn't complete and later tests will
behave unpredictably.

### 0.3 Demo data you'll need

Create these once, in **Inventory → Add Product**. They're used across several tests.

| # | Product                | Sold by (unit)          | Sold as                                                                                           | Other settings                      | Opening qty  |
| - | ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------ |
| A | `Egg — single`      | Piece                   | Single item                                                                                       | —                                  | **4**  |
| B | `Egg Carton (12)`    | Piece                   | **Pack of items**, Items per pack **12**, Breaks down into → **Egg — single** | —                                  | **3**  |
| C | `Tomatoes`           | **Kilogram (kg)** | Single item                                                                                       | Avg. weight per item**0.120** | **10** |
| D | `Cooking Oil (bulk)` | **Litre (L)**     | Single item                                                                                       | leave avg. weight blank             | **20** |
| E | `Almarai Milk 1L`    | Piece                   | Single item                                                                                       | Brand**Almarai**              | **0**  |
| F | `Nadec Milk 1L`      | Piece                   | Single item                                                                                       | Brand**Nadec**                | **15** |

> Create **A before B** — the "Breaks down into" dropdown only lists products that already exist
> and are not themselves packs.

Then link E and F as substitutes: **Inventory → edit `Almarai Milk 1L` → Substitutes → pick
`Nadec Milk 1L` → +**.

---

## 1. Selling part of a pack — "some eggs from the carton"

This is the headline feature. Setup: 4 loose eggs on the shelf, 3 unopened cartons of 12.

### TEST 1.1 — Normal sale, enough loose stock (nothing should change)

| Step | Action                                       |
| ---- | -------------------------------------------- |
| 1    | Go to**POS**, search `Egg — single` |
| 2    | Add**3** to the cart                   |
| 3    | Charge (cash)                                |

**Expected:** Sale completes normally with **no prompt of any kind**. Loose eggs drop 4 → 1.
*This test exists to prove the new code doesn't interfere with ordinary sales.*

> Reset for the next test: **Inventory → Adjust stock** on `Egg — single`, add 3 back (qty 4).

### TEST 1.2 — Availability counts unopened cartons ⭐

| Step | Action                                              |
| ---- | --------------------------------------------------- |
| 1    | In**POS**, search `Egg — single`           |
| 2    | Look at the stock figure shown on the search result |

**Expected:** it reads **40**, not 4 — that's `4 loose + (3 cartons × 12)`.

**Why it matters:** before this change the till showed "4 in stock" while 36 more sat on the shelf
inside cartons, so it would refuse a sale of 6 that the shop could obviously fulfil.

### TEST 1.3 — Auto pack-break at checkout ⭐⭐ (the main demo)

| Step | Action                                                                               |
| ---- | ------------------------------------------------------------------------------------ |
| 1    | **POS** → add **6** × `Egg — single` to the cart (only 4 are loose) |
| 2    | Click**Charge**, pick cash, confirm                                            |

**Expected:** a dialog appears:

> **Open a pack to complete this sale?**
> Only **4** loose Egg — single left, which isn't enough for this sale.
> **Open 1 × Egg Carton (12)** — Adds 12 loose units (12 per pack). Any expiry date on the pack carries over.
> *Physically open the pack before confirming — stock is recorded as opened either way.*

| 3 | Click **Open & complete sale** |

**Expected after the sale:**

- Sale completes; receipt shows 6 eggs.
- **Inventory:** `Egg Carton (12)` = **2** (was 3), `Egg — single` = **10** (4 + 12 − 6).
- **Reports → Stock Movement History** for these two products shows a paired entry:
  - `Egg Carton (12)` — **Pack Broken**, −1, note *"Broken into Egg — single (sale ORD-…)"*
  - `Egg — single` — **From Broken Pack**, +12, note *"From breaking Egg Carton (12) (sale ORD-…)"*
  - `Egg — single` — **Sale**, −6

### TEST 1.4 — Declining the prompt cancels cleanly

| Step | Action                                                  |
| ---- | ------------------------------------------------------- |
| 1    | Repeat 1.3 but click**Cancel sale** on the prompt |

**Expected:** message *"Sale cancelled — no pack was opened."* Critically, check Inventory:
**carton count is unchanged** and **no stock moved at all**. Nothing is half-done.

### TEST 1.5 — Manual Break Pack still works

| Step | Action                                                                 |
| ---- | ---------------------------------------------------------------------- |
| 1    | **Inventory** → find the `Egg Carton (12)` row                |
| 2    | Click the**boxes icon** (tooltip: "Break pack into loose units") |
| 3    | Break**1** pack                                                  |

**Expected:** cartons −1, loose eggs +12. Same movement entries as 1.3, but with no sale reference.
*Staff pre-breaking cartons onto the shelf still works exactly as before.*

### TEST 1.6 — Genuinely out of stock still fails

| Step | Action                                                                                     |
| ---- | ------------------------------------------------------------------------------------------ |
| 1    | Adjust stock so**both** `Egg — single` and `Egg Carton (12)` are at **0** |
| 2    | Try to add`Egg — single` to the cart at POS                                             |

**Expected:** *"Out of stock"* — no pack-break prompt, because there's nothing to break.
The prompt only ever appears when opening a pack would actually solve the problem.

---

## 2. Weight and volume units (kg / g / L / ml)

### TEST 2.1 — The unit picker exists and is grouped

| Step | Action                                      |
| ---- | ------------------------------------------- |
| 1    | **Inventory → Add Product**          |
| 2    | Find the**"Sold by (unit)"** dropdown |

**Expected:** options grouped under **Counted** (piece, dozen, box), **By weight** (kilogram, gram),
**By volume** (litre, millilitre), **By length** (metre). Below the dropdown, a hint reads
*"The selling price above is the price of one kg…"* and updates as you change the unit.

*The old **"Sold by weight (kg)" checkbox is gone** — it could only ever mean kilograms.*

### TEST 2.2 — Decimal quantities on a kg product

| Step | Action                                        |
| ---- | --------------------------------------------- |
| 1    | **POS** → add `Tomatoes` to the cart |
| 2    | Look at the quantity control                  |

**Expected:** instead of the +/− stepper you get a **decimal input** with a **`kg`** label beside it,
stepping by `0.001`. The price line shows **`SAR x.xx / kg`** — making it unambiguous that the price
is a rate, not the price of the bag in front of the customer.

| 3 | Type `0.35` (i.e. 350 g) |

**Expected:** line total = `0.35 × price-per-kg`. Sale completes; stock drops from 10 to 9.65 kg.

### TEST 2.3 — Litres for drinks ⭐

| Step | Action                                      |
| ---- | ------------------------------------------- |
| 1    | **POS** → add `Cooking Oil (bulk)` |
| 2    | Enter`1.5`                                |

**Expected:** unit label reads **`L`**, step is `0.001` (i.e. millilitre precision), price shown
`/ L`. Stock drops 20 → 18.5 L.

**Why it matters:** this was **impossible before** — the old boolean flag hardcoded kilograms, so
anything dispensed by the litre had to be faked as a "kg" product.

> **Note for the team:** a *sealed* 1.5 L bottle is **not** this. That's a countable piece whose
> size is just a label — set it to **Piece**. The Litre unit is for goods actually *dispensed* by
> volume (bulk oil, syrups, fuel).

### TEST 2.4 — Selling a weighed product by the piece ⭐⭐ (the second demo)

This answers "can something sold in kg also be sold by the unit?"

| Step | Action                                                        |
| ---- | ------------------------------------------------------------- |
| 1    | **POS** → add `Tomatoes` to the cart                 |
| 2    | Click the**`#` (hash) icon** next to the quantity box |

**Expected:** a dialog *"Enter by the piece"* — *"Tomatoes — about 0.120 kg each"*.

| 3 | Type **3**, watch the preview |

**Expected:** *"Rings up as **0.36 kg**"* (3 × 0.120).

| 4 | Click **Set quantity** |

**Expected:** cart line becomes `0.36 kg`, priced per kg as normal. One SKU, one stock pool —
no separate "tomato by piece" product was created or needed.

### TEST 2.5 — Products without an estimate don't offer it

| Step | Action                                                               |
| ---- | -------------------------------------------------------------------- |
| 1    | **POS** → add `Cooking Oil (bulk)` (avg. weight left blank) |

**Expected:** **no `#` button.** Bulk oil has no meaningful "one piece", so by-count entry is
correctly not offered.

---

## 3. Brand & substitution

### TEST 3.1 — Brand typeahead prevents fragmentation

| Step | Action                                                                |
| ---- | --------------------------------------------------------------------- |
| 1    | **Inventory → Add Product** → click the **Brand** field |

**Expected:** a dropdown of brands already in your catalogue (Almarai, Nadec, …).

| 2 | Type `almarai` in lowercase and save the product |
| 3 | Reopen the product |

**Expected:** it reads **`Almarai`** — the existing spelling, not your lowercase version.

**Why it matters:** without this, "Almarai" / "almarai" / "ALMARAI" become three separate brands,
which splits the POS brand filter into near-duplicates and hides products from each other's
substitution suggestions.

### TEST 3.2 — Linking substitutes

| Step | Action                                                                             |
| ---- | ---------------------------------------------------------------------------------- |
| 1    | **Inventory** → edit `Almarai Milk 1L` → scroll to **Substitutes** |
| 2    | Pick`Nadec Milk 1L` → click **+**                                         |

**Expected:** a chip appears reading *"Nadec — Nadec Milk 1L"*.

| 3 | Close, then edit **`Nadec Milk 1L`** instead |

**Expected:** ⭐ it already shows **`Almarai Milk 1L`** as a substitute — the link is stored **both
ways**, so the suggestion appears whichever of the pair runs out. You only have to link it once.

### TEST 3.3 — Substitution suggestion at the till ⭐

Setup: `Almarai Milk 1L` at **0** stock, `Nadec Milk 1L` at **15**.

| Step | Action                                                   |
| ---- | -------------------------------------------------------- |
| 1    | **POS** → type `Almarai Milk` in the search box |

**Expected:** the search result row is greyed with **"Out of stock · Tap to Stock In"**, and
directly beneath it a row appears:

> Try instead: **[ Nadec Milk 1L (Nadec) ]**

| 2 | Click the `Nadec Milk 1L` chip |

**Expected:** it drops straight into the cart. Ordinary add-to-cart — no special transaction type.

> **Note:** these suggestions appear in the **search results list**, not after clicking the product
> (clicking a greyed-out row opens Quick Stock In instead). So demo this by *searching*, not by
> trying to add.

### TEST 3.3b — ONLY linked products are suggested ⭐ (nothing is guessed)

This is the important one to demo, because the behaviour **changed**. Previously the till guessed:
it offered *any* in-stock product in the same category. Now it offers **only** what someone
explicitly linked on the product's Substitutes list.

| Step | Action |
|---|---|
| 1 | Make sure `Almarai Milk 1L` and `Nadec Milk 1L` are linked (§3.2), and both sit in the same category as some **unrelated** product with stock — e.g. `Yoghurt 500g` |
| 2 | Zero `Almarai Milk 1L`, search for it at POS |

**Expected:** the "Try instead" row lists **`Nadec Milk 1L` only**. `Yoghurt 500g` is **not**
offered, even though it's in stock and in the same category.

| 3 | Now unlink them (§3.4) and search again |

**Expected:** ⭐ **no "Try instead" row at all** — not a fallback list. No links configured means no
suggestions, which is the honest answer.

**Why it matters:** a category is not a statement of interchangeability. The old guess would
happily offer a 2 L bottle for a 1 L one, or yoghurt for milk. A wrong suggestion at the till is
worse than none, because the cashier acts on it in front of the customer.

| 4 | Link two products in **different** categories and repeat |

**Expected:** the link still works — suggestions are not category-limited at all any more. What
matters is that a human said these two are interchangeable.

### TEST 3.4 — Unlinking removes both directions

| Step | Action                                                              |
| ---- | ------------------------------------------------------------------- |
| 1    | Edit`Almarai Milk 1L` → click the **×** on the Nadec chip |
| 2    | Now edit`Nadec Milk 1L`                                           |

**Expected:** the Almarai chip is gone from there too. No orphaned half-link that keeps suggesting
the pair from one side after you thought you'd removed it.

---

## 4. Guardrails — these should all be *refused*

These prove the system can't be put into a broken state. Each should show a clear error message,
**not** a crash, a silent no-op, or a 500.

| #   | Try to do this                                                                   | Expected refusal                                                                                           | Why                                                        |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 4.1 | Edit a product to**Sold as: Pack** while its unit is **Kilogram**    | *"A product sold as a pack must be counted, not measured…"*                                             | You can't sell 0.4 of a carton                             |
| 4.2 | Set a pack's "Breaks down into" to**itself**                               | *"A pack cannot break down into itself…"*                                                               | Would loop stock into itself without bound                 |
| 4.3 | Set a pack's "Breaks down into" to**another pack**                         | *"…is itself sold as a pack. A pack must break down into a single-unit product."*                       | Chains would strand stock in the middle tier               |
| 4.4 | Set a pack's "Breaks down into" to a**kg product**                         | *"…is sold by weight/volume. A pack must break down into a counted product."*                           | A carton can't yield "12 kg of egg"                        |
| 4.5 | Change`Tomatoes` from **kg** to **Piece** while 9.65 kg is on hand | *"…cannot switch to a counted unit while 9.65 is on hand — adjust the stock to a whole number first."* | Would strand an unsellable 0.65 remainder                  |
| 4.6 | Link a**kg** product as a substitute for a **piece** product         | *"…only products sharing a unit can substitute for each other."*                                        | Swapping "1 piece" for "1 kg" charges for the wrong amount |
| 4.7 | Enter`1.5` as the quantity for a **piece** product anywhere in Inventory | *"Quantity must be a whole number…"*                                                                    | You can't stock half a tin                                 |

> **4.5 is worth demoing** — it's the least obvious one and shows the system protecting data it
> would otherwise silently corrupt.

---

## 5. Bug fixes — verifying the two things that were already broken

### TEST 5.1 — ZATCA invoice unit codes ⭐ (compliance)

**The bug:** every invoice line was reported to ZATCA as `unitCode="PCE"` (pieces), regardless of
what was actually sold. A 2 kg bag of rice was declared to the government as "2 pieces".

| Step | Action                                                                              |
| ---- | ----------------------------------------------------------------------------------- |
| 1    | Sell**0.5 kg** of `Tomatoes` at POS                                         |
| 2    | Go to**Compliance / ZATCA** and open the generated invoice XML for that order |
| 3    | Find the`<cbc:InvoicedQuantity>` line                                             |

**Expected:** `unitCode="KGM"` (kilograms), **not** `PCE`.
Selling a piece product should still show `PCE`; a litre product shows `LTR`.

| Unit                | Code on the invoice        |
| ------------------- | -------------------------- |
| piece / dozen / box | `PCE` / `DZN` / `BX` |
| kilogram / gram     | `KGM` / `GRM`          |
| litre / millilitre  | `LTR` / `MLT`          |
| metre               | `MTR`                    |

### TEST 5.2 — Pack-break cost no longer inflated 12× ⭐ (money)

**The bug:** breaking a carton copied the *carton's* cost onto every single egg, so each egg
appeared to cost a whole carton — a 12× COGS overstatement that silently destroyed margin reporting.

| Step | Action                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------- |
| 1    | Receive a batch of`Egg Carton (12)` with **Purchase price 24.00**                      |
| 2    | Break**1** pack (Inventory → boxes icon)                                                |
| 3    | Go to**Inventory → Batch Tracking**, find the new `…-BRK` batch on `Egg — single` |

**Expected:** its purchase cost is **2.00** per egg (24 ÷ 12), **not** 24.00.

| 4 | Sell some of those eggs, then check **Reports → Product Performance** |

**Expected:** COGS and margin are sane. Before the fix, this report would have shown a
catastrophic loss on every egg sold out of a broken carton.

---

## 6. Regression checks — things that must still work

Quick pass to confirm nothing existing broke. None of these should behave differently than before.

- [ ] Sell an ordinary piece-based product — no prompts, no unit labels, +/− stepper as always
- [ ] Sell a **pack** product directly (e.g. sell 1 whole `Egg Carton (12)`) — stock drops by 1 carton, no break occurs
- [ ] Receive a batch, adjust stock, run a stock transfer — all still reject fractional qty on piece products
- [ ] Existing weight-based products created **before** this change still sell in decimals
- [ ] Wastage approval flow unchanged (still maker-checker gated)
- [ ] Branch with **Allow negative stock** on can still oversell
- [ ] Product Performance / Stock Movement History reports still load

> The 4th item is the one to watch. Old products had `weight_based = 1` with the unit string left
> at its `piece` default. The migration promoted those to `kilogram`, which is what the flag always
> meant. If any old weighed product now refuses decimals, that backfill missed it — report it.

---

## 7. Five-minute team demo

The tightest path through the value. Set up demo data per §0.3 first.

| Time | Show                                                                                        | Say                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 | **POS** → search `Egg — single`, point at "40 in stock"                           | *"4 loose eggs, 3 unopened cartons. The till now knows about all 40 — before, it said 4 and refused to sell 6."*                          |
| 0:45 | Add**6**, charge → **pack-break prompt appears**                               | *"Not enough loose eggs. Instead of failing the sale, it tells the cashier exactly what to open."*                                         |
| 1:30 | Confirm → show Inventory: cartons 3→2, loose 4→10                                        | *"One carton opened, 12 eggs in, 6 sold. All in one transaction — if the sale had failed, the carton would still be sealed."*             |
| 2:15 | **POS** → `Tomatoes`, show the `kg` input and `/ kg` price                     | *"Weighed goods now say what unit they're in. And it's not just kg any more — bulk oil sells by the litre, which was impossible before."* |
| 3:00 | Click the**`#`** button → type 3 → *"Rings up as 0.36 kg"*                      | *"Customer asks for three tomatoes instead of a weighed bag. Same product, same stock pool — we just estimate from the average weight."*  |
| 3:45 | **POS** → *search* `Almarai Milk` (out of stock) → "Try instead: Nadec Milk 1L" | *"Out of stock doesn't mean lost sale — we offer the same product in another brand."*                                                     |
| 4:15 | **Inventory** → edit Nadec → show the reverse link is already there                 | *"Link it once, it works from both sides. And only what we link is ever offered — the till never guesses from the category."*              |
| 4:45 | Mention the two silent bugs fixed (ZATCA`PCE`, 12× egg cost)                             | *"Both were already live and neither was visible from the UI."*                                                                            |

---

## 8. If something goes wrong

| Symptom                                    | Likely cause                                                                         | Check                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Unit dropdown is empty                     | API not running, or`/api/products/units` failing                                   | Browser devtools → Network tab                                                                    |
| No pack-break prompt when expected         | The pack has no "Breaks down into" set, or it's discontinued                         | Edit the pack product, confirm the link                                                            |
| Old weighed product refuses decimals       | Backfill missed it                                                                   | Run the §0.2 query; it should return 0                                                            |
| "…must be a whole number" on a kg product | Unit is still`piece`                                                               | Edit the product, set the unit explicitly                                                          |
| Substitutes section not visible            | It only appears on**edit**, not **add** — it needs a saved product id   | Save the product first, then reopen it                                                             |
| No "Try instead" row at POS                | Nothing is linked on that product; or you clicked instead of searching; or the substitute is also out of stock | Suggestions are**explicit links only** — check the product's Substitutes list. They render in the **search list**, and only list substitutes with stock |

---

## 9. Not covered / known limits

Stated plainly so nobody demos something that doesn't exist yet:

- **Stock counting in mixed units** — you still count loose and cartons as two separate lines; there's no "2 cartons + 5 loose" combined entry (§4.3 of the plan doc).
- **Purchase-order unit conversion** — buying a case of 24 and selling by the piece still needs two products; out of scope this round (§4.5).
- **Weighing-scale barcodes** (embedded weight/price, prefix 20–29) — not implemented (§4.6).
- **Substitution analytics** — no "what did we lose to stockouts" report yet (§3, phase 2).
- **Reorder-level alerts** are not yet pack-aware everywhere — the POS and the availability endpoint are, but a low-stock alert on a loose product may still read only its own row. Worth a follow-up.
