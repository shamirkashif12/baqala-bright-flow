# MI Money — Major UX & Module Upgrade

This is a large, additive pass on the existing app. No theme rebuild — keep purple/white. All pseudo data. Mobile-responsive throughout.

## 1. Dashboard simplification (`_app.dashboard.tsx`)
- Remove all images and the ZATCA Sync card.
- Replace hero with a clean header + filter chips: **Daily / Weekly / Monthly / Custom**.
- Build a single reusable `StatCard` (icon, count, label, % change, last-updated time, quick action link).
- Render 10 cards: Pending Orders, Processing, Ready to Deliver, Delivered, Today's Sales, Today's Delivery, Active Cashiers, Active Terminals, Low Stock, Close to Expiry.
- Below cards: simple widget grid — Order Status Summary, Today's Delivery, Cashier Snapshot, Terminal Snapshot, Low Stock Alerts, Expiry Alerts, BI Summary.

## 2. Inventory upgrade (`_app.inventory.tsx`)
- Expand pseudo dataset with all columns (ID, Name, SKU, Barcode, Category, Branch, Warehouse, Qty, Stock Status, Expiry, Expiry Status, Days Left, Supplier, Purchase Price, Selling Price, Status).
- Add filter bar: Stock Status, Expiry Status, Category, Branch, Warehouse, Supplier, search.
- Row highlighting: orange (close to expiry), red (expired), warning badge (out of stock).
- Add/Edit dialog.

## 3. Warehouse module
- Upgrade existing `_app.warehouse-suppliers.tsx` is supplier-only; add a new **`_app.warehouses.tsx`** for warehouse list with the columns specified, plus drill-in dialog showing warehouse items, batches, transfer logs, movement history.
- Actions: Add/Edit/View Warehouse, Add Item, Transfer to Branch, Adjust Stock (all as dialogs).
- Add sidebar entry "Warehouses".

## 4. POS upgrade (`_app.pos.tsx`)
- Add grid/list view toggle, expiry chip + days-left + permissible badge per product card.
- Cart panel: existing structure + cashier name, terminal ID, order status row.
- New dialogs: **Order Details**, **Payment** (cash/card/wallet/split with card-machine status), **Hold Orders** drawer (list held orders + reopen/cancel/new), **Customer**, **Discount/Coupon**, **Invoice Print**, **Refund**.
- Held orders stored in component state.

## 5. Cashier shift flow
- New route `_app.cashier-shift.tsx` with Check-In and Check-Out dialogs and a session summary card (open amount, totals by tender, refunds, withdrawal, expected vs actual, difference, transactions, scans).

## 6. Terminal sessions
- New route `_app.terminal-sessions.tsx` showing per-cashier active terminal, previous terminal, held orders count, total orders/scans, status. Pseudo data.

## 7. POS Settings
- New route `_app.pos-settings.tsx` — tabbed: Cashier, Terminal, Payment Methods, Invoice, Permissions (refund/discount/coupon/hold), Scan Behavior, Expiry Rules, Card Machine, Printer.

## 8. ACL / Roles & Permissions
- New route `_app.roles.tsx` with role list (Admin, Manager, Cashier, Inventory, Warehouse, Accountant) + permission matrix (module × action toggles) + Add/Edit role dialog.

## 9. Coupons, Discounts, Refunds
- New `_app.coupons.tsx` (coupon table + add/edit dialog with types: %, fixed, product, category, branch).
- New `_app.refunds.tsx` (refund requests table, status pipeline, approve/reject dialog).

## 10. MI Money Tiers (rename "Baqala Tiers" → MI Money Plans)
- New `_app.plans.tsx` with 4 purple/white pricing cards (Basic, Standard, Premium, Enterprise) showing all listed limits and Upgrade/Edit/Activate actions.

## 11. KPI Evaluation
- New `_app.kpi.tsx` with tabs: Cashier KPI, Terminal KPI, Product Scan KPI, Branch KPI. Each tab = KPI summary cards + detailed table.

## 12. Business Intelligence
- New `_app.bi.tsx` — admin/manager BI dashboard: sales trends (chart), best/slow sellers, cashier/terminal/branch performance, expiry loss, refund analytics, discount impact, payment mix, inventory movement, warehouse insights. Use existing Recharts/shadcn chart.

## 13. Cashier-only view
- Add a `cashier` role mode in `auth.tsx` already exists. Add a **Cashier Workspace** route `_app.cashier.tsx` that surfaces Check-In, POS, Held Orders, My Orders, Refund Request, Check-Out as a focused tile grid. Sidebar groups already filter by role visually — keep simple: just add the route + link.

## 14. Sidebar reorganization
- Add new entries: Warehouses, Cashier Shift, Terminal Sessions, POS Settings, Roles & Permissions, Coupons, Refunds, Plans, KPI, BI, Cashier Workspace.
- Keep collapsible groups.

## 15. Home / Login polish
- Login page: add a soft animated gradient mesh + 2 floating KPI chips, feature pill row (POS · Inventory · Suppliers · Delivery · Devices), EN/AR toggle (visual), Forgot password link. Keep purple/white.

## 16. Responsive
- All new tables wrapped in overflow-x containers. Cards stack to 1-col on mobile, 2-col sm, 3-col lg, 4/5 xl.

## Technical notes
- All frontend-only, pseudo data inline.
- Reuse existing `Card`, `Dialog`, `Tabs`, `Table`, `Toolbar`, `MetricCard`, `DataTable` patterns.
- New files: `_app.warehouses.tsx`, `_app.cashier-shift.tsx`, `_app.terminal-sessions.tsx`, `_app.pos-settings.tsx`, `_app.roles.tsx`, `_app.coupons.tsx`, `_app.refunds.tsx`, `_app.plans.tsx`, `_app.kpi.tsx`, `_app.bi.tsx`, `_app.cashier.tsx`.
- Edited: `_app.dashboard.tsx`, `_app.inventory.tsx`, `_app.pos.tsx`, `app-sidebar.tsx`, `login.tsx`.
- routeTree.gen.ts is auto-generated.

## Out of scope
- No backend / auth changes.
- No theme/token rewrite.
- No real card-machine integration — status badges only.
