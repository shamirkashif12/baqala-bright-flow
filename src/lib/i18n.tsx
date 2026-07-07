import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ar";

type Dict = Record<string, { en: string; ar: string }>;

/**
 * Translation dictionary. Keys are the canonical English strings used across
 * the app — translating in-place keeps the code readable. Add entries for any
 * label that should appear in Arabic.
 */
export const dict: Dict = {
  // Common
  "Search products, SKU, invoices…": { en: "Search products, SKU, invoices…", ar: "ابحث عن المنتجات والباركود والفواتير…" },
  "Riyadh — Olaya Branch": { en: "Riyadh — Olaya Branch", ar: "الرياض — فرع العليا" },
  "Apply": { en: "Apply", ar: "تطبيق" },
  "Reset": { en: "Reset", ar: "إعادة تعيين" },
  "Export": { en: "Export", ar: "تصدير" },
  "Save": { en: "Save", ar: "حفظ" },
  "Cancel": { en: "Cancel", ar: "إلغاء" },
  "Add": { en: "Add", ar: "إضافة" },
  "Edit": { en: "Edit", ar: "تعديل" },
  "Delete": { en: "Delete", ar: "حذف" },
  "Status": { en: "Status", ar: "الحالة" },
  "Date": { en: "Date", ar: "التاريخ" },
  "Branch": { en: "Branch", ar: "الفرع" },
  "Item": { en: "Item", ar: "الصنف" },
  "Amount": { en: "Amount", ar: "المبلغ" },
  "Done": { en: "Done", ar: "تم" },
  "Customize": { en: "Customize", ar: "تخصيص" },

  // Sidebar groups
  "Operate": { en: "Operate", ar: "العمليات" },
  "Stock": { en: "Stock", ar: "المخزون" },
  "Finance": { en: "Finance", ar: "المالية" },
  "Suppliers": { en: "Suppliers", ar: "الموردون" },
  "Network": { en: "Network", ar: "الشبكة" },
  "Insights": { en: "Insights", ar: "التحليلات" },
  "Admin": { en: "Admin", ar: "الإدارة" },

  // Sidebar items
  "Dashboard": { en: "Dashboard", ar: "لوحة التحكم" },
  "POS Checkout": { en: "POS Checkout", ar: "نقطة البيع" },
  "Mobile POS & Kiosk": { en: "Mobile POS & Kiosk", ar: "نقطة البيع المتنقلة والكشك" },
  "Orders": { en: "Orders", ar: "الطلبات" },
  "Cashier Workspace": { en: "Cashier Workspace", ar: "مساحة عمل الكاشير" },
  "Cashier Shift": { en: "Cashier Shift", ar: "وردية الكاشير" },
  "Terminal Sessions": { en: "Terminal Sessions", ar: "جلسات الأجهزة" },
  "Control Tower": { en: "Control Tower", ar: "برج التحكم" },
  "Inventory": { en: "Inventory", ar: "المخزون" },
  "Expiry & Permissible": { en: "Expiry & Permissible", ar: "الصلاحية والمسموح" },
  "Warehouses": { en: "Warehouses", ar: "المستودعات" },
  "Expenses": { en: "Expenses", ar: "المصاريف" },
  "Expense Types": { en: "Expense Types", ar: "أنواع المصاريف" },
  "Coupons & Discounts": { en: "Coupons & Discounts", ar: "الكوبونات والخصومات" },
  "Coupons, Discounts & Offers": { en: "Coupons, Discounts & Offers", ar: "الكوبونات والخصومات والعروض" },
  "Refunds": { en: "Refunds", ar: "المبالغ المستردة" },
  "Customer Returns": { en: "Customer Returns", ar: "مرتجعات العملاء" },
  "Tax, Fees & Tobacco": { en: "Tax, Fees & Tobacco", ar: "الضرائب والرسوم والتبغ" },
  "Tax & Fee Reports": { en: "Tax & Fee Reports", ar: "تقارير الضرائب والرسوم" },
  "Warehouse Suppliers": { en: "Warehouse Suppliers", ar: "موردو المستودعات" },
  "Mart-to-Mart": { en: "Mart-to-Mart", ar: "بقالة إلى بقالة" },
  "Branches": { en: "Branches", ar: "الفروع" },
  "Terminals": { en: "Terminals", ar: "الأجهزة" },
  "Devices": { en: "Devices", ar: "الأجهزة الطرفية" },
  "Device Behavior": { en: "Device Behavior", ar: "سلوك الأجهزة" },
  "Sales": { en: "Sales", ar: "المبيعات" },
  "Reports": { en: "Reports", ar: "التقارير" },
  "KPI Evaluation": { en: "KPI Evaluation", ar: "تقييم المؤشرات" },
  "Business Intelligence": { en: "Business Intelligence", ar: "ذكاء الأعمال" },
  "Registered Users": { en: "Registered Users", ar: "المستخدمون المسجلون" },
  "Roles & Permissions": { en: "Roles & Permissions", ar: "الأدوار والصلاحيات" },
  "Staff & Roles": { en: "Staff & Roles", ar: "الموظفون والأدوار" },
  "Maintenance": { en: "Maintenance", ar: "الصيانة" },
  "ZATCA Invoices": { en: "ZATCA Invoices", ar: "فواتير زاتكا" },
  "ZATCA Phase 2 Settings": { en: "ZATCA Phase 2 Settings", ar: "إعدادات زاتكا المرحلة 2" },
  "Compliance": { en: "Compliance", ar: "الامتثال" },
  "POS Settings": { en: "POS Settings", ar: "إعدادات نقطة البيع" },
  "Audit Logs": { en: "Audit Logs", ar: "سجلات التدقيق" },
  "Plans & Pricing": { en: "Plans & Pricing", ar: "الباقات والأسعار" },
  "Settings": { en: "Settings", ar: "الإعدادات" },
  "Rules Engine": { en: "Rules Engine", ar: "محرك القواعد" },

  // Roles & footer
  "Owner": { en: "Owner", ar: "المالك" },
  "Manager": { en: "Manager", ar: "المدير" },
  "Cashier": { en: "Cashier", ar: "الكاشير" },

  // PageShell titles (most viewed)
  "Dashboard ": { en: "Dashboard", ar: "لوحة التحكم" },
  "Live snapshot across 4 branches": { en: "Live snapshot across 4 branches", ar: "ملخص مباشر عبر 4 فروع" },
  "Tax, Fees & Tobacco ": { en: "Tax, Fees & Tobacco", ar: "الضرائب والرسوم والتبغ" },
  "ZATCA-2 enablement, custom fees and tobacco excise — applied at billing & orders": {
    en: "ZATCA-2 enablement, custom fees and tobacco excise — applied at billing & orders",
    ar: "تفعيل زاتكا المرحلة 2، الرسوم المخصصة وضريبة التبغ — تطبق على الفواتير والطلبات",
  },
  "ZATCA Phase 2 — Billing & Orders": { en: "ZATCA Phase 2 — Billing & Orders", ar: "زاتكا المرحلة 2 — الفواتير والطلبات" },
  "Company billing info, invoice rules, credit/debit/refund notes and integration health": {
    en: "Company billing info, invoice rules, credit/debit/refund notes and integration health",
    ar: "بيانات الشركة، قواعد الفواتير، إشعارات الدائن والمدين والاسترداد وحالة التكامل",
  },
  "Customer Returns ": { en: "Customer Returns", ar: "مرتجعات العملاء" },
  "Handle item returns, refunds and restocking from a single workspace": {
    en: "Handle item returns, refunds and restocking from a single workspace",
    ar: "إدارة المرتجعات والاسترداد وإعادة التخزين من مكان واحد",
  },
  "Tax & Fee Reports ": { en: "Tax & Fee Reports", ar: "تقارير الضرائب والرسوم" },
  "VAT, custom fees, tobacco excise — by branch, cashier, product and date": {
    en: "VAT, custom fees, tobacco excise — by branch, cashier, product and date",
    ar: "ضريبة القيمة المضافة والرسوم وضريبة التبغ — حسب الفرع والكاشير والمنتج والتاريخ",
  },

  // Reports module
  "Operational, financial and compliance reports": { en: "Operational, financial and compliance reports", ar: "تقارير تشغيلية ومالية وتقارير امتثال" },
  "Export CSV": { en: "Export CSV", ar: "تصدير CSV" },
  "Back to Reports": { en: "Back to Reports", ar: "العودة إلى التقارير" },
  "Daily Sales": { en: "Daily Sales", ar: "المبيعات اليومية" },
  "Hour-by-hour sales, payment split and VAT for a single business day": {
    en: "Hour-by-hour sales, payment split and VAT for a single business day",
    ar: "المبيعات وتوزيع الدفع وضريبة القيمة المضافة بالساعة ليوم عمل واحد",
  },
  "Monthly Sales": { en: "Monthly Sales", ar: "المبيعات الشهرية" },
  "Sales trend and profit margin breakdown across a date range": {
    en: "Sales trend and profit margin breakdown across a date range",
    ar: "اتجاه المبيعات وتفصيل هامش الربح خلال فترة زمنية",
  },
  "Cashier Sales": { en: "Cashier Sales", ar: "مبيعات الكاشير" },
  "Cashier-level shift performance, cash variance and productivity": {
    en: "Cashier-level shift performance, cash variance and productivity",
    ar: "أداء الكاشير خلال الوردية وفروقات النقدية والإنتاجية",
  },
  "Payment Methods": { en: "Payment Methods", ar: "طرق الدفع" },
  "Settlement values and transaction split by cash, card and wallet": {
    en: "Settlement values and transaction split by cash, card and wallet",
    ar: "قيم التسوية وتوزيع المعاملات حسب النقد والبطاقة والمحفظة",
  },
  "Low Stock Report": { en: "Low Stock Report", ar: "تقرير المخزون المنخفض" },
  "Items below reorder thresholds — toggle to view the full inventory snapshot": {
    en: "Items below reorder thresholds — toggle to view the full inventory snapshot",
    ar: "الأصناف الأقل من حد إعادة الطلب — بدّل لعرض لقطة المخزون الكاملة",
  },
};

type Ctx = {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: string) => string;
};

const I18nContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "baqala_lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = (localStorage.getItem(STORAGE_KEY) as Lang | null);
      if (saved === "ar" || saved === "en") setLangState(saved);
    } catch { /* ignore */ }
  }, []);

  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") {
      try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
    }
  };

  const t = (key: string) => {
    const entry = dict[key];
    if (!entry) return key;
    return entry[lang] ?? key;
  };

  return (
    <I18nContext.Provider value={{ lang, dir, setLang, toggle: () => setLang(lang === "en" ? "ar" : "en"), t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback so components don't crash if used outside provider
    return { lang: "en", dir: "ltr", setLang: () => {}, toggle: () => {}, t: (k) => k };
  }
  return ctx;
}