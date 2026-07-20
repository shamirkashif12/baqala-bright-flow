# Dev Response — Mimony Mart POS Retest Follow-Up (2026-07-17)

**Re:** MyTM QA — Test Run Report (Dev-Claimed-Fix Retest, 2026-07-17)
**Scope:** all 10 retested defects + the 1 new defect found incidentally (MIMONY-WHSE-REQUEST-PAYLOAD-001)
**Commits:** `ad3f392` → `8b108fa` on `main`
**Status:** every open item from the report now has a code fix in `main`. None of this has been deployed to staging (`65.108.31.172:8088`) yet — that's the next step before any of this can be retested live.

Ground rule for this cycle: every fix below is described with what QA will actually observe on retest, not just what changed internally. Where I couldn't runtime-verify something (no UI wired up yet, or needs specific staging data), I've said so plainly rather than claiming a clean pass.

---

## Summary table

| Ticket | QA verdict (2026-07-17) | This cycle |
|---|---|---|
| MIMONY-CRYPTO-001 | STILL OPEN — clean but held for 2nd session + unexplained print toast | Print toast explained (see below) — root cause is environmental, not app code. No new code change; nothing to re-verify. |
| MIMONY-RETURNS-VAT-001 | STILL OPEN — VAT confirmed, discount-netting untested | Already fully fixed in code, confirmed by re-reading + re-running the discount math myself. **No code gap — just needs a discount-order retest.** |
| MIMONY-PII-ORDERS-CROSSBRANCH-001 | PARTIALLY FIXED — IDOR fixed, cashier-name leak remained | **Closed.** Cashier is now hidden entirely (not just PII-trimmed) once they're outside the viewer's branch. |
| MIMONY-ORPHANED-CHECKOUT-001 | STILL REPRODUCES — no reconciliation path | **Reconciliation endpoint added.** No UI yet — backend only this cycle. |
| MIMONY-UI-011 | DID NOT REPRODUCE (partial coverage) | No new change — already comprehensively fixed on 33 pages earlier this cycle; QA's partial retest is consistent with that. |
| MIMONY-RETURNS-ORDERSTATUS-001 | "Fixed going forward" (unexplained) | **Now actually fixed, with a named root cause** — previously nothing pinned this down. |
| MIMONY-RETURNS-CUSTMISATTR-001 | "Confirmed fixed" (unexplained) | **Was NOT actually fixed** — found and closed the real bug this cycle. |
| MIMONY-RBAC-CREATEFORMPICKER-001 | INCONCLUSIVE — hit unrelated 500 | The 500 is fixed (see WHSE-REQUEST-PAYLOAD-001). Please re-run the write-probe now that the request actually succeeds. |
| MIMONY-INV-FRACTIONALQTY-001 | STILL REPRODUCES | **Fixed** — whole-unit products now reject fractional quantities. |
| MIMONY-SHIFT-CONCURRENT-001 | RESOLVED, non-issue | No action needed, agreed. |
| MIMONY-WHSE-REQUEST-PAYLOAD-001 (new) | S3, provisional hypothesis | **Confirmed and fixed** — QA's hypothesis was directionally right; here's the actual mechanism. |

---

## Detail per ticket

### MIMONY-CRYPTO-001 — checkout crash
No code change this cycle. On the "Print failed: Failed to fetch" toast QA flagged: I traced the call chain — `printReceipt()` targets a **local print-agent** on `http://localhost:5008` (a separate companion service from the main API, installed via the POS Setup tool), not the app's own backend. "Failed to fetch" is the exact browser signature of that local agent not running on the test machine. Confirmed the order is fully saved *before* the print attempt fires — a print failure has zero effect on the order or transaction. This is an environment prerequisite on the QA machine, not an app bug. No objection to holding for a 2nd session on the original root-cause grounds (plain-HTTP/no secure context) — that part of your call stands.

### MIMONY-RETURNS-VAT-001 — refund shortfall
No code change needed — already fixed. I re-checked `ReturnsController.cs` and re-ran the actual formula against an order with a real discount (`subtotal=108.5, discount=54.25`): it reconciles to `67.3875`, not the old flat `108.5`. The discount-netting half QA flagged as "untested" is already live; your retest case just didn't carry a discount. **Ask:** retest against any order that has a discount applied, and this should close outright.

### MIMONY-PII-ORDERS-CROSSBRANCH-001 — cross-branch cashier PII
Fixed further this cycle. Root cause of the residual "still reproduces": the earlier fix trimmed the embedded cashier down to `{id, fullName}`, but a cashier who has since transferred to a different branch was still named on old orders. Now: the whole `cashier` field is hidden (returns `null`) once that cashier's *current* branch differs from the viewer's — in both the Orders list and Order detail. `tenant_admin` is unaffected, same as every other cross-branch exemption in this controller.

### MIMONY-ORPHANED-CHECKOUT-001 — checkout with no shift
Root cause: elevated-role checkout (Branch Manager/Supervisor/Admin) without a shift is a deliberate, documented rule (`FR-SLS-05` — those roles structurally can't hold a shift), not a bug in itself. What was actually missing was a way to fix an order afterward. Added `PATCH /api/orders/{id}/reconcile-shift` (manager/admin-only, same-branch-only) to retroactively attach a shift to an order that has none. **This cycle is backend-only — no UI button exists yet to call it.** If you want to retest the historical 4 orphaned orders, that needs either a direct API call or a small UI addition first; let me know which you'd prefer.

Also noting: the "self-flagged critical severity" your ticket describes doesn't match what I found in the audit-log code — the actual entry for this case is logged at `warning`, not `critical`. Worth double-checking where the "critical" reading came from (possibly a display/rendering question rather than the stored severity) — flagging in case it affects how this gets prioritized elsewhere.

### MIMONY-UI-011 — stale-zero render
No new work this cycle — this was already fixed comprehensively earlier (33 pages total, not just the original 7). Your retest covered 5 of 7 original pages, 2 of 9 roles, and came back clean, which is consistent with — not contradictory to — the fix holding everywhere. **Ask:** when you get to a full pass, the untested screens (`/orders`, `/warehouses`) and roles (Storekeeper, Supervisor) are worth confirming, but I'd be surprised if they don't also come back clean.

### MIMONY-RETURNS-ORDERSTATUS-001 — orderStatus reads "refunded" despite rejection
This is the one where I can now tell you *why* your retest passed, which your ticket couldn't. Root cause: the Orders page's "quick refund" dialog called `updateOrderStatus(order.id, "refunded")` **immediately on submitting** the return request — before any manager approval — even though the backend always creates a new return as `"pending"` regardless of what's sent. If that pending return was later rejected through the normal Returns-page flow, the order stayed permanently mislabeled "refunded" with nothing behind it.

Fix: removed that premature call. The order now only becomes `"refunded"` inside `ReturnsController.Complete` — the one place a return actually finishes, after real manager approval. Also hardened the generic order-status endpoint to flatly reject `status=refunded` from any other caller, so this is now the *only* path to that status. Verified directly: `PATCH /api/orders/{id}/status {"status":"refunded"}` now returns 400.

One user-visible change worth flagging to QA and to Usman: the Orders-page "quick refund" dialog no longer marks an order refunded the instant it's submitted — it now correctly sits as **pending manager approval** like every other return, and the dialog's success message was updated to say so. If anyone was relying on that dialog for an *instant* refund, that's now a deliberate behavior change, not a bug.

### MIMONY-RETURNS-CUSTMISATTR-001 — customer misattribution
Your "confirmed fixed" verdict was **not actually correct** — I found and reproduced the real mechanism. Root cause: the Returns page's order-select and invoice-lookup handlers used `order.customerId ?? p.customerId` — if you looked up a customer's order first (populating the form), then switched to a different, anonymous order *within the same open sheet* without closing it, the anonymous order's `null` fell through to the stale previous customer. Your 2 fresh test cases each started from a freshly-opened, empty sheet, which never exercises that fallback — hence the false clean pass.

Fixed both frontend call sites to always take the freshly-looked-up order's own value. Also hardened server-side: `ReturnsController.Create` now derives `CustomerId` from the order itself and ignores whatever the client sends, so this can't regress again even from a future frontend bug. Verified directly: submitted a return with a deliberately forged `customerId` in the request body — server persisted the order's own value, not the forged one. **Ask:** please retest specifically via the repro I found — look up a customer's order, then switch to an anonymous order in the same open sheet — since that's the actual failure mode, not two independent fresh sheets.

### MIMONY-RBAC-CREATEFORMPICKER-001 / MIMONY-WHSE-REQUEST-PAYLOAD-001 — Picker's New Stock Request 500
Both point at the same bug, now fixed. Root cause: `WarehouseRequest.RequestedBy` is a required foreign key to `Users`, but `[Required]` on a `Guid` is a no-op in ASP.NET model binding (a value type can't be "missing") — and the frontend never sent this field at all. Every submission silently bound `Guid.Empty`, which has no matching user, and violated the foreign-key constraint at save time — an unhandled exception that surfaced as a generic 500 with no partial record, for **any role**, not just Picker.

Fixed: `RequestedBy` is now derived server-side from the caller's own JWT, same pattern used elsewhere in this codebase. Also added a clean 400 for an unresolvable destination branch (your own secondary hypothesis about a warehouse/branch-ID mismatch — real edge case, now handled defensively too, though the `RequestedBy` bug was the dominant, unconditional cause). Verified directly: a full legitimate submission now returns 201 with `requestedBy` correctly populated. **Ask:** please re-run RBAC-CREATEFORMPICKER-001's original write-bypass probe now that the request actually succeeds instead of 500ing — that will finally give you a clean signal on whether Picker's create-form reachability is also a real write-bypass, or just blocked by `canCreate:false` as expected.

### MIMONY-INV-FRACTIONALQTY-001 — fractional quantities on whole-unit products
Confirmed and fixed. There was no unit-of-measure validation anywhere — every stock-quantity endpoint (Inventory receive/adjust, Stock Transfers create/receive, Purchase Orders create/receive) accepted any `decimal` value with no check against the product's unit. Added a shared validation helper checking `Product.WeightBased` (false = count-based "piece"-style product, no fractional units allowed) across all six endpoints. Verified directly: `2.5` units of a non-weight-based product now rejects with `"...must be a whole number for [product] — this product is tracked by piece, not weight/volume"`; whole-number quantities are unaffected.

### MIMONY-SHIFT-CONCURRENT-001 — concurrent shift
Agreed as resolved/non-issue. No action taken — confirmed the 409 conflict check was already correct and predates any of this cycle's changes.

---

## What's ready to retest now vs. what still needs staging first

Everything above is **committed and pushed to `main`** (`3d47564`, `8b108fa`), built clean, typechecked clean, and directly runtime-verified against a local environment for: the warehouse-request fix, the fractional-quantity rejection, the customer-misattribution server-side guard, and the refunded-status block. **None of it is deployed to the staging box you retest against (`65.108.31.172:8088`) yet** — that needs to happen before any of this is retestable live. Worth confirming with whoever owns that deploy step before scheduling the next retest pass.
