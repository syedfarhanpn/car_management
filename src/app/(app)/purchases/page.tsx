import { requireRole } from "@/lib/auth";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function Page() {
  await requireRole(["ADMIN", "MANAGER"]);
  return (
    <ModulePlaceholder
      moduleKey="purchases"
      ready={[
              "Suppliers, purchase bills and line items",
              "Pass-through flag that bypasses stock and revenue entirely",
              "Purchase lines convert purchase units into base units",
              "Moving-average cost per item",
              "Supplier payments and payables"
      ]}
      upcoming={[
              "Record a supplier bill with a photo of it",
              "Buy a part for a specific customer and job card",
              "Outstanding client reimbursables report",
              "Supplier payables and ageing",
              "Reorder suggestions from low stock"
      ]}
    />
  );
}
