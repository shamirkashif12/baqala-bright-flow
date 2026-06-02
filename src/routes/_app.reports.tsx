import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileBarChart, FileSpreadsheet, FileText, Download, TrendingUp, Calendar, Building2, ShoppingCart, Tag, Truck, Boxes, Ban, RotateCcw, Percent, CreditCard, ShieldCheck, DollarSign } from "lucide-react";

export const Route = createFileRoute("/_app/reports")({ component: Reports });

const reports = [
  { name: "Daily Sales", desc: "Hour-by-hour sales for any single day", icon: Calendar, color: "primary" },
  { name: "Monthly Sales", desc: "Trend with profit margin breakdown", icon: TrendingUp, color: "primary" },
  { name: "Branch Sales", desc: "Compare performance across branches", icon: Building2, color: "primary" },
  { name: "Terminal Sales", desc: "Per-terminal breakdown and uptime", icon: ShoppingCart, color: "primary" },
  { name: "Cashier Sales", desc: "Cashier-level shift performance", icon: TrendingUp, color: "primary" },
  { name: "Product Sales", desc: "Top SKUs, dead stock, velocity", icon: Tag, color: "warning" },
  { name: "Category Performance", desc: "Margin & velocity by category", icon: Tag, color: "warning" },
  { name: "Supplier Performance", desc: "Lead time, fill rate, dues", icon: Truck, color: "warning" },
  { name: "Inventory Valuation", desc: "Snapshot of stock value by branch", icon: Boxes, color: "warning" },
  { name: "Expiry Loss", desc: "Write-offs from expired stock", icon: Ban, color: "destructive" },
  { name: "Refund Report", desc: "Returns by branch / cashier", icon: RotateCcw, color: "destructive" },
  { name: "Discount Report", desc: "Discounts applied across periods", icon: Percent, color: "warning" },
  { name: "Payment Methods", desc: "Cash / Card / STC Pay split", icon: CreditCard, color: "primary" },
  { name: "VAT / ZATCA", desc: "Tax filing-ready summary", icon: ShieldCheck, color: "success" },
  { name: "Profit Margin", desc: "Gross & net margin by product", icon: DollarSign, color: "success" },
];

const colorMap: Record<string,string> = {
  primary: "bg-primary/10 text-primary",
  warning: "bg-warning/20 text-warning-foreground",
  destructive: "bg-destructive/15 text-destructive",
  success: "bg-success/15 text-success",
};

function Reports() {
  return (
    <PageShell title="Reports" subtitle="Pre-built reports · export to Excel / PDF">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="gap-2"><FileSpreadsheet className="h-4 w-4" /> Export Excel</Button>
        <Button variant="outline" className="gap-2"><FileText className="h-4 w-4" /> Export PDF</Button>
        <Button variant="outline" className="gap-2"><Calendar className="h-4 w-4" /> Date range</Button>
        <div className="flex-1" />
        <Button className="gap-2 gradient-primary text-primary-foreground border-0 shadow-glow"><FileBarChart className="h-4 w-4" /> Custom Report</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.name} className="p-5 border-border/60 shadow-card hover:shadow-elegant hover:-translate-y-0.5 transition-all cursor-pointer group">
            <div className="flex items-start gap-4">
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${colorMap[r.color]}`}>
                <r.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">{r.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{r.desc}</p>
                <div className="flex gap-2 mt-3">
                  <Button variant="ghost" size="sm" className="h-7 text-xs px-2">Open</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs px-2 gap-1"><Download className="h-3 w-3" />Download</Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}