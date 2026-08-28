// Admin → Payments catalog: every 3rd-party integration this product tracks (MI_ECR_3rd_Party
// Integration_Tracker sheet, Master tab, rows 5-20 — 16 providers across payments, delivery,
// loyalty, e-invoicing, accounting/ERP, KYB/identity, communications and CRM). Mirrors the
// backend provider list (api/Controllers/PaymentIntegrationsController.cs KnownProviders). Field
// lists reflect what each provider actually needs to go live — POS-acceptance providers need
// merchant/terminal IDs, SMTP needs host/port/TLS, identity providers need client id/secret —
// not a generic one-size-fits-all form.
//
// Logos are each provider's real brand asset (downloaded from their own official site/CDN —
// NearPay/MyFatoorah/Nami favicons, Odoo's brand-assets page, ZATCA's og:image emblem, Wafeq's
// site banner, Wathq's and Nafath's own site/app-store icons, Bevatel's favicon). SMS Gateway and
// Email Gateway have no single named vendor yet (tracker notes list them as "Unifonic or
// equivalent" / internal SMTP), so those two fall back to a generic icon instead of a logo.
import nearpayLogo from "@/assets/payment-logos/nearpay.png";
import namiLogo from "@/assets/payment-logos/nami.png";
import myFatoorahLogo from "@/assets/payment-logos/myfatoorah.png";
import zatcaLogo from "@/assets/payment-logos/zatca.png";
import odooLogo from "@/assets/payment-logos/odoo.svg";
import wafeqLogo from "@/assets/payment-logos/wafeq.png";
import wathqLogo from "@/assets/payment-logos/wathq.svg";
import nafathLogo from "@/assets/payment-logos/nafath.png";
import bevatelLogo from "@/assets/payment-logos/bevatel.png";

export type PaymentFieldType = "text" | "password" | "select";

export interface PaymentField {
  key: string;
  label: string;
  type: PaymentFieldType;
  required?: boolean;
  placeholder?: string;
  helperText?: string;
  options?: { value: string; label: string }[];
  default?: string;
}

export interface PaymentProviderDef {
  key: string;
  name: string;
  category: string;
  priority: "Mandatory" | "Recommended";
  description: string;
  colorClass: string;
  initials: string;
  /** Real brand logo asset — when absent, the card falls back to a colored initials tile. */
  logo?: string;
  fields: PaymentField[];
  /** Extra context shown at the top of the setup form — used when full onboarding lives on a dedicated settings page elsewhere in the app. */
  setupNote?: string;
  /** Text under the "Enable" switch. Defaults to the generic credentials wording, which reads wrong for a provider with no credential fields here. */
  enableDescription?: string;
  /** Shows a "Test connection" button in the setup form. Only for providers with a real rail behind them — the backend's test endpoint must support the provider (PaymentIntegrationsController.TestConnection). */
  supportsTest?: boolean;
}

const ENV_SANDBOX_PRODUCTION = {
  key: "environment",
  label: "Environment",
  type: "select" as const,
  required: true,
  default: "sandbox",
  options: [
    { value: "sandbox", label: "Sandbox" },
    { value: "production", label: "Production" },
  ],
};

export const PAYMENT_PROVIDERS: PaymentProviderDef[] = [
  {
    key: "NearPay",
    name: "NearPay",
    category: "POS Payment Acceptance",
    priority: "Mandatory",
    description:
      "Soft POS on Android — accept Mada and card payments via NFC, no extra hardware required.",
    colorClass: "bg-blue-500/15 text-blue-600",
    initials: "NP",
    logo: nearpayLogo,
    fields: [
      {
        key: "merchantId",
        label: "Merchant ID",
        type: "text",
        required: true,
        placeholder: "e.g. 100234567",
      },
      {
        key: "terminalId",
        label: "Terminal ID",
        type: "text",
        required: true,
        placeholder: "e.g. TID-00123",
      },
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        helperText: "Issued by NearPay once your merchant account is approved",
      },
      ENV_SANDBOX_PRODUCTION,
    ],
  },
  {
    key: "Nami",
    name: "Nami",
    category: "POS Payment Acceptance",
    priority: "Recommended",
    description:
      "Traditional hard POS terminal — self-service pairing for card acceptance at the counter.",
    colorClass: "bg-amber-500/15 text-amber-600",
    initials: "N",
    logo: namiLogo,
    // Card payments reach Nami through the finova middleware's Nami service
    // (api/Services/NamiPayServiceClient.cs). Unlike MyFatoorah there are no per-branch
    // credentials to collect: the merchant account, API secret and Sandbox/Production choice all
    // live server-side in that middleware's own DB. The one thing the checkout flow reads from
    // this form is WHICH terminal the amount is pushed to — PosCardPaymentService's
    // ResolveNamiTerminalIdAsync reads exactly the "terminalId" key below; rename them together.
    fields: [
      {
        key: "terminalId",
        label: "Terminal ID",
        type: "text",
        required: true,
        placeholder: "e.g. 8184000200000077",
        helperText:
          "The TID Nami assigns when this branch's terminal is provisioned — card amounts are pushed to this device.",
      },
    ],
    setupNote:
      "Nami merchant credentials and the Sandbox/Production environment are configured once on the payment middleware server, not per branch — " +
      "the only setting needed here is which terminal (TID) this branch's card payments go to.",
    enableDescription:
      "Turn this on once the Terminal ID below is correct — the POS card tender pushes amounts to this device only while enabled.",
    supportsTest: true,
  },
  {
    key: "MyFatoorah",
    name: "MyFatoorah",
    category: "Payment Gateway",
    priority: "Mandatory",
    description:
      "Online card payment (Apple Pay, Google Pay, mada, Visa/Mastercard) on this branch's public ordering page.",
    colorClass: "bg-emerald-500/15 text-emerald-600",
    initials: "MF",
    logo: myFatoorahLogo,
    // Checkout doesn't call MyFatoorah directly — it goes through the finova middleware's
    // MyFatoorah service (api/Services/MyFatoorahServiceClient.cs), forwarding THIS branch's own
    // API token + environment on every call, so each store can use its own MyFatoorah account.
    // The keys below (apiKey / environment) are exactly what MyFatoorahMerchantAccount reads
    // out of the saved ConfigJson — rename them together.
    fields: [
      {
        key: "apiKey",
        label: "API Token",
        type: "password",
        required: true,
        helperText: "MyFatoorah portal → Integration Settings → API Key. Use the Test token while trying it out.",
      },
      {
        ...ENV_SANDBOX_PRODUCTION,
        default: "test",
        helperText: "Test = MyFatoorah sandbox (apitest.myfatoorah.com). Live = your real KSA account (api-sa.myfatoorah.com) — money moves.",
        options: [
          { value: "test", label: "Test" },
          { value: "live", label: "Live" },
        ],
      },
    ],
    setupNote:
      "Used by the branch's public online ordering page: shoppers get a “Pay Online” option (card / Apple Pay / Google Pay / mada) next to Cash on Delivery. " +
      "Online ordering itself must also be switched on in POS Settings → Online Ordering.",
    enableDescription:
      "Turn this on once the API token below is correct — the ordering page only offers “Pay Online” while enabled.",
    supportsTest: true,
  },
  {
    key: "ZATCA",
    name: "ZATCA",
    category: "E-Invoicing",
    priority: "Mandatory",
    description:
      "Zakat, Tax and Customs Authority — KSA e-invoicing (Phase 1 + Phase 2 / FATOORA).",
    colorClass: "bg-teal-500/15 text-teal-600",
    initials: "ZT",
    logo: zatcaLogo,
    setupNote:
      "Full onboarding (CSR generation, OTP, CSID) is handled on the dedicated ZATCA Phase 2 Settings page — this just tracks connection status for the directory.",
    fields: [
      {
        key: "vatNumber",
        label: "VAT Registration Number",
        type: "text",
        required: true,
        placeholder: "3xxxxxxxxxxxxxx03",
      },
      { ...ENV_SANDBOX_PRODUCTION, default: "sandbox" },
    ],
  },
  {
    key: "Odoo",
    name: "Odoo",
    category: "Accounting / ERP",
    priority: "Mandatory",
    description: "Accounting / ERP sync — invoices, journals and taxes with your Odoo instance.",
    colorClass: "bg-purple-500/15 text-purple-600",
    initials: "OD",
    logo: odooLogo,
    fields: [
      {
        key: "odooUrl",
        label: "Odoo URL",
        type: "text",
        required: true,
        placeholder: "https://your-instance.odoo.com",
      },
      {
        key: "databaseName",
        label: "Database Name",
        type: "text",
        required: true,
        placeholder: "your-database",
      },
      {
        key: "authMethod",
        label: "Authentication Method",
        type: "select",
        required: true,
        default: "password",
        options: [
          { value: "password", label: "Password" },
          { value: "api_key", label: "API Key" },
        ],
      },
      {
        key: "username",
        label: "Username",
        type: "text",
        required: true,
        helperText: "Your Odoo username (email)",
      },
      {
        key: "password",
        label: "Password",
        type: "password",
        required: true,
        helperText: "Your Odoo password (required for both authentication methods)",
      },
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: false,
        helperText: "Only required when Authentication Method is API Key",
      },
    ],
  },
  {
    key: "Wafeq",
    name: "Wafeq",
    category: "Accounting / ERP",
    priority: "Mandatory",
    description: "Saudi-native, ZATCA-ready cloud accounting system.",
    colorClass: "bg-purple-500/15 text-purple-600",
    initials: "WQ",
    logo: wafeqLogo,
    fields: [
      { key: "organizationId", label: "Organization ID", type: "text", required: true },
      { key: "apiKey", label: "API Key", type: "password", required: true },
      {
        ...ENV_SANDBOX_PRODUCTION,
        default: "test",
        options: [
          { value: "test", label: "Test" },
          { value: "live", label: "Live" },
        ],
      },
    ],
  },
  {
    key: "Wathiq",
    name: "Wathiq",
    category: "Onboarding / KYB",
    priority: "Mandatory",
    description: "Ministry of Commerce commercial registration verification (KYB).",
    colorClass: "bg-cyan-500/15 text-cyan-600",
    initials: "WT",
    logo: wathqLogo,
    fields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", required: true },
      ENV_SANDBOX_PRODUCTION,
    ],
  },
  {
    key: "Nafath",
    name: "Nafath",
    category: "Onboarding / Identity",
    priority: "Mandatory",
    description: "National single sign-on identity verification.",
    colorClass: "bg-green-500/15 text-green-600",
    initials: "NF",
    logo: nafathLogo,
    fields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", required: true },
      {
        key: "redirectUri",
        label: "Redirect URI",
        type: "text",
        required: true,
        placeholder: "https://yourapp.com/auth/nafath/callback",
      },
      ENV_SANDBOX_PRODUCTION,
    ],
  },
  {
    key: "SmsGateway",
    name: "SMS Gateway",
    category: "Communications",
    priority: "Mandatory",
    description: "OTP + transactional SMS delivery (Unifonic or equivalent).",
    colorClass: "bg-red-500/15 text-red-600",
    initials: "SG",
    fields: [
      { key: "apiUsername", label: "API Username", type: "text", required: true },
      { key: "apiToken", label: "API Token", type: "password", required: true },
      {
        key: "senderId",
        label: "Sender ID",
        type: "text",
        required: true,
        placeholder: "e.g. MIMONY",
      },
    ],
  },
  {
    key: "EmailGateway",
    name: "Email Gateway",
    category: "Communications",
    priority: "Mandatory",
    description: "Internal SMTP system for transactional email — receipts, invites, alerts.",
    colorClass: "bg-red-500/15 text-red-600",
    initials: "EG",
    fields: [
      {
        key: "smtpHost",
        label: "SMTP Host",
        type: "text",
        required: true,
        placeholder: "smtp.yourdomain.com",
      },
      { key: "smtpPort", label: "SMTP Port", type: "text", required: true, placeholder: "587" },
      {
        key: "encryption",
        label: "Encryption",
        type: "select",
        required: true,
        default: "tls",
        options: [
          { value: "none", label: "None" },
          { value: "ssl", label: "SSL" },
          { value: "tls", label: "TLS" },
        ],
      },
      { key: "username", label: "Username", type: "text", required: true },
      { key: "password", label: "Password", type: "password", required: true },
      {
        key: "fromEmail",
        label: "From Email",
        type: "text",
        required: true,
        placeholder: "no-reply@yourdomain.com",
      },
    ],
  },
  {
    key: "CrmBevatel",
    name: "CRM + Bevatel",
    category: "Customer Support / CRM",
    priority: "Recommended",
    description: "CRM + call-centre platform for tenant and merchant support.",
    colorClass: "bg-yellow-500/15 text-yellow-700",
    initials: "CB",
    logo: bevatelLogo,
    fields: [
      { key: "accountId", label: "Account ID", type: "text", required: true },
      { key: "apiKey", label: "API Key", type: "password", required: true },
      ENV_SANDBOX_PRODUCTION,
    ],
  },
];
