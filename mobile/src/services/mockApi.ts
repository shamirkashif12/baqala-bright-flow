import type { AuditLog, Branch, Order, Product, Terminal, User } from "@/types";

export const mockUsers: User[] = [
  { id: "U1", name: "Ayesha Nadeem", email: "ayesha@mart.sa", role: "Admin" },
  { id: "U2", name: "Ahmed Al Harbi", email: "ahmed@mart.sa", role: "Manager" },
  { id: "U3", name: "Sara Khan", email: "sara@mart.sa", role: "Cashier" },
  { id: "U4", name: "Omar Al Qahtani", email: "omar@mart.sa", role: "Cashier" },
  { id: "U5", name: "Yousef Inv.", email: "yousef@mart.sa", role: "Inventory Staff" },
];

export const mockBranches: Branch[] = [
  { id: "B1", name: "Riyadh Central Bakala", city: "Riyadh", code: "RYD-01" },
  { id: "B2", name: "Jeddah Mart 02", city: "Jeddah", code: "JED-02" },
  { id: "B3", name: "Dammam Express Bakala", city: "Dammam", code: "DMM-03" },
  { id: "B4", name: "Makkah Neighborhood Mart", city: "Makkah", code: "MKK-04" },
];

export const mockTerminals: Terminal[] = [
  { id: "TML-RYD-001", branchId: "B1", branchName: "Riyadh Central", type: "POS", status: "Active", employee: "Sara Khan", lastSync: "2m ago", sessionDuration: "3h 12m", openingCash: 500, ordersProcessed: 42, totalSales: 3210.5 },
  { id: "TML-RYD-002", branchId: "B1", branchName: "Riyadh Central", type: "POS", status: "Syncing", employee: "Omar A.", lastSync: "now", sessionDuration: "1h 04m", openingCash: 300, ordersProcessed: 18, totalSales: 1240 },
  { id: "MPOS-JED-001", branchId: "B2", branchName: "Jeddah Mart 02", type: "MPOS", status: "Active", employee: "Ahmed H.", lastSync: "1m ago", sessionDuration: "2h 30m", openingCash: 200, ordersProcessed: 12, totalSales: 880 },
  { id: "MPOS-DMM-003", branchId: "B3", branchName: "Dammam Express", type: "MPOS", status: "Offline", lastSync: "32m ago" },
  { id: "TML-MKK-001", branchId: "B4", branchName: "Makkah Mart", type: "POS", status: "Idle", employee: "—", lastSync: "8m ago" },
];

const today = new Date();
const addDays = (n: number) => new Date(today.getTime() + n * 86400000).toISOString();

export const mockProducts: Product[] = [
  { id: "P1", name: "Almarai Milk 1L", sku: "ALM-MLK-1L", barcode: "6281007012340", category: "Dairy", price: 7.5, stock: 48, expiryDate: addDays(5), daysLeft: 5, expiryStatus: "Close", permissibleStatus: "Allowed", supplier: "Almarai Co.", branch: "Riyadh Central", batchNumber: "BCH-1024", purchasePrice: 5.2 },
  { id: "P2", name: "Pepsi 330ml", sku: "PEP-330", barcode: "6223000110015", category: "Beverages", price: 2.5, stock: 120, expiryDate: addDays(180), daysLeft: 180, expiryStatus: "Fresh", permissibleStatus: "Allowed" },
  { id: "P3", name: "Marlboro Red", sku: "MRB-RED", barcode: "5901234567890", category: "Tobacco", price: 28, stock: 30, expiryDate: addDays(365), daysLeft: 365, expiryStatus: "Fresh", permissibleStatus: "Restricted" },
  { id: "P4", name: "Lays Classic 50g", sku: "LAYS-CLS", barcode: "6281063123451", category: "Snacks", price: 3, stock: 9, expiryDate: addDays(60), daysLeft: 60, expiryStatus: "Fresh", permissibleStatus: "Allowed" },
  { id: "P5", name: "Nadec Juice 1L", sku: "NDC-JC-1L", barcode: "6281007088884", category: "Beverages", price: 8, stock: 24, expiryDate: addDays(2), daysLeft: 2, expiryStatus: "Close", permissibleStatus: "Allowed" },
  { id: "P6", name: "Water Bottle 500ml", sku: "WTR-500", barcode: "6281100000123", category: "Beverages", price: 1, stock: 300, expiryDate: addDays(400), daysLeft: 400, expiryStatus: "Fresh", permissibleStatus: "Allowed" },
  { id: "P7", name: "Bread Pack", sku: "BRD-PK", barcode: "6281019999991", category: "Bakery", price: 5, stock: 4, expiryDate: addDays(-1), daysLeft: -1, expiryStatus: "Expired", permissibleStatus: "Allowed" },
  { id: "P8", name: "Dettol Handwash 200ml", sku: "DTL-HW", barcode: "5000158101234", category: "Household", price: 12, stock: 18, expiryDate: addDays(540), daysLeft: 540, expiryStatus: "Fresh", permissibleStatus: "Allowed" },
];

export const mockOrders: Order[] = [
  { id: "ORD-10241", invoiceNo: "INV-20260612-001", customer: "Khalid A.", items: [], subtotal: 215, tax: 32.25, discount: 0, total: 247.25, status: "completed", paymentMethod: "Card", paymentStatus: "paid", cashier: "Sara Khan", branch: "Riyadh Central", terminalId: "TML-RYD-001", createdAt: addDays(0) },
  { id: "ORD-10240", invoiceNo: "INV-20260612-002", customer: "Walk-in", items: [], subtotal: 64, tax: 9.6, discount: 0, total: 73.6, status: "pending", paymentMethod: "Cash", paymentStatus: "unpaid", cashier: "Omar A.", branch: "Riyadh Central", terminalId: "TML-RYD-002", createdAt: addDays(0) },
  { id: "ORD-10239", invoiceNo: "INV-20260611-014", customer: "Sara G.", items: [], subtotal: 420, tax: 63, discount: 10, total: 473, status: "completed", paymentMethod: "Wallet", paymentStatus: "paid", cashier: "Sara Khan", branch: "Jeddah Mart 02", terminalId: "MPOS-JED-001", createdAt: addDays(-1) },
  { id: "ORD-10238", invoiceNo: "INV-20260611-013", customer: "Nora H.", items: [], subtotal: 88, tax: 13.2, discount: 0, total: 101.2, status: "refunded", paymentMethod: "Card", paymentStatus: "refunded", cashier: "Omar A.", branch: "Dammam", terminalId: "MPOS-DMM-003", createdAt: addDays(-1) },
];

export const mockAuditLogs: AuditLog[] = [
  { id: "L1", action: "Login", user: "Sara Khan", role: "Cashier", branch: "Riyadh Central", terminalId: "TML-RYD-001", timestamp: addDays(0), status: "success" },
  { id: "L2", action: "Opening Cash Submitted", user: "Sara Khan", role: "Cashier", branch: "Riyadh Central", terminalId: "TML-RYD-001", timestamp: addDays(0), status: "success" },
  { id: "L3", action: "Order Created (ORD-10241)", user: "Sara Khan", role: "Cashier", branch: "Riyadh Central", terminalId: "TML-RYD-001", timestamp: addDays(0), status: "success" },
  { id: "L4", action: "Payment Completed", user: "Sara Khan", role: "Cashier", branch: "Riyadh Central", terminalId: "TML-RYD-001", timestamp: addDays(0), status: "success" },
  { id: "L5", action: "Stock Updated (Lays Classic)", user: "Yousef I.", role: "Inventory Staff", branch: "Riyadh Central", terminalId: "—", timestamp: addDays(0), status: "warning" },
  { id: "L6", action: "Closing Submitted", user: "Omar A.", role: "Cashier", branch: "Riyadh Central", terminalId: "TML-RYD-002", timestamp: addDays(-1), status: "success" },
];

// Simulated API surface — swap with fetch() later.
export const api = {
  login: async (email: string) => new Promise<User>((res, rej) => {
    setTimeout(() => {
      const u = mockUsers.find(x => x.email.toLowerCase() === email.toLowerCase()) ?? mockUsers[2];
      u ? res(u) : rej(new Error("Invalid credentials"));
    }, 300);
  }),
  branches: async () => mockBranches,
  terminals: async () => mockTerminals,
  products: async () => mockProducts,
  orders: async () => mockOrders,
  auditLogs: async () => mockAuditLogs,
};