export type Role = "Admin" | "Manager" | "Cashier" | "Inventory Staff";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
}

export interface Branch {
  id: string;
  name: string;
  city: string;
  code: string;
}

export type TerminalStatus = "Active" | "Syncing" | "Offline" | "Idle";
export interface Terminal {
  id: string;
  branchId: string;
  branchName: string;
  type: "POS" | "MPOS";
  status: TerminalStatus;
  employee?: string;
  lastSync: string;
  sessionDuration?: string;
  openingCash?: number;
  ordersProcessed?: number;
  totalSales?: number;
}

export type ExpiryStatus = "Fresh" | "Close" | "Expired";
export type PermissibleStatus = "Allowed" | "Restricted";

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  price: number;
  stock: number;
  expiryDate: string;
  daysLeft: number;
  expiryStatus: ExpiryStatus;
  permissibleStatus: PermissibleStatus;
  supplier?: string;
  branch?: string;
  warehouse?: string;
  batchNumber?: string;
  purchasePrice?: number;
}

export interface CartItem {
  product: Product;
  qty: number;
  discount?: number;
}

export type OrderStatus = "pending" | "completed" | "held" | "refunded" | "cancelled";
export type PaymentMethod = "Cash" | "Card" | "Wallet" | "Split";

export interface Order {
  id: string;
  invoiceNo: string;
  customer: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
  paymentStatus: "paid" | "unpaid" | "refunded";
  cashier: string;
  branch: string;
  terminalId: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  user: string;
  role: Role;
  branch: string;
  terminalId: string;
  timestamp: string;
  status: "success" | "warning" | "error";
}

export interface OpeningCash {
  cashier: string;
  branchId: string;
  terminalId: string;
  amount: number;
  notes?: string;
  startedAt: string;
}

export interface ClosingReport {
  cashier: string;
  branchId: string;
  terminalId: string;
  shiftStart: string;
  shiftEnd: string;
  openingCash: number;
  cashSales: number;
  cardSales: number;
  walletSales: number;
  refunds: number;
  withdrawals: number;
  expectedClosing: number;
  actualClosing: number;
  difference: number;
  notes?: string;
  status: "Draft" | "Pending Review" | "Approved";
}