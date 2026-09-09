import { requireRole } from "@/lib/auth";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function Page() {
  await requireRole(["ADMIN", "MANAGER"]);
  return (
    <ModulePlaceholder
      moduleKey="inventory"
      ready={[
              "Three item types: stocked parts, bulk consumables, pass-through",
              "Append-only stock ledger — quantity is derived, never stored",
              "Base-unit modelling so a 5L can and a 500ml bottle compare",
              "Service recipes that auto-deduct consumables on job close",
              "Stock take tables with variance capture"
      ]}
      upcoming={[
              "Stock on hand with low-stock highlighting",
              "Recipe editor per service and vehicle class",
              "Stock take entry and variance report",
              "Manual adjustments with a mandatory reason",
              "Consumption: expected vs actual, by item and period"
      ]}
    />
  );
}
