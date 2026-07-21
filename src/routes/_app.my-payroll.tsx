import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type MyPayroll } from "@/lib/api";

export const Route = createFileRoute("/_app/my-payroll")({ component: MyPayrollPage });

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function money(v?: number | null): string {
  return v == null ? "—" : `SAR ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function MyPayrollPage() {
  const [data, setData] = useState<MyPayroll | null | undefined>(undefined);

  useEffect(() => {
    api.getMyPayroll().then(setData).catch(() => setData(null));
  }, []);

  return (
    <PageShell title="My Payroll" subtitle="Your own salary components and payslip history" breadcrumb={["My Payroll"]}>
      {data === undefined && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      {data === null && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No employee record is linked to your account yet. Contact an administrator to link your login to your employee profile.
        </Card>
      )}
      {data && (
        <>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Current Salary Components</p>
            {data.components.length === 0 ? (
              <p className="text-sm text-muted-foreground">No salary components configured yet.</p>
            ) : (
              <div className="space-y-1.5">
                {data.components.map(c => (
                  <div key={c.id} className="flex items-center justify-between text-sm border-b border-border/40 pb-1.5">
                    <span className={c.componentType === "Deduction" ? "text-destructive" : ""}>{c.componentName}</span>
                    <span className="font-medium">{c.componentType === "Deduction" ? "-" : ""}{money(c.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm font-semibold pt-1">
                  <span>Net</span>
                  <span>
                    {money(
                      data.components.filter(c => c.componentType === "Earning").reduce((s, c) => s + c.amount, 0) -
                      data.components.filter(c => c.componentType === "Deduction").reduce((s, c) => s + c.amount, 0)
                    )}
                  </span>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-0 overflow-hidden">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 pt-4 pb-2">Payslip History</p>
            {data.payslips.length === 0 ? (
              <p className="text-sm text-muted-foreground px-4 pb-4">No processed payslips yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Period</th>
                      <th className="text-left px-4 py-2 font-medium">Status</th>
                      <th className="text-right px-4 py-2 font-medium">Basic</th>
                      <th className="text-right px-4 py-2 font-medium">Gross</th>
                      <th className="text-right px-4 py-2 font-medium">Deductions</th>
                      <th className="text-right px-4 py-2 font-medium">Net Payable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payslips.map(p => (
                      <tr key={p.id} className="border-t border-border/40">
                        <td className="px-4 py-2">{p.month ? MONTH_NAMES[p.month - 1] : "—"} {p.year}</td>
                        <td className="px-4 py-2">{p.status}</td>
                        <td className="px-4 py-2 text-right">{money(p.basicSalary)}</td>
                        <td className="px-4 py-2 text-right">{money(p.grossEarnings)}</td>
                        <td className="px-4 py-2 text-right text-destructive">{money(p.totalDeductions)}</td>
                        <td className="px-4 py-2 text-right font-semibold">{money(p.netPayable)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </PageShell>
  );
}
