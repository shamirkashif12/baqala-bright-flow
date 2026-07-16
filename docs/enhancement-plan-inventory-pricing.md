# Enhancement Plan — Inventory & Stock (§2), Pricing (§12), Lifecycle & Expiry (§13)

Status: **proposal, nothing implemented.** Written against the working tree at `59d7d7f`
(plus the staged, uncommitted FRD §1.1 filter work).

The headline: **a large part of this spec is already built.** The models are, on the whole,
better than the spec assumes. The gaps are concentrated in three places — the warehouse
dimension is missing from all reporting, there is no movement ledger, and two subsystems
(batches, price lists) exist as schema that nothing reads or maintains. Most of the work is
*exposing and correcting* what exists, not greenfield building.

---

## 1. Findings — what the code actually looks like today

These five facts drive every decision below. Each was read directly, not inferred.

### 1.1 There are two independent stock ledgers (the central constraint)

| Table | Keyed by | Written by | Read by reports? |
|---|---|---|---|
| `inventory_stock` | **branch** + product | `OrdersController` (sales), `InventoryController` (adjustments), `StockCountsController`, `ReturnsController` | **Yes — exclusively** |
| `warehouse_stock` | **warehouse** + product | `StockTransfersController`, `PurchaseOrdersController` | **No — never** |

`ReportsController` contains **zero** references to `warehouseId` (verified: `grep -c` → 0), and
**no report API function accepts a `warehouseId` param**. Warehouse is a fully-modelled,
first-class entity (`warehouses`, `branch_warehouses`, `warehouse_stock`, with CRUD endpoints and
`api.getWarehouses()` already in the client) that is completely invisible to reporting.

The two ledgers are not reconciled anywhere. Stock moves between them only via
`StockTransfersController`, which decrements one and increments the other in the same request.
The code states this deliberately — `ReportsController.cs:860-862`:

> `// This system tracks branch-level stock (InventoryStock) separately from warehouse stock`
> `// (WarehouseStock) — they are different pools, not one snapshot`

Consequences, all verified: `InventoryAdjustment`, `InventoryBatch`, and `StockCount` are **all
branch-only**. There is therefore **no way to waste, write off, batch, or count warehouse stock
at all.** `Warehouse` has no `BranchId` (the link is the `branch_warehouses` M2M), so a warehouse
row cannot even be mapped to one branch for reporting. When a PO is received into a warehouse,
`PurchaseOrdersController.cs:251` back-fills the batch's required `BranchId` by picking an
**arbitrary** linked branch — and silently yields `Guid.Empty` if the warehouse has no link.

`WarehouseRequest` (`warehouse_requests`) is a legacy branch-to-branch requisition that, despite
its name, has **no warehouse FK at all** and moves no stock. It is superseded by `StockTransfer`
and should be treated as dead weight, not extended.

> **This is the single most important thing to settle before any code is written.** "Add a
> Warehouse filter to Inventory reports" is not a UI task — for most reports the underlying
> row has no warehouse to filter *by*. See Decision A.

### 1.2 There is no inventory movement ledger

Nothing records "product X at location Y moved from qty A to qty B at time T because Z."
What exists instead is scattered and shape-incompatible:

- `inventory_adjustments` — **branch-only** (no `warehouse_id`), stores the *delta* (`quantity`),
  not before/after. Has `adjusted_by`, but **no `approved_by`**.
- `stock_transfers` / `stock_transfer_items` — has `created_by`, `approved_by`, and all six
  transfer directions, but **no `received_by`**.
- `purchase_order_items` — has `ordered_quantity`, `received_quantity`, `unit_cost`, `subtotal`.
- Sales deduct `inventory_stock` inline in `OrdersController` and leave **no movement row at all**.

§2.5 (audit trail), §2.6 (turnover, top/slow movers), and §2.7 (days since last movement, dead
stock) all need the same thing: one queryable movement history. Building them on the current
scattered tables means three separate UNION-heavy queries that will not perform and will not
agree with each other.

### 1.3 The audit trail exists and is decent, but coverage is partial

`AuditLog` (`audit_logs`) has `user_id`, `action`, `entity_type`, `entity_id`, `old_values`/
`new_values` (JSON), `notes`, `ip_address`, `severity`, `branch_id`. Written via `IAuditService`
by **explicit call**, not an EF interceptor.

- ✅ `InventoryController.Adjust` already captures **quantity-before/after** into the JSON
  (`InventoryController.cs:243` snapshots `stock.Quantity` before mutating — the comment says
  this is exactly for audit reviewability). `StockCountsController` and `ProductsController`
  also audit.
- ❌ **`StockTransfersController` and `PurchaseOrdersController` never call the audit service.**
  Transfers, receipts, and purchase returns produce no audit rows at all.
- ❌ `AuditLog` has no `warehouse_id` and no `product_id` — §2.5 asks for both as first-class
  columns. Product is currently only recoverable by parsing the JSON blob.

Three further issues that bear directly on §2.5's credibility as an *audit* feature:

- **Actor attribution is inconsistent and partly spoofable.** `InventoryController` reads the
  acting user from the **JWT** (`:28-29`, with a comment explaining the spoofing hole that
  closed). But `StockCountsController` (`StartedBy`/`CompletedBy`), `PurchaseOrdersController`
  and `StockTransfersController` (`ApprovedBy`), and `WarehouseController.Approve` all still take
  the actor **from the request body** — a client can name anyone as approver. `export_report`
  rows take `exportedBy` from a **query param**. An audit trail whose actor field is
  client-supplied does not satisfy §2.5's accountability goal.
- **`GET /inventory/adjustments` has no permission gate and no branch scoping** — every other
  read in that controller has at least scoping. It leaks all branches' adjustment history.
- **The `audit-trail` report hard-caps at 2,000 rows** (`ReportsController.cs:1930`), applied
  *after* sorting, with no pagination and no total count — a wide date range **silently
  truncates**. Meanwhile `AuditLogsController.GET` paginates properly. Silent truncation in an
  audit report is a compliance problem, not a UX one.

`src/lib/audit-changes.ts` (staged) is the read-time differ that turns those JSON snapshots into
reviewer-facing rows. It already handles `quantityBefore`/`quantityAfter` → `quantity_on_hand`.
**Any new audit payload must match the shapes it expects**, or the UI silently renders nothing —
this is precisely the PascalCase bug its `lowerKeys` helper was written to repair.

### 1.4 Batch tracking is a correctness bug, not a missing feature

`InventoryBatch` is fully modelled — `batch_number`, `expiry_date`, `remaining_quantity`,
`received_date`, `purchase_cost`, `status` (`active|near_expiry|expired|consumed`) — with
endpoints, an alerts service, a `_app.batches.tsx` UI, and an expired-sale guard in
`OrdersController:146-160`.

But:

- **`RemainingQuantity` is never decremented.** It is written at three sites only — all
  *creation* (`InventoryController:115`, `PurchaseOrdersController:227`,
  `StockTransfersController:285`). `OrdersController` checks that a sellable batch *exists*, then
  deducts `inventory_stock` and never touches the batch. **Batch quantities are write-once and
  drift from reality after the first sale.**
- **`Status` never transitions.** Nothing ages a batch to `near_expiry`/`expired`; the only
  assignments are in `DataSeeder`. The expired-sale guard therefore leans entirely on the
  `ExpiryDate` comparison beside it, and the UI's Near Expiry/Expired counts only ever reflect
  seed data.
- **FIFO/FEFO does not exist.** The only repo-wide hits are an i18n string
  (`"FIFO / FEFO tracking · auto-block expired items"`) used as a page subtitle.
- **Recall does not exist.** `_app.batches.tsx:269` renders a hardcoded `value="—"` card.

So §13 is mostly *repair*, and every batch-derived number on screen today is unreliable.

### 1.5 Pricing: the price-list table is dead code

- **`ProductPriceList`** (`Product.cs:129`) already has `price_type`
  (`standard|online|aggregator|wholesale`), `price`, `branch_id`, `effective_from`,
  `effective_to`, `is_active`. That is §12's "multiple price lists" + "branch-based pricing" +
  "scheduled pricing", already designed.
  **It is referenced only by the DbContext, the seeder, and migrations. Zero controllers, zero
  UI, zero pricing engines.**
- **A product's price is always `product.BasePrice`.** There is no resolution step anywhere.
  Discounts/offers are computed as order-level adjustments on top of `BasePrice`; they never
  rewrite a line's unit price.
- **The pricing engine is duplicated by hand.** `self-checkout/src/lib/pricing.ts` (271 lines) is
  the only extracted engine; the staff POS re-implements the same logic inline in
  `_app.pos.tsx:1091-1326`. Its own comments say it "mirrors the staff POS". **Any pricing change
  must be made twice, or the engine extracted first.**
- Against the §12 checklist: Promotion pricing ✅ (rich — `Discount` + `Offer`, tier gates,
  exclusions). Barcode pricing 🟡 (`Offer.TriggerBarcode` only — shipped today). Tobacco 🟡
  (`IsTobacco` + a hardcoded `max(25, basePrice)` formula, **with three known defects already
  documented in `docs/tobacco-fees-testing.md`**). Customer-group pricing ❌ (**no
  `CustomerGroup` entity exists** — only a flat `Customer.Tier` string). Pack/unit pricing ❌
  (`UnitOfMeasure` is a free-text string; no pack size, no conversion). Multi-barcode ❌
  (`Product.Barcode` is a single nullable column).

### 1.6 The reports layer is consistent and easy to extend — but has no shared filter bar

21 reports, each a strict `GET /reports/x` + `GET /reports/x/export` pair in a 3,305-line
`ReportsController`, registered in one array in `_app.reports.index.tsx`. Frontend pattern is
near-copy-paste across all 21.

- **No react-query.** It's a dependency and a `QueryClient` is created, but `useQuery` appears in
  zero routes. Every report hand-rolls `useEffect` + `useState` + `.then(setData)`. No caching,
  no dedupe, **no abort** (product-sales refires on every keystroke, undebounced).
- **No shared filter bar.** `components/filter-bar.tsx` exists but is unusable — its branch list
  is a **hardcoded string array of fake branch names**. `components/branch-filter.tsx` is proper
  and `Branch[]`-driven but is **imported by zero reports**. All 21 inline the branch select by
  hand. `ui/calendar.tsx` supports `mode="range"` but every report uses two raw
  `<input type="date">`. `ui/command.tsx` (combobox) is present and used by nothing.
- The staged `src/lib/use-report-filters.ts` is the first step of consolidation — a lookup-list
  hook (categories/products/employees/terminals), **adopted by 9 of 21 reports**. It holds no
  state and **has no warehouse list**.

---

## 2. Status against the spec

Legend: ✅ done · 🟡 partial · ❌ missing

### §2.1 Advanced Inventory Filters

| Filter | Coverage today |
|---|---|
| Branch | ✅ **21/21** (but rendered only for `tenant_admin`; others get no control) |
| Product | 🟡 **9/21** |
| Employee | 🟡 **13/21** — labelled inconsistently: Employee / Cashier / Staff / Created By |
| **Warehouse** | ❌ **0/21**, and no report endpoint accepts it. See §1.1. |

| Requirement | Status |
|---|---|
| Stock Review filter | 🟡 `StockCount` + `StockCountsController` exist (start → count → complete, posts variance as adjustments). No report. |
| Stock Audit filter | 🟡 Same substrate as above. |
| Inventory Reconciliation | 🟡 Same — `stock_count_items` already carries `system_quantity`, `counted_quantity`, `variance`. |
| Product-Based Stock Analysis | 🟡 `inventory-snapshot` report covers much of it. |

**Read:** the reconciliation domain is largely built and unreported. This is cheaper than it looks.

### §2.2 Purchase Report — View Details
**Data ✅ / Report ❌.** `PurchaseOrderItem` already has *every* field the spec lists (product,
ordered qty, received qty, unit cost, subtotal → product name/SKU via nav). But **there is no
purchase report at all** — only the operational `_app.purchase-orders.tsx` page and
`supplier-performance`. Needs a new report + drill-down. No migration.

### §2.3 Wastage Report
🟡 Mostly done. `waste-spoilage` already filters by date, branch, product, category, `adjustedBy`,
reason, tobacco. Missing: **Employee who approved** (no `approved_by` column on
`inventory_adjustments`) and **Warehouse** (no `warehouse_id`). → migration.

Two latent bugs in this report, both worth fixing while we're here:
- **`InventoryAdjustment.BatchId` is dead.** The column exists (migration
  `20260630120000_AddBatchId`) and the report *reads through it* (`ReportsController.cs:1619`),
  but **no write path ever populates it** — neither `InventoryController.Adjust` nor
  `StockCountsController.Complete`. So the report's **Batch/Lot and Expiry columns are always
  null in production.** They look implemented and are not.
- **There is no `expired` adjustment type.** The `ExpiredItems` KPI approximates it by
  substring-matching `"expir"` in free-text notes (`ReportsController.cs:1629`). Adding a real
  adjustment type is the honest fix, and §13 needs it anyway.

### §2.4 Stock Transfer Report
**Model ✅ / Report ❌.** `StockTransfer` already has all six directions, source/dest
branch+warehouse+supplier, `created_by`, `approved_by`, status, dates, and per-item requested/
approved/received quantities. `api.getStockTransfers()` already accepts source/dest warehouse
filters. Missing: **`received_by`** (no column) and the report itself.

### §2.5 Inventory Transaction Audit Trail
🟡 Foundation good, coverage partial. See §1.3. Per applicable transaction:

| Transaction | Audited today |
|---|---|
| Stock Adjustments | ✅ with qty before/after |
| Inventory Reconciliation | ✅ (`StockCountsController`) |
| Stock Transfers | ❌ no audit calls |
| Purchase Receipts | ❌ no audit calls |
| Purchase Returns | ❌ no audit calls |
| Wastage | ✅ (it's an adjustment type) |

Missing columns for the spec's required fields: `warehouse_id`, `product_id`. Plus the
attribution, scoping, and truncation issues in §1.3 — all of which undercut the feature's purpose.

Also note `AuditLog.Notes` exists and holds the free-text reason, but the `audit-trail` report
**does not expose it** — §2.5 asks for "Reason for Adjustment", which is already captured and
simply not surfaced.

### §2.6 Inventory Dashboard KPIs
**There is no inventory dashboard.** `_app.inventory.tsx` is a CRUD page with zero KPI cards.
KPIs are scattered across `_app.dashboard.tsx` (low stock, out of stock, near expiry) and
`reports/inventory-snapshot` (stock value, available qty, reserved qty, negative stock).

| KPI | Status |
|---|---|
| Current Stock Value | ✅ exists in inventory-snapshot (finance-gated) |
| Available Stock Qty | ✅ same |
| Low Stock / Out of Stock | ✅ dashboard + low-stock report |
| Negative Inventory | 🟡 KPI exists — but see the conflict below |
| Pending Purchase Orders | ❌ |
| Wastage Value | ❌ (waste-spoilage has it per-report, not as a KPI) |
| Inventory Turnover | ❌ needs movement history |
| Top / Slow Moving | ❌ needs movement history |

> **Spec-vs-code conflict:** `InventoryController:247-250` **clamps stock at zero**
> (`Math.max(0, ...)`), matching `OrdersController`. Negative inventory therefore cannot arise
> through the adjustment path, so a "Negative Inventory Items" KPI would read 0 forever. Either
> the clamp is wrong or the KPI is decorative. Needs a business answer (Decision D).

### §2.7 Inventory Aging
❌ Nothing. All four items need per-product movement history → blocked on §1.2.

### §12 Pricing
Promotion ✅ · Barcode 🟡 · Tobacco 🟡 (with known defects) · Price lists / Branch / Scheduled 🟡
**(schema exists, dead)** · Customer group ❌ · Pack & unit ❌.

### §13 Lifecycle & Expiry
Batch tracking 🟡 **(broken — drifts)** · Expiry tracking ✅ · Near-expiry alerts ✅
(`OperationalAlertsService`, 7-day) · Expired reports 🟡 · FIFO ❌ · FEFO ❌ · Recall ❌.

---

## 3. Decisions needed before I write code

These are business calls I should not make unilaterally; each one changes the plan's shape and cost.

**A. Is Warehouse a real reporting dimension, or a filter over branch data?** (blocks §2.1, §2.3, §2.5)
The spec says warehouse filters everywhere, but wastage/adjustments/sales have no warehouse
today — they're branch-only.
- **A1 (cheap, honest):** warehouse filters appear only where warehouse data genuinely exists
  (transfers, POs, warehouse stock). Inventory/sales reports keep branch only.
- **A2 (expensive, complete):** add `warehouse_id` to adjustments and unify both ledgers behind
  a single location concept. Correct long-term, touches the POS write path, needs backfill for
  existing rows.
- **A3 (compromise, my recommendation):** A1 now + `warehouse_id` added to *adjustments only*
  (nullable, additive, no backfill risk), so wastage/audit get warehouse. Defer full unification.

**B. Do we fix batch consumption / FIFO-FEFO?** (blocks §13)
Making sales consume batches changes `OrdersController`'s hot write path and every existing batch
row is already wrong. This is the highest-risk item in the document. Fixing it makes today's
numbers *change*, which will look like a regression to users. Doing §13 without it means building
FEFO on data known to be false.

**C. Do we activate `ProductPriceList`, or keep `BasePrice`?** (blocks §12)
Activating it means POS pricing gains a resolution step — the single riskiest change in the
pricing area, and it must be made in **two** engines unless we extract first.
My recommendation: extract the shared engine **first** (behaviour-preserving, independently
verifiable), then activate price lists behind it.

**D. Should stock be allowed to go negative?** (blocks the §2.6 KPI) — see the conflict above.

**E. Customer-group pricing: new `CustomerGroup` entity, or promote `Customer.Tier`?**
Tier is a flat string with an existing `MinCustomerTier` gate. A real group entity is more correct;
reusing tier is far cheaper and already wired through both engines.

---

## 4. Phased plan

Ordering principle: **correctness and foundations before features**, and nothing that changes a
number on screen ships in the same phase as something that adds a screen. Every migration is
**additive and nullable** — no destructive column changes, consistent with the
`20260716110815_AddOfferTriggerBarcode` precedent.

### Phase 0 — Foundations (no user-visible change)
Purpose: make the later phases small. Nothing here alters existing behaviour.

1. **Extract the shared pricing engine.** Lift `_app.pos.tsx:1091-1326` into `src/lib/pricing.ts`
   so it and `self-checkout` share one implementation. Pure refactor; verify both POS paths
   produce byte-identical totals before/after. *Unblocks all of §12.*
2. **Additive migration** (one, coherent). Convention: `yyyyMMddHHmmss_PascalCaseName`, EF-generated
   with a `.Designer.cs` (the hand-written `HHmm00` migrations in the folder are the exception,
   mostly data fixes — follow the EF path here).
   - `inventory_adjustments`: `+ approved_by`, `+ warehouse_id` (both nullable) → §2.3
   - `stock_transfers`: `+ received_by` (nullable) → §2.4
   - `audit_logs`: `+ product_id`, `+ warehouse_id` (both nullable) → §2.5
3. **Close the attribution holes** (small, high value, independently shippable):
   - Take the actor from the **JWT** in `StockCountsController`, `PurchaseOrdersController`,
     `StockTransfersController`, `WarehouseController.Approve` — matching the pattern
     `InventoryController:28` already established. Keep the body value as a fallback only for
     kiosk/service tokens, exactly as `InventoryController` does.
   - Add the missing permission gate + branch scoping to `GET /inventory/adjustments`.
   - **Populate `InventoryAdjustment.BatchId`** on write, so the waste report's existing
     Batch/Expiry columns stop being permanently null.
   - Paginate the `audit-trail` report (or at minimum return a total + a truncation flag) instead
     of silently capping at 2,000.
4. **`useReportFilterOptions` → add `warehouses`** (via existing `api.getWarehouses()`), and
   adopt the hook in `product-sales` (the 9/21 holdout — deletes ~25 duplicated lines).
   Preserve its `cashierId` reset-on-branch-change behaviour.
5. **Build the two missing shared controls**: a `DateRangePicker` (`ui/calendar.tsx` already
   supports `mode="range"`; replaces ~19 duplicated `firstOfMonthStr()`/`todayStr()` pairs) and a
   searchable combobox (`ui/command.tsx` + `ui/popover.tsx`, both present and unused) for the
   Product picker, which is currently an unsearchable full-catalog `<select>`.
   **Delete or fix `components/filter-bar.tsx`** — it ships hardcoded fake branch names.

### Phase 1 — Unified filters (§2.1 + the spec's "Important Note")
Roll the Phase-0 controls across the reports, per Decision A's scope.
- Backend: add `warehouseId` / `productId` / `employeeId` query params to the report endpoints
  that can support them. **All optional** — existing callers unaffected.
- Frontend: standardise the labels (settle on **Employee**, not Cashier/Staff/Device) and adopt
  `BranchFilter` so non-admins see a *disabled* branch control rather than nothing.
- Ship report-by-report, not big-bang. Each is independently verifiable.

### Phase 2 — Missing reports (§2.2, §2.3, §2.4)
Follow the existing `GET` + `/export` pair convention and register in `_app.reports.index.tsx`.
- **Purchase Order Details report** — new report + expandable row drill-down. No new data.
- **Stock Transfer report** — new report; the model already has everything but `received_by`
  (Phase 0).
- **Wastage report** — extend the existing one with Approved By + Warehouse.

### Phase 3 — Movement ledger + audit trail (§2.5)
The keystone. Introduce **one** `inventory_movements` table (product, location, type, qty before,
qty delta, qty after, user, reason, ref to source doc, timestamp), written from every mutation
site: adjustments, transfers, PO receipts, PO returns, wastage, reconciliation, **and sales**.
- Write it *additively* alongside existing logic first — nothing reads it — then cut reports over
  once it's proven to agree with `inventory_stock`.
- Add the missing `IAuditService` calls to `StockTransfersController` and
  `PurchaseOrdersController`, matching the JSON shape `src/lib/audit-changes.ts` expects.
- Extend `describeChanges` for the new transaction kinds.

### Phase 4 — Inventory dashboard + aging (§2.6, §2.7)
Depends on Phase 3 — turnover, top/slow movers, aging, and days-since-last-movement all read the
ledger. Build the dedicated inventory dashboard here rather than bolting KPIs onto
`_app.inventory.tsx`; consolidate the KPIs currently split between `_app.dashboard.tsx` and
`inventory-snapshot`.

### Phase 5 — Pricing (§12) — *gated on Decisions C & E*
On the Phase-0 extracted engine: activate `ProductPriceList` (endpoints + admin UI + a resolution
step), then customer-group and pack/unit pricing.
Also fold in the three **already-documented tobacco defects** from `docs/tobacco-fees-testing.md`
— notably that `OrdersController.Create` never computes the tobacco fee server-side and trusts the
client. That is a live revenue/compliance bug and arguably belongs earlier than Phase 5.

### Phase 6 — Lifecycle (§13) — *gated on Decision B*
1. Make batch consumption real (decrement `RemainingQuantity` on sale) + a reconciliation/backfill
   for the drifted rows.
2. A job to age `Status` → `near_expiry` / `expired`.
3. FEFO picking, then FIFO costing.
4. Recall tracking (net-new).

---

## 5. Risk register

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Fixing batches changes visible numbers.** Today's counts are wrong; correcting them reads as a regression. | Reconcile in a dry-run report first; show before/after; get sign-off before cutover. |
| 2 | **Pricing is duplicated across two engines.** A one-sided change makes self-checkout and staff POS disagree on price — silent, and customer-facing. | Phase 0 extraction is a hard prerequisite for Phase 5. |
| 3 | **Touching `OrdersController`'s write path** (batches, ledger, negative stock) risks the highest-traffic, money-handling code. | Additive writes first, read-side cutover second. Never both in one PR. |
| 4 | **New audit payloads that don't match `audit-changes.ts`** render as *silently empty* diffs — exactly the PascalCase bug already fixed once. | Add a shape test per new transaction kind. |
| 5 | The 3,305-line `ReportsController` and ~21 copy-paste report pages make cross-cutting change expensive. | Phase 0/1 consolidation pays for Phases 2–4. |
| 6 | Warehouse scope creep (Decision A2) silently becomes a stock-architecture rewrite. | Settle Decision A **before** Phase 1 starts. |
| 7 | Uncommitted staged §1.1 filter work overlaps Phase 0/1 file-for-file. | Land or discard it before Phase 0. |
| 8 | **Client-supplied actors** (`ApprovedBy` from request body) make the audit trail attestable-to-nothing. Building §2.5 on top of it ships a feature that *looks* like accountability. | Phase 0 item 3 — fix before §2.5 is demoed to anyone as an audit control. |
| 9 | Several columns look implemented but are never written (`InventoryAdjustment.BatchId`, `RemainingQuantity`, `Batch.Status`, `ProductPriceList`). Reading the schema overstates what works. | This document is the inventory; don't trust a column's existence as evidence of a live write path. |
