---
name: verify
description: Build, run, and drive Mimony Mart POS (Vite frontend + .NET API + local MySQL) to verify changes end-to-end.
---

# Verify — Mimony Mart POS

## Stack & handles

- **API**: `cd api && dotnet build`, then `dotnet run --launch-profile http --no-build` → `http://localhost:5008`. Needs local MySQL (`localhost:3306`, db `mart_ecr`, root, empty password — see `api/appsettings.Development.json`). Boot takes ~10-20s.
- **Frontend**: `npm run dev` (Vite). Port 8080 is often taken by the user's own dev server — Vite falls back to 8081. `.env` already sets `VITE_API_URL=http://localhost:5008`.
- **Auth**: `POST /api/auth/login` with `{"email", "password"}` → `{token, user}`. JWT carries `role`, `roleId`, `branchId`; backend permission checks resolve `roleId` against RolePermissions in the DB.

## Seeded logins (api/Data/DataSeeder.cs)

Password `Pakistan123@`: `ahmad.aziz@mytm.co` (Tenant Admin), `sara.manager@baqala.sa` (Branch Manager), `omar.supervisor@baqala.sa` (Supervisor), `khalid.cashier@baqala.sa` / `nora.cashier2@baqala.sa` (Cashiers), `bilal.finance@baqala.sa`, `layla.marketing@baqala.sa`, `tarek.picker@baqala.sa`.

Password `Admin@1234`: `yousef@mimoney.sa` (Storekeeper), `abdullah.alfaisal` and other primary demo users.

⚠️ Role assignments can drift in the local DB (users edited via the admin UI). Trust the `role` field in the login response, not the seeder's intent — e.g. `yousef.store@baqala.sa` was found reassigned to tenant_admin locally; use `yousef@mimoney.sa` for a genuine Storekeeper.

## Driving the API

Node ≥18 `fetch` one-liners/scripts work well: login → `Authorization: Bearer <token>` → hit endpoints, assert status + body.

## Driving the browser

No Playwright in the project. Install `playwright-core` in the session scratchpad (NOT the repo) and launch system Edge:

```js
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
```

**Gotcha — hydration**: the login page is SSR-streamed; clicking submit before React hydrates fires a native form GET (page reloads, no API call, nothing stored, chunks abort with `net::ERR_ABORTED`). Always `goto(..., { waitUntil: "networkidle" })` + `waitForTimeout(1500)` before interacting. Login form fields are `#email` / `#password`, submit is `button[type="submit"]`.

Route-guard redirects (`src/components/route-guard.tsx`) are client-side effects — after `goto`, wait ~3s then read `page.url()` to see where a denied role landed (per-role defaults in `ROLE_DEFAULT_ROUTES`).

**Fault injection**: `ctx.route("**/api/terminals*", r => r.abort())` deterministically reproduces partial-load failures (the stale-zero defect family, 86eyag3ny) — pages must keep partial data and show the `LoadErrorBanner` with Retry, never silent zeros.

## Flows worth driving

- Per-role access: login as each seeded role, check sidebar items rendered vs. direct-URL navigation redirect vs. API status codes for the module under test.
- RBAC lives in DataSeeder `BuildPermissions` (role defaults) + `UserPermissions` (per-user overrides, take precedence — `PermissionCheck.HasPermissionForUserAsync`).
