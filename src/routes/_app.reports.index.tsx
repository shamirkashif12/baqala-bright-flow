import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import {
  FileBarChart, Download, TrendingUp, Calendar, Building2, ShoppingCart, Tag, Truck, Boxes,
  Ban, RotateCcw, Percent, CreditCard, ShieldCheck, DollarSign, AlertTriangle, Cigarette, Coins,
  ClipboardList, ClipboardCheck, Clock, Lock, ExternalLink, Hourglass, UserCheck, CalendarCheck, History,
} from "lucide-react";

export const Route = createFileRoute("/_app/reports/")({ component: Reports });

type ReportCard = {
  code: string;
  name: string;
  desc: string;
  icon: typeof Calendar;
  color: string;
  href?: string;
  exportFile?: () => Promise<Blob>;
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function buildReports(exportedBy?: string): ReportCard[] {
  return [
    { code: "daily-sales", name: "Daily Sales", desc: "Hour-by-hour sales for any single day", icon: Calendar, color: "primary",
      href: "/reports/daily-sales", exportFile: () => api.exportDailySalesReport({ date: todayStr(), exportedBy }) },
    { code: "monthly-sales", name: "Monthly Sales", desc: "Trend with profit margin breakdown", icon: TrendingUp, color: "primary",
      href: "/reports/monthly-sales", exportFile: () => api.exportMonthlySalesReport({ from: firstOfMonthStr(), to: todayStr(), exportedBy }) },
    { code: "branch-sales", name: "Branch Sales", desc: "Compare performance across branches", icon: Building2, color: "primary",
      href: "/reports/branch-sales", exportFile: () => api.exportBranchSalesReport({ from: firstOfMonthStr(), to: todayStr(), exportedBy }) },
    { code: "terminal", name: "Terminal", desc: "Per-terminal breakdown and uptime", icon: ShoppingCart, color: "primary",
      href: "/reports/terminal", exportFile: () => api.exportTerminalReport({ from: todayStr(), to: todayStr(), exportedBy }) },
    { code: "cashier-sales", name: "Cashier Sales", desc: "Cashier-level shift performance", icon: TrendingUp, color: "primary",
      href: "/reports/cashier-sales", exportFile: () => api.exportCashierSalesReport({ from: todayStr(), to: todayStr(), exportedBy }) },
    { code: "product-sales", name: "Product Sales", desc: "Top SKUs, dead stock, velocity", icon: Tag, color: "warning",
      href: "/reports/product-sales", exportFile: () => api.exportProductSalesReport({ from: firstOfMonthStr(), to: todayStr(), exportedBy }) },
    { code: "category-performance", name: "Category Performance", desc: "Margin & velocity by category", icon: Tag, color: "warning",
      href: "/reports/category-performance", exportFile: () => api.exportCategoryPerformanceReport({ from: firstOfMonthStr(), to: todayStr(), exportedBy }) },
    { code: "supplier-performance", name: "Supplier Performance", desc: "Lead time, fill rate, dues", icon: Truck, color: "warning",
      href: "/reports/supplier-performance", exportFile: () => api.exportSupplierPerformanceReport({ from: firstOfMonthStr(), to: todayStr(), exportedBy }) },
    { code: "inventory-snapshot", name: "Inventory Reports", desc: "Snapshot of stock value by branch & warehouse", icon: Boxes, color: "warning",
      href: "/reports/inventory-snapshot", exportFile: () => api.exportInventorySnapshotReport({ exportedBy }) },
    { code: "stock-reconciliation", name: "Stock Reconciliation", desc: "Stock review / audit — system vs counted", icon: ClipboardCheck, color: "primary",
      href: "/reports/stock-reconciliation", exportFile: () => api.exportStockReconciliationReport({ from: firstOfMonthStr(), to: todayStr(), exportedBy }) },
    // KPI dashboard rather than a tabular report — there is no row set to export, so it opts out
    // of the export affordance the others share.
    { code: "inventory-dashboard", name: "Inventory Aging", desc: "Product age, days since movement, slow-moving & dead stock", icon: Hourglass, color: "primary",
      href: "/reports/inventory-dashboard" },
    { code: "low-stock", name: "Low Stock Report", desc: "Items below reorder thresholds", icon: AlertTriangle, color: "destructive",
      href: "/reports/low-stock", exportFile: () => api.exportLowStockReport({ onlyLowStock: true, exportedBy }) },
    { code: "waste-spoilage", name: "Waste / Spoilage Report", desc: "Expired & damaged write-offs", icon: Ban, color: "destructive",
      href: "/reports/waste-spoilage", exportFile: () => api.exportWasteSpoilageReport({ from: firstOfMonthStr(), to: todayStr(), exportedBy }) },
    { code: "returns-refunds", name: "Return / Refund Report", desc: "Returns by branch / cashier", icon: RotateCcw, color: "destructive",
      href: "/reports/returns-refunds", exportFile: () => api.exportReturnsRefundsReport({ from: firstOfMonthStr(), to: todayStr(), exportedBy }) },
    { code: "attendance-shift", name: "Attendance / Shift Report", desc: "Staff attendance and cashier shifts", icon: Clock, color: "primary",
      href: "/reports/attendance-shift", exportFile: () => api.exportAttendanceShiftReport({ from: todayStr(), to: todayStr(), exportedBy }) },
    { code: "audit-trail", name: "Audit Trail Report", desc: "Critical events across system", icon: ClipboardList, color: "primary",
      href: "/reports/audit-trail", exportFile: () => api.exportAuditTrailReport({ exportedBy }) },
    { code: "discounts", name: "Discount Report", desc: "Discounts applied across periods", icon: Percent, color: "warning",
      href: "/reports/discounts", exportFile: () => api.exportDiscountsReport({ from: firstOfMonthStr(), to: todayStr(), exportedBy }) },
    { code: "payment-methods", name: "Payment Methods", desc: "Cash / Card / STC Pay split", icon: CreditCard, color: "primary",
      href: "/reports/payment-methods", exportFile: () => api.exportPaymentMethodsReport({ from: todayStr(), to: todayStr(), exportedBy }) },
    { code: "vat-zatca", name: "VAT / ZATCA Report", desc: "Tax filing-ready VAT summary", icon: ShieldCheck, color: "success",
      href: "/reports/vat-zatca", exportFile: () => api.exportVatZatcaReport({ from: firstOfMonthStr(), to: todayStr(), exportedBy }) },
    { code: "tax", name: "Tax Report", desc: "Tax breakdown by branch and cashier", icon: Coins, color: "success",
      href: "/reports/tax", exportFile: () => api.exportTaxReport({ from: firstOfMonthStr(), to: todayStr(), exportedBy }) },
    { code: "fees", name: "Fee Report", desc: "Custom fees collected & detail", icon: DollarSign, color: "success",
      href: "/reports/fees", exportFile: () => api.exportFeeReport({ from: firstOfMonthStr(), to: todayStr(), exportedBy }) },
    { code: "tobacco-excise", name: "Tobacco Excise Report", desc: "Excise tax on tobacco products", icon: Cigarette, color: "warning",
      href: "/reports/tobacco-excise", exportFile: () => api.exportTobaccoExciseReport({ from: firstOfMonthStr(), to: todayStr(), exportedBy }) },
    { code: "profit-margin", name: "Profit Margin", desc: "Gross & net margin by product", icon: DollarSign, color: "success",
      href: "/reports/profit-margin", exportFile: () => api.exportProfitMarginReport({ from: firstOfMonthStr(), to: todayStr(), exportedBy }) },
    { code: "hrm-attendance", name: "Attendance Report", desc: "Employee attendance across dates and branches", icon: UserCheck, color: "primary",
      href: "/reports/hrm-attendance", exportFile: () => api.exportHrAttendanceReport({ dateFrom: todayStr(), dateTo: todayStr(), exportedBy }) },
    { code: "shift-closing", name: "Shift Closing Report", desc: "Shift closing completion and exceptions", icon: CalendarCheck, color: "primary",
      href: "/reports/shift-closing", exportFile: () => api.exportShiftClosingReport({ dateFrom: todayStr(), dateTo: todayStr(), exportedBy }) },
    { code: "employee-activity", name: "Employee Activity Report", desc: "Audit trail of employee actions across HRM and POS", icon: History, color: "primary",
      href: "/reports/employee-activity", exportFile: () => api.exportEmployeeActivityReport({ dateFrom: `${firstOfMonthStr()}T00:00:00`, dateTo: `${todayStr()}T23:59:59`, exportedBy }) },
  ];
}

const colorMap: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  warning: "bg-warning/20 text-warning-foreground",
  destructive: "bg-destructive/15 text-destructive",
  success: "bg-success/15 text-success",
};

function Reports() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const reports = buildReports(user?.id);

  const handleDownload = async (r: ReportCard) => {
    if (!r.exportFile) return;
    try {
      const blob = await r.exportFile();
      downloadBlob(blob, `${r.code}-${todayStr()}.csv`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  return (
    <PageShell title="Reports" subtitle="Operational, financial and compliance reports">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => {
          const enabled = !!r.href;
          return (
            <Card
              key={r.code}
              className={`p-5 border-border/60 shadow-card transition-all ${
                enabled ? "hover:shadow-elegant hover:-translate-y-0.5" : "opacity-60"
              }`}
              title={enabled ? undefined : "Coming soon in a future release"}
            >
              <div className="flex items-start gap-4">
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${colorMap[r.color]}`}>
                  <r.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold">{r.name}</h3>
                    {!enabled && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{r.desc}</p>
                  <div className="flex gap-2 mt-3">
                    {enabled ? (
                      <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2 gap-1">
                        <Link to={r.href!} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3" />Open
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-7 text-xs px-2" disabled>Open</Button>
                    )}
                    <Button
                      variant="ghost" size="sm" className="h-7 text-xs px-2 gap-1"
                      disabled={!enabled || !canExport}
                      onClick={() => handleDownload(r)}
                    >
                      <Download className="h-3 w-3" />Download
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileBarChart className="h-3.5 w-3.5" />
        All {reports.length} reports are live.
      </div>
    </PageShell>
  );
}
