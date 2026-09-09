import { requireRole } from "@/lib/auth";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function Page() {
  await requireRole(["ADMIN", "MANAGER"]);
  return (
    <ModulePlaceholder
      moduleKey="whatsapp"
      ready={[
              "Message log with status, provider id and failure reason",
              "Per-tenant editable templates with variables",
              "Provider adapter interface — your team's API drops in as one file",
              "Client-level opt-in flag"
      ]}
      upcoming={[
              "Send an invoice or 'car is ready' message from a job card",
              "Service-due reminders from odometer and last service date",
              "Promotional campaigns with audience filters",
              "Delivery log and retry handling"
      ]}
    />
  );
}
