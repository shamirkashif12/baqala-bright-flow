export const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5008";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("baqala_token") : null;
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Branches
  getBranches: (status?: string) =>
    request<Branch[]>(`/api/branches${status ? `?status=${status}` : ""}`),
  createBranch: (data: Partial<Branch>) =>
    request<Branch>("/api/branches", { method: "POST", body: JSON.stringify(data) }),
  updateBranch: (id: string, data: Partial<Branch>) =>
    request<Branch>(`/api/branches/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  // Users
  getUsers: (params?: { branchId?: string; status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<User[]>(`/api/users${q ? `?${q}` : ""}`);
  },
  createUser: (data: CreateUserPayload) =>
    request<User>("/api/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: string, data: Partial<User>) =>
    request<User>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  // Roles
  getRoles: () => request<Role[]>("/api/roles"),
  createRole: (data: { name: string; nameAr?: string; description?: string; permissions: Omit<RolePermission, "id" | "roleId">[] }) =>
    request<Role>("/api/roles", { method: "POST", body: JSON.stringify({ ...data, isSystem: false }) }),
  updateRole: (id: string, data: { name?: string; nameAr?: string; description?: string; isSystem?: boolean; permissions: Omit<RolePermission, "id" | "roleId">[] }) =>
    request<Role>(`/api/roles/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRole: (id: string) =>
    request<{ deleted: boolean }>(`/api/roles/${id}`, { method: "DELETE" }),

  // Products
  getProducts: (params?: { categoryId?: string; status?: string; search?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<Product[]>(`/api/products${q ? `?${q}` : ""}`);
  },
  getProductByBarcode: (barcode: string) =>
    request<Product>(`/api/products/barcode/${barcode}`),
  createProduct: (data: Partial<Product>) =>
    request<Product>("/api/products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id: string, data: Partial<Product>) =>
    request<Product>(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  // Categories
  getCategories: () => request<Category[]>("/api/categories"),

  // Inventory
  getStock: (params?: { branchId?: string; lowStock?: boolean }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<InventoryStock[]>(`/api/inventory/stock${q ? `?${q}` : ""}`);
  },
  getBatches: (params?: { branchId?: string; status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<InventoryBatch[]>(`/api/inventory/batches${q ? `?${q}` : ""}`);
  },
  getExpiringBatches: (branchId?: string, daysAhead = 30) => {
    const q = new URLSearchParams({ ...(branchId && { branchId }), daysAhead: String(daysAhead) }).toString();
    return request<InventoryBatch[]>(`/api/inventory/batches/expiring?${q}`);
  },

  // Orders
  getOrders: (params?: { branchId?: string; status?: string; paymentStatus?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<Order[]>(`/api/orders${q ? `?${q}` : ""}`);
  },
  getOrder: (id: string) => request<Order>(`/api/orders/${id}`),
  createOrder: (data: Partial<Order>) =>
    request<Order>("/api/orders", { method: "POST", body: JSON.stringify(data) }),
  updateOrderStatus: (id: string, status: string) =>
    request<Order>(`/api/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),

  // Cashier Shifts
  getShifts: (params?: { branchId?: string; status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<CashierShift[]>(`/api/shifts${q ? `?${q}` : ""}`);
  },
  getActiveShifts: (branchId?: string) =>
    request<CashierShift[]>(`/api/shifts/active${branchId ? `?branchId=${branchId}` : ""}`),
  openShift: (data: OpenShiftPayload) =>
    request<CashierShift>("/api/shifts/open", { method: "POST", body: JSON.stringify(data) }),
  closeShift: (id: string, data: CloseShiftPayload) =>
    request<CashierShift>(`/api/shifts/${id}/close`, { method: "POST", body: JSON.stringify(data) }),

  // Terminals
  getTerminals: (branchId?: string) =>
    request<Terminal[]>(`/api/terminals${branchId ? `?branchId=${branchId}` : ""}`),

  // Suppliers
  getSuppliers: (params?: { status?: string; supplyType?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<Supplier[]>(`/api/suppliers${q ? `?${q}` : ""}`);
  },
  createSupplier: (data: Partial<Supplier>) =>
    request<Supplier>("/api/suppliers", { method: "POST", body: JSON.stringify(data) }),

  // Customers
  getCustomers: (params?: { tier?: string; search?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<Customer[]>(`/api/customers${q ? `?${q}` : ""}`);
  },
  getCustomerByPhone: (phone: string) =>
    request<Customer>(`/api/customers/by-phone/${encodeURIComponent(phone)}`),

  // Finance
  getExpenses: (params?: { branchId?: string; status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<Expense[]>(`/api/finance/expenses${q ? `?${q}` : ""}`);
  },
  getExpenseTypes: () => request<ExpenseType[]>("/api/finance/expense-types"),
  getCoupons: (status?: string) =>
    request<Coupon[]>(`/api/finance/coupons${status ? `?status=${status}` : ""}`),
  validateCoupon: (code: string) =>
    request<Coupon>(`/api/finance/coupons/validate/${code}`),
  getTaxRules: (branchId?: string) =>
    request<TaxFeeRule[]>(`/api/finance/tax-rules${branchId ? `?branchId=${branchId}` : ""}`),

  // Warehouse
  getWarehouseRequests: (params?: { branchId?: string; approvalStatus?: string; deliveryStatus?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<WarehouseRequest[]>(`/api/warehouse/requests${q ? `?${q}` : ""}`);
  },

  // Returns
  getReturns: (params?: { branchId?: string; status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<CustomerReturn[]>(`/api/returns${q ? `?${q}` : ""}`);
  },

  // Compliance / ZATCA
  getZatcaInvoices: (params?: { branchId?: string; status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<ZatcaInvoice[]>(`/api/compliance/zatca/invoices${q ? `?${q}` : ""}`);
  },

  // Audit Logs
  getAuditLogs: (params?: { entityType?: string; page?: number }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ total: number; items: AuditLog[] }>(`/api/auditlogs${q ? `?${q}` : ""}`);
  },

  // Attendance
  getAttendance: (params?: { branchId?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<StaffAttendance[]>(`/api/settings/attendance${q ? `?${q}` : ""}`);
  },

  // Dashboard aggregated metrics
  getDashboard: (params?: { period?: string; branchId?: string }) => {
    const q = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params ?? {}).filter(([, v]) => v !== undefined)
      ) as Record<string, string>
    ).toString();
    return request<DashboardMetrics>(`/api/dashboard${q ? `?${q}` : ""}`);
  },

  // Compliance rules
  getComplianceRules: (params?: { ruleType?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<ComplianceRule[]>(`/api/compliance/rules${q ? `?${q}` : ""}`);
  },
  createComplianceRule: (data: Partial<ComplianceRule>) =>
    request<ComplianceRule>("/api/compliance/rules", { method: "POST", body: JSON.stringify(data) }),

  // Devices
  getDevices: (params?: { branchId?: string; status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<DeviceRecord[]>(`/api/devices${q ? `?${q}` : ""}`);
  },
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Branch {
  id: string; branchCode: string; name: string; nameAr?: string;
  address?: string; city?: string; contactNumber?: string; status: string;
  createdAt: string;
}

export interface Role {
  id: string; name: string; nameAr?: string; description?: string;
  isSystem: boolean; createdAt: string;
  userCount?: number;
  permissions?: RolePermission[];
}

export interface RolePermission {
  id: string; roleId: string; module: string;
  canView: boolean; canCreate: boolean; canEdit: boolean;
  canDelete: boolean; canApprove: boolean; canExport: boolean;
}

export interface User {
  id: string; email: string; username: string; fullName: string; fullNameAr?: string;
  roleId: string; roleName?: string; branchId?: string; branchName?: string;
  status: string; lastLogin?: string; createdAt: string;
}

export interface CreateUserPayload {
  email: string; username: string; password: string; pin?: string;
  fullName: string; fullNameAr?: string; roleId: string; branchId?: string;
}

export interface Category {
  id: string; name: string; nameAr?: string; parentId?: string;
  isActive: boolean; sortOrder: number;
}

export interface Product {
  id: string; sku: string; barcode?: string; name: string; nameAr?: string;
  categoryId?: string; brand?: string; basePrice: number; costPrice?: number;
  taxPercentage: number; customFee: number; reorderLevel: number;
  status: string; weightBased: boolean;
}

export interface InventoryStock {
  id: string; productId: string; branchId: string; quantity: number;
  reservedQuantity: number; reorderLevel: number; lastUpdated: string;
  product?: Product;
}

export interface InventoryBatch {
  id: string; batchNumber: string; productId: string; branchId: string;
  supplierId?: string; quantity: number; remainingQuantity: number;
  purchaseCost?: number; expiryDate?: string; receivedDate: string;
  status: string;
  product?: Product;
  supplier?: { id: string; name: string };
}

export interface Order {
  id: string; orderNumber: string; source: string; branchId: string;
  customerId?: string; cashierId?: string; subtotal: number; discountAmount: number;
  taxAmount: number; totalAmount: number; paymentStatus: string; orderStatus: string;
  createdAt: string; items?: OrderItem[]; payments?: OrderPayment[];
  branch?: { id: string; name: string };
  cashier?: { id: string; fullName: string };
}

export interface OrderItem {
  id: string; productId: string; quantity: number; unitPrice: number; totalPrice: number;
}

export interface OrderPayment {
  id: string; paymentMethod: string; amount: number; status: string;
}

export interface CashierShift {
  id: string; cashierId: string; branchId: string; terminalId?: string;
  openingAmount: number; closingAmount?: number;
  cashSales: number; cardSales: number; digitalSales: number;
  totalSales: number; variance?: number;
  status: string; openedAt: string; closedAt?: string; notes?: string;
  cashier?: { id: string; fullName: string };
  terminal?: { id: string; terminalCode: string; name: string };
}

export interface OpenShiftPayload {
  cashierId: string; branchId: string; terminalId?: string; openingAmount: number;
}

export interface CloseShiftPayload { closingAmount: number; notes?: string; }

export interface Terminal {
  id: string; terminalCode: string; name: string; branchId: string;
  assignedCashierId?: string; status: string; lastSync?: string; uptimeMinutes?: number;
  branch?: { id: string; name: string };
  assignedCashier?: { id: string; fullName: string };
}

export interface Supplier {
  id: string; supplierCode: string; name: string; warehouseName?: string;
  contactPerson?: string; contactNumber?: string; email?: string;
  address?: string; city?: string; supplyType: string; status: string;
}

export interface Customer {
  id: string; customerCode: string; fullName: string; phone: string;
  loyaltyBalance: number; totalSpend: number; tier: string; status: string;
}

export interface ExpenseType {
  id: string; name: string; nameAr?: string; description?: string;
  isActive: boolean; createdAt: string;
}

export interface Expense {
  id: string; expenseTypeId: string; branchId: string; amount: number;
  description?: string; referenceNumber?: string; expenseDate: string; status: string;
  expenseType?: { id: string; name: string };
}

export interface Coupon {
  id: string; code: string; name: string; type: string; value: number;
  usageLimit?: number; usedCount: number; startDate: string; endDate: string;
  status: string;
}

export interface TaxFeeRule {
  id: string; ruleName: string; ruleType: string; vatPercentage: number;
  customFeeAmount: number; excisePercentage: number; isTobacco: boolean;
  applicableTo: string; status: string; effectiveDate: string;
}

export interface WarehouseRequest {
  id: string; requestNumber: string;
  sourceBranchId?: string; destinationBranchId: string; supplierId?: string;
  approvalStatus: string; deliveryStatus: string;
  notes?: string; createdAt: string;
  sourceBranch?: { id: string; name: string };
  destinationBranch?: { id: string; name: string };
  supplier?: { id: string; name: string };
  items?: WarehouseRequestItem[];
}

export interface WarehouseRequestItem {
  id: string; requestId: string; productId: string;
  requestedQuantity: number; approvedQuantity?: number;
  product?: Product;
}

export interface CustomerReturn {
  id: string; returnNumber: string; orderId: string; customerId: string;
  branchId: string; returnType: string; refundMethod: string;
  refundAmount: number; reason: string; notes?: string; status: string;
  createdAt: string;
  customer?: { id: string; fullName: string };
  order?: { id: string; orderNumber: string };
  items?: CustomerReturnItem[];
}

export interface CustomerReturnItem {
  id: string; returnId: string; productId: string;
  quantity: number; unitPrice: number; refundAmount: number; restock: boolean;
  product?: Product;
}

export interface ZatcaInvoice {
  id: string; invoiceNumber: string; orderId: string; branchId: string;
  invoiceType: string; issueDate: string; totalAmount: number; taxAmount: number;
  zatcaStatus: string; buyerName?: string; qrCodeValue?: string;
  branch?: { id: string; name: string };
}

export interface StaffAttendance {
  id: string; userId: string; branchId: string;
  checkIn?: string; checkOut?: string; status: string; createdAt: string;
  user?: { id: string; fullName: string; roleName?: string };
}

export interface AuditLog {
  id: string; userId?: string; action: string; entityType?: string;
  entityId?: string; createdAt: string; details?: string;
}

export interface ComplianceRule {
  id: string; ruleName: string; ruleType: string; appliesTo: string;
  appliesToId?: string; branchId?: string; ruleConfig: string;
  priority: number; isActive: boolean; createdAt: string;
}

export interface DeviceRecord {
  id: string; deviceName: string; deviceType: string; serialNumber?: string;
  branchId: string; terminalId?: string; status: string; syncStatus: string;
  behaviourProfile?: string; lastActivity?: string; createdAt: string;
  branch?: { id: string; name: string };
  terminal?: { id: string; terminalCode: string; name: string };
}

export interface DashboardMetrics {
  orders: {
    pending: number; processing: number; readyToDeliver: number;
    delivered: number; cancelled: number; totalToday: number;
  };
  sales: {
    totalToday: number;
    paymentBreakdown: { method: string; amount: number; pct: number }[];
  };
  shifts: { active: number; totalCashiers: number };
  terminals: { active: number; total: number };
  inventory: {
    lowStockCount: number; outOfStockCount: number; expiringCount: number;
    lowStockItems: { name: string; qty: number; branch: string }[];
    expiringItems: { name: string; daysLeft: number; branch: string }[];
  };
  cashierPerformance: { name: string; sales: number; status: string }[];
  branchPerformance: { branch: string; orders: number; sales: number }[];
  returns: { count: number; refundedAmount: number };
}
