import { HubConnectionBuilder, LogLevel, type HubConnection } from "@microsoft/signalr";
import { BASE } from "@/lib/api";

// Wire contract for the POS Customer Display second-screen feature. The cashier's checkout
// screen is the only thing that ever computes these values — CustomerDisplayHub is a dumb relay,
// so this shape must stay in sync by hand with the C# hub's JSON (camelCase) payload, not by any
// shared codegen.
export type CustomerDisplayStatus = "Idle" | "Building" | "Processing" | "Approved";

export type CustomerDisplayLine = {
  name: string;
  qty: number;
  uom: string;
  unitPrice: number;
  lineTotal: number;
};

export type CustomerDisplayAmountLine = { label: string; amount: number };

export type CustomerDisplaySnapshot = {
  status: CustomerDisplayStatus;
  lines: CustomerDisplayLine[];
  subtotal: number;
  discounts: CustomerDisplayAmountLine[];
  fees: CustomerDisplayAmountLine[];
  vat: number;
  total: number;
  customerName: string | null;
  orderNo: string | null;
  customerLoyaltyTier?: string | null;
  customerLoyaltyPoints?: number | null;
  customerLoyaltyPointsSarValue?: number | null;
};

export function idleCustomerDisplaySnapshot(): CustomerDisplaySnapshot {
  return {
    status: "Idle",
    lines: [],
    subtotal: 0,
    discounts: [],
    fees: [],
    vat: 0,
    total: 0,
    customerName: null,
    orderNo: null,
  };
}

const HUB_PATH = "/hubs/customer-display";

// Browsers can't attach a custom Authorization header to a WebSocket handshake — accessTokenFactory
// is SignalR's own answer to that, appending the token as an "access_token" query param instead,
// which Program.cs's JwtBearerEvents.OnMessageReceived reads back out for requests under /hubs.
// Re-read from localStorage on every reconnect (not captured once at build time) so a token
// refreshed mid-session is picked up automatically.
export function createCustomerDisplayConnection(): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(`${BASE}${HUB_PATH}`, {
      accessTokenFactory: () => localStorage.getItem("baqala_token") ?? "",
    })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build();
}
