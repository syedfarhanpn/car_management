import { requireRole } from "@/lib/auth";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function Page() {
  await requireRole(["ADMIN", "MANAGER"]);
  return (
    <ModulePlaceholder
      moduleKey="employees"
      ready={[
              "Employee records separate from login users",
              "Attendance table with per-day status",
              "Technician stored on job lines for productivity reporting",
              "Salary field ready — commission is off by decision, not by omission"
      ]}
      upcoming={[
              "Employee directory and profiles",
              "Daily attendance marking",
              "Monthly attendance summary",
              "Jobs completed per technician"
      ]}
    />
  );
}
