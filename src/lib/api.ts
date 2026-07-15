export const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
export const PRINTER_API_KEY = "baqala_printer_api_url";
export const DEFAULT_PRINTER_AGENT = "http://localhost:5008";
// Fired on window after a successful api.notify() so NotificationsPopover can refetch
// immediately instead of waiting for its poll interval.
export const NOTIFICATION_CREATED_EVENT = "baqala:notification-created";

export function getPrinterBase(): string {
  return (typeof window !== "undefined" ? localStorage.getItem(PRINTER_API_KEY) : null) ?? DEFAULT_PRINTER_AGENT;
}

async function printerRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getPrinterBase();
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let msg = text;
    try { const p = JSON.parse(text) as { message?: string; title?: string }; msg = p.message ?? p.title ?? text; } catch { /* not JSON */ }
    throw new Error(msg || res.statusText);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

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
    let msg = text;
    try {
      const parsed = JSON.parse(text) as { message?: string; title?: string };
      msg = parsed.message ?? parsed.title ?? text;
    } catch { /* not JSON */ }
    throw new Error(msg || res.statusText);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

async function requestBlob(path: string): Promise<Blob> {
  const token = typeof window !== "undefined" ? localStorage.getItem("baqala_token") : null;
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let msg = text;
    try {
      const parsed = JSON.parse(text) as { message?: string; title?: string };
      msg = parsed.message ?? parsed.title ?? text;
    } catch { /* not JSON */ }
    throw new Error(msg || res.statusText);
  }
  return res.blob();
}

function toQuery(params?: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== "")) as Record<string, string>
  ).toString();
  return q ? `?${q}` : "";
}

export const api = {
  // Branches
  getBranches: (status?: string) =>
    request<Branch[]>(`/api/branches${status ? `?status=${status}` : ""}`),
  createBranch: (data: Partial<Branch>) =>
    request<Branch>("/api/branches", { method: "POST", body: JSON.stringify(data) }),
  updateBranch: (id: string, data: Partial<Branch>) =>
    request<Branch>(`/api/branches/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBranch: (id: string) =>
    request<void>(`/api/branches/${id}`, { method: "DELETE" }),

  // Users
  getUsers: (params?: { branchId?: string; status?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<User[]>(`/api/users${q ? `?${q}` : ""}`);
  },
  createUser: (data: CreateUserPayload) =>
    request<User>("/api/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: string, data: Partial<User>) =>
    request<User>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteUser: (id: string) =>
    request<User>(`/api/users/${id}`, { method: "DELETE" }),
  getUser: (id: string) => request<User>(`/api/users/${id}`),
  updateUserProfile: (id: string, data: { fullName: string; email: string; phone?: string }) =>
    request<User>(`/api/users/${id}/profile`, { method: "PUT", body: JSON.stringify(data) }),
  getUserPermissions: (id: string) =>
    request<UserPermissionOverride[]>(`/api/users/${id}/permissions`),
  updateUserPermissions: (id: string, permissions: UserPermissionOverride[]) =>
    request<UserPermissionOverride[]>(`/api/users/${id}/permissions`, { method: "PUT", body: JSON.stringify(permissions) }),
  resetUserPermissions: (id: string) =>
    request<void>(`/api/users/${id}/permissions`, { method: "DELETE" }),

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
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<Product[]>(`/api/products${q ? `?${q}` : ""}`);
  },
  getProductByBarcode: (barcode: string) =>
    request<Product>(`/api/products/barcode/${barcode}`),
  createProduct: (data: Partial<Product>) =>
    request<Product>("/api/products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id: string, data: Partial<Product>) =>
    request<Product>(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProduct: (id: string) =>
    request<void>(`/api/products/${id}`, { method: "DELETE" }),

  // Categories
  getCategories: () => request<Category[]>("/api/categories"),
  createCategory: (data: Partial<Category>) =>
    request<Category>("/api/categories", { method: "POST", body: JSON.stringify(data) }),
  updateCategory: (id: string, data: Partial<Category>) =>
    request<Category>(`/api/categories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCategory: (id: string) =>
    request<void>(`/api/categories/${id}`, { method: "DELETE" }),

  // Inventory
  getStock: (params?: { branchId?: string; lowStock?: boolean; categoryId?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<InventoryStock[]>(`/api/inventory/stock${q ? `?${q}` : ""}`);
  },
  getBatches: (params?: { branchId?: string; status?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<InventoryBatch[]>(`/api/inventory/batches${q ? `?${q}` : ""}`);
  },
  getExpiringBatches: (branchId?: string, daysAhead = 30) => {
    const q = new URLSearchParams({ ...(branchId && { branchId }), daysAhead: String(daysAhead) }).toString();
    return request<InventoryBatch[]>(`/api/inventory/batches/expiring?${q}`);
  },
  receiveBatch: (data: ReceiveBatchPayload) =>
    request<InventoryBatch>("/api/inventory/batches", { method: "POST", body: JSON.stringify(data) }),
  adjustInventory: (data: AdjustInventoryPayload) =>
    request<{ id: string }>("/api/inventory/adjustments", { method: "POST", body: JSON.stringify(data) }),
  getAdjustments: (params?: { branchId?: string; adjustmentType?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v))).toString();
    return request<InventoryAdjustment[]>(`/api/inventory/adjustments${q ? `?${q}` : ""}`);
  },

  // Stock Counts (Stocking Review)
  getStockCounts: (params?: { branchId?: string; status?: string }) =>
    request<StockCount[]>(`/api/stock-counts${toQuery(params)}`),
  getStockCount: (id: string) => request<StockCount>(`/api/stock-counts/${id}`),
  startStockCount: (data: { branchId: string; categoryId?: string; startedBy?: string; notes?: string }) =>
    request<StockCount>("/api/stock-counts", { method: "POST", body: JSON.stringify(data) }),
  recordStockCount: (id: string, data: { productId: string; countedQuantity: number }) =>
    request<StockCountItem>(`/api/stock-counts/${id}/count`, { method: "POST", body: JSON.stringify(data) }),
  completeStockCount: (id: string, completedBy?: string) =>
    request<StockCount>(`/api/stock-counts/${id}/complete`, { method: "POST", body: JSON.stringify({ completedBy }) }),
  cancelStockCount: (id: string) =>
    request<StockCount>(`/api/stock-counts/${id}/cancel`, { method: "PATCH" }),

  // Orders
  getOrders: (params?: { branchId?: string; status?: string; paymentStatus?: string; from?: string; to?: string }) => {
    const filtered = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null)) as Record<string, string>;
    const q = new URLSearchParams(filtered).toString();
    return request<Order[]>(`/api/orders${q ? `?${q}` : ""}`);
  },
  getOrder: (id: string) => request<Order>(`/api/orders/${id}`),
  getOrderByNumber: (num: string) => request<Order>(`/api/orders/by-number/${encodeURIComponent(num)}`),
  createOrder: (data: Partial<Order>) =>
    request<Order>("/api/orders", { method: "POST", body: JSON.stringify(data) }),
  updateOrderStatus: (id: string, status: string) =>
    request<Order>(`/api/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  editOrder: (id: string, data: {
    items: OrderEditItem[]; notes?: string; paymentMethod?: string; discountAmount?: number;
    updateCustomer?: boolean; customerId?: string | null;
  }) =>
    request<Order>(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  voidOrder: (id: string, data: { reason?: string }) =>
    request<Order>(`/api/orders/${id}`, { method: "DELETE", body: JSON.stringify(data) }),

  // Cashier Shifts
  getShifts: (params?: { branchId?: string; cashierId?: string; terminalId?: string; status?: string; dateFrom?: string; dateTo?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<CashierShift[]>(`/api/shifts${q ? `?${q}` : ""}`);
  },
  getActiveShifts: (branchId?: string) =>
    request<CashierShift[]>(`/api/shifts/active${branchId ? `?branchId=${branchId}` : ""}`),
  openShift: (data: OpenShiftPayload) =>
    request<CashierShift>("/api/shifts/open", { method: "POST", body: JSON.stringify(data) }),
  closeShift: (id: string, data: CloseShiftPayload) =>
    request<CashierShift>(`/api/shifts/${id}/close`, { method: "POST", body: JSON.stringify(data) }),
  approveVariance: (id: string) =>
    request<CashierShift>(`/api/shifts/${id}/approve-variance`, { method: "POST" }),

  // Terminals
  getTerminals: (params?: { branchId?: string; status?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<Terminal[]>(`/api/terminals${q ? `?${q}` : ""}`);
  },
  createTerminal: (data: Partial<Terminal>) =>
    request<Terminal>("/api/terminals", { method: "POST", body: JSON.stringify(data) }),
  updateTerminal: (id: string, data: Partial<Terminal>) =>
    request<Terminal>(`/api/terminals/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  updateTerminalStatus: (id: string, status: string) =>
    request<Terminal>(`/api/terminals/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  // Returns the plaintext pairing secret exactly once — only its hash is stored server-side,
  // so there's no "view existing secret" endpoint, only regenerate (which invalidates the old one).
  generateKioskPairingCode: (id: string) =>
    request<{ terminalCode: string; pairingSecret: string }>(`/api/terminals/${id}/kiosk-pairing-code`, { method: "POST" }),

  // Suppliers
  getSuppliers: (params?: { status?: string; supplyType?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<Supplier[]>(`/api/suppliers${q ? `?${q}` : ""}`);
  },
  createSupplier: (data: Partial<Supplier>) =>
    request<Supplier>("/api/suppliers", { method: "POST", body: JSON.stringify(data) }),
  updateSupplier: (id: string, data: Partial<Supplier>) =>
    request<Supplier>(`/api/suppliers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSupplier: (id: string) =>
    request<void>(`/api/suppliers/${id}`, { method: "DELETE" }),

  // Customers
  getCustomers: (params?: { tier?: string; search?: string }) => {
    const filtered = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>;
    const q = new URLSearchParams(filtered).toString();
    return request<Customer[]>(`/api/customers${q ? `?${q}` : ""}`);
  },
  getCustomerByPhone: (phone: string) =>
    request<Customer>(`/api/customers/by-phone/${encodeURIComponent(phone)}`),
  createCustomer: (data: Partial<Customer>) =>
    request<Customer>("/api/customers", { method: "POST", body: JSON.stringify(data) }),
  updateCustomer: (id: string, data: Partial<Customer>) =>
    request<Customer>(`/api/customers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  getCustomerLoyalty: (id: string) =>
    request<LoyaltyTransaction[]>(`/api/customers/${id}/loyalty`),

  // Finance
  getExpenses: (params?: { branchId?: string; status?: string; paymentMethod?: string; expenseTypeId?: string }) => {
    const filtered = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null)) as Record<string, string>;
    const q = new URLSearchParams(filtered).toString();
    return request<Expense[]>(`/api/finance/expenses${q ? `?${q}` : ""}`);
  },
  createExpense: (data: Partial<Expense>) =>
    request<Expense>("/api/finance/expenses", { method: "POST", body: JSON.stringify(data) }),
  updateExpense: (id: string, data: Partial<Expense>) =>
    request<Expense>(`/api/finance/expenses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteExpense: (id: string) =>
    request<void>(`/api/finance/expenses/${id}`, { method: "DELETE" }),
  approveExpense: (id: string, approved: boolean, approvedBy: string) =>
    request<Expense>(`/api/finance/expenses/${id}/approve`, { method: "PATCH", body: JSON.stringify({ approved, approvedBy }) }),
  getExpenseTypes: (includeInactive = false) =>
    request<ExpenseType[]>(`/api/finance/expense-types${includeInactive ? "?includeInactive=true" : ""}`),
  createExpenseType: (data: { name: string; nameAr?: string; description?: string }) =>
    request<ExpenseType>("/api/finance/expense-types", { method: "POST", body: JSON.stringify({ ...data, isActive: true }) }),
  updateExpenseType: (id: string, data: { name: string; nameAr?: string; description?: string; isActive: boolean }) =>
    request<ExpenseType>(`/api/finance/expense-types/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteExpenseType: (id: string) =>
    request<void>(`/api/finance/expense-types/${id}`, { method: "DELETE" }),
  getCoupons: (status?: string) =>
    request<Coupon[]>(`/api/finance/coupons${status ? `?status=${status}` : ""}`),
  createCoupon: (data: Partial<Coupon>) =>
    request<Coupon>("/api/finance/coupons", { method: "POST", body: JSON.stringify(data) }),
  updateCoupon: (id: string, data: Partial<Coupon>) =>
    request<Coupon>(`/api/finance/coupons/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCoupon: (id: string) =>
    request<void>(`/api/finance/coupons/${id}`, { method: "DELETE" }),
  validateCoupon: (code: string) =>
    request<Coupon>(`/api/finance/coupons/validate/${code}`),
  getTaxRules: (branchId?: string) =>
    request<TaxFeeRule[]>(`/api/finance/tax-rules${branchId ? `?branchId=${branchId}` : ""}`),
  createTaxRule: (data: Partial<TaxFeeRule>) =>
    request<TaxFeeRule>("/api/finance/tax-rules", { method: "POST", body: JSON.stringify(data) }),
  updateTaxRule: (id: string, data: Partial<TaxFeeRule>) =>
    request<TaxFeeRule>(`/api/finance/tax-rules/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  // Warehouse
  getWarehouseRequests: (params?: { branchId?: string; approvalStatus?: string; deliveryStatus?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<WarehouseRequest[]>(`/api/warehouse/requests${q ? `?${q}` : ""}`);
  },
  createWarehouseRequest: (data: Partial<WarehouseRequest>) =>
    request<WarehouseRequest>("/api/warehouse/requests", { method: "POST", body: JSON.stringify(data) }),
  approveWarehouseRequest: (id: string, approved: boolean, approvedBy: string) =>
    request<WarehouseRequest>(`/api/warehouse/requests/${id}/approve`, { method: "PATCH", body: JSON.stringify({ approved, approvedBy }) }),
  updateWarehouseDelivery: (id: string, status: string) =>
    request<WarehouseRequest>(`/api/warehouse/requests/${id}/delivery`, { method: "PATCH", body: JSON.stringify({ status }) }),

  // Warehouses (entity)
  getWarehouses: () => request<Warehouse[]>("/api/warehouses"),
  getWarehouse: (id: string) => request<Warehouse>(`/api/warehouses/${id}`),
  createWarehouse: (data: Partial<Warehouse>) =>
    request<Warehouse>("/api/warehouses", { method: "POST", body: JSON.stringify(data) }),
  updateWarehouse: (id: string, data: Partial<Warehouse>) =>
    request<Warehouse>(`/api/warehouses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  addWarehouseBranch: (warehouseId: string, data: { branchId: string }) =>
    request<void>(`/api/warehouses/${warehouseId}/branches`, { method: "POST", body: JSON.stringify(data) }),
  removeWarehouseBranch: (warehouseId: string, branchId: string) =>
    request<void>(`/api/warehouses/${warehouseId}/branches/${branchId}`, { method: "DELETE" }),
  getWarehouseStock: (warehouseId: string) =>
    request<WarehouseStock[]>(`/api/warehouses/${warehouseId}/stock`),

  // Purchase Orders
  getPurchaseOrders: (params?: { supplierId?: string; warehouseId?: string; branchId?: string; createdBy?: string; approvedBy?: string; productId?: string; status?: string; paymentStatus?: string }) => {
    const filtered = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null)) as Record<string, string>;
    const q = new URLSearchParams(filtered).toString();
    return request<PurchaseOrder[]>(`/api/purchase-orders${q ? `?${q}` : ""}`);
  },
  getPurchaseOrder: (id: string) => request<PurchaseOrder>(`/api/purchase-orders/${id}`),
  getPurchaseOrderByNumber: (number: string) =>
    request<PurchaseOrder>(`/api/purchase-orders/by-number/${encodeURIComponent(number)}`),
  getPurchaseOrdersByBatch: (batchId: string) =>
    request<PurchaseOrder[]>(`/api/purchase-orders/batch/${encodeURIComponent(batchId)}`),
  createPurchaseOrder: (data: Partial<PurchaseOrder>) =>
    request<PurchaseOrder>("/api/purchase-orders", { method: "POST", body: JSON.stringify(data) }),
  updatePoStatus: (id: string, status: string, approvedBy?: string) =>
    request<PurchaseOrder>(`/api/purchase-orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, approvedBy }) }),
  receivePurchaseOrder: (id: string, items: { productId: string; quantity: number; expiryDate?: string; batchNumber?: string }[]) =>
    request<PurchaseOrder>(`/api/purchase-orders/${id}/receive`, { method: "POST", body: JSON.stringify(items) }),
  addSupplierPayment: (poId: string, data: Partial<SupplierPayment>) =>
    request<SupplierPayment>(`/api/purchase-orders/${poId}/payments`, { method: "POST", body: JSON.stringify(data) }),

  // Stock Transfers
  getStockTransfers: (params?: { transferType?: string; status?: string; sourceWarehouseId?: string; destWarehouseId?: string; purchaseOrderId?: string; sourceSupplierId?: string }) => {
    const filtered = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null)) as Record<string, string>;
    const q = new URLSearchParams(filtered).toString();
    return request<StockTransfer[]>(`/api/stock-transfers${q ? `?${q}` : ""}`);
  },
  getStockTransfer: (id: string) => request<StockTransfer>(`/api/stock-transfers/${id}`),
  getStockTransferByNumber: (number: string) =>
    request<StockTransfer>(`/api/stock-transfers/by-number/${encodeURIComponent(number)}`),
  getStockTransfersByBatch: (batchId: string) =>
    request<StockTransfer[]>(`/api/stock-transfers/batch/${encodeURIComponent(batchId)}`),
  createStockTransfer: (data: Partial<StockTransfer>) =>
    request<StockTransfer>("/api/stock-transfers", { method: "POST", body: JSON.stringify(data) }),
  updateTransferStatus: (id: string, status: string, approvedBy?: string) =>
    request<StockTransfer>(`/api/stock-transfers/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, approvedBy }) }),
  receiveStockTransfer: (id: string, items: { itemId: string; receivedQuantity: number; notes?: string }[], approvedBy?: string) =>
    request<StockTransfer>(`/api/stock-transfers/${id}/receive`, { method: "POST", body: JSON.stringify({ items, approvedBy }) }),

  // Product Variants
  getProductVariants: (productId: string) =>
    request<ProductVariant[]>(`/api/products/${productId}/variants`),
  addProductVariant: (productId: string, data: Partial<ProductVariant>) =>
    request<ProductVariant>(`/api/products/${productId}/variants`, { method: "POST", body: JSON.stringify(data) }),
  deleteProductVariant: (productId: string, variantId: string) =>
    request<void>(`/api/products/${productId}/variants/${variantId}`, { method: "DELETE" }),

  // Returns
  getReturns: (params?: { branchId?: string; status?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<CustomerReturn[]>(`/api/returns${q ? `?${q}` : ""}`);
  },
  createReturn: (data: Partial<CustomerReturn>) =>
    request<CustomerReturn>("/api/returns", { method: "POST", body: JSON.stringify(data) }),
  approveReturn: (id: string, approved: boolean) =>
    request<CustomerReturn>(`/api/returns/${id}/approve`, { method: "PATCH", body: JSON.stringify({ approved }) }),
  completeReturn: (id: string) =>
    request<CustomerReturn>(`/api/returns/${id}/complete`, { method: "PATCH", body: JSON.stringify({}) }),

  // Compliance / ZATCA
  getZatcaInvoices: (params?: { branchId?: string; status?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<ZatcaInvoice[]>(`/api/compliance/zatca/invoices${q ? `?${q}` : ""}`);
  },
  getZatcaSettings: (branchId: string) =>
    request<ZatcaSettings>(`/api/compliance/zatca/settings/${branchId}`),
  updateZatcaSettings: (branchId: string, data: Partial<ZatcaSettings>) =>
    request<ZatcaSettings>(`/api/compliance/zatca/settings/${branchId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  generateZatcaCsr: (branchId: string) =>
    request<{ csr: string; egsSerial: string }>(`/api/compliance/zatca/onboarding/${branchId}/csr`, { method: "POST" }),
  getZatcaComplianceCsid: (branchId: string, otp: string) =>
    request<{ success: boolean; requestId?: string; error?: string }>(`/api/compliance/zatca/onboarding/${branchId}/compliance-csid`, {
      method: "POST",
      body: JSON.stringify({ otp }),
    }),
  getZatcaProductionCsid: (branchId: string) =>
    request<{ success: boolean; requestId?: string; error?: string; complianceTests: { documentType: string; passed: boolean; apiStatus?: string }[] }>(
      `/api/compliance/zatca/onboarding/${branchId}/production-csid`, { method: "POST" }),
  submitZatcaInvoice: (invoiceId: string) =>
    request<ZatcaInvoice>(`/api/compliance/zatca/invoices/${invoiceId}/submit`, { method: "POST" }),

  // Audit Logs
  getAuditLogs: (params?: { entityType?: string; page?: number }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<{ total: number; items: AuditLog[] }>(`/api/auditlogs${q ? `?${q}` : ""}`);
  },
  createAuditLog: (data: { action: string; entityType?: string; userId?: string; branchId?: string; details?: string }) =>
    request<AuditLog>("/api/auditlogs", { method: "POST", body: JSON.stringify({
      action: data.action,
      entityType: data.entityType ?? null,
      userId: data.userId ?? null,
      branchId: data.branchId ?? null,
      newValues: data.details ?? null,
    }) }),

  // Notifications
  getNotifications: (params?: { unreadOnly?: boolean; page?: number; pageSize?: number }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))).toString();
    return request<{ total: number; page: number; pageSize: number; items: Notification[] }>(`/api/notifications${q ? `?${q}` : ""}`);
  },
  getUnreadNotificationCount: () =>
    request<{ count: number }>("/api/notifications/unread-count"),
  markNotificationRead: (id: string) =>
    request<Notification>(`/api/notifications/${id}/read`, { method: "POST" }),
  markAllNotificationsRead: () =>
    request<{ success: boolean }>("/api/notifications/read-all", { method: "POST" }),
  // Self-notify: logs a Bell notification for the current user. Fire-and-forget by design —
  // callers should never await this or let it block/break the UI action it's attached to.
  notify: (
    category: string,
    type: string,
    title: string,
    message: string,
    opts?: { severity?: "info" | "warning" | "error"; entityType?: string; entityId?: string; branchId?: string }
  ) =>
    request<{ success: boolean }>("/api/notifications", {
      method: "POST",
      body: JSON.stringify({
        category, type, title, message,
        severity: opts?.severity ?? "info",
        entityType: opts?.entityType,
        entityId: opts?.entityId,
        branchId: opts?.branchId,
      }),
    })
      .then((res) => {
        // Bell polls on an interval for notifications triggered by other users/the backend, but
        // a self-notify is caused by the current user's own action right now — waiting out the
        // poll interval to see it would read as "the notification never showed up".
        if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIFICATION_CREATED_EVENT));
        return res;
      })
      .catch(() => {}),

  // POS Settings
  getPosSettings: (branchId: string) =>
    request<PosSettingsRecord>(`/api/settings/pos/${branchId}`),
  updatePosSettings: (branchId: string, data: Partial<PosSettingsRecord>) =>
    request<PosSettingsRecord>(`/api/settings/pos/${branchId}`, { method: "PUT", body: JSON.stringify(data) }),

  // Tenant key-value settings
  getTenantSettings: (branchId: string) =>
    request<Record<string, string | null>>(`/api/settings/tenant/${branchId}`),
  updateTenantSettings: (branchId: string, data: Record<string, string | null>) =>
    request<void>(`/api/settings/tenant/${branchId}`, { method: "PUT", body: JSON.stringify(data) }),

  // Attendance
  getAttendance: (params?: { branchId?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
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

  // Reports
  getDailySalesReport: (params?: { date?: string; branchId?: string; terminalId?: string; cashierId?: string; paymentMethod?: string; orderStatus?: string; customerType?: string }) =>
    request<DailySalesReport>(`/api/reports/daily-sales${toQuery(params)}`),
  exportDailySalesReport: (params?: { date?: string; branchId?: string; terminalId?: string; cashierId?: string; paymentMethod?: string; orderStatus?: string; customerType?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/daily-sales/export${toQuery(params)}`),

  getMonthlySalesReport: (params?: { from?: string; to?: string; branchId?: string; categoryId?: string; comparePrevious?: boolean }) =>
    request<MonthlySalesReport>(`/api/reports/monthly-sales${toQuery(params)}`),
  exportMonthlySalesReport: (params?: { from?: string; to?: string; branchId?: string; categoryId?: string; comparePrevious?: boolean; exportedBy?: string; includeMargin?: boolean; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/monthly-sales/export${toQuery(params)}`),

  getCashierSalesReport: (params?: { from?: string; to?: string; branchId?: string; cashierId?: string; terminalId?: string }) =>
    request<CashierSalesReport>(`/api/reports/cashier-sales${toQuery(params)}`),
  exportCashierSalesReport: (params?: { from?: string; to?: string; branchId?: string; cashierId?: string; terminalId?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/cashier-sales/export${toQuery(params)}`),

  getPaymentMethodsReport: (params?: { from?: string; to?: string; branchId?: string; terminalId?: string; cashierId?: string; paymentMethod?: string }) =>
    request<PaymentMethodsReport>(`/api/reports/payment-methods${toQuery(params)}`),
  exportPaymentMethodsReport: (params?: { from?: string; to?: string; branchId?: string; terminalId?: string; cashierId?: string; paymentMethod?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/payment-methods/export${toQuery(params)}`),

  getLowStockReport: (params?: { branchId?: string; categoryId?: string; onlyLowStock?: boolean }) =>
    request<LowStockReport>(`/api/reports/low-stock${toQuery(params)}`),
  exportLowStockReport: (params?: { branchId?: string; categoryId?: string; onlyLowStock?: boolean; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/low-stock/export${toQuery(params)}`),

  getInventorySnapshotReport: (params?: { branchId?: string; categoryId?: string }) =>
    request<InventorySnapshotReport>(`/api/reports/inventory-snapshot${toQuery(params)}`),
  exportInventorySnapshotReport: (params?: { branchId?: string; categoryId?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/inventory-snapshot/export${toQuery(params)}`),

  getBranchSalesReport: (params?: { from?: string; to?: string; city?: string; branchId?: string; customerType?: string }) =>
    request<BranchSalesReport>(`/api/reports/branch-sales${toQuery(params)}`),
  exportBranchSalesReport: (params?: { from?: string; to?: string; city?: string; branchId?: string; customerType?: string; exportedBy?: string; includeMargin?: boolean; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/branch-sales/export${toQuery(params)}`),

  getTerminalReport: (params?: { from?: string; to?: string; branchId?: string; terminalId?: string; status?: string }) =>
    request<TerminalReport>(`/api/reports/terminal${toQuery(params)}`),
  exportTerminalReport: (params?: { from?: string; to?: string; branchId?: string; terminalId?: string; status?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/terminal/export${toQuery(params)}`),

  getProductSalesReport: (params?: { from?: string; to?: string; branchId?: string; categoryId?: string; productId?: string; search?: string; cashierId?: string; hasTobaccoFee?: boolean }) =>
    request<ProductSalesReport>(`/api/reports/product-sales${toQuery(params)}`),
  exportProductSalesReport: (params?: { from?: string; to?: string; branchId?: string; categoryId?: string; productId?: string; search?: string; cashierId?: string; hasTobaccoFee?: boolean; exportedBy?: string; includeMargin?: boolean; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/product-sales/export${toQuery(params)}`),

  getCategoryPerformanceReport: (params?: { from?: string; to?: string; branchId?: string; categoryId?: string }) =>
    request<CategoryPerformanceReport>(`/api/reports/category-performance${toQuery(params)}`),
  exportCategoryPerformanceReport: (params?: { from?: string; to?: string; branchId?: string; categoryId?: string; exportedBy?: string; includeMargin?: boolean; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/category-performance/export${toQuery(params)}`),

  getSupplierPerformanceReport: (params?: { from?: string; to?: string; supplierId?: string; branchId?: string; productId?: string; createdBy?: string; approvedBy?: string }) =>
    request<SupplierPerformanceReport>(`/api/reports/supplier-performance${toQuery(params)}`),
  exportSupplierPerformanceReport: (params?: { from?: string; to?: string; supplierId?: string; branchId?: string; productId?: string; createdBy?: string; approvedBy?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/supplier-performance/export${toQuery(params)}`),

  getWasteSpoilageReport: (params?: { from?: string; to?: string; branchId?: string; reason?: string; productId?: string; adjustedBy?: string }) =>
    request<WasteSpoilageReport>(`/api/reports/waste-spoilage${toQuery(params)}`),
  exportWasteSpoilageReport: (params?: { from?: string; to?: string; branchId?: string; reason?: string; productId?: string; adjustedBy?: string; exportedBy?: string; includeCost?: boolean; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/waste-spoilage/export${toQuery(params)}`),

  getReturnsRefundsReport: (params?: { from?: string; to?: string; branchId?: string; refundMethod?: string; status?: string; customerType?: string; reason?: string; productId?: string; processedBy?: string }) =>
    request<ReturnsRefundsReport>(`/api/reports/returns-refunds${toQuery(params)}`),
  exportReturnsRefundsReport: (params?: { from?: string; to?: string; branchId?: string; refundMethod?: string; status?: string; customerType?: string; reason?: string; productId?: string; processedBy?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/returns-refunds/export${toQuery(params)}`),

  getAttendanceShiftReport: (params?: { from?: string; to?: string; branchId?: string; staffId?: string; status?: string; roleId?: string; terminalId?: string; varianceThreshold?: number }) =>
    request<AttendanceShiftReport>(`/api/reports/attendance-shift${toQuery(params)}`),
  exportAttendanceShiftReport: (params?: { from?: string; to?: string; branchId?: string; staffId?: string; status?: string; roleId?: string; terminalId?: string; varianceThreshold?: number; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/attendance-shift/export${toQuery(params)}`),

  getAuditTrailReport: (params?: { from?: string; to?: string; userId?: string; module?: string; severity?: string; branchId?: string }) =>
    request<AuditTrailReport>(`/api/reports/audit-trail${toQuery(params)}`),
  exportAuditTrailReport: (params?: { from?: string; to?: string; userId?: string; module?: string; severity?: string; branchId?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/audit-trail/export${toQuery(params)}`),

  getDiscountsReport: (params?: { from?: string; to?: string; branchId?: string; discountType?: string }) =>
    request<DiscountsReport>(`/api/reports/discounts${toQuery(params)}`),
  exportDiscountsReport: (params?: { from?: string; to?: string; branchId?: string; discountType?: string; exportedBy?: string; includeMargin?: boolean; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/discounts/export${toQuery(params)}`),

  getVatZatcaReport: (params?: { from?: string; to?: string; branchId?: string; zatcaStatus?: string; invoiceType?: string }) =>
    request<VatZatcaReport>(`/api/reports/vat-zatca${toQuery(params)}`),
  exportVatZatcaReport: (params?: { from?: string; to?: string; branchId?: string; zatcaStatus?: string; invoiceType?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/vat-zatca/export${toQuery(params)}`),

  getTaxReport: (params?: { from?: string; to?: string; branchId?: string; cashierId?: string }) =>
    request<TaxReport>(`/api/reports/tax${toQuery(params)}`),
  exportTaxReport: (params?: { from?: string; to?: string; branchId?: string; cashierId?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/tax/export${toQuery(params)}`),

  getFeeReport: (params?: { from?: string; to?: string; branchId?: string; cashierId?: string }) =>
    request<FeeReport>(`/api/reports/fees${toQuery(params)}`),
  exportFeeReport: (params?: { from?: string; to?: string; branchId?: string; cashierId?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/fees/export${toQuery(params)}`),

  getTobaccoExciseReport: (params?: { from?: string; to?: string; branchId?: string; cashierId?: string }) =>
    request<TobaccoExciseReport>(`/api/reports/tobacco-excise${toQuery(params)}`),
  exportTobaccoExciseReport: (params?: { from?: string; to?: string; branchId?: string; cashierId?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/tobacco-excise/export${toQuery(params)}`),

  getProfitMarginReport: (params?: { from?: string; to?: string; branchId?: string; groupBy?: "product" | "category" | "branch" }) =>
    request<ProfitMarginReport>(`/api/reports/profit-margin${toQuery(params)}`),
  exportProfitMarginReport: (params?: { from?: string; to?: string; branchId?: string; groupBy?: "product" | "category" | "branch"; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/profit-margin/export${toQuery(params)}`),

  // Compliance rules
  getComplianceRules: (params?: { ruleType?: string; includeInactive?: boolean }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)]))).toString();
    return request<ComplianceRule[]>(`/api/compliance/rules${q ? `?${q}` : ""}`);
  },
  createComplianceRule: (data: Partial<ComplianceRule>) =>
    request<ComplianceRule>("/api/compliance/rules", { method: "POST", body: JSON.stringify(data) }),
  updateComplianceRule: (id: string, data: Partial<ComplianceRule>) =>
    request<ComplianceRule>(`/api/compliance/rules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  toggleComplianceRule: (id: string) =>
    request<ComplianceRule>(`/api/compliance/rules/${id}/toggle`, { method: "PATCH" }),
  deleteComplianceRule: (id: string) =>
    request<void>(`/api/compliance/rules/${id}`, { method: "DELETE" }),

  // Devices
  getDevices: (params?: { branchId?: string; status?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<DeviceRecord[]>(`/api/devices${q ? `?${q}` : ""}`);
  },
  createDevice: (data: Partial<DeviceRecord>) =>
    request<DeviceRecord>("/api/devices", { method: "POST", body: JSON.stringify(data) }),
  updateDevice: (id: string, data: Partial<DeviceRecord>) =>
    request<DeviceRecord>(`/api/devices/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  updateDeviceStatus: (id: string, status: string, syncStatus?: string) =>
    request<DeviceRecord>(`/api/devices/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, syncStatus }) }),

  // Discounts
  getDiscounts: (params?: { isActive?: boolean }) => {
    const q = params?.isActive !== undefined ? `?isActive=${params.isActive}` : "";
    return request<Discount[]>(`/api/discounts${q}`);
  },
  createDiscount: (data: Partial<Discount> & { excludedProductIds?: string[] }) =>
    request<Discount>("/api/discounts", { method: "POST", body: JSON.stringify(data) }),
  updateDiscount: (id: string, data: Partial<Discount> & { excludedProductIds?: string[] }) =>
    request<Discount>(`/api/discounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  toggleDiscount: (id: string) =>
    request<Discount>(`/api/discounts/${id}/toggle`, { method: "PATCH" }),
  deleteDiscount: (id: string) =>
    request<void>(`/api/discounts/${id}`, { method: "DELETE" }),

  // Supply Chain Finance (Discrepancies & Credit Notes)
  getDiscrepancies: (params?: { supplierId?: string; poId?: string; transferId?: string; status?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<StockDiscrepancy[]>(`/api/supply-chain/discrepancies${q ? `?${q}` : ""}`);
  },
  updateDiscrepancyStatus: (id: string, status: string, notes?: string) =>
    request<StockDiscrepancy>(`/api/supply-chain/discrepancies/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, notes }) }),
  raiseDebitNote: (id: string) =>
    request<SupplierCreditNote>(`/api/supply-chain/discrepancies/${id}/raise-debit-note`, { method: "POST", body: JSON.stringify({}) }),
  raiseShortageDebitNote: (data: { poId: string; productId: string; expectedQuantity: number; receivedQuantity: number; unitCost: number }) =>
    request<{ discrepancy: StockDiscrepancy; creditNote: SupplierCreditNote }>(`/api/supply-chain/raise-shortage-debit-note`, { method: "POST", body: JSON.stringify(data) }),
  getCreditNotes: (params?: { supplierId?: string; status?: string; creditType?: string; poId?: string; transferId?: string; sourceWarehouseId?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<SupplierCreditNote[]>(`/api/supply-chain/credit-notes${q ? `?${q}` : ""}`);
  },
  applyCreditNote: (id: string, applyToPoId?: string) => {
    const q = applyToPoId ? `?applyToPoId=${applyToPoId}` : "";
    return request<SupplierCreditNote>(`/api/supply-chain/credit-notes/${id}/apply${q}`, { method: "PATCH", body: JSON.stringify({}) });
  },

  // Offers
  getOffers: (params?: { isActive?: boolean; offerType?: string }) => {
    const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined) as [string, string][];
    const q = new URLSearchParams(Object.fromEntries(entries)).toString();
    return request<Offer[]>(`/api/offers${q ? `?${q}` : ""}`);
  },
  getActiveOffers: () => request<Offer[]>("/api/offers/active"),
  createOffer: (data: Partial<Offer>) =>
    request<Offer>("/api/offers", { method: "POST", body: JSON.stringify(data) }),
  updateOffer: (id: string, data: Partial<Offer>) =>
    request<Offer>(`/api/offers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  toggleOffer: (id: string) =>
    request<Offer>(`/api/offers/${id}/toggle`, { method: "PATCH" }),
  deleteOffer: (id: string) =>
    request<void>(`/api/offers/${id}`, { method: "DELETE" }),

  // ─── Printer (routes to local agent URL, not remote server) ─────────────────
  detectPrinters: () =>
    printerRequest<{ printers: DetectedPrinter[] }>("/api/printer/detect"),
  getPrinterStatus: () =>
    printerRequest<{ defaultPrinter: string | null; installed: string[]; installedUris: Record<string, string> }>("/api/printer/status"),
  activatePrinter: (data: { uri: string; name: string }) =>
    printerRequest<{ message: string; name: string; kioskReady: boolean }>("/api/printer/activate", { method: "POST", body: JSON.stringify(data) }),
  removePrinter: (name: string) =>
    printerRequest<{ message: string }>(`/api/printer/${name}`, { method: "DELETE" }),
  printReceipt: (invoice: {
    orderNumber: string; createdAt: string; sellerName: string; branchName: string;
    vatNumber?: string; customerName?: string; paymentMethod?: string;
    items: { name: string; qty: number; price: number }[];
    subtotal: number; discount: number; vat: number; total: number; taxLabel: string;
    tobaccoExcise?: number;
    fees?: { name: string; amount: number }[];
    splitBreakdown?: { method: string; amount: number }[];
    printerName?: string;
    zatcaQrCode?: string;
  }) =>
    printerRequest<{ message: string; jobId?: string }>("/api/printer/print-receipt", { method: "POST", body: JSON.stringify(invoice) }),
  getPrintJobs: (printer?: string) =>
    printerRequest<{ jobs: string[] }>(`/api/printer/jobs${printer ? `?printer=${encodeURIComponent(printer)}` : ""}`),
  cancelAllJobs: (printer?: string) =>
    printerRequest<{ message: string }>(`/api/printer/jobs${printer ? `?printer=${encodeURIComponent(printer)}` : ""}`, { method: "DELETE" }),
  // Returns the direct URL to download the OS-specific QZ Tray install script
  qzInstallScriptUrl: () => `${BASE}/api/printer/qz-install-script`,
  // Returns the direct URL to download the one-click POS Setup installer (OS-specific)
  setupInstallerUrl: () => `${BASE}/api/printer/setup-installer`,
  // Returns the Windows PowerShell one-liner install command (no download needed)
  setupPs1Url: () => `${BASE}/api/printer/setup-ps1`,
  // Fixes the "Action Required" QZ Tray popup on Windows when QZ Tray is already installed.
  // Must read the cert from THIS machine's local agent, not the remote server — the cert
  // embedded needs to match what's actually paired with the QZ Tray running on this machine.
  qzTrustPs1Url: () => `${getPrinterBase()}/api/printer/qz-trust-ps1`,
  // QZ Tray's cert/sign challenge must be answered by the local agent on this machine (same
  // reasoning as above) — routing these through the remote server returns whatever cert that
  // server happens to have on disk, which can silently mismatch what's trusted in this
  // machine's QZ Tray allowed.dat/override.crt and leave every print request unsigned.
  qzCertificateUrl: () => `${getPrinterBase()}/api/printer/qz-certificate`,
  qzSign: (toSign: string) =>
    fetch(`${getPrinterBase()}/api/printer/qz-sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toSign }),
    }).then(r => r.text()),
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Branch {
  id: string; branchCode: string; name: string; nameAr?: string;
  address?: string; city?: string; contactNumber?: string;
  commercialRegistration?: string; email?: string;
  status: string; createdAt: string;
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
  phone?: string;
  roleId: string; roleName?: string; branchId?: string; branchName?: string;
  status: string; lastLogin?: string; createdAt: string;
  hasCustomPermissions?: boolean;
}

export interface UserPermissionOverride {
  module: string;
  canView: boolean; canCreate: boolean; canEdit: boolean;
  canDelete: boolean; canApprove: boolean; canExport: boolean;
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
  status: string; weightBased: boolean; isTobacco: boolean;
  discount?: number; discountType?: "percentage" | "fixed";
  imageUrl?: string;
  category?: { id: string; name: string; nameAr?: string };
}

export interface InventoryStock {
  id: string; productId: string; branchId: string; quantity: number;
  reservedQuantity: number; reorderLevel: number; lastUpdated: string;
  product?: Product;
  branch?: { id: string; name: string; branchCode?: string };
}

export interface InventoryBatch {
  id: string; batchNumber: string; productId: string; branchId: string;
  supplierId?: string; quantity: number; remainingQuantity: number;
  purchaseCost?: number; expiryDate?: string; receivedDate: string;
  status: string;
  product?: Product;
  supplier?: { id: string; name: string };
}

export interface ReceiveBatchPayload {
  productId: string; branchId: string; supplierId?: string;
  quantity: number; purchaseCost?: number; expiryDate?: string;
  batchNumber?: string; notes?: string; reorderLevel?: number;
  damagedOrReturnReason?: string;
}

export interface Order {
  id: string; orderNumber: string; source: string; branchId: string;
  customerId?: string; cashierId?: string; subtotal: number; discountAmount: number;
  taxAmount: number; customFeeAmount?: number; tobaccoFeeAmount?: number; totalAmount: number; paymentStatus: string; orderStatus: string;
  createdAt: string; items?: OrderItem[]; payments?: OrderPayment[];
  branch?: { id: string; name: string };
  cashier?: { id: string; fullName: string };
  customer?: { id: string; fullName: string; phone: string; email?: string };
  // Only populated on the createOrder response — the real ZATCA-signed QR/status, when Phase 2
  // is onboarded for the branch. Absent otherwise; callers should fall back to a Phase-1 QR.
  zatcaQrCode?: string;
  zatcaInvoiceStatus?: string;
  notes?: string;
  voidReason?: string;
  // Set by the caller once per checkout attempt and re-sent unchanged on retry, so a request
  // that succeeded server-side but whose response was lost to a timeout returns the SAME order
  // on retry instead of creating a duplicate paid order (backend dedupes on this).
  clientRequestId?: string;
}

export interface OrderItem {
  id?: string; productId: string; quantity: number; unitPrice: number; totalPrice: number; tobaccoFeeAmount?: number;
  product?: { id: string; name: string; sku: string };
}

export interface OrderEditItem { id?: string; productId: string; quantity: number; unitPrice: number; }

export interface OrderPayment {
  id?: string; paymentMethod: string; amount: number; status: string;
}

export interface CashierShift {
  id: string; cashierId: string; branchId: string; terminalId?: string;
  openingAmount: number; closingAmount?: number;
  cashSales: number; cardSales: number; digitalSales: number;
  totalSales: number; variance?: number;
  status: string; openedAt: string; closedAt?: string; notes?: string;
  requiresApproval?: boolean; approvedBy?: string; approvedAt?: string;
  closedBy?: string; closeReason?: string;
  cashier?: { id: string; fullName: string };
  terminal?: { id: string; terminalCode: string; name: string };
}

export interface OpenShiftPayload {
  cashierId: string; branchId: string; terminalId?: string; openingAmount: number;
}

export interface CloseShiftPayload { closingAmount: number; notes?: string; reason?: string; }

export interface Terminal {
  id: string; terminalCode: string; name: string; branchId: string;
  assignedCashierId?: string; status: string; lastSync?: string; uptimeMinutes?: number;
  pairingSecretSetAt?: string;
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
  email?: string; loyaltyBalance: number; totalSpend: number;
  visitCount?: number; tier: string; status: string; createdAt?: string;
}

export interface LoyaltyTransaction {
  id: string; customerId: string; orderId?: string; branchId?: string;
  transactionType: string; points: number; balanceAfter: number;
  description?: string; expiryDate?: string; createdAt: string;
}

export interface ExpenseType {
  id: string; name: string; nameAr?: string; description?: string;
  isActive: boolean; createdAt: string;
}

export interface Expense {
  id: string; expenseTypeId: string; branchId: string; amount: number;
  paidAmount?: number; paymentMethod?: string;
  description?: string; referenceNumber?: string; expenseDate: string; status: string;
  expenseType?: { id: string; name: string };
  branch?: { id: string; name: string };
}

export interface Coupon {
  id: string; code: string; name: string; type: string; value: number;
  usageLimit?: number; usedCount: number; startDate: string; endDate: string;
  status: string;
}

export interface Discount {
  id: string; name: string; nameAr?: string;
  appliesTo: string; // all | product | category | branch
  productId?: string; categoryId?: string; branchId?: string;
  discountType: string; // percentage | fixed
  value: number; isActive: boolean;
  startDate?: string; endDate?: string; createdAt: string;
  requiresCustomer?: boolean; minCustomerTier?: string; // standard | silver | gold | platinum
  // JSON array of product ids carved out of an all/branch/category scoped discount
  excludedProductIdsJson?: string;
  product?: { id: string; name: string; sku: string };
  branch?: { id: string; name: string };
}

export interface Offer {
  id: string; name: string;
  offerType: string; // bogo | combo | buy_a_get_b | product_offer | lucky_draw
  branchId?: string;
  triggerProductId?: string; getProductId?: string;
  triggerQuantity: number; getQuantity: number;
  offerPrice?: number; discountPercentage?: number;
  itemsDescription?: string; minBasketAmount?: number; winners?: number;
  usageLimit?: number; usedCount: number;
  startDate: string; endDate: string; isActive: boolean; createdAt: string;
  branch?: { id: string; name: string };
  triggerProduct?: { id: string; name: string; sku: string };
  getProduct?: { id: string; name: string; sku: string };
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
  id?: string; returnId?: string; productId: string;
  orderItemId?: string;
  quantity: number; unitPrice: number; refundAmount: number;
  condition: string; restock: boolean;
  product?: { id: string; name: string; sku: string };
}

export interface ZatcaSettings {
  id?: string; branchId: string; vatRegistrationNumber?: string; sellerName?: string;
  streetName?: string; buildingNumber?: string; citySubdivisionName?: string; postalZone?: string;
  phase2Enabled: boolean; environment: string;
  egsSerial?: string; onboardingStatus?: string;
  hasCsr?: boolean; hasComplianceCsid?: boolean; hasProductionCsid?: boolean;
  createdAt?: string; updatedAt?: string;
}

export interface ZatcaInvoice {
  id: string; invoiceNumber: string; orderId: string; branchId: string;
  invoiceType: string; issueDate: string; totalAmount: number; taxAmount: number;
  zatcaStatus: string; zatcaResponse?: string; buyerName?: string; buyerVatNumber?: string; qrCodeValue?: string;
  branch?: { id: string; name: string };
}

export interface StaffAttendance {
  id: string; userId: string; branchId: string;
  checkIn?: string; checkOut?: string; status: string; createdAt: string;
  user?: { id: string; fullName: string; roleName?: string };
}

export interface AuditLog {
  id: string; userId?: string; action: string; entityType?: string;
  entityId?: string; createdAt: string;
  details?: string;   // legacy alias
  newValues?: string; // backend field — contains human-readable details
  branchId?: string;
}

export interface Notification {
  id: string; userId: string; branchId?: string;
  category: string; type: string; title: string; message: string;
  severity: "info" | "warning" | "error";
  entityType?: string; entityId?: string;
  isRead: boolean; readAt?: string; createdAt: string;
}

export interface PosSettingsRecord {
  id?: string; branchId: string;
  // Cashier tab
  requireShiftOpen: boolean;
  requireOpeningCashCount: boolean;
  autoLockIdle: boolean;
  allowCustomerViewPaidShifts: boolean;
  // Terminal tab
  allowTerminalSwitching: boolean;
  preserveHeldOrders: boolean;
  offlineModeEnabled: boolean;
  // Invoice tab
  autoPrintReceipt: boolean;
  sendSmsInvoice: boolean;
  // Permissions tab
  cashierCanDiscount: boolean;
  cashierCanCoupon: boolean;
  cashierCanRefund: boolean;
  cashierCanHoldOrder: boolean;
  cashierCanEditOrder: boolean;
  requireReasonForVoid: boolean;
  requireManagerApprovalForRefund: boolean;
  allowNegativeStock: boolean;
  // Scan tab
  beepOnScan: boolean;
  warnNearExpiry: boolean;
  allowNearExpirySale: boolean;
  blockExpiredItems: boolean;
  blockNonpermissibleItems: boolean;
}

export interface ComplianceRule {
  id: string; ruleName: string; ruleType: string; appliesTo: string;
  appliesToId?: string; branchId?: string; ruleConfig: string;
  priority: number; isActive: boolean; createdBy?: string; createdAt: string;
}

export interface DeviceRecord {
  id: string; deviceName: string; deviceType: string; serialNumber?: string;
  branchId: string; terminalId?: string; status: string; syncStatus: string;
  behaviourProfile?: string; lastActivity?: string; createdAt: string;
  branch?: { id: string; name: string };
  terminal?: { id: string; terminalCode: string; name: string };
}

export interface AdjustInventoryPayload {
  productId: string; branchId: string; quantity: number;
  adjustmentType: string; reason?: string; adjustedBy?: string;
}

export interface InventoryAdjustment {
  id: string; productId: string; branchId: string;
  quantity: number; adjustmentType: string; reason?: string;
  adjustedBy?: string; createdAt: string;
  product?: Product;
  branch?: { id: string; name: string };
  adjustedByUser?: { id: string; fullName: string };
}

export interface StockCountItem {
  id: string; stockCountId?: string; productId: string;
  systemQuantity: number; countedQuantity?: number; variance?: number;
  countedAt?: string; createdAt?: string;
  product?: Product;
}

export interface StockCount {
  id: string; branchId: string; categoryId?: string;
  status: string; // draft | completed | cancelled
  startedBy?: string; completedBy?: string; notes?: string;
  startedAt: string; completedAt?: string;
  branch?: { id: string; name: string };
  category?: { id: string; name: string };
  items?: StockCountItem[];
}

export interface Warehouse {
  id: string; code: string; name: string; nameAr?: string;
  address?: string; city?: string; capacity?: number;
  contactPerson?: string; contactNumber?: string; status: string;
  createdAt: string; updatedAt: string;
  branchWarehouses?: { id: string; branchId: string; branch?: { id: string; name: string } }[];
  stock?: WarehouseStock[];
}

export interface WarehouseStock {
  id: string; warehouseId: string; productId: string;
  quantity: number; reservedQuantity: number; reorderLevel: number;
  lastUpdated: string; createdAt: string; updatedAt: string;
  product?: Product;
}

export interface PurchaseOrder {
  id: string; poNumber: string; supplierId: string;
  warehouseId?: string; branchId?: string; orderedBy: string; approvedBy?: string; createdBy?: string;
  status: string; paymentStatus: string; paymentTerms?: string;
  totalAmount: number; paidAmount: number; taxAmount: number; discountAmount: number;
  expectedDeliveryDate?: string; receivedDate?: string; notes?: string; batchId?: string;
  createdAt: string; updatedAt: string;
  supplier?: Supplier;
  warehouse?: { id: string; name: string; code: string };
  branch?: { id: string; name: string };
  orderedByUser?: { id: string; fullName: string };
  createdByUser?: { id: string; fullName: string };
  approvedByUser?: { id: string; fullName: string };
  items?: PurchaseOrderItem[];
  payments?: SupplierPayment[];
}

export interface PurchaseOrderItem {
  id: string; poId: string; productId: string;
  orderedQuantity: number; receivedQuantity: number;
  unitCost: number; subtotal: number;
  expiryDate?: string; notes?: string; status: string; createdAt: string;
  product?: Product;
}

export interface SupplierPayment {
  id: string; poId: string; supplierId: string; amount: number;
  paymentDate: string; paymentMethod: string; referenceNumber?: string;
  notes?: string; recordedBy: string; status: string; createdAt: string;
  supplier?: Supplier;
}

export interface StockTransfer {
  id: string; transferNumber: string; transferType: string;
  sourceBranchId?: string; sourceWarehouseId?: string; sourceSupplierId?: string;
  destBranchId?: string; destWarehouseId?: string; destSupplierId?: string;
  purchaseOrderId?: string; createdBy: string; approvedBy?: string;
  status: string; returnReason?: string; notes?: string; batchId?: string;
  expectedDate?: string; completedDate?: string; createdAt: string; updatedAt: string;
  sourceBranch?: { id: string; name: string };
  sourceWarehouse?: { id: string; name: string; code: string };
  sourceSupplier?: { id: string; name: string };
  destBranch?: { id: string; name: string };
  destWarehouse?: { id: string; name: string; code: string };
  destSupplier?: { id: string; name: string };
  items?: StockTransferItem[];
}

export interface StockTransferItem {
  id: string; transferId: string; productId: string; batchId?: string;
  requestedQuantity: number; approvedQuantity?: number; receivedQuantity?: number;
  unitCost?: number; expiryDate?: string; returnReason?: string; notes?: string; createdAt: string;
  product?: Product;
}

export interface ProductVariant {
  id: string; productId: string; variantType: string; variantValue: string;
  skuSuffix?: string; barcode?: string; priceModifier: number;
  status: string; createdAt: string; updatedAt: string;
}

export interface StockDiscrepancy {
  id: string; poId?: string; transferId?: string;
  supplierId: string; productId: string;
  expectedQuantity: number; receivedQuantity: number;
  discrepancyQuantity: number; unitCost: number; discrepancyValue: number;
  discrepancyType: string; // shortage | excess | damage | substitution
  status: string; // open | acknowledged | debit_note_raised | resolved
  notes?: string; createdAt: string; updatedAt: string;
  supplier?: { id: string; name: string };
  product?: Product;
}

export interface SupplierCreditNote {
  id: string; creditNoteNumber?: string;
  supplierId: string; poId?: string; transferId?: string; discrepancyId?: string;
  amount: number;
  creditType: string; // rts_return | damage_claim | shortage_claim | price_adjustment
  status: string; // draft | confirmed | applied | cancelled
  notes?: string; issuedDate: string; createdAt: string; updatedAt: string;
  supplier?: { id: string; name: string };
}

export interface DashboardMetrics {
  orders: {
    pending: number; processing: number; readyToDeliver: number;
    delivered: number; cancelled: number; totalToday: number;
    // % change vs the equivalent prior period (e.g. "today" vs yesterday)
    pendingDeltaPct: number; processingDeltaPct: number;
    readyToDeliverDeltaPct: number; deliveredDeltaPct: number;
  };
  sales: {
    totalToday: number;
    totalTodayDeltaPct: number;
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

// ─── Reports ─────────────────────────────────────────────────────────────────

export type ReportExportFormat = "csv" | "pdf";

export interface DailySalesHour {
  hour: number; transactions: number; grossSales: number; discounts: number; returns: number;
  netSales: number; vat: number; cash: number; card: number; wallet: number; avgBasket: number;
}
export interface DailySalesReport {
  kpis: { grossSales: number; netSales: number; transactions: number; avgBasket: number; vatCollected: number; returnsRefunds: number; tobaccoFees: number };
  hourly: DailySalesHour[];
  paymentSplit: { method: string; amount: number }[];
}

export interface MonthlyDayRow {
  date: string; transactions: number; grossSales: number; discounts: number; returns: number;
  netSales: number; vat: number; cogs: number; grossProfit: number; marginPct: number | null;
  avgBasket: number; previousPeriodSales: number | null; growthPct: number | null;
}
export interface MonthlySalesReport {
  kpis: { netSales: number; grossProfit: number; marginPct: number | null; transactions: number; returnValue: number; discountValue: number };
  daily: MonthlyDayRow[];
}

export interface CashierSalesRow {
  cashierId: string; cashierName: string; branch: string; shiftId: string;
  shiftStart: string; shiftEnd?: string; terminal: string; transactions: number;
  grossSales: number; discounts: number; returns: number; voids: number; netSales: number;
  cashExpected: number; cashCounted?: number; variance?: number;
}
export interface CashierSalesReport {
  kpis: { topCashier?: string; totalSales: number; cashVariance: number; returnCount: number; voidCount: number };
  rows: CashierSalesRow[];
}

export interface PaymentMethodRow {
  method: string; branch: string; transactions: number; grossAmount: number;
  netSettled: number; pendingAmount: number; status: string;
}
export interface PaymentMethodsReport {
  kpis: { cashCollected: number; cardSettled: number; walletAmount: number; pendingAmount: number; refundValue: number; paymentFees: number };
  rows: PaymentMethodRow[];
  refunds: { method: string; amount: number }[];
}

export interface LowStockRow {
  sku: string; productName: string; category: string; branch: string; availableQty: number;
  reorderLevel: number; recommendedReorderQty: number; preferredSupplier?: string;
  lastSoldDate?: string; urgency: "critical" | "low" | "ok"; estimatedReorderValue: number;
}
export interface LowStockReport {
  kpis: { lowStockSkus: number; criticalSkus: number; outOfStockSkus: number; estimatedReorderValue: number; affectedBranches: number; suppliersToContact: number };
  rows: LowStockRow[];
}

export interface InventorySnapshotRow {
  sku: string; productName: string; category: string; branch: string;
  onHandQty: number; reservedQty: number; availableQty: number; reorderLevel: number;
  costPrice: number; stockCostValue: number; retailValue: number;
  lastMovementDate: string; stockStatus: "negative" | "out of stock" | "low" | "in stock";
}
export interface InventorySnapshotReport {
  kpis: { totalStockValue: number; skuCount: number; availableQty: number; reservedQty: number; outOfStockSkus: number; negativeStockExceptions: number };
  rows: InventorySnapshotRow[];
  snapshotAt: string;
}

export interface BranchSalesRow {
  branchCode: string; branchName: string; city: string; openTerminals: number; transactions: number;
  grossSales: number; discounts: number; returns: number; netSales: number; vat: number; avgBasket: number;
  grossProfit: number; marginPct: number | null; rank: number;
}
export interface BranchSalesReport {
  kpis: { topBranch?: string; lowestBranch?: string; totalNetSales: number; averageBranchSales: number; totalReturns: number; overallMarginPct: number | null };
  rows: BranchSalesRow[];
}

export interface TerminalReportRow {
  terminalId: string; terminalName: string; branch: string; status: string; assignedCashier: string;
  transactions: number; netSales: number; refunds: number; uptimePct: number; lastSyncTime?: string;
}
export interface TerminalReport {
  kpis: { activeTerminals: number; offlineTerminals: number; terminalSales: number; avgUptimePct: number };
  rows: TerminalReportRow[];
}

export interface ProductSalesRow {
  sku: string; barcode: string; productName: string; category: string; brand: string; unitsSold: number;
  netSales: number; discounts: number; tobaccoFeeAmount: number; returnsQty: number; returnRatePct: number; cogs: number;
  grossProfit: number; marginPct: number | null; currentStock: number;
}
export interface ProductSalesReport {
  kpis: { topSku?: string; unitsSold: number; netSales: number; grossMarginPct: number | null; deadStockCount: number; returnRatePct: number; totalTobaccoFees: number };
  rows: ProductSalesRow[];
}

export interface CategoryPerformanceRow {
  categoryId: string; categoryName: string; parentCategory: string; skuCount: number; unitsSold: number;
  grossSales: number; discounts: number; returns: number; returnsQty: number; returnRatePct: number;
  netSales: number; salesContributionPct: number;
  cogs: number; grossProfit: number; marginPct: number | null;
}
export interface CategoryPerformanceReport {
  kpis: { topCategory?: string; highestMarginCategory?: string; categoryReturnRatePct: number; totalCategoriesSold: number; categoryDiscountValue: number };
  rows: CategoryPerformanceRow[];
}

export interface SupplierPerformanceRow {
  supplierId: string; supplierName: string; poCount: number; orderedQty: number; receivedQty: number;
  fillRatePct: number; averageLeadTimeDays: number; lateDeliveries: number; purchaseValue: number;
  outstandingDues: number; supplierReturnsQty: number; rtsValue: number; lastPoDate: string;
}
export interface SupplierPerformanceReport {
  kpis: { bestFillRatePct: number; averageLeadTimeDays: number; totalPurchaseValue: number; outstandingDues: number; rtsValue: number };
  rows: SupplierPerformanceRow[];
}

export interface WasteSpoilageRow {
  wasteId: string; dateTime: string; sku: string; productName: string; category: string; branch: string;
  qty: number; reason: string; costValue: number; notes?: string; batchNumber?: string; expiryDate?: string;
}
export interface WasteSpoilageReport {
  kpis: { totalWriteOffValue: number; expiredItems: number; damagedItems: number; topWasteCategory?: string; wastePctOfSales: number };
  rows: WasteSpoilageRow[];
}

export interface ReturnRefundRow {
  returnId: string; originalOrderId: string; invoiceNo: string; dateTime: string; branch: string; cashier: string; customer: string;
  returnType: string; reason: string; skus: string; qty: number; refundMethod: string; refundAmount: number; vatReversal: number;
  approvedBy: string; status: string;
}
export interface ReturnsRefundsReport {
  kpis: { returnCount: number; refundValue: number; vatReversed: number; topReturnReason?: string; highestReturnBranch?: string; refundsPending: number };
  rows: ReturnRefundRow[];
}

export interface AttendanceShiftRow {
  staffId: string; staffName: string; role: string; branch: string; shiftId: string; terminal: string;
  checkInTime?: string; shiftOpenTime: string; shiftCloseTime?: string; hoursWorked: number; openingFloat: number;
  expectedCash: number; countedCash?: number; variance?: number; status: string;
}
export interface AttendanceShiftReport {
  kpis: { openShifts: number; closedShifts: number; cashVariance: number; totalStaffHours: number; missingClosures: number };
  rows: AttendanceShiftRow[];
}

export interface AuditTrailRow {
  eventId: string; timestamp: string; severity: string; module: string; action: string; entityId: string;
  user: string; role: string; branch: string; ipAddress: string; beforeValue?: string; afterValue?: string;
}
export interface AuditTrailReport {
  kpis: { criticalEvents: number; failedLogins: number; overrideCount: number; configurationChanges: number; exportsGenerated: number };
  rows: AuditTrailRow[];
}

export interface DiscountRow {
  transactionId: string; invoiceNo: string; dateTime: string; branch: string; cashier: string; customerType: string;
  discountType: string; couponCode?: string; discountPct: number; discountAmount: number; netSalesAfterDiscount: number;
}
export interface DiscountsReport {
  kpis: { totalDiscountValue: number; manualDiscountValue: number; couponUsage: number; discountPctOfSales: number };
  rows: DiscountRow[];
}

export interface VatZatcaRow {
  invoiceNo: string; issueDateTime: string; branch: string; invoiceType: string; customerVatNo?: string;
  taxableAmount: number; vatAmount: number; totalWithVat: number; zatcaStatus: string;
}
export interface VatZatcaReport {
  kpis: { taxableSales: number; vatCollected: number; vatReversed: number; zatcaSuccess: number; zatcaPending: number; zatcaErrors: number };
  rows: VatZatcaRow[];
}

export interface TaxReportRow {
  branch: string; cashier: string; taxCode: string; taxType: string; taxRate: number; taxableAmount: number;
  taxAmount: number; zeroRatedAmount: number; exemptAmount: number; taxReversed: number; netTaxAmount: number; transactions: number;
}
export interface TaxReport {
  kpis: { totalTaxableAmount: number; vatAmount: number; zeroRatedSales: number; netTaxPayable: number };
  rows: TaxReportRow[];
}

export interface FeeRow {
  feeId: string; feeType: string; transactionId: string; invoiceNo: string; dateTime: string; branch: string;
  cashier: string; customerType: string; feeAmount: number; netFee: number;
}
export interface FeeReport {
  kpis: { totalFeesCollected: number; transactionsWithFees: number; averageFeePerTransaction: number; totalTobaccoFees: number };
  rows: FeeRow[];
}

export interface TobaccoExciseRow {
  sku: string; barcode: string; productName: string; brand: string; category: string; branch: string; employee: string;
  unitsSold: number; taxablePrice: number; exciseRate: number; exciseAmount: number; vatAmount: number;
  returnsQty: number; exciseReversal: number; netExcise: number; complianceStatus: string;
}
export interface TobaccoExciseReport {
  kpis: { exciseSalesValue: number; exciseTaxAmount: number; tobaccoUnitsSold: number; exciseRefunds: number; topTobaccoSku?: string; complianceExceptions: number };
  rows: TobaccoExciseRow[];
}

export interface ProfitMarginRow {
  groupKey: string; groupName: string; branch: string; unitsSold: number; netSales: number; cogs: number;
  grossProfit: number; marginPct: number | null; discountValue: number; returnImpact: number; netProfit: number; netMarginPct: number | null;
}
export interface ProfitMarginReport {
  kpis: { grossProfit: number; grossMarginPct: number | null; netMarginPct: number | null; lowMarginSkus: number; discountImpact: number; returnImpact: number };
  rows: ProfitMarginRow[];
}

export interface DetectedPrinter {
  uri: string;
  model: string;
  type: "usb" | "network";
  suggestedName: string;
}
