import { requireRole } from "@/lib/auth";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function Page() {
  await requireRole(["ADMIN", "MANAGER"]);
  return (
    <ModulePlaceholder
      moduleKey="revenue"
      ready={[
              "Payments, invoices and job values all queryable by period",
              "Cost captured per line, so margin is computable",
              "Consumable cost attributable per service via recipes"
      ]}
      upcoming={[
              "Revenue by day, week and month",
              "Margin by service and by vehicle class",
              "Top customers and top vehicles",
              "Consumption variance in rupees",
              "Technician productivity"
      ]}
    />
  );
}
