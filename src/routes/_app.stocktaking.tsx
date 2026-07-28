import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Button } from "@/components/ui/button";
import { StocktakingPanel } from "@/routes/_app.stocks";
import { api, type Branch, type Warehouse } from "@/lib/api";
import { Link } from "@tanstack/react-router";
import { FileBarChart } from "lucide-react";

// Stocktaking (Inventory Count) as a first-class page. The counting tool and its two-stage
// sign-off already existed, but only as a tab inside /stocks labelled "Stocking Review" — which is
// why it read as missing. The panel itself is shared with that tab (single implementation); this
// route is the front door, and links straight through to the Stocktaking Report for the reporting
// half of the same workflow.
export const Route = createFileRoute("/_app/stocktaking")({ component: StocktakingPage });

function StocktakingPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  useEffect(() => {
    api.getBranches().then(setBranches).catch(() => {});
    api.getWarehouses().then(setWarehouses).catch(() => {});
  }, []);

  return (
    <PageShell
      title="Stocktaking (Inventory Count)"
      subtitle="Run a physical count against system quantity, then reconcile the variance through review and approval"
      breadcrumb={["Stock", "Stocktaking"]}
      actions={
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/reports/stock-reconciliation"><FileBarChart className="h-3.5 w-3.5" /> Stocktaking Report</Link>
        </Button>
      }
    >
      <StocktakingPanel branches={branches} warehouses={warehouses} />
    </PageShell>
  );
}
