export const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

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
    // Strip raw HTML/JSON problem-details from user-visible messages
    let msg = text;
    try { msg = (JSON.parse(text) as { title?: string }).title ?? text; } catch { /* not JSON */ }
    throw new Error(msg || res.statusText);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
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
  receiveBatch: (data: Partial<InventoryBatch>) =>
    request<InventoryBatch>("/api/inventory/batches", { method: "POST", body: JSON.stringify(data) }),
  adjustInventory: (data: AdjustInventoryPayload) =>
    request<{ id: string }>("/api/inventory/adjustments", { method: "POST", body: JSON.stringify(data) }),
  getAdjustments: (params?: { branchId?: string; adjustmentType?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v))).toString();
    return request<InventoryAdjustment[]>(`/api/inventory/adjustments${q ? `?${q}` : ""}`);
  },

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

  // Cashier Shifts
  getShifts: (params?: { branchId?: string; status?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<CashierShift[]>(`/api/shifts${q ? `?${q}` : ""}`);
  },
  getActiveShifts: (branchId?: string) =>
    request<CashierShift[]>(`/api/shifts/active${branchId ? `?branchId=${branchId}` : ""}`),
  openShift: (data: OpenShiftPayload) =>
    request<CashierShift>("/api/shifts/open", { method: "POST", body: JSON.stringify(data) }),
  closeShift: (id: string, data: CloseShiftPayload) =>
    request<CashierShift>(`/api/shifts/${id}/close`, { method: "POST", body: JSON.stringify(data) }),

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
  addWarehouseSupplier: (warehouseId: string, data: { supplierId: string; isPrimary: boolean; notes?: string }) =>
    request<void>(`/api/warehouses/${warehouseId}/suppliers`, { method: "POST", body: JSON.stringify(data) }),
  removeWarehouseSupplier: (warehouseId: string, supplierId: string) =>
    request<void>(`/api/warehouses/${warehouseId}/suppliers/${supplierId}`, { method: "DELETE" }),
  addWarehouseBranch: (warehouseId: string, data: { branchId: string; isPrimary: boolean }) =>
    request<void>(`/api/warehouses/${warehouseId}/branches`, { method: "POST", body: JSON.stringify(data) }),
  removeWarehouseBranch: (warehouseId: string, branchId: string) =>
    request<void>(`/api/warehouses/${warehouseId}/branches/${branchId}`, { method: "DELETE" }),
  getWarehouseStock: (warehouseId: string) =>
    request<WarehouseStock[]>(`/api/warehouses/${warehouseId}/stock`),

  // Purchase Orders
  getPurchaseOrders: (params?: { supplierId?: string; warehouseId?: string; status?: string; paymentStatus?: string }) => {
    const filtered = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null)) as Record<string, string>;
    const q = new URLSearchParams(filtered).toString();
    return request<PurchaseOrder[]>(`/api/purchase-orders${q ? `?${q}` : ""}`);
  },
  getPurchaseOrder: (id: string) => request<PurchaseOrder>(`/api/purchase-orders/${id}`),
  getPurchaseOrderByNumber: (number: string) =>
    request<PurchaseOrder>(`/api/purchase-orders/by-number/${encodeURIComponent(number)}`),
  createPurchaseOrder: (data: Partial<PurchaseOrder>) =>
    request<PurchaseOrder>("/api/purchase-orders", { method: "POST", body: JSON.stringify(data) }),
  updatePoStatus: (id: string, status: string, approvedBy?: string) =>
    request<PurchaseOrder>(`/api/purchase-orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, approvedBy }) }),
  receivePurchaseOrder: (id: string, items: { productId: string; quantity: number; expiryDate?: string; batchNumber?: string }[]) =>
    request<PurchaseOrder>(`/api/purchase-orders/${id}/receive`, { method: "POST", body: JSON.stringify(items) }),
  addSupplierPayment: (poId: string, data: Partial<SupplierPayment>) =>
    request<SupplierPayment>(`/api/purchase-orders/${poId}/payments`, { method: "POST", body: JSON.stringify(data) }),

  // Stock Transfers
  getStockTransfers: (params?: { transferType?: string; status?: string; sourceWarehouseId?: string; destWarehouseId?: string }) => {
    const filtered = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null)) as Record<string, string>;
    const q = new URLSearchParams(filtered).toString();
    return request<StockTransfer[]>(`/api/stock-transfers${q ? `?${q}` : ""}`);
  },
  getStockTransfer: (id: string) => request<StockTransfer>(`/api/stock-transfers/${id}`),
  getStockTransferByNumber: (number: string) =>
    request<StockTransfer>(`/api/stock-transfers/by-number/${encodeURIComponent(number)}`),
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

  // Audit Logs
  getAuditLogs: (params?: { entityType?: string; page?: number }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<{ total: number; items: AuditLog[] }>(`/api/auditlogs${q ? `?${q}` : ""}`);
  },

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

  // Compliance rules
  getComplianceRules: (params?: { ruleType?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<ComplianceRule[]>(`/api/compliance/rules${q ? `?${q}` : ""}`);
  },
  createComplianceRule: (data: Partial<ComplianceRule>) =>
    request<ComplianceRule>("/api/compliance/rules", { method: "POST", body: JSON.stringify(data) }),

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
  createDiscount: (data: Partial<Discount>) =>
    request<Discount>("/api/discounts", { method: "POST", body: JSON.stringify(data) }),
  updateDiscount: (id: string, data: Partial<Discount>) =>
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
  getCreditNotes: (params?: { supplierId?: string; status?: string; creditType?: string }) => {
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
  status: string; weightBased: boolean; isTobacco: boolean;
  discount?: number; discountType?: "percentage" | "fixed";
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

export interface Order {
  id: string; orderNumber: string; source: string; branchId: string;
  customerId?: string; cashierId?: string; subtotal: number; discountAmount: number;
  taxAmount: number; totalAmount: number; paymentStatus: string; orderStatus: string;
  createdAt: string; items?: OrderItem[]; payments?: OrderPayment[];
  branch?: { id: string; name: string };
  cashier?: { id: string; fullName: string };
  customer?: { id: string; fullName: string; phone: string; email?: string };
}

export interface OrderItem {
  id?: string; productId: string; quantity: number; unitPrice: number; totalPrice: number;
  product?: { id: string; name: string; sku: string };
}

export interface OrderPayment {
  id?: string; paymentMethod: string; amount: number; status: string;
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
  phase2Enabled: boolean; environment: string; createdAt?: string; updatedAt?: string;
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

export interface Warehouse {
  id: string; code: string; name: string; nameAr?: string;
  address?: string; city?: string; capacity?: number;
  contactPerson?: string; contactNumber?: string; status: string;
  createdAt: string; updatedAt: string;
  warehouseSuppliers?: { id: string; supplierId: string; isPrimary: boolean; notes?: string; supplier?: Supplier }[];
  branchWarehouses?: { id: string; branchId: string; isPrimary: boolean; branch?: { id: string; name: string } }[];
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
  warehouseId?: string; branchId?: string; orderedBy: string; approvedBy?: string;
  status: string; paymentStatus: string; paymentTerms?: string;
  totalAmount: number; paidAmount: number; taxAmount: number; discountAmount: number;
  expectedDeliveryDate?: string; receivedDate?: string; notes?: string;
  createdAt: string; updatedAt: string;
  supplier?: Supplier;
  warehouse?: { id: string; name: string; code: string };
  branch?: { id: string; name: string };
  orderedByUser?: { id: string; fullName: string };
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
  status: string; returnReason?: string; notes?: string;
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
