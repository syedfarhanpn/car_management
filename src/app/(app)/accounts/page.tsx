import { requireRole } from "@/lib/auth";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function Page() {
  await requireRole(["ADMIN", "MANAGER"]);
  return (
    <ModulePlaceholder
      moduleKey="accounts"
      ready={[
              "Expense categories split fixed vs variable",
              "Customer receivables and supplier payables",
              "Daily cash closing with expected vs counted variance",
              "Every payment method recorded separately"
      ]}
      upcoming={[
              "Expense entry with receipt photo",
              "Daily closing screen with cash count",
              "Cash and bank position",
              "Profit and loss for a period"
      ]}
    />
  );
}
