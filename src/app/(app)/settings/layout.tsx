import { requireRole } from "@/lib/auth";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Every settings screen is admin-only; enforcing it here means an individual
  // page can never be added later that forgets to check.
  await requireRole(["ADMIN"]);

  return (
    <div>
      <SettingsNav />
      {children}
    </div>
  );
}
