# ZATCA Phase 2 Integration — Agent Guide

**Purpose of this file:** brief a coding agent that has never seen this codebase before, so it can
work on ZATCA-related tasks (fix a bug, add a field, wire up a new screen, debug a rejected
invoice) without re-discovering the architecture from scratch. Every claim below was verified
directly against the current code (not assumed) — file paths and line-level behavior, read on
2026-08-07.

If you only read one section, read **§7 (landmines)** before touching any crypto/signing code.

---

## 0. TL;DR

- This is a **native C#/.NET port** of ZATCA's (Saudi e-invoicing) Phase 2 flow — no PHP/Node
  sidecar, no external ZATCA SDK. All CSR generation, XML building, canonicalization, hashing,
  XAdES signing and QR-TLV encoding happens in `api/Services/Zatca*.cs`.
- There are **four onboarding steps**, done once per mart (not per branch, not per order):
  1. Generate CSR → 2. Redeem it for an OTP on ZATCA's Fatoora portal (human, outside this app) →
     3. Exchange OTP for a **Compliance CSID** → 4. Run 6 compliance tests, then exchange for a
     **Production CSID**.
- Once onboarded, **every POS checkout auto-creates and auto-submits a ZATCA invoice
  synchronously**, and the resulting signed QR code is what actually gets printed on the receipt —
  see §5. Nothing about this is fire-and-forget; the checkout HTTP response itself carries the
  real signed QR so the printed receipt is never a placeholder once onboarding is done.
- One shared cryptographic identity (`ZatcaIdentity`, a singleton DB row) is used by **all
  branches** — one certificate, one VAT registration chain, one hash chain. Branches only differ in
  their address/seller-name fields (`ZatcaSettings`, one row per branch).

---

## 1. The four models — don't confuse them

| Model | Table | Scope | What it holds |
|---|---|---|---|
| `ZatcaIdentity` | `zatca_identity` | **Singleton** (fixed PK `00000000-0000-0000-0000-000000000001`) | The shared crypto identity: CSR, private key (encrypted), EGS serial, compliance/production CSID tokens+secrets (encrypted), the ICV/PIH hash chain state, `OnboardingStatus`, `Phase2Enabled`, `Environment` |
| `ZatcaSettings` | `zatca_settings` | **Per branch** | Seller name, VAT registration number, structured address (street/building/city-subdivision/postal zone) — ZATCA's UBL XML needs discrete address fields; `Branch.Address` is free text and isn't enough |
| `ZatcaInvoice` | `zatca_invoices` | **Per order** | One row per submitted e-invoice: type, amounts, buyer info (for B2B), the signed XML, the QR value, ZATCA's response, status (`pending/submitted/accepted/rejected`) |
| `CompanyProfile` | `company_profile` | **Singleton** (fixed PK `...002`) | Legal name / CR number / VAT number shown on every printed document + receipt logo. Deliberately separate from `ZatcaSettings` — this is "what a human reads on the receipt", not ZATCA's legally-fixed TLV spec fields |

Why the split (from `api/Models/Compliance.cs` comments): all branches share one VAT
registration and must sign under **one** certificate with **one unbroken** ICV/hash sequence — you
cannot have branch A and branch B each running their own onboarding. `ZatcaSettings` used to also
carry the crypto/onboarding fields until migration `20260710131917_SplitZatcaIdentityFromSettings`
pulled them out into the `ZatcaIdentity` singleton.

`OnboardingStatus` on `ZatcaIdentity` moves through exactly these values, in order:
`not_started` → `csr_generated` → `compliance_csid_obtained` → `production_ready`.
**Only at `production_ready` does checkout start auto-submitting real invoices.**

---

## 2. The onboarding flow, step by step

All onboarding endpoints live in `api/Controllers/ComplianceController.cs` under
`/api/compliance/zatca/onboarding/{branchId}/...`, backed by `IZatcaService`
(`api/Services/ZatcaService.cs`). The UI is `src/routes/_app.zatca-settings.tsx` (page title
"ZATCA Phase 2 — Billing & Orders"), specifically its **"ZATCA onboarding"** card with 3 numbered
steps. Every onboarding endpoint requires `RequirePermission("Compliance", Edit)` +
`RequirePlanFeature("zatca_compliance")`.

### Step 0 — Prerequisites (do this before step 1)

Onboarding will technically run without these, but the CSR/invoices will contain garbage/blank
legal data ZATCA will eventually reject. Fill in, per branch, via `PUT
/api/compliance/zatca/settings/{branchId}`:

- `vatRegistrationNumber` — **15 digits, must start and end with `3`** (validated client-side as a
  placeholder pattern, not currently a hard server validation on this endpoint — see §7).
- `sellerName` — legal name as registered with ZATCA (falls back to branch name if blank).
- `streetName`, `buildingNumber`, `citySubdivisionName`, `postalZone`.
- Branch's own `commercialRegistration` and `city` — edited on the **Branches** page, not here
  (shown read-only on this page).
- Mart-wide `CompanyProfile` (legal name / CR / VAT for the printed receipt) — edited via `PUT
  /api/compliance/company-profile`, server-validates CR (10 digits) and VAT (15 digits,
  start/end `3`) via `ContactValidation.IsValidSaudiCr/IsValidSaudiVat`.
- `environment` (`sandbox` | `simulation` | `production`) — shared across all branches, saved on
  the same request as the address fields (see `ZatcaSettingsUpdateRequest`).

### Step 1 — Generate CSR

```
POST /api/compliance/zatca/onboarding/{branchId}/csr
→ { csr: string, egsSerial: string }
```

- Frontend: "1. Generate CSR" button → `api.generateZatcaCsr(branchId)`.
- Backend: `ZatcaService.GenerateCsrAsync` builds a `ZatcaCsrConfig` from the branch +
  `ZatcaSettings` (VAT registration number → CSR's Organization Identifier — **not** the CR
  number, a different field) and calls `ZatcaCsrService.GenerateCsr` (BouncyCastle, secp256k1 EC
  key + a CSR with a ZATCA-specific `directoryName` SAN — .NET's own `CertificateRequest` API
  cannot express this SAN shape, hence BouncyCastle).
- Result: `identity.Csr`, `identity.PrivateKey` (encrypted via `IDataProtector`, see §7), 
  `identity.EgsSerial` saved; `OnboardingStatus` → `csr_generated`.
- The UI then shows the CSR text in a read-only textarea with the instruction: **paste it into
  the ZATCA Fatoora portal** to get an OTP. This next part happens *outside this app* — a human
  logs into ZATCA's Fatoora developer/production portal with the mart's real account and pastes
  the CSR to receive a one-time OTP code. There is no API for this step; it cannot be automated.

### Step 2 — Compliance CSID (needs the OTP from step 1's manual step)

```
POST /api/compliance/zatca/onboarding/{branchId}/compliance-csid
Body: { otp: string }
→ { success: bool, requestId?: string } | { success: false, error: string }
```

- Frontend: "2. Compliance CSID" card, OTP input + button → `api.getZatcaComplianceCsid(branchId, otp)`.
- Backend: `ZatcaService.GetComplianceCsidAsync` calls ZATCA's
  `POST {gateway}/{env}/compliance` with the stored CSR + the `Otp` header, via
  `IZatcaApiClient.GetComplianceCsidAsync`.
- ZATCA returns `binarySecurityToken` + `secret` — these ARE the compliance CSID credentials
  (Basic Auth username/password for every subsequent compliance-test/production call). Saved as
  `identity.CcsidBinarySecurityToken` (plaintext — it's already opaque) and
  `identity.CcsidSecret` (encrypted). `OnboardingStatus` → `compliance_csid_obtained`.

### Step 3 — Compliance tests + Production CSID (one combined action)

```
POST /api/compliance/zatca/onboarding/{branchId}/production-csid
→ { success, requestId, error, complianceTests: [{ documentType, passed, apiStatus }] }
```

- Frontend: "3. Go to Production" button → `api.getZatcaProductionCsid(branchId)`. Note this
  ignores `branchId` server-side — it operates on the one shared `ZatcaIdentity`.
- Backend: `ZatcaService.RunOnboardingToProductionAsync` runs **6 fixed document types** ZATCA
  requires for compliance testing, in this exact order:

  | Prefix | Type code | Description |
  |---|---|---|
  | STDSI | 388 | Standard Invoice |
  | STDCN | 381 | Standard Credit Note |
  | STDDN | 383 | Standard Debit Note |
  | SIMSI | 388 | Simplified Invoice |
  | SIMCN | 381 | Simplified Credit Note |
  | SIMDN | 383 | Simplified Debit Note |

  For each: builds a synthetic UBL doc (`ZatcaInvoiceXmlBuilder.ModifyForComplianceTest`), signs
  it (`ZatcaInvoiceSigner.Sign`), POSTs to `{gateway}/{env}/compliance/invoices`. A doc "passes" if
  ZATCA's status contains `REPORTED`/`CLEARED`, **or** if the error explicitly says "Compliance
  check already completed" (re-running onboarding after a partial prior run is safe). The
  invoice-hash chain (`pih`) only advances on a genuine pass, not an "already compliant" replay.
  - **If any of the 6 fail, the whole step fails** and returns which ones failed — no Production
    CSID request is made.
  - If all 6 pass: `POST {gateway}/{env}/production/csids` with the compliance request ID,
    exchanging for the final `PcsidBinarySecurityToken`/`PcsidSecret`. This is a **brand new
    device credential** — the ICV/hash chain resets to 0/seed-hash (`identity.LastIcv = 0`).
  - `OnboardingStatus` → `production_ready`. **This is the flag `OrdersController` checks before
    auto-submitting any real invoice** (§4).

### Re-running onboarding

Every step is idempotent-ish by design: regenerating a CSR is allowed (`zatca.hasCsr` just shows
"Regenerate CSR" instead of "Generate CSR"), and a stuck compliance test that already succeeded on
ZATCA's side won't re-fail the whole flow. There is no "reset onboarding" endpoint — to fully
restart, you'd need to null out the relevant `ZatcaIdentity` columns directly.

---

## 3. Branch / company setup — what's editable where

| Field | Lives on | Edited via | Notes |
|---|---|---|---|
| VAT registration number, seller name, address | `ZatcaSettings` (per branch) | `_app.zatca-settings.tsx` → `PUT zatca/settings/{branchId}` | Used as the CSR's Organization Identifier and every invoice's supplier VAT |
| Commercial registration number, city | `Branch` | `_app.branches.tsx` | Shown read-only on the ZATCA settings page ("Edit on the Branches page") |
| Legal name, CR number, VAT number (company-wide) | `CompanyProfile` | `_app.settings.tsx` ("Business & Security Settings") → `PUT company-profile` | Shown on every printed receipt regardless of branch; server-validates CR/VAT format |
| Receipt logo (data URL + pre-rasterized ESC/POS bytes) | `CompanyProfile` | POS Settings' "Receipt Logo" card → `PUT company-profile/logo` | Two independent show/hide flags: staff receipt vs. customer-facing slip (keyed on `Order.Source`) |
| `Phase2Enabled`, `Environment` | `ZatcaIdentity` (shared) | Same `PUT zatca/settings/{branchId}` call, just projected onto the identity server-side | **Not per-branch** even though the endpoint is branch-scoped — flipping it from branch A's page affects every branch |

---

## 4. Invoice submission — what happens on every sale

Trigger point: `OrdersController.cs` inside the checkout/`Create` action, right after the order,
items, payments and stock are already committed. Gate:

```csharp
if (zatcaIdentity is { Phase2Enabled: true, OnboardingStatus: "production_ready" }) { ... }
```

If that's false, nothing ZATCA-related happens — no invoice row, no QR, no error. Once true:

1. A `ZatcaInvoice` row is created (`InvoiceType = "simplified"` always — POS sales are B2C, no
   buyer VAT is captured at checkout). A failure to even save this row is caught and logged —
   **a ZATCA problem must never fail an already-paid sale.**
2. `ZatcaService.SubmitInvoiceAsync(invoiceId)` runs **synchronously, inline in the checkout
   request** (not a background task) specifically so the checkout HTTP response can carry the
   real signed QR for the receipt that's about to print. This is a deliberate choice — see the
   comment at `OrdersController.cs` line ~1110.
3. Inside `SubmitInvoiceAsync`:
   - Row-locks the singleton `ZatcaIdentity` (`SELECT ... FOR UPDATE` inside a DB transaction)
     because **every branch shares one ICV/hash chain** — two branches submitting concurrently
     must not compute the same ICV or fork the tamper-evident chain.
   - `isSimplified = string.IsNullOrEmpty(invoice.BuyerVatNumber)` — decides reporting
     (simplified/B2C) vs clearance (standard/B2B) path.
   - VAT rate is **back-derived** from the order's real aggregate totals (`TaxAmount /
     taxableAmount`), not summed per-line — per-line tax/discount fields are never actually
     populated by POS checkout. Tobacco excise is folded into each line's unit price so the
     signed `LineExtensionAmount` doesn't silently drop excise money that was actually charged.
   - Builds UBL XML (`ZatcaInvoiceXmlBuilder.Build`), signs it (`ZatcaInvoiceSigner.Sign`,
     simplified invoices only — standard/clearance invoices are sent unsigned XML, ZATCA signs
     clearance itself), sends to `{gateway}/{env}/invoices/reporting/single` (simplified) or
     `.../clearance/single` (standard).
   - On success: `invoice.QrCodeValue` = the TLV QR ZATCA-compliant base64 string,
     `invoice.ZatcaStatus = "accepted"`, and the identity's ICV/hash chain advances. On rejection:
     status = `"rejected"`, an Admin notification fires, chain does **not** advance (so a retry
     reuses the same ICV/PIH — required, not a bug).
   - Result flows back to the controller: `order.ZatcaQrCode = submitted.QrCodeValue` (this is a
     `[NotMapped]` transient property on `Order` — never persisted, only exists to ride along in
     the checkout HTTP response).

**Manual submit/retry**: `POST /api/compliance/zatca/invoices/{id}/submit` — same
`SubmitInvoiceAsync`, exposed on the `/zatca` invoice-history page (`_app.zatca.tsx`) as a "Retry"
action for any invoice not yet `accepted`.

---

## 5. Receipt printing — how the QR actually reaches paper

This is the part the request specifically called out, so tracing the field end-to-end:

```
ZatcaInvoice.QrCodeValue                       (DB, set by SubmitInvoiceAsync)
   → order.ZatcaQrCode                          (Order, [NotMapped], set only in the checkout response)
      → checkout API response JSON `zatcaQrCode`
         → ReceiptData.zatcaQrCode  /  PrintReceiptRequest.ZatcaQrCode
            → embedded verbatim into the ESC/POS QR command bytes
```

There are **three independent places** this same pattern is implemented, all with the identical
fallback rule — *"use the real ZATCA-signed QR if we have one, otherwise build a local Phase-1-style
5-tag QR from raw order totals"*:

| Path | File | Used when |
|---|---|---|
| Browser-side ESC/POS builder | `src/lib/escpos.ts` (`buildEscPos`) | POS terminal prints via a local USB/browser print agent |
| Server-side ESC/POS builder | `api/Controllers/PrinterController.cs` (`BuildEscPos`, `POST /api/printer/print-receipt`) | Windows network printing (`WindowsPrinting.PrintRaw`) — mirrors `escpos.ts` byte-for-byte, must be kept in sync manually if either changes |
| Self-checkout kiosk | `self-checkout/src/lib/escpos.ts` + `self-checkout/src/components/InvoiceDialog.tsx` | Kiosk checkout flow, separate Vite app |

The **fallback QR** (Phase 1 style) is built locally, client-side, with only 5 TLV tags (seller
name, VAT number, ISO timestamp, total, VAT amount) — no signature, no certificate, no invoice
hash. It exists so a receipt is never QR-less for a tenant that hasn't finished onboarding, but it
is **not** a ZATCA Phase 2 compliant QR by itself (it's what Phase 1 required). Once
`OnboardingStatus == production_ready`, every checkout supplies the real 9-tag signed QR and the
fallback path is never hit for POS-originated orders.

The **on-screen invoice dialog** (`src/routes/_app.pos.tsx`'s invoice `Dialog`, and the
self-checkout `InvoiceDialog.tsx`) uses the exact same `invoice.zatcaQrCode ?? buildZatcaTlv(...)`
fallback — it just doesn't render a scannable QR bitmap on screen (only the raw TLV string), the
QR *image* only actually gets rendered at print time via the ESC/POS `GS ( k` QR command.

**If you're asked to "make sure the receipt shows the ZATCA QR"**: the fix is almost never in
`escpos.ts` — it's in whether checkout's response actually contains a `zatcaQrCode` value, which
means checking `OnboardingStatus` and whether `SubmitInvoiceAsync` actually succeeded for that
order (check `ZatcaInvoice.ZatcaStatus` for the order, and `ZatcaResponse` for ZATCA's raw reason
if `rejected`).

---

## 6. Full API reference

Base route for all of these: `/api/compliance/...` (`ComplianceController`), except printing which
is `/api/printer/...` (`PrinterController`).

| Method & Route | Gate | Purpose | Called from |
|---|---|---|---|
| `GET zatca/invoices?branchId&status` | `Compliance:View` + plan `zatca_compliance` | List invoices (paginated 200, newest first) | `_app.zatca.tsx` |
| `GET zatca/invoices/{id}` | `Compliance:View` + plan | Single invoice | — |
| `POST zatca/invoices` | `Compliance:Create` + plan | Manually create an invoice row | — (checkout creates these itself; not used by any current UI) |
| `PATCH zatca/invoices/{id}/status` | `Compliance:Edit` + plan | Force-set status/response | — |
| `POST zatca/invoices/{id}/submit` | `Compliance:Edit` + plan | (Re)submit to ZATCA | `_app.zatca.tsx` "Retry" |
| `GET zatca/settings/{branchId}` | **none** (branch-scoped to caller) | Read merged `ZatcaSettings` + `ZatcaIdentity` (secrets excluded) | `_app.zatca-settings.tsx`; also anything printing a receipt that needs VAT number |
| `PUT zatca/settings/{branchId}` | `Compliance:Edit` (no plan gate) | Save address/seller fields + shared `Phase2Enabled`/`Environment` | `_app.zatca-settings.tsx` "Save company info" / "Save address" / the enable switch |
| `POST zatca/onboarding/{branchId}/csr` | `Compliance:Edit` + plan | Step 1 | `_app.zatca-settings.tsx` "Generate CSR" |
| `POST zatca/onboarding/{branchId}/compliance-csid` | `Compliance:Edit` + plan | Step 2 (needs OTP) | `_app.zatca-settings.tsx` "Get Compliance CSID" |
| `POST zatca/onboarding/{branchId}/production-csid` | `Compliance:Edit` + plan | Step 3 | `_app.zatca-settings.tsx` "Run Compliance Tests & Get Production CSID" |
| `GET company-profile` | **none** | Legal name/CR/VAT + logo | POS checkout, report exports, receipt printing |
| `PUT company-profile` | `Compliance:Edit` + plan | Update legal identity (validates CR/VAT format) | `_app.settings.tsx` ("Business & Security Settings") |
| `PUT company-profile/logo` | `Settings:Edit` | Update receipt logo + show/hide flags | POS Settings "Receipt Logo" card |
| `POST /api/printer/print-receipt` | (none listed — internal print agent call) | Builds ESC/POS bytes server-side and sends to a Windows printer | Local print agent / QZ Tray path |

`branchId` in the onboarding routes is accepted but only actually used by `GenerateCsrAsync`
(which needs the branch's name/settings for the CSR fields) — the other two onboarding steps and
all submission logic operate on the single shared `ZatcaIdentity` regardless of which branch's
page you clicked the button from.

---

## 7. Landmines — do not "fix" these without a live round-trip test

ZATCA's real gateway is the only reliable oracle here; several of these look structurally wrong
under normal code review but are byte-for-byte required. **If you change any of the following,
verify against ZATCA's actual sandbox response (or the proven-working PHP reference), not just by
reading the spec.**

1. **CSR SAN "SN" field must use OID `2.5.4.4` (surname), not `2.5.4.5` (serialNumber)** —
   `ZatcaCsrService.SnOid`. ZATCA's own `openssl.cnf` uses the short name `SN`, which OpenSSL
   resolves to *surname*, not *serialNumber*, despite the confusing abbreviation. Using the
   "correct-looking" `X509Name.SerialNumber` (2.5.4.5) produces a CSR that is structurally
   identical and passes every local check, but is silently rejected by ZATCA's live sandbox with a
   bare `400 "Invalid Request"` — no field-level detail. Cost a full debugging session; only found
   via a byte-level diff against a PHP-accepted CSR.
2. **`binarySecurityToken` is double base64-encoded.** The raw value from ZATCA's CSID APIs is
   correct as-is for HTTP Basic Auth, but `ZatcaInvoiceSigner` needs it decoded once first
   (`ZatcaService.DecodeCertificateContent`) to get the certificate's actual PEM body text.
3. **The XAdES `CertDigest` and QR tags 6/7 hash the BASE64 TEXT bytes of the cert/hash/signature,
   not the decoded binary.** This is genuinely how ZATCA's spec works (verified against the PHP
   reference), not a bug to "correct" toward standard XAdES behavior.
4. **EC domain parameters must be `ECNamedDomainParameters`, not plain `ECDomainParameters`** —
   otherwise the public key gets encoded with explicit curve parameters instead of the expected
   named-curve OID, and ZATCA's parser chokes on it.
5. **`domainComponent` in the issuer name is OID `0.9.2342.19200300.100.1.25`, not `...100.1.1`**
   (that one is `uid`) — see `ZatcaInvoiceSigner.ParseIssuerNameAndSerial`.
6. **Secrets are encrypted at rest via `IDataProtector`** (`CreateProtector("BaqalaPOS.Zatca.Secrets.v1")`)
   — `PrivateKey`, `CcsidSecret`, `PcsidSecret` are all `_protector.Protect(...)`'d before saving.
   Keys are persisted to the DB (`AddDataProtection().PersistKeysToDbContext<BaqalaDbContext>()` in
   `Program.cs`), **not** to local disk — so they survive app restarts as long as the DB does. **If
   the DataProtection keys table is ever dropped/recreated** (it has been once —
   `20260804104938_RecreateDataProtectionKeysTable`), every previously-encrypted secret becomes
   permanently unreadable, and the only fix is a full re-onboarding from CSR generation. Don't
   treat that migration as routine.
7. **The OTP step is a real human using the mart's real Fatoora account** — there is no API to
   fetch or automate it. Any task that says "get an OTP" or "complete onboarding end to end" needs
   a human in the loop at step 1→2; you cannot fully automate past that boundary in a test/dev run.
8. **The ICV/PIH hash chain is shared and must never fork.** `SubmitInvoiceAsync` holds a
   `SELECT ... FOR UPDATE` row lock across the *entire* external ZATCA HTTP call. If
   `EnableRetryOnFailure()` is ever added to the EF `DbContext` options, this transaction must move
   inside `db.Database.CreateExecutionStrategy().ExecuteAsync(...)` — the comment in
   `ZatcaService.SubmitInvoiceAsync` flags this explicitly.
9. **Standard (B2B/clearance) invoices are sent unsigned** — only simplified (B2C/reporting)
   invoices go through `SignSimplifiedInvoice`'s XAdES+QR path (`ZatcaInvoiceSigner.Sign` early-
   returns for non-simplified). Don't "fix" clearance invoices to also carry a QR/signature; that's
   correct per ZATCA's model (ZATCA itself signs clearance on their end).
10. **CSR's `certificateTemplateName`** uses `TSTZATCA-Code-Signing` /
    `PREZATCA-Code-Signing` / `ZATCA-Code-Signing` depending on environment — an earlier attempt to
    match ZATCA's own Swagger example (a different, unprefixed format) was chasing a red herring;
    that example is a static canned response, not a real validation path. Don't re-attempt that
    "fix" without a live test proving it's actually needed.

---

## 8. Where to look when something breaks

| Symptom | Look here first |
|---|---|
| CSR request rejected with generic "Invalid Request" | `ZatcaCsrService` — compare every OID byte-for-byte against a known-good CSR; see landmine #1 |
| OTP → Compliance CSID fails | `ZatcaApiClient.GetComplianceCsidAsync` request/response logged via `logger.LogWarning` on the service; check the raw ZATCA body, not just success/fail |
| Compliance tests fail at step 3 | `RunOnboardingToProductionAsync`'s `outcomes` list — each entry has the real `apiStatus` string from ZATCA per document type |
| Onboarding stuck at `compliance_csid_obtained` forever | Something failing inside the 6-document loop — check `ComplianceChecksAsync` responses, and whether `pih` advanced correctly between iterations |
| Real invoice rejected at checkout | `ZatcaInvoice.ZatcaResponse` for that order — ZATCA's literal rejection reason is stored there raw |
| Receipt has no QR / wrong QR | Check `ZatcaIdentity.OnboardingStatus` and that order's `ZatcaInvoice.ZatcaStatus` first — the print layer (`escpos.ts`/`PrinterController`) is almost never the actual bug, see §5 |
| "Could not reach ZATCA's servers" errors | `ZatcaApiClient.SendWithRetryAsync` — 3 retries w/ exponential backoff already built in; a persistent failure here is a real network/egress problem from wherever the API is hosted, not an app bug |
| Secrets suddenly all invalid / decrypt errors | Check `DataProtectionKeys` table — see landmine #6 |

---

## 9. Related but separate — don't conflate these

- **`_app.compliance.tsx`** ("Compliance" nav page) is **not** ZATCA onboarding — it's VAT/tobacco-
  excise tax rule management (`TaxFeeRule`, `PosSettings` toggles). Different page, different
  purpose, despite the shared "Compliance" name/module.
- **`_app.reports.vat-zatca.tsx`** is a read-only VAT/ZATCA reconciliation report
  (`GET /api/reports/vat-zatca`) — it reads already-submitted `ZatcaInvoice` rows, it doesn't
  submit anything.
- **Admin → Payments** integrations directory (`_app.payments.tsx`, unrelated new feature) lists
  ZATCA as one card among many third-party integrations for visibility/status purposes — that card
  is a lightweight enable/disable toggle with its own `payment_integrations` table, **completely
  separate** from the real onboarding flow described in this document. Don't wire that card's
  "Enable" button to attempt real onboarding; direct users to `_app.zatca-settings.tsx` instead.
