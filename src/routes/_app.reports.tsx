import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileBarChart, FileSpreadsheet, FileText, Download, TrendingUp, Calendar, Building2, ShoppingCart, Tag, Truck, Boxes, Ban, RotateCcw, Percent, CreditCard, ShieldCheck, DollarSign, AlertTriangle, Cigarette, Coins, ClipboardList, Clock } from "lucide-react";

export const Route = createFileRoute("/_app/reports")({ component: Reports });

const reports = [
  { name: "Daily Sales", desc: "Hour-by-hour sales for any single day", icon: Calendar, color: "primary" },
  { name: "Monthly Sales", desc: "Trend with profit margin breakdown", icon: TrendingUp, color: "primary" },
  { name: "Branch Sales", desc: "Compare performance across branches", icon: Building2, color: "primary" },
  { name: "Terminal", desc: "Per-terminal breakdown and uptime", icon: ShoppingCart, color: "primary" },
  { name: "Cashier Sales", desc: "Cashier-level shift performance", icon: TrendingUp, color: "primary" },
  { name: "Product Sales", desc: "Top SKUs, dead stock, velocity", icon: Tag, color: "warning" },
  { name: "Category Performance", desc: "Margin & velocity by category", icon: Tag, color: "warning" },
  { name: "Supplier Performance", desc: "Lead time, fill rate, dues", icon: Truck, color: "warning" },
  { name: "Inventory Reports", desc: "Snapshot of stock value by branch", icon: Boxes, color: "warning" },
  { name: "Low Stock Report", desc: "Items below reorder thresholds", icon: AlertTriangle, color: "destructive" },
  { name: "Waste / Spoilage Report", desc: "Expired & damaged write-offs", icon: Ban, color: "destructive" },
  { name: "Return / Refund Report", desc: "Returns by branch / cashier", icon: RotateCcw, color: "destructive" },
  { name: "Attendance / Shift Report", desc: "Staff attendance and cashier shifts", icon: Clock, color: "primary" },
  { name: "Audit Trail Report", desc: "Critical events across system", icon: ClipboardList, color: "primary" },
  { name: "Discount Report", desc: "Discounts applied across periods", icon: Percent, color: "warning" },
  { name: "Payment Methods", desc: "Cash / Card / STC Pay split", icon: CreditCard, color: "primary" },
  { name: "VAT / ZATCA Report", desc: "Tax filing-ready VAT summary", icon: ShieldCheck, color: "success" },
  { name: "Tax Report", desc: "Tax breakdown by branch and cashier", icon: Coins, color: "success" },
  { name: "Fee Report", desc: "Custom fees collected & detail", icon: DollarSign, color: "success" },
  { name: "Tobacco Excise Report", desc: "Excise tax on tobacco products", icon: Cigarette, color: "warning" },
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
    <PageShell title="Reports" subtitle="Pre-built reports · tax & fee reports · export to Excel / PDF">
      <Card className="p-3 border-border/60 shadow-card">
        <div className="flex flex-wrap gap-2">
          <Input type="date" className="h-9 w-[150px]" />
          <span className="self-center text-xs text-muted-foreground">to</span>
          <Input type="date" className="h-9 w-[150px]" />
          <Select defaultValue="all"><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{["all","Olaya","Khobar","Jeddah","Madinah"].map(o => <SelectItem key={o} value={o}>{o === "all" ? "All Branches" : o}</SelectItem>)}</SelectContent></Select>
          <Input placeholder="Item" className="h-9 w-[140px]" />
          <Select defaultValue="all"><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{["all","Dairy","Beverages","Snacks","Tobacco","Meat"].map(o => <SelectItem key={o} value={o}>{o === "all" ? "All Categories" : o}</SelectItem>)}</SelectContent></Select>
          <Input placeholder="Supplier" className="h-9 w-[140px]" />
          <Input placeholder="Cashier" className="h-9 w-[140px]" />
          <Select defaultValue="all"><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{["all","pending","delivered","cancelled"].map(o => <SelectItem key={o} value={o}>{o === "all" ? "Any Status" : o}</SelectItem>)}</SelectContent></Select>
          <div className="ml-auto flex gap-1">
            <Button variant="outline" size="sm" className="h-9 gap-1.5"><FileSpreadsheet className="h-4 w-4" />Excel</Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5"><FileText className="h-4 w-4" />PDF</Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button className="gap-2 gradient-primary text-primary-foreground border-0 shadow-glow"><FileBarChart className="h-4 w-4" /> Custom Report</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map(r => (
          <Card key={r.name} className="p-5 border-border/60 shadow-card hover:shadow-elegant hover:-translate-y-0.5 transition-all cursor-pointer">
            <div className="flex items-start gap-4">
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${colorMap[r.color]}`}><r.icon className="h-5 w-5" /></div>
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
