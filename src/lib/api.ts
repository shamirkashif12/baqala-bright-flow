export const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
export const PRINTER_API_KEY = "baqala_printer_api_url";
export const DEFAULT_PRINTER_AGENT = "http://localhost:5008";
// Fired on window after a successful api.notify() so NotificationsPopover can refetch
// immediately instead of waiting for its poll interval.
export const NOTIFICATION_CREATED_EVENT = "baqala:notification-created";

export function getPrinterBase(): string {
  return (typeof window !== "undefined" ? localStorage.getItem(PRINTER_API_KEY) : null) ?? DEFAULT_PRINTER_AGENT;
}

// Direct-USB printer selection (QZ Tray qz.usb.* path). When set, it takes
// precedence over the named printer in QZ mode — used for thermal printers that
// won't show up as a named OS printer. Stores the resolved vendor/product/
// interface/endpoint plus a human label. See qz.ts qzPrintReceiptUsb.
const USB_PRINTER_KEY = "baqala_usb_printer";

export interface UsbPrinterSelection {
  vendorId: string;
  productId: string;
  interface: string;
  endpoint: string;
  label: string;
}

export function getUsbPrinter(): UsbPrinterSelection | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USB_PRINTER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UsbPrinterSelection;
  } catch {
    return null;
  }
}

export function setUsbPrinter(sel: UsbPrinterSelection | null) {
  if (sel) localStorage.setItem(USB_PRINTER_KEY, JSON.stringify(sel));
  else localStorage.removeItem(USB_PRINTER_KEY);
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
    let body: unknown;
    try {
      const parsed = JSON.parse(text) as { message?: string; title?: string };
      msg = parsed.message ?? parsed.title ?? text;
      body = parsed;
    } catch { /* not JSON */ }
    const err = new Error(msg || res.statusText) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = body;
    throw err;
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
    let body: unknown;
    try {
      const parsed = JSON.parse(text) as { message?: string; title?: string };
      msg = parsed.message ?? parsed.title ?? text;
      body = parsed;
    } catch { /* not JSON */ }
    const err = new Error(msg || res.statusText) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.blob();
}

// Array values are appended as repeated params (?key=a&key=b) — the convention ASP.NET Core's
// [FromQuery] Guid[]/string[] model binding expects for the standardized multi-select filters.
// An empty array is omitted entirely (no filter), matching a plain omitted single value.
function toQuery(params?: Record<string, string | number | boolean | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const v of value) if (v !== undefined && v !== "") q.append(key, v);
    } else {
      q.append(key, String(value));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const api = {
  logAccessDenied: (path: string) =>
    request<void>("/api/auditlogs/access-denied", { method: "POST", body: JSON.stringify({ path }) }).catch(() => {}),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }).catch(() => {}),

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
  // Always queues in the Approval Center (202, with a message and approvalRequestId) — no
  // self-approve bypass, even for a caller who holds Inventory:Approve. The product stays live
  // until a manager (someone other than whoever requested it) decides it.
  deleteProduct: (id: string, reason?: string) =>
    request<{ message: string; approvalRequestId: string }>(`/api/products/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }),

  // Pricing (FRD §12) — branch / customer-tier / scheduled / pack price rules.
  //
  // resolvePrices is the one the POS cares about: it returns the effective unit price for every
  // active product given a branch and (optionally) the cart's customer tier, plus any pack buying
  // options. Products with no rules come back at their basePrice, so callers can key the result by
  // productId and use it unconditionally.
  resolvePrices: (params?: { branchId?: string; customerTier?: string; priceType?: string; at?: string }) =>
    request<ResolvedPrice[]>(`/api/pricing/resolve${toQuery(params)}`),
  resolveProductPrice: (productId: string, params?: { branchId?: string; customerTier?: string; priceType?: string; at?: string }) =>
    request<ResolvedPrice>(`/api/pricing/resolve/${productId}${toQuery(params)}`),
  getPriceLists: (params?: { productId?: string; branchId?: string[]; priceType?: string; unitType?: "unit" | "pack"; isActive?: boolean }) =>
    request<ProductPriceList[]>(`/api/pricing/lists${toQuery(params)}`),
  createPriceList: (data: PriceListPayload) =>
    request<ProductPriceList>("/api/pricing/lists", { method: "POST", body: JSON.stringify(data) }),
  // One round trip, all-or-nothing — what the Add Product dialog posts when several branches each
  // get their own price, so a partial failure can't leave a product priced in some branches only.
  createPriceListsBulk: (rules: PriceListPayload[]) =>
    request<ProductPriceList[]>("/api/pricing/lists/bulk", { method: "POST", body: JSON.stringify({ rules }) }),
  updatePriceList: (id: string, data: PriceListPayload) =>
    request<ProductPriceList>(`/api/pricing/lists/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  togglePriceList: (id: string) =>
    request<ProductPriceList>(`/api/pricing/lists/${id}/toggle`, { method: "PATCH" }),
  deletePriceList: (id: string) =>
    request<void>(`/api/pricing/lists/${id}`, { method: "DELETE" }),

  // Recalls (FRD §13)
  //
  // The product ids a till must refuse to sell, for the POS's scan-time block. Separate from
  // getRecalls because that one is gated on Batches:View, which the Cashier role does not have —
  // the POS would 403, silently never block, and collect an "Unauthorized Action Attempt" warning
  // on every load. Lot-scoped recalls are resolved against on-hand stock server-side.
  getBlockedProducts: (branchId?: string) =>
    request<Array<{ productId: string; recallNumber: string }>>(`/api/recalls/blocked-products${toQuery({ branchId })}`),
  getRecalls: (params?: { productId?: string; branchId?: string; batchId?: string; status?: "open" | "closed"; severity?: string }) =>
    request<ProductRecall[]>(`/api/recalls${toQuery(params)}`),
  getRecall: (id: string) => request<ProductRecall>(`/api/recalls/${id}`),
  // What's still on the shelf and who already bought the recalled lot.
  getRecallImpact: (id: string) => request<RecallImpact>(`/api/recalls/${id}/impact`),
  createRecall: (data: RecallPayload) =>
    request<ProductRecall>("/api/recalls", { method: "POST", body: JSON.stringify(data) }),
  updateRecall: (id: string, data: Partial<Pick<RecallPayload, "reason" | "recallType" | "severity" | "notes">>) =>
    request<ProductRecall>(`/api/recalls/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  // Withdraws the recalled stock, writing ordinary "damage" adjustments so it lands in the
  // Wastage report and the movement timeline like any other write-off.
  quarantineRecall: (id: string) =>
    request<{ id: string; recallNumber: string; quarantined: number; quantityQuarantined: number }>(
      `/api/recalls/${id}/quarantine`, { method: "POST" }),
  closeRecall: (id: string, resolution?: string) =>
    request<ProductRecall>(`/api/recalls/${id}/close`, { method: "POST", body: JSON.stringify({ resolution }) }),

  // Categories
  getCategories: () => request<Category[]>("/api/categories"),
  createCategory: (data: Partial<Category>) =>
    request<Category>("/api/categories", { method: "POST", body: JSON.stringify(data) }),
  updateCategory: (id: string, data: Partial<Category>) =>
    request<Category>(`/api/categories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  // Always queues in the Approval Center — same no-bypass rule as deleteProduct above.
  deleteCategory: (id: string, reason?: string) =>
    request<{ message: string; approvalRequestId: string }>(`/api/categories/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }),

  // Inventory
  getStock: (params?: { branchId?: string; lowStock?: boolean; categoryId?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<InventoryStock[]>(`/api/inventory/stock${q ? `?${q}` : ""}`);
  },
  // Only succeeds once the row is fully zeroed (on-hand and reserved) with no open batches —
  // the backend returns 409 with a message otherwise, which the caller surfaces as-is (it
  // already explains the stock needs transferring out first).
  deleteInventoryStock: (id: string) =>
    request<void>(`/api/inventory/stock/${id}`, { method: "DELETE" }),
  getBatches: (params?: { branchId?: string[]; warehouseId?: string[]; productId?: string; status?: string[]; locationType?: "branch" | "warehouse" }) =>
    request<InventoryBatch[]>(`/api/inventory/batches${toQuery(params)}`),
  getExpiringBatches: (branchId?: string, daysAhead = 30, warehouseId?: string) => {
    const q = new URLSearchParams({ ...(branchId && { branchId }), ...(warehouseId && { warehouseId }), daysAhead: String(daysAhead) }).toString();
    return request<InventoryBatch[]>(`/api/inventory/batches/expiring?${q}`);
  },
  receiveBatch: (data: ReceiveBatchPayload) =>
    request<InventoryBatch>("/api/inventory/batches", { method: "POST", body: JSON.stringify(data) }),
  adjustInventory: (data: AdjustInventoryPayload) =>
    request<{ id: string }>("/api/inventory/adjustments", { method: "POST", body: JSON.stringify(data) }),
  getAdjustments: (params?: { branchId?: string; warehouseId?: string; batchId?: string; adjustmentType?: string; productId?: string; adjustedBy?: string; approvalStatus?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v))).toString();
    return request<InventoryAdjustment[]>(`/api/inventory/adjustments${q ? `?${q}` : ""}`);
  },
  // Sign-off on a held write-off (FRD §2.3). A pending write-off hasn't touched stock: APPROVE
  // applies the deduction now; REJECT leaves stock on hand. (Legacy rows deducted before gating
  // shipped are given back via a compensating movement on reject.) Reason is required to reject.
  reviewAdjustment: (id: string, approved: boolean, reason?: string) =>
    request<InventoryAdjustment>(`/api/inventory/adjustments/${id}/approval`, {
      method: "PATCH", body: JSON.stringify({ approved, reason }),
    }),
  getStockMovements: (params?: { productId?: string; branchId?: string[]; warehouseId?: string; batchId?: string; movementType?: string; from?: string; to?: string; limit?: number }) =>
    request<StockMovement[]>(`/api/inventory/movements${toQuery(params)}`),

  // Stock Counts (Stocking Review)
  getStockCounts: (params?: { branchId?: string; warehouseId?: string; status?: string }) =>
    request<StockCount[]>(`/api/stock-counts${toQuery(params)}`),
  getStockCount: (id: string) => request<StockCount>(`/api/stock-counts/${id}`),
  // countType records WHY the count is being run (review | audit | reconciliation) — the FRD's
  // three filters read it back. Optional: omitting it records no intent rather than guessing one.
  // Exactly one of branchId/warehouseId.
  startStockCount: (data: { branchId?: string; warehouseId?: string; categoryId?: string; startedBy?: string; notes?: string; countType?: string }) =>
    request<StockCount>("/api/stock-counts", { method: "POST", body: JSON.stringify(data) }),
  recordStockCount: (id: string, data: { productId: string; countedQuantity: number }) =>
    request<StockCountItem>(`/api/stock-counts/${id}/count`, { method: "POST", body: JSON.stringify(data) }),
  // Closes counting and submits for review — no longer applies stock. Status moves to pending_review.
  completeStockCount: (id: string, completedBy?: string) =>
    request<StockCount>(`/api/stock-counts/${id}/complete`, { method: "POST", body: JSON.stringify({ completedBy }) }),
  // First sign-off: approved moves pending_review -> pending_approval; rejecting ends the session
  // with stock untouched. A rejection reason is required when approved is false.
  reviewStockCount: (id: string, data: { approved: boolean; reason?: string }) =>
    request<StockCount>(`/api/stock-counts/${id}/review`, { method: "PATCH", body: JSON.stringify(data) }),
  // Final sign-off: approving now applies the counted variance to on-hand stock and moves the
  // session to "approved". Rejecting is a no-op on stock — nothing was ever applied.
  approveStockCount: (id: string, data: { approved: boolean; reason?: string }) =>
    request<StockCount>(`/api/stock-counts/${id}/approve`, { method: "PATCH", body: JSON.stringify(data) }),
  cancelStockCount: (id: string) =>
    request<StockCount>(`/api/stock-counts/${id}/cancel`, { method: "PATCH" }),

  // Orders
  getOrders: (params?: { branchId?: string[]; status?: string[]; paymentStatus?: string[]; from?: string; to?: string }) =>
    request<Order[]>(`/api/orders${toQuery(params)}`),
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
  getShifts: (params?: { branchId?: string[]; cashierId?: string; terminalId?: string[]; status?: string[]; dateFrom?: string; dateTo?: string }) =>
    request<CashierShift[]>(`/api/shifts${toQuery(params)}`),
  getActiveShifts: (branchId?: string) =>
    request<CashierShift[]>(`/api/shifts/active${branchId ? `?branchId=${branchId}` : ""}`),
  openShift: (data: OpenShiftPayload) =>
    request<CashierShift>("/api/shifts/open", { method: "POST", body: JSON.stringify(data) }),
  closeShift: (id: string, data: CloseShiftPayload) =>
    request<CashierShift>(`/api/shifts/${id}/close`, { method: "POST", body: JSON.stringify(data) }),
  approveVariance: (id: string) =>
    request<CashierShift>(`/api/shifts/${id}/approve-variance`, { method: "POST" }),

  // Terminals
  getTerminals: (params?: { branchId?: string[]; status?: string[] }) =>
    request<Terminal[]>(`/api/terminals${toQuery(params)}`),
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
  // Same one-time-set shape as the pairing secret above — no "view current PIN" endpoint.
  setKioskLockdownPin: (id: string, pin: string) =>
    request<{ setAt: string; length: number }>(`/api/terminals/${id}/kiosk-lockdown-pin`, { method: "POST", body: JSON.stringify({ pin }) }),
  clearKioskLockdownPin: (id: string) =>
    request<void>(`/api/terminals/${id}/kiosk-lockdown-pin`, { method: "DELETE" }),

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
  getSupplierDocuments: (supplierId: string) => request<SupplierDocument[]>(`/api/suppliers/${supplierId}/documents`),
  uploadSupplierDocument: (supplierId: string, data: Partial<SupplierDocument>) =>
    request<SupplierDocument>(`/api/suppliers/${supplierId}/documents`, { method: "POST", body: JSON.stringify(data) }),
  deleteSupplierDocument: (supplierId: string, documentId: string) =>
    request<void>(`/api/suppliers/${supplierId}/documents/${documentId}`, { method: "DELETE" }),

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

  // Loyalty Program
  getLoyaltyPrograms: (branchId?: string) =>
    request<LoyaltyProgram[]>(`/api/loyalty/programs${branchId ? `?branchId=${branchId}` : ""}`),
  getLoyaltyProgram: (id: string) =>
    request<LoyaltyProgram>(`/api/loyalty/programs/${id}`),
  getEffectiveLoyaltyProgram: (branchId: string) =>
    request<LoyaltyProgram>(`/api/loyalty/programs/effective/${branchId}`),
  createLoyaltyProgram: (data: Partial<LoyaltyProgram>) =>
    request<LoyaltyProgram>("/api/loyalty/programs", { method: "POST", body: JSON.stringify(data) }),
  updateLoyaltyProgram: (id: string, data: Partial<LoyaltyProgram>) =>
    request<LoyaltyProgram>(`/api/loyalty/programs/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteLoyaltyProgram: (id: string) =>
    request<void>(`/api/loyalty/programs/${id}`, { method: "DELETE" }),
  // Public, unauthenticated — the branded loyalty landing page (no bearer token attached; request()
  // only adds an Authorization header when one exists in localStorage, so these still work signed-out).
  getPublicLoyaltyProgram: (branchId: string) =>
    request<PublicLoyaltyProgram>(`/api/loyalty/public/${branchId}`),
  lookupPublicLoyalty: (branchId: string, phone: string) =>
    request<PublicLoyaltyLookup>(`/api/loyalty/public/${branchId}/lookup?phone=${encodeURIComponent(phone)}`),
  getLoyaltyReport: (params?: { from?: string; to?: string; branchId?: string }) =>
    request<LoyaltyReportResult>(`/api/reports/loyalty${toQuery(params)}`),
  exportLoyaltyReport: (params?: { from?: string; to?: string; branchId?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/loyalty/export${toQuery(params)}`),
  exportLoyaltyCustomersReport: (params?: { from?: string; to?: string; branchId?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/loyalty/customers/export${toQuery(params)}`),

  // Finance
  getExpenses: (params?: { branchId?: string[]; status?: string; paymentMethod?: string; expenseTypeId?: string }) =>
    request<Expense[]>(`/api/finance/expenses${toQuery(params)}`),
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
  getWarehouseRequests: (params?: { branchId?: string; approvalStatus?: string[]; deliveryStatus?: string[] }) =>
    request<WarehouseRequest[]>(`/api/warehouse/requests${toQuery(params)}`),
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
  getPurchaseOrders: (params?: { supplierId?: string; warehouseId?: string; branchId?: string; createdBy?: string[]; approvedBy?: string[]; productId?: string; status?: string[]; paymentStatus?: string }) =>
    request<PurchaseOrder[]>(`/api/purchase-orders${toQuery(params)}`),
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
  // branchId/warehouseId match a transfer at EITHER end (source or destination); the directional
  // source*/dest* params remain for the Sending/Receiving Warehouse filters that mean one side.
  getStockTransfers: (params?: { transferType?: string; status?: string[]; sourceWarehouseId?: string; destWarehouseId?: string; sourceBranchId?: string; destBranchId?: string; purchaseOrderId?: string; sourceSupplierId?: string; branchId?: string[]; warehouseId?: string[]; productId?: string[]; createdBy?: string[]; approvedBy?: string[] }) =>
    request<StockTransfer[]>(`/api/stock-transfers${toQuery(params)}`),
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
  getReturns: (params?: { branchId?: string[]; status?: string[] }) =>
    request<CustomerReturn[]>(`/api/returns${toQuery(params)}`),
  createReturn: (data: Partial<CustomerReturn>) =>
    request<CustomerReturn>("/api/returns", { method: "POST", body: JSON.stringify(data) }),
  approveReturn: (id: string, approved: boolean) =>
    request<CustomerReturn>(`/api/returns/${id}/approve`, { method: "PATCH", body: JSON.stringify({ approved }) }),
  completeReturn: (id: string) =>
    request<CustomerReturn>(`/api/returns/${id}/complete`, { method: "PATCH", body: JSON.stringify({}) }),

  // Approval Center
  getApprovals: (params?: { status?: string; type?: string; branchId?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")) as Record<string, string>).toString();
    return request<ApprovalRow[]>(`/api/approvals${q ? `?${q}` : ""}`);
  },
  decideApproval: (id: string, approved: boolean, reason?: string) =>
    request<ApprovalRow>(`/api/approvals/${id}/decision`, { method: "POST", body: JSON.stringify({ approved, reason }) }),

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
  getCompanyProfile: () => request<CompanyProfile>("/api/compliance/company-profile"),
  updateCompanyProfile: (data: Partial<CompanyProfile>) =>
    request<CompanyProfile>("/api/compliance/company-profile", { method: "PUT", body: JSON.stringify(data) }),
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
  getAuditLogs: (params?: {
    userId?: string; entityType?: string; entityId?: string; action?: string;
    severity?: string; from?: string; to?: string; page?: number; pageSize?: number;
  }) => {
    const q = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params ?? {})
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
    return request<{ total: number; page: number; pageSize: number; items: AuditLog[] }>(`/api/auditlogs${q ? `?${q}` : ""}`);
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
  getDailySalesReport: (params?: { date?: string; branchId?: string; terminalId?: string; cashierId?: string; paymentMethod?: string; orderStatus?: string; customerType?: string; hasTobaccoFee?: boolean }) =>
    request<DailySalesReport>(`/api/reports/daily-sales${toQuery(params)}`),
  exportDailySalesReport: (params?: { date?: string; branchId?: string; terminalId?: string; cashierId?: string; paymentMethod?: string; orderStatus?: string; customerType?: string; hasTobaccoFee?: boolean; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/daily-sales/export${toQuery(params)}`),

  getMonthlySalesReport: (params?: { from?: string; to?: string; branchId?: string; categoryId?: string; cashierId?: string; terminalId?: string; productId?: string; hasTobaccoFee?: boolean; comparePrevious?: boolean }) =>
    request<MonthlySalesReport>(`/api/reports/monthly-sales${toQuery(params)}`),
  exportMonthlySalesReport: (params?: { from?: string; to?: string; branchId?: string; categoryId?: string; cashierId?: string; terminalId?: string; productId?: string; hasTobaccoFee?: boolean; comparePrevious?: boolean; exportedBy?: string; includeMargin?: boolean; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/monthly-sales/export${toQuery(params)}`),

  getCashierSalesReport: (params?: { from?: string; to?: string; branchId?: string; cashierId?: string; terminalId?: string }) =>
    request<CashierSalesReport>(`/api/reports/cashier-sales${toQuery(params)}`),
  exportCashierSalesReport: (params?: { from?: string; to?: string; branchId?: string; cashierId?: string; terminalId?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/cashier-sales/export${toQuery(params)}`),

  getPaymentMethodsReport: (params?: { from?: string; to?: string; branchId?: string; terminalId?: string; cashierId?: string; paymentMethod?: string; hasTobaccoFee?: boolean }) =>
    request<PaymentMethodsReport>(`/api/reports/payment-methods${toQuery(params)}`),
  exportPaymentMethodsReport: (params?: { from?: string; to?: string; branchId?: string; terminalId?: string; cashierId?: string; paymentMethod?: string; hasTobaccoFee?: boolean; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/payment-methods/export${toQuery(params)}`),

  getLowStockReport: (params?: { branchId?: string[]; categoryId?: string[]; productId?: string[]; isTobacco?: boolean; onlyLowStock?: boolean }) =>
    request<LowStockReport>(`/api/reports/low-stock${toQuery(params)}`),
  exportLowStockReport: (params?: { branchId?: string[]; categoryId?: string[]; productId?: string[]; isTobacco?: boolean; onlyLowStock?: boolean; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/low-stock/export${toQuery(params)}`),

  getInventorySnapshotReport: (params?: { branchId?: string[]; categoryId?: string[]; productId?: string[]; isTobacco?: boolean; warehouseId?: string[]; locationType?: string }) =>
    request<InventorySnapshotReport>(`/api/reports/inventory-snapshot${toQuery(params)}`),
  exportInventorySnapshotReport: (params?: { branchId?: string[]; categoryId?: string[]; productId?: string[]; isTobacco?: boolean; exportedBy?: string; format?: ReportExportFormat; warehouseId?: string[]; locationType?: string }) =>
    requestBlob(`/api/reports/inventory-snapshot/export${toQuery(params)}`),
  getInventorySnapshotScope: () =>
    request<InventorySnapshotScope>("/api/reports/inventory-snapshot/scope"),

  getInventoryDashboardReport: (params?: { from?: string; to?: string; branchId?: string[]; warehouseId?: string[]; categoryId?: string[]; locationType?: string; moverLimit?: number }) =>
    request<InventoryDashboardReport>(`/api/reports/inventory-dashboard${toQuery(params)}`),

  // FRD §2.1 — the "Stock Review" / "Stock Audit" / "Inventory Reconciliation" filters all describe
  // StockCount sessions, which are one report. countedBy matches either end of a session (whoever
  // started it or completed it).
  // countType: review | audit | reconciliation | unspecified — the FRD's three named filters, plus
  // sessions that predate the column.
  getStockReconciliationReport: (params?: { from?: string; to?: string; branchId?: string[]; warehouseId?: string[]; productId?: string[]; categoryId?: string[]; countedBy?: string[]; status?: string[]; varianceOnly?: boolean; countType?: string }) =>
    request<StockReconciliationReport>(`/api/reports/stock-reconciliation${toQuery(params)}`),
  exportStockReconciliationReport: (params?: { from?: string; to?: string; branchId?: string[]; warehouseId?: string[]; productId?: string[]; categoryId?: string[]; countedBy?: string[]; status?: string[]; varianceOnly?: boolean; countType?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/stock-reconciliation/export${toQuery(params)}`),

  getProductPerformanceReport: (params?: { from?: string; to?: string; branchId?: string[]; warehouseId?: string[]; categoryId?: string[]; productId?: string[] }) =>
    request<ProductPerformanceReport>(`/api/reports/inventory-aging-performance${toQuery(params)}`),
  exportProductPerformanceReport: (params?: { from?: string; to?: string; branchId?: string[]; warehouseId?: string[]; categoryId?: string[]; productId?: string[]; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/inventory-aging-performance/export${toQuery(params)}`),

  getBranchSalesReport: (params?: { from?: string; to?: string; city?: string; branchId?: string; customerType?: string; cashierId?: string; terminalId?: string; productId?: string; categoryId?: string; hasTobaccoFee?: boolean }) =>
    request<BranchSalesReport>(`/api/reports/branch-sales${toQuery(params)}`),
  exportBranchSalesReport: (params?: { from?: string; to?: string; city?: string; branchId?: string; customerType?: string; cashierId?: string; terminalId?: string; productId?: string; categoryId?: string; hasTobaccoFee?: boolean; exportedBy?: string; includeMargin?: boolean; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/branch-sales/export${toQuery(params)}`),

  getTerminalReport: (params?: { from?: string; to?: string; branchId?: string; terminalId?: string; cashierId?: string; status?: string; hasTobaccoFee?: boolean }) =>
    request<TerminalReport>(`/api/reports/terminal${toQuery(params)}`),
  exportTerminalReport: (params?: { from?: string; to?: string; branchId?: string; terminalId?: string; cashierId?: string; status?: string; hasTobaccoFee?: boolean; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/terminal/export${toQuery(params)}`),

  getProductSalesReport: (params?: { from?: string; to?: string; branchId?: string; categoryId?: string; productId?: string; search?: string; cashierId?: string; hasTobaccoFee?: boolean }) =>
    request<ProductSalesReport>(`/api/reports/product-sales${toQuery(params)}`),
  exportProductSalesReport: (params?: { from?: string; to?: string; branchId?: string; categoryId?: string; productId?: string; search?: string; cashierId?: string; hasTobaccoFee?: boolean; exportedBy?: string; includeMargin?: boolean; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/product-sales/export${toQuery(params)}`),

  getCategoryPerformanceReport: (params?: { from?: string; to?: string; branchId?: string; categoryId?: string; cashierId?: string; terminalId?: string; productId?: string; hasTobaccoFee?: boolean }) =>
    request<CategoryPerformanceReport>(`/api/reports/category-performance${toQuery(params)}`),
  exportCategoryPerformanceReport: (params?: { from?: string; to?: string; branchId?: string; categoryId?: string; cashierId?: string; terminalId?: string; productId?: string; hasTobaccoFee?: boolean; exportedBy?: string; includeMargin?: boolean; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/category-performance/export${toQuery(params)}`),

  getSupplierPerformanceReport: (params?: { from?: string; to?: string; supplierId?: string[]; branchId?: string[]; productId?: string[]; createdBy?: string[]; approvedBy?: string[] }) =>
    request<SupplierPerformanceReport>(`/api/reports/supplier-performance${toQuery(params)}`),
  exportSupplierPerformanceReport: (params?: { from?: string; to?: string; supplierId?: string[]; branchId?: string[]; productId?: string[]; createdBy?: string[]; approvedBy?: string[]; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/supplier-performance/export${toQuery(params)}`),

  getSupplierReturnsReport: (params?: { from?: string; to?: string; supplierId?: string[]; warehouseId?: string[]; branchId?: string[]; status?: string[]; reason?: string }) =>
    request<SupplierReturnsReportRow[]>(`/api/reports/supplier-returns${toQuery(params)}`),
  exportSupplierReturnsReport: (params?: { from?: string; to?: string; supplierId?: string[]; warehouseId?: string[]; branchId?: string[]; status?: string[]; reason?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/supplier-returns/export${toQuery(params)}`),

  getStockTransferReport: (params?: { from?: string; to?: string; transferType?: string; status?: string[]; sourceBranchId?: string[]; sourceWarehouseId?: string[]; destBranchId?: string[]; destWarehouseId?: string[]; productId?: string[]; createdBy?: string[]; approvedBy?: string[] }) =>
    request<StockTransferReportRow[]>(`/api/reports/stock-transfer-report${toQuery(params)}`),
  exportStockTransferReport: (params?: { from?: string; to?: string; transferType?: string; status?: string[]; sourceBranchId?: string[]; sourceWarehouseId?: string[]; destBranchId?: string[]; destWarehouseId?: string[]; productId?: string[]; createdBy?: string[]; approvedBy?: string[]; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/stock-transfer-report/export${toQuery(params)}`),

  getPurchaseOrderReport: (params?: { from?: string; to?: string; supplierId?: string[]; branchId?: string[]; warehouseId?: string[]; status?: string[]; createdBy?: string[]; approvedBy?: string[]; productId?: string[] }) =>
    request<PurchaseOrderReportRow[]>(`/api/reports/purchase-order-report${toQuery(params)}`),
  exportPurchaseOrderReport: (params?: { from?: string; to?: string; supplierId?: string[]; branchId?: string[]; warehouseId?: string[]; status?: string[]; createdBy?: string[]; approvedBy?: string[]; productId?: string[]; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/purchase-order-report/export${toQuery(params)}`),

  getEmployeeAuditCenter: (params?: { from?: string; to?: string; branchId?: string[]; employeeId?: string[]; category?: string[]; search?: string }) =>
    request<EmployeeAuditRow[]>(`/api/reports/employee-audit-center${toQuery(params)}`),
  exportEmployeeAuditCenter: (params?: { from?: string; to?: string; branchId?: string[]; employeeId?: string[]; category?: string[]; search?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/employee-audit-center/export${toQuery(params)}`),

  getWasteSpoilageReport: (params?: { from?: string; to?: string; branchId?: string[]; reason?: string; productId?: string[]; categoryId?: string[]; adjustedBy?: string[]; isTobacco?: boolean; warehouseId?: string[]; approvedBy?: string[]; approvalStatus?: string[] }) =>
    request<WasteSpoilageReport>(`/api/reports/waste-spoilage${toQuery(params)}`),
  exportWasteSpoilageReport: (params?: { from?: string; to?: string; branchId?: string[]; reason?: string; productId?: string[]; categoryId?: string[]; adjustedBy?: string[]; isTobacco?: boolean; exportedBy?: string; includeCost?: boolean; format?: ReportExportFormat; warehouseId?: string[]; approvedBy?: string[]; approvalStatus?: string[] }) =>
    requestBlob(`/api/reports/waste-spoilage/export${toQuery(params)}`),

  getReturnsRefundsReport: (params?: { from?: string; to?: string; branchId?: string; refundMethod?: string; status?: string; customerType?: string; reason?: string; productId?: string; processedBy?: string }) =>
    request<ReturnsRefundsReport>(`/api/reports/returns-refunds${toQuery(params)}`),
  exportReturnsRefundsReport: (params?: { from?: string; to?: string; branchId?: string; refundMethod?: string; status?: string; customerType?: string; reason?: string; productId?: string; processedBy?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/returns-refunds/export${toQuery(params)}`),

  getAttendanceShiftReport: (params?: { from?: string; to?: string; branchId?: string; staffId?: string; status?: string; roleId?: string; terminalId?: string }) =>
    request<AttendanceShiftReport>(`/api/reports/attendance-shift${toQuery(params)}`),
  exportAttendanceShiftReport: (params?: { from?: string; to?: string; branchId?: string; staffId?: string; status?: string; roleId?: string; terminalId?: string; exportedBy?: string; format?: ReportExportFormat }) =>
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
    request<FeeReport>(`/api/reports/service-charges${toQuery(params)}`),
  exportFeeReport: (params?: { from?: string; to?: string; branchId?: string; cashierId?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/reports/service-charges/export${toQuery(params)}`),

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
    vatNumber?: string; crNumber?: string; customerName?: string; paymentMethod?: string;
    items: { name: string; qty: number; price: number }[];
    subtotal: number; discount: number; vat: number; total: number; taxLabel: string;
    loyaltyPointsRedeemed?: number; loyaltyDiscountAmount?: number;
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
  // Returns the direct URL to download the one-click POS Setup installer (OS-specific). Passes
  // this page's own origin explicitly — the endpoint otherwise falls back to the configured
  // PosUrl, which silently drifts out of sync if this app is ever served from elsewhere.
  setupInstallerUrl: () => `${BASE}/api/printer/setup-installer?origin=${encodeURIComponent(window.location.origin)}`,
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

  // Employees (HRM)
  getEmployees: (params?: { branchId?: string[]; departmentId?: string[]; designationId?: string[]; roleId?: string[]; status?: string[]; search?: string }) =>
    request<Employee[]>(`/api/employees${toQuery(params)}`),
  getEmployee: (id: string) => request<Employee>(`/api/employees/${id}`),
  createEmployee: (data: Partial<Employee>) =>
    request<Employee>("/api/employees", { method: "POST", body: JSON.stringify(data) }),
  updateEmployee: (id: string, data: Partial<Employee>) =>
    request<Employee>(`/api/employees/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteEmployee: (id: string) => request<void>(`/api/employees/${id}`, { method: "DELETE" }),
  exportEmployees: (params?: { branchId?: string; departmentId?: string; designationId?: string; roleId?: string; status?: string; search?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/employees/export${toQuery(params)}`),

  // Departments (HRM)
  getDepartments: (params?: { branchId?: string; status?: string; search?: string }) =>
    request<Department[]>(`/api/departments${toQuery(params)}`),
  createDepartment: (data: Partial<Department>) =>
    request<Department>("/api/departments", { method: "POST", body: JSON.stringify(data) }),
  updateDepartment: (id: string, data: Partial<Department>) =>
    request<Department>(`/api/departments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDepartment: (id: string) => request<void>(`/api/departments/${id}`, { method: "DELETE" }),

  // Designations (HRM)
  getDesignations: (params?: { departmentId?: string; status?: string; search?: string }) =>
    request<Designation[]>(`/api/designations${toQuery(params)}`),
  createDesignation: (data: Partial<Designation>) =>
    request<Designation>("/api/designations", { method: "POST", body: JSON.stringify(data) }),
  updateDesignation: (id: string, data: Partial<Designation>) =>
    request<Designation>(`/api/designations/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDesignation: (id: string) => request<void>(`/api/designations/${id}`, { method: "DELETE" }),

  // Holidays (HRM)
  getHolidays: (params?: { branchId?: string; year?: number; holidayType?: string; status?: string; search?: string }) =>
    request<Holiday[]>(`/api/holidays${toQuery(params)}`),
  createHoliday: (data: Partial<Holiday>) =>
    request<Holiday>("/api/holidays", { method: "POST", body: JSON.stringify(data) }),
  updateHoliday: (id: string, data: Partial<Holiday>) =>
    request<Holiday>(`/api/holidays/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteHoliday: (id: string) => request<void>(`/api/holidays/${id}`, { method: "DELETE" }),

  // Work Shifts (HRM)
  getWorkShifts: (params?: { branchId?: string; departmentId?: string; status?: string }) =>
    request<WorkShift[]>(`/api/work-shifts${toQuery(params)}`),
  getWorkShift: (id: string) => request<WorkShift>(`/api/work-shifts/${id}`),
  createWorkShift: (data: Partial<WorkShift>) =>
    request<WorkShift>("/api/work-shifts", { method: "POST", body: JSON.stringify(data) }),
  updateWorkShift: (id: string, data: Partial<WorkShift>) =>
    request<WorkShift>(`/api/work-shifts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteWorkShift: (id: string) => request<void>(`/api/work-shifts/${id}`, { method: "DELETE" }),
  assignWorkShift: (id: string, data: { employeeIds: string[]; effectiveFrom: string; effectiveTo?: string; override?: boolean }) =>
    request<{ assigned: number }>(`/api/work-shifts/${id}/assign`, { method: "POST", body: JSON.stringify(data) }),
  getEmployeeShiftHistory: (employeeId: string) =>
    request<EmployeeShiftAssignment[]>(`/api/employees/${employeeId}/shifts`),
  getWorkShiftAssignments: (params?: { status?: string }) =>
    request<{ id: string; employeeId: string; shiftId: string; effectiveFrom: string; effectiveTo?: string; status: string }[]>(`/api/work-shifts/assignments${toQuery(params)}`),

  // HRM Attendance
  getHrAttendance: (params?: { branchId?: string[]; departmentId?: string[]; employeeId?: string[]; shiftId?: string[]; status?: string[]; dateFrom?: string; dateTo?: string; correctionStatus?: string }) =>
    request<StaffAttendance[]>(`/api/hrm/attendance${toQuery(params)}`),
  markAttendance: (data: { employeeId: string; date: string; shiftId?: string; checkInTime?: string; checkOutTime?: string; status: string; remarks?: string }) =>
    request<StaffAttendance>("/api/hrm/attendance", { method: "POST", body: JSON.stringify(data) }),
  correctAttendance: (id: string, data: { shiftId?: string; checkInTime?: string; checkOutTime?: string; status: string; correctionReason: string; correctionNote?: string }) =>
    request<StaffAttendance>(`/api/hrm/attendance/${id}/correction`, { method: "POST", body: JSON.stringify(data) }),

  // Leave (HRM)
  getLeaveTypes: (params?: { status?: string }) => request<LeaveType[]>(`/api/leave-types${toQuery(params)}`),
  createLeaveType: (data: Partial<LeaveType>) => request<LeaveType>("/api/leave-types", { method: "POST", body: JSON.stringify(data) }),
  updateLeaveType: (id: string, data: Partial<LeaveType>) => request<LeaveType>(`/api/leave-types/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteLeaveType: (id: string) => request<void>(`/api/leave-types/${id}`, { method: "DELETE" }),

  getLeavePolicies: (params?: { status?: string }) => request<LeavePolicy[]>(`/api/leave-policies${toQuery(params)}`),
  createLeavePolicy: (data: Partial<LeavePolicy>) => request<LeavePolicy>("/api/leave-policies", { method: "POST", body: JSON.stringify(data) }),
  updateLeavePolicy: (id: string, data: Partial<LeavePolicy>) => request<LeavePolicy>(`/api/leave-policies/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteLeavePolicy: (id: string) => request<void>(`/api/leave-policies/${id}`, { method: "DELETE" }),

  getLeaves: (params?: { branchId?: string; departmentId?: string; employeeId?: string; leaveTypeId?: string; status?: string; dateFrom?: string; dateTo?: string }) =>
    request<LeaveRequest[]>(`/api/leaves${toQuery(params)}`),
  applyLeave: (data: { employeeId: string; leaveTypeId: string; fromDate: string; toDate: string; reason: string; attachmentUrl?: string }) =>
    request<LeaveRequest>("/api/leaves", { method: "POST", body: JSON.stringify(data) }),
  approveLeave: (id: string) => request<LeaveRequest>(`/api/leaves/${id}/approve`, { method: "POST" }),
  rejectLeave: (id: string, rejectionReason: string) =>
    request<LeaveRequest>(`/api/leaves/${id}/reject`, { method: "POST", body: JSON.stringify({ rejectionReason }) }),
  cancelLeave: (id: string) => request<LeaveRequest>(`/api/leaves/${id}/cancel`, { method: "POST" }),
  getEmployeeLeaves: (employeeId: string) => request<LeaveRequest[]>(`/api/employees/${employeeId}/leaves`),

  // Documents & Contracts (HRM)
  getEmployeeDocuments: (employeeId: string) => request<EmployeeDocument[]>(`/api/employees/${employeeId}/documents`),
  uploadEmployeeDocument: (employeeId: string, data: Partial<EmployeeDocument>) =>
    request<EmployeeDocument>(`/api/employees/${employeeId}/documents`, { method: "POST", body: JSON.stringify(data) }),
  deleteEmployeeDocument: (employeeId: string, documentId: string) =>
    request<void>(`/api/employees/${employeeId}/documents/${documentId}`, { method: "DELETE" }),

  getEmployeeContracts: (employeeId: string) => request<EmployeeContract[]>(`/api/employees/${employeeId}/contracts`),
  uploadEmployeeContract: (employeeId: string, data: Partial<EmployeeContract>) =>
    request<EmployeeContract>(`/api/employees/${employeeId}/contracts`, { method: "POST", body: JSON.stringify(data) }),
  terminateEmployeeContract: (employeeId: string, contractId: string) =>
    request<EmployeeContract>(`/api/employees/${employeeId}/contracts/${contractId}/terminate`, { method: "POST" }),

  // HRM Reports
  getHrAttendanceReport: (params?: { branchId?: string; departmentId?: string; employeeId?: string; shiftId?: string; status?: string; correctionStatus?: string; dateFrom?: string; dateTo?: string }) =>
    request<StaffAttendance[]>(`/api/hrm/reports/attendance${toQuery(params)}`),
  exportHrAttendanceReport: (params?: { branchId?: string; departmentId?: string; employeeId?: string; shiftId?: string; status?: string; correctionStatus?: string; dateFrom?: string; dateTo?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/hrm/reports/attendance/export${toQuery(params)}`),
  getAttendanceCorrectionHistory: (id: string) =>
    request<{ createdAt: string; oldValues?: string; newValues?: string; notes?: string; userId?: string }[]>(`/api/hrm/reports/attendance/${id}/history`),

  getShiftClosingReport: (params?: { branchId?: string; departmentId?: string; employeeId?: string; shiftId?: string; closingStatus?: string; dateFrom?: string; dateTo?: string }) =>
    request<ShiftClosingRow[]>(`/api/hrm/reports/shift-closing${toQuery(params)}`),
  exportShiftClosingReport: (params?: { branchId?: string; departmentId?: string; employeeId?: string; shiftId?: string; closingStatus?: string; dateFrom?: string; dateTo?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/hrm/reports/shift-closing/export${toQuery(params)}`),

  getEmployeeActivityReport: (params?: { branchId?: string; employeeId?: string; module?: string; activityType?: string; performedBy?: string; referenceId?: string; ipOrDevice?: string; dateFrom?: string; dateTo?: string }) =>
    request<EmployeeActivityRow[]>(`/api/hrm/reports/employee-activity${toQuery(params)}`),
  exportEmployeeActivityReport: (params?: { branchId?: string; employeeId?: string; module?: string; activityType?: string; performedBy?: string; referenceId?: string; ipOrDevice?: string; dateFrom?: string; dateTo?: string; exportedBy?: string; format?: ReportExportFormat }) =>
    requestBlob(`/api/hrm/reports/employee-activity/export${toQuery(params)}`),
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Branch {
  id: string; branchCode: string; name: string; nameAr?: string;
  address?: string; city?: string; contactNumber?: string;
  commercialRegistration?: string; email?: string;
  status: string; createdAt: string;
}

/** Filters out disabled branches — use for any dropdown/selector; management pages that need to show/re-enable disabled branches should NOT use this. */
export function excludeDisabledBranches(branches: Branch[]): Branch[] {
  return branches.filter((b) => b.status !== "disabled");
}

export interface Role {
  id: string; name: string; nameAr?: string; description?: string;
  isSystem: boolean; createdAt: string;
  userCount?: number;
  permissions?: RolePermission[];
}

// HRM — Employee Management
export interface Employee {
  id: string; employeeCode: string; fullName: string; email?: string; phone: string;
  emergencyContact?: string; nationalId: string; iqamaExpiry?: string; dateOfBirth?: string;
  gender?: string; nationality?: string; maritalStatus?: string; profileImageUrl?: string;
  branchId: string; departmentId?: string; designationId?: string; roleId?: string; userId?: string;
  hireDate: string; employmentStatus: string;
  currentAddress?: string; permanentAddress?: string;
  contractType?: string; contractStartDate?: string; contractEndDate?: string; contractOpenEnded: boolean;
  createdAt: string; updatedAt: string;
  branch?: Branch; department?: Department; designation?: Designation; role?: Role;
  user?: { id: string; username: string; email: string; status: string };
  leavePolicyId?: string; leavePolicy?: LeavePolicy; leavePolicyEffectiveFrom?: string;
  currentShift?: { shiftId: string; shiftName: string; startTime: string; endTime: string; effectiveFrom: string };
  hasDocuments: boolean; documentStatus: string; onLeaveToday: boolean;
  latestContract?: { contractType: string; endDate?: string; openEnded: boolean; status: string };
}

// HRM — Leave
export interface LeaveType { id: string; name: string; status: string; createdAt: string; updatedAt: string }
export interface LeavePolicy { id: string; name: string; annualDays: number; sickDays: number; casualDays: number; status: string; createdAt: string; updatedAt: string }
export interface LeaveRequest {
  id: string; employeeId: string; leaveTypeId: string; fromDate: string; toDate: string; totalDays: number;
  reason: string; attachmentUrl?: string; status: string; approverId?: string; approvedAt?: string; rejectionReason?: string;
  createdAt: string; updatedAt: string;
  employee?: Employee; leaveType?: LeaveType; approver?: { id: string; fullName: string };
}

// HRM — Reports
export interface ShiftClosingRow {
  id: string; date?: string; employeeId?: string;
  employee?: { id: string; fullName: string; employeeCode: string };
  department?: string; branchId?: string;
  shift?: { id: string; name: string; startTime: string; endTime: string };
  scheduledStart?: string; scheduledEnd?: string;
  actualCheckIn?: string; actualCheckOut?: string;
  closingStatus: string; closedBy?: string; closingTime?: string; remarks?: string;
}
export interface EmployeeActivityRow {
  id: string; createdAt: string; action: string; activityType: string; entityType?: string; entityId?: string; module?: string;
  employee?: { id: string; fullName: string; employeeCode: string };
  performedBy?: { id: string; fullName: string };
  branchId?: string; branchName?: string; deviceName?: string;
  description?: string; oldValueSummary?: string; newValueSummary?: string;
  oldValues?: string; newValues?: string; notes?: string; ipAddress?: string; severity: string;
}

// HRM — Documents & Contracts
export interface EmployeeDocument {
  id: string; employeeId: string; documentType: string; fileName: string; fileUrl: string;
  issueDate?: string; expiryDate?: string; uploadedBy?: string; uploadedAt: string;
}
export interface EmployeeContract {
  id: string; employeeId: string; contractType: string; startDate: string; endDate?: string;
  openEnded: boolean; status: string; fileName?: string; fileUrl?: string; uploadedBy?: string; uploadedAt: string;
}

export interface Department {
  id: string; name: string; branchId?: string; managerEmployeeId?: string; status: string;
  createdAt: string; updatedAt: string;
  branch?: Branch; managerEmployee?: Employee;
}

export interface Designation {
  id: string; name: string; departmentId: string; grade?: string; status: string;
  createdAt: string; updatedAt: string;
  department?: Department;
}

export interface Holiday {
  id: string; name: string; holidayType: string; date: string; branchId?: string;
  description?: string; status: string; createdAt: string; updatedAt: string;
  branch?: Branch;
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
  employeeId: string;
}

export interface Category {
  id: string; name: string; nameAr?: string; parentId?: string;
  isActive: boolean; sortOrder: number;
}

export interface Product {
  id: string; sku: string; barcode?: string; name: string; nameAr?: string;
  categoryId?: string; brand?: string; basePrice: number; costPrice?: number;
  taxPercentage: number; reorderLevel: number;
  status: string; weightBased: boolean; isTobacco: boolean;
  discount?: number; discountType?: "percentage" | "fixed";
  imageUrl?: string;
  // Pack & unit pricing (FRD §12): "single" (default) or "pack". A pack is sold as one unit at its
  // own basePrice; itemsPerPack is informational (items inside one pack).
  saleUnitType?: "single" | "pack";
  itemsPerPack?: number | null;
  category?: { id: string; name: string; nameAr?: string };
}

export interface InventoryStock {
  id: string; productId: string; branchId: string; quantity: number;
  reservedQuantity: number; reorderLevel: number; lastUpdated: string;
  product?: Product;
  branch?: { id: string; name: string; branchCode?: string };
}

export interface InventoryBatch {
  id: string; batchNumber: string; productId: string; branchId?: string; warehouseId?: string;
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

// ─── Pricing (FRD §12) ───────────────────────────────────────────────────────

export type PriceType = "standard" | "online" | "aggregator" | "wholesale";
export type CustomerTier = "standard" | "silver" | "gold" | "platinum";

// One price rule. branchId null = every branch; minCustomerTier null = every customer;
// effectiveTo null = open-ended.
export interface ProductPriceList {
  id: string; productId: string; branchId?: string | null;
  priceType: PriceType; price: number;
  effectiveFrom: string; effectiveTo?: string | null;
  minCustomerTier?: CustomerTier | null;
  unitType: "unit" | "pack";
  packSize?: number | null; packBarcode?: string | null;
  label?: string | null; priority: number; isActive: boolean;
  createdAt: string; updatedAt: string;
  product?: Product;
  branch?: { id: string; name: string };
}

export interface PriceListPayload {
  id?: string;
  productId: string;
  branchId?: string | null;
  priceType?: PriceType;
  price: number;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  minCustomerTier?: CustomerTier | null;
  unitType?: "unit" | "pack";
  packSize?: number | null;
  packBarcode?: string | null;
  label?: string | null;
  priority?: number;
  isActive?: boolean;
}

// A pack buying option. unitPrice is packPrice/packSize — a pack is sold as packSize ordinary
// units at that derived price, never as a distinct kind of line, which is what keeps stock,
// batches, tax and reporting working unchanged.
export interface PackOption {
  priceListId: string;
  label?: string | null;
  packSize: number;
  packPrice: number;
  unitPrice: number;
  packBarcode?: string | null;
}

// source explains which rule won: "base" (no rule — basePrice), "branch", "tier", "branch_tier",
// "scheduled", "list".
export interface ResolvedPrice {
  productId: string;
  unitPrice: number;
  basePrice: number;
  priceListId?: string | null;
  source: "base" | "branch" | "tier" | "branch_tier" | "scheduled" | "list";
  packs: PackOption[];
}

// ─── Recalls (FRD §13) ───────────────────────────────────────────────────────

export type RecallStatus = "open" | "closed";
export type RecallSeverity = "low" | "medium" | "high" | "critical";
export type RecallType =
  | "supplier_notice" | "quality_issue" | "contamination"
  | "mislabeling" | "regulatory" | "other";

// batchId null = every batch of the product; branchId null = tenant-wide.
export interface ProductRecall {
  id: string; recallNumber: string;
  productId: string; batchId?: string | null; branchId?: string | null; supplierId?: string | null;
  reason: string; recallType: RecallType; severity: RecallSeverity; status: RecallStatus;
  quantityQuarantined: number;
  notes?: string | null; resolution?: string | null;
  initiatedBy?: string | null; closedBy?: string | null;
  closedAt?: string | null; createdAt: string; updatedAt: string;
  product?: Product;
  batch?: InventoryBatch;
  branch?: { id: string; name: string };
  supplier?: { id: string; name: string };
  initiatedByUser?: { id: string; fullName?: string };
  closedByUser?: { id: string; fullName?: string };
}

export interface RecallPayload {
  productId: string; batchId?: string | null; branchId?: string | null; supplierId?: string | null;
  reason: string; recallType?: RecallType; severity?: RecallSeverity; notes?: string;
}

export interface RecallImpact {
  recallId: string; recallNumber: string; status: RecallStatus;
  quantityQuarantined: number;
  totalOnHand: number;
  locations: Array<{
    batchId: string; batchNumber?: string | null;
    branchId?: string | null; branchName?: string | null;
    warehouseId?: string | null; warehouseName?: string | null;
    remainingQuantity: number; expiryDate?: string | null;
  }>;
  soldUnits: number;
  // Sales lists cap at 500 rows; this says so rather than silently truncating an outreach list.
  affectedSalesTruncated: boolean;
  affectedSales: Array<{
    orderId: string; orderNumber: string; soldAt: string; quantity: number;
    batchId?: string | null;
    customerId?: string | null; customerName?: string | null; customerPhone?: string | null;
  }>;
}

export interface Order {
  id: string; orderNumber: string; source: string; branchId: string;
  customerId?: string; cashierId?: string; subtotal: number; discountAmount: number;
  // Breakout of how much of discountAmount came from loyalty points redemption — the server
  // clamps loyaltyPointsRedeemed to the customer's balance/program caps, so what's echoed back
  // on the response may be lower than what was sent.
  loyaltyPointsRedeemed?: number; loyaltyDiscountAmount?: number;
  taxAmount: number; customFeeAmount?: number; tobaccoFeeAmount?: number; totalAmount: number; paymentStatus: string; orderStatus: string;
  createdAt: string; items?: OrderItem[]; payments?: OrderPayment[];
  // Named breakdown of discountAmount — which manually-applied Discount(s) contributed and how
  // much each contributed (coupon's own share is separately identified via couponId, loyalty's
  // via loyaltyDiscountAmount above).
  discounts?: Array<{ id?: string; discountId?: string; name: string; amount: number }>;
  // Named breakdown of customFeeAmount — which configured service charge(s) (Delivery Service
  // Fee, Card Payment Surcharge, etc.) contributed and how much each contributed.
  serviceCharges?: Array<{ id?: string; taxFeeRuleId?: string; name: string; amount: number }>;
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
  kioskLockdownPinSetAt?: string;
  kioskLockdownPinLength?: number;
  branch?: { id: string; name: string };
  assignedCashier?: { id: string; fullName: string };
}

export interface Supplier {
  id: string; supplierCode: string; name: string; warehouseName?: string;
  contactPerson?: string; contactNumber?: string; email?: string;
  address?: string; city?: string; supplyType: string; status: string;
  legalName?: string; crNumber?: string; vatNumber?: string; category?: string;
  paymentTerms?: string; creditLimit?: number;
  bankName?: string; bankAccountHolder?: string; bankAccountNumber?: string; bankIban?: string;
  notes?: string;
}

export interface SupplierDocument {
  id: string; supplierId: string; documentType: string; fileName: string; fileUrl: string;
  issueDate?: string; expiryDate?: string; uploadedBy?: string; uploadedAt: string;
}

export interface Customer {
  id: string; customerCode: string; fullName: string; phone: string;
  email?: string; loyaltyBalance: number; totalSpend: number;
  visitCount?: number; tier: string; status: string; createdAt?: string;
  preferredBranchId?: string;
}

export interface LoyaltyTransaction {
  id: string; customerId: string; orderId?: string; branchId?: string;
  transactionType: string; points: number; balanceAfter: number;
  monetaryValue?: number;
  description?: string; expiryDate?: string; createdAt: string;
}

export interface LoyaltyProgram {
  id: string; branchId?: string;
  programName: string; description?: string; logoUrl?: string; brandColor?: string;
  pointsPerCurrencyUnit: number; redemptionValuePerPoint: number;
  minPointsToRedeem: number;
  // null = no cap / never expires. Must be sent as an explicit null in requests, not omitted —
  // omitting the key leaves it out of the JSON body entirely, and the server's model binder then
  // falls back to the field's non-null default (50 / 365) instead of actually clearing it.
  maxRedeemPctOfOrder?: number | null; pointsExpiryDays?: number | null;
  silverThreshold: number; goldThreshold: number; platinumThreshold: number;
  silverEarnMultiplier: number; goldEarnMultiplier: number; platinumEarnMultiplier: number;
  isActive: boolean; createdAt?: string; updatedAt?: string;
}

export interface PublicLoyaltyProgram {
  branchName: string; programName: string; description?: string;
  logoUrl?: string; brandColor?: string;
  pointsPerCurrencyUnit: number; redemptionValuePerPoint: number; minPointsToRedeem: number;
}

export interface PublicLoyaltyLookup {
  fullName: string; tier: string; loyaltyBalance: number;
  recentHistory: Array<{
    transactionType: string; points: number; monetaryValue?: number;
    createdAt: string; description?: string;
  }>;
}

export interface LoyaltyReportRow {
  branchId: string; branchName: string;
  pointsEarned: number; pointsRedeemed: number; pointsExpired: number;
  redemptionValue: number; activeMembers: number;
}

export interface LoyaltyCustomerRow {
  customerId: string; customerName: string; phone: string; branches: string; tier: string;
  currentBalance: number; pointsEarned: number; pointsRedeemed: number; pointsExpired: number;
  redemptionValue: number; lastActivityAt: string;
}

export interface LoyaltyReportResult {
  byBranch: LoyaltyReportRow[];
  byCustomer: LoyaltyCustomerRow[];
  tierBreakdown: Array<{ tier: string; members: number; totalBalance: number }>;
  kpis: {
    totalPointsEarned: number; totalPointsRedeemed: number; totalPointsExpired: number;
    totalRedemptionValue: number; totalActiveMembers: number;
  };
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
  requiresCustomer?: boolean;
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
  triggerBarcode?: string; // when set, the offer only fires for this exact scanned barcode
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
  customFeeAmount: number; excisePercentage: number; minimumExciseAmount: number; isTobacco: boolean;
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

export interface ApprovalRow {
  id: string;
  sourceType: "approval_request" | "return" | "stock_count" | "stock_transfer" | "wastage_adjustment";
  requestType: "discount" | "order_cancellation" | "item_deletion" | "refund_return" | "stock_count" | "stock_transfer" | "wastage_adjustment";
  entityLabel: string;
  branchId?: string; branchName?: string;
  requestedBy?: string; requestedByName?: string;
  requestedAt: string;
  status: string;
  approvedBy?: string; approvedByName?: string;
  actionAt?: string;
  reason?: string; rejectionReason?: string;
}

export interface CompanyProfile {
  id?: string; legalName?: string; crNumber?: string; vatNumber?: string;
  updatedBy?: string; createdAt?: string; updatedAt?: string;
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
  id: string; userId?: string; branchId: string;
  checkIn?: string; checkOut?: string; status: string; createdAt: string;
  user?: { id: string; fullName: string; roleName?: string };
  // HRM Attendance module fields
  employeeId?: string; date?: string; shiftId?: string;
  lateMinutes: number; earlyLeaveMinutes: number; remarks?: string; isCorrected?: boolean;
  employee?: Employee; shift?: WorkShift;
}

// HRM — Shifts
export interface WorkShift {
  id: string; name: string; branchId?: string; departmentId?: string;
  workingDays: string; startTime: string; endTime: string;
  breakStart?: string; breakEnd?: string; graceInMinutes: number; graceOutMinutes: number;
  status: string; createdAt: string; updatedAt: string;
  branch?: Branch; department?: Department; assignedEmployees?: number;
}

export interface EmployeeShiftAssignment {
  id: string; employeeId: string; shiftId: string;
  effectiveFrom: string; effectiveTo?: string; status: string;
  assignedBy?: string; assignedAt: string;
  employee?: Employee; shift?: WorkShift;
}

export interface AuditLog {
  id: string; userId?: string; action: string; entityType?: string;
  entityId?: string; createdAt: string;
  details?: string;   // legacy alias
  newValues?: string; // backend field — the "after" snapshot (JSON) or human-readable details
  oldValues?: string; // backend field — the "before" snapshot (JSON), set on edit/approve actions
  notes?: string;
  ipAddress?: string;
  severity?: "info" | "warning" | "critical";
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
  // Optional — when set, the adjustment moves this specific batch's RemainingQuantity (clamped/
  // validated server-side) instead of only the aggregate stock row. Omit for adjustments not
  // tied to any particular lot (e.g. a cycle-count correction with no known batch origin).
  batchId?: string;
}

export interface InventoryAdjustment {
  id: string; productId: string; branchId?: string; warehouseId?: string; batchId?: string;
  quantity: number; adjustmentType: string; reason?: string;
  adjustedBy?: string; createdAt: string;
  // null = not subject to review (every adjustment raised before the approval flow shipped, plus
  // non-write-off types). Only waste/damage enter the flow.
  approvalStatus?: "pending" | "approved" | "rejected" | null;
  approvedBy?: string; approvedAt?: string; rejectionReason?: string;
  product?: Product;
  branch?: { id: string; name: string };
  warehouse?: { id: string; name: string };
  batch?: InventoryBatch;
  adjustedByUser?: { id: string; fullName: string };
  approvedByUser?: { id: string; fullName: string };
}

// Signed ledger entry (positive = stock increase, negative = decrease) — the single source of
// truth for "how did stock actually move", written by every stock-mutating endpoint in the same
// unit of work as the mutation itself. movementType is one of: purchase_receive, sale,
// transfer_out, transfer_in, transfer_restore, manual_receive, adjustment_<type>, expired.
export interface StockMovement {
  id: string; productId: string; branchId?: string; warehouseId?: string; batchId?: string;
  movementType: string; quantity: number;
  referenceType?: string; referenceId?: string; referenceNumber?: string;
  notes?: string; createdBy?: string; createdAt: string;
  product?: Product;
  branch?: { id: string; name: string };
  warehouse?: { id: string; name: string };
  batch?: { id: string; batchNumber: string; expiryDate?: string };
  createdByUser?: { id: string; fullName: string };
}

export interface StockCountItem {
  id: string; stockCountId?: string; productId: string;
  systemQuantity: number; countedQuantity?: number; variance?: number;
  countedAt?: string; createdAt?: string;
  product?: Product;
}

export interface StockCount {
  id: string; branchId?: string; warehouseId?: string; categoryId?: string;
  // Why the count was run — null for sessions started before this was recorded.
  countType?: "review" | "audit" | "reconciliation" | null;
  // draft (counting) | pending_review | pending_approval | approved (stock applied) | rejected | cancelled
  status: string;
  startedBy?: string; completedBy?: string; reviewedBy?: string; approvedBy?: string;
  rejectionReason?: string; stockApplied?: boolean; notes?: string;
  startedAt: string; completedAt?: string; reviewedAt?: string; approvedAt?: string;
  branch?: { id: string; name: string };
  warehouse?: { id: string; name: string };
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
  purchaseOrderId?: string; createdBy: string; approvedBy?: string; receivedBy?: string;
  status: string; returnReason?: string; notes?: string; batchId?: string;
  expectedDate?: string; completedDate?: string; createdAt: string; updatedAt: string;
  sourceBranch?: { id: string; name: string };
  sourceWarehouse?: { id: string; name: string; code: string };
  sourceSupplier?: { id: string; name: string };
  destBranch?: { id: string; name: string };
  destWarehouse?: { id: string; name: string; code: string };
  destSupplier?: { id: string; name: string };
  createdByUser?: { id: string; fullName: string };
  approvedByUser?: { id: string; fullName: string };
  receivedByUser?: { id: string; fullName: string };
  items?: StockTransferItem[];
}

export interface StockTransferItem {
  id: string; transferId: string; productId: string; batchId?: string;
  requestedQuantity: number; approvedQuantity?: number; receivedQuantity?: number;
  unitCost?: number; expiryDate?: string; returnReason?: string; notes?: string; createdAt: string;
  product?: Product;
  batch?: InventoryBatch;
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

export type ReportExportFormat = "csv" | "pdf" | "excel";

export interface DailySalesHour {
  hour: number; transactions: number; grossSales: number; discounts: number; returns: number;
  netSales: number; vat: number; tobaccoFees: number; cash: number; card: number; wallet: number; avgBasket: number;
}
export interface DailySalesReport {
  kpis: { grossSales: number; netSales: number; transactions: number; avgBasket: number; vatCollected: number; returnsRefunds: number; tobaccoFees: number };
  hourly: DailySalesHour[];
  paymentSplit: { method: string; amount: number }[];
}

export interface MonthlyDayRow {
  date: string; transactions: number; grossSales: number; discounts: number; returns: number;
  netSales: number; vat: number; tobaccoFees: number; cogs: number; grossProfit: number; marginPct: number | null;
  avgBasket: number; previousPeriodSales: number | null; growthPct: number | null;
}
export interface MonthlySalesReport {
  kpis: { netSales: number; grossProfit: number; marginPct: number | null; transactions: number; returnValue: number; discountValue: number; tobaccoFees: number };
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
  kpis: { cashCollected: number; cardSettled: number; walletAmount: number; pendingAmount: number; refundValue: number; paymentFees: number; tobaccoFees: number };
  rows: PaymentMethodRow[];
  refunds: { method: string; amount: number }[];
}

export interface LowStockRow {
  sku: string; productName: string; category: string; branch: string; isTobacco: boolean; availableQty: number;
  reorderLevel: number; recommendedReorderQty: number; preferredSupplier?: string;
  lastSoldDate?: string; urgency: "critical" | "low" | "ok"; estimatedReorderValue: number;
}
export interface LowStockReport {
  kpis: { lowStockSkus: number; criticalSkus: number; outOfStockSkus: number; estimatedReorderValue: number; affectedBranches: number; suppliersToContact: number };
  rows: LowStockRow[];
}

export interface InventorySnapshotRow {
  sku: string; productName: string; category: string; isTobacco: boolean;
  // This report spans both stock pools (inventory_stock and warehouse_stock), so a row names
  // whichever location holds it. Replaces the old branch-only `branch` field.
  locationType: "branch" | "warehouse"; location: string; locationId: string;
  onHandQty: number; reservedQty: number; availableQty: number; reorderLevel: number;
  costPrice: number; stockCostValue: number; retailValue: number;
  lastMovementDate: string; stockStatus: "negative" | "out of stock" | "low" | "in stock";
}
// FRD §2.6 / §2.7 — inventory KPIs + aging. Turnover and movers read stock_movements, so
// `dataWindow` reports how much of the period the ledger actually covers.
export interface InventoryMoverRow {
  productId: string; sku: string; productName: string; unitsMoved: number; cogsValue: number;
}
export interface InventoryAgingBucket {
  bucket: string; skuCount: number; onHandQty: number; stockValue: number;
}
export interface InventoryDataWindow {
  ledgerStart?: string | null; from: string; to: string;
  // False when the ledger starts after the requested period — movement figures cover only its tail.
  coversFullPeriod: boolean;
  saleMovementsInPeriod: number;
}
// FRD §2.7 — one row per product at one location.
export interface InventoryAgingRow {
  productId: string; sku: string; productName: string; category: string;
  location: string; locationType: "branch" | "warehouse";
  onHandQty: number; stockValue: number;
  // Null when no batch record exists — the stock row alone can't say when goods arrived.
  productAgeDays?: number | null;
  daysSinceLastMovement: number;
  lastMovementDate: string;
  // "ledger" = a real recorded movement; "stock_row" = fallback approximation from LastUpdated.
  lastMovementSource: "ledger" | "stock_row";
  unitsMovedInPeriod: number;
  ageBucket: string;
  isDeadStock: boolean;
  // Same Star/High/Average/Slow/Dead Stock classification as the Product Performance report —
  // identical across every location-row for a given product.
  classification: ProductPerformanceTier;
  performanceScore: number;
}
export interface InventoryDashboardReport {
  kpis: {
    totalStockValue: number; availableStockQty: number; outOfStockProducts: number;
    negativeInventoryItems: number; lowStockProducts: number; pendingPurchaseOrders: number;
    wastageValue: number; inventoryTurnover: number; cogsValue: number;
    starCount: number; highPerformerCount: number; averagePerformerCount: number; slowMovingCount: number;
  };
  topMoving: InventoryMoverRow[];
  slowMoving: InventoryMoverRow[];
  aging: InventoryAgingBucket[];
  agingRows: InventoryAgingRow[];
  deadStockSkus: number;
  deadStockValue: number;
  dataWindow: InventoryDataWindow;
}

export interface StockReconciliationRow {
  countId: string; stockCountId: string;
  // null for sessions started before count_type existed — shown as "Unspecified".
  countType?: "review" | "audit" | "reconciliation" | null;
  startedAt: string; completedAt?: string | null;
  // Exactly one of branch/warehouse is set — render as one combined "Branch / Warehouse" column.
  branch?: string | null; warehouse?: string | null;
  sku: string; productName: string; category: string;
  systemQty: number;
  // null while the line is still pending — render "—", never 0.
  countedQty?: number | null; variance?: number | null;
  varianceValue: number;
  startedBy: string; performedBy?: string | null; reviewedBy?: string | null; approvedBy?: string | null;
  status: string; rejectionReason?: string | null; countedAt?: string | null;
}
export interface StockReconciliationReport {
  kpis: {
    sessionCount: number; itemsCounted: number; itemsPending: number; itemsWithVariance: number;
    accuracyPct: number; netVarianceUnits: number; netVarianceValue: number; absVarianceValue: number;
    pendingReviewCount: number; pendingApprovalCount: number;
  };
  rows: StockReconciliationRow[];
}

// Star Products | High Performers | Average Performers | Slow Moving Products | Dead Stock
export type ProductPerformanceTier = "Star Products" | "High Performers" | "Average Performers" | "Slow Moving Products" | "Dead Stock";
export interface ProductPerformanceRow {
  productId: string; sku: string; productName: string; category: string;
  unitsSold: number; salesValue: number; cogs: number; grossProfit: number; marginPct?: number | null;
  currentStockQty: number; currentStockValue: number;
  // null when there's no batch record at all (predates batch tracking, or nothing on hand).
  daysInStock?: number | null;
  // null = never sold (within what the ledger can see) — distinct from 0 ("sold today").
  daysSinceLastSale?: number | null;
  turnoverRatio: number;
  performanceScore: number;
  classification: ProductPerformanceTier;
}
export interface ProductPerformanceReport {
  kpis: {
    productCount: number; starCount: number; highPerformerCount: number; averagePerformerCount: number;
    slowMovingCount: number; deadStockCount: number; deadStockValue: number; totalSalesValue: number;
  };
  rows: ProductPerformanceRow[];
}

// Which pools/filters this caller may use. Resolved server-side because the rule depends on
// branch_warehouses, and AuthUser has no warehouse field to derive it from client-side.
export interface InventorySnapshotScope {
  canFilterBranch: boolean;
  canFilterWarehouse: boolean;
  forcedBranchId?: string | null;
  warehouses: { id: string; name: string }[];
}
export interface InventorySnapshotReport {
  kpis: { totalStockValue: number; skuCount: number; availableQty: number; reservedQty: number; outOfStockSkus: number; negativeStockExceptions: number };
  rows: InventorySnapshotRow[];
  snapshotAt: string;
}

export interface BranchSalesRow {
  branchCode: string; branchName: string; city: string; openTerminals: number; transactions: number;
  grossSales: number; discounts: number; returns: number; netSales: number; vat: number; tobaccoFees: number; avgBasket: number;
  grossProfit: number; marginPct: number | null; rank: number;
}
export interface BranchSalesReport {
  kpis: { topBranch?: string; lowestBranch?: string; totalNetSales: number; averageBranchSales: number; totalReturns: number; overallMarginPct: number | null; totalTobaccoFees: number };
  rows: BranchSalesRow[];
}

export interface TerminalReportRow {
  terminalId: string; terminalName: string; branch: string; status: string; assignedCashier: string;
  transactions: number; netSales: number; tobaccoFees: number; refunds: number; uptimePct: number; lastSyncTime?: string;
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
  netSales: number; salesContributionPct: number; tobaccoFees: number;
  cogs: number; grossProfit: number; marginPct: number | null;
}
export interface CategoryPerformanceReport {
  kpis: { topCategory?: string; highestMarginCategory?: string; categoryReturnRatePct: number; totalCategoriesSold: number; categoryDiscountValue: number; totalTobaccoFees: number };
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

export interface SupplierReturnsReportItem {
  productName: string; sku: string; returnedQuantity: number; unitCost: number; totalValue: number; reason: string; notes?: string;
}
export interface SupplierReturnsReportRow {
  returnNumber: string; returnDate: string; supplierName: string; warehouseName: string;
  returnedBy: string; approvedBy: string; status: string; totalValue: number; items: SupplierReturnsReportItem[];
}

export interface StockTransferReportRow {
  transferNumber: string; transferType: string; sourceLocation: string; destinationLocation: string; status: string;
  createdBy: string; approvedBy: string; receivedBy: string; productName: string; sku: string;
  orderedQuantity: number; receivedQuantity: number; unitCost: number; totalCost: number; createdAt: string; completedDate?: string; notes?: string;
}

export interface PurchaseOrderReportItem {
  productName: string; sku: string; orderedQuantity: number; receivedQuantity: number; unitCost: number; subtotal: number;
}
export interface PurchaseOrderReportRow {
  id: string; poNumber: string; supplierName: string; locationName: string; purchaseDate: string; status: string; paymentStatus: string;
  createdBy: string; approvedBy: string; receivedBy: string; totalAmount: number; items: PurchaseOrderReportItem[];
}

export interface EmployeeAuditRow {
  id: string; createdAt: string; employeeName: string; actionCategory: string; actionLabel: string;
  oldValueSummary?: string; newValueSummary?: string; branchName: string; deviceName: string; relatedTransaction: string; severity: string;
}

export interface WasteSpoilageRow {
  wasteId: string; dateTime: string; sku: string; productName: string; category: string; branch: string;
  isTobacco: boolean;
  qty: number; reason: string; costValue: number; notes?: string; batchNumber?: string; expiryDate?: string;
  // adjustmentId is the real Guid — wasteId is a truncated display string and cannot be used to
  // call the approval endpoint.
  adjustmentId: string;
  createdBy: string;
  // Used to disable Approve on your own write-off — the API blocks self-approval, so offering the
  // button would just produce a 403.
  createdById?: string | null;
  approvedBy?: string;
  approvalStatus?: "pending" | "approved" | "rejected" | null;
  approvedAt?: string;
  rejectionReason?: string;
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
  discountType: string; couponCode?: string; discountPct: number; discountAmount: number;
  loyaltyDiscountAmount: number; netSalesAfterDiscount: number;
}
export interface DiscountsReport {
  kpis: { totalDiscountValue: number; manualDiscountValue: number; loyaltyDiscountValue: number; couponUsage: number; discountPctOfSales: number };
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

// Business-configured surcharges (delivery fee, card surcharge) — NOT a tax. KSA only recognizes
// VAT and tobacco excise as real taxes; see TobaccoExciseReport for that.
export interface FeeRow {
  transactionId: string; invoiceNo: string; dateTime: string; branch: string;
  cashier: string; customerType: string; chargeName: string; serviceChargeAmount: number;
}
export interface FeeReport {
  kpis: { totalServiceCharges: number; transactionsWithFees: number; averageFeePerTransaction: number };
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
  legalCompanyName: string;
  commercialRegistrationNumber: string;
  vatRegistrationNumber: string;
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
