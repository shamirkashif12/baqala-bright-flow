
# MI Money — Incremental Enhancements

Keep the existing app intact. Rename to **MI Money** and fill in only the missing modules, popups, and polish. No rebuild.

## 1. Rebrand to MI Money

- Update `baqala-logo.tsx` → render new "MI Money" wordmark + small purple receipt/coin mark (inline SVG, drop Mimony PNG reference).
- Replace "Mimony" / "Baqala" strings in sidebar, topbar, login, signup, dashboard headers, settings.
- Update document `<title>` defaults to "MI Money — Mart ECR".

## 2. Login / Home polish (edit, not rebuild)

Keep current `/login` structure; add:
- "MI Money" wordmark + tagline "Manage your Mart Smartly".
- Right-side live retail visual: keep current panel, add a paused-video-style hero (existing storefront image + animated gradient mesh + 2 floating live KPI chips via Framer-Motion).
- Feature pills row (POS · Inventory · Suppliers · Delivery · Devices).
- Language toggle (EN/AR) + Forgot password link (visual only).

## 3. Sidebar additions

Edit `app-sidebar.tsx` to add missing items in grouped order:
- Orders, Expenses, Expense Types, Warehouse Suppliers, Mart-to-Mart Suppliers, Device Behavior, Registered Users.
- Remove standalone "Admin Portal" entry (route stays for back-compat but unlinked); index redirect goes to `/dashboard`.

## 4. New module routes (add only)

Create these new files, each with table + Add/Edit/View popups using existing shadcn `Dialog`:

- `_app.orders.tsx` — orders table, filters, status update popup, invoice print popup.
- `_app.expenses.tsx` — expense summary table, Add Expense popup with line items + paid/total/due footer.
- `_app.expense-types.tsx` — CRUD table + popups.
- `_app.warehouse-suppliers.tsx` — reuses suppliers pattern, type=Warehouse.
- `_app.mart-suppliers.tsx` — type=Mart-to-Mart.
- `_app.device-behavior.tsx` — 4 status cards + behavior alerts table.
- `_app.users.tsx` — registered users card grid + table.

## 5. Existing module enhancements

- **POS** (`_app.pos.tsx`): add expiry chip with "X days left" per line, near-expiry warning toast, expired-block, and 3 popups (Customer, Discount, Payment, Invoice Print preview).
- **Inventory**: add Days Left + Permissible Status columns, Add/Edit product Dialog.
- **Compliance/Batches**: add Edit rule popup.
- **Branches / Terminals / Devices / Suppliers / Staff**: add Add+Edit Dialog buttons wired to existing Toolbar "primaryLabel".
- **Settings**: convert to tabs (Company, UI, Branches, Order Status, Designation, Department, Payment Methods) with add/edit dialogs.
- **Dashboard**: add 4 order-status top cards (Pending/Processing/Ready/Delivered), Daily/Weekly/Monthly filter chips, Alerts panel.

## 6. Shared utilities

Add `src/components/form-dialog.tsx` — thin wrapper around `Dialog` for consistent add/edit popups across modules.

## Technical notes

- Frontend only. No auth/backend changes.
- Pseudo Saudi data everywhere (SAR, Riyadh/Jeddah/Khobar branches, Almarai/Nadec/Sadia products, Saudi names).
- Use existing tokens in `src/styles.css`; only add a small accent if needed (no theme rebuild).
- Routes naming via dot-convention to match existing files.

This is purely additive + targeted edits — no module deletion, no design system overhaul.
