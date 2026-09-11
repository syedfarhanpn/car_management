import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { groupedModulesFor } from "@/lib/modules";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { logout } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const groups = groupedModulesFor(user.role);

  const db = await getDb();
  const [org] = await db
    .select({ name: s.organizations.name })
    .from(s.organizations)
    .where(eq(s.organizations.id, user.orgId))
    .limit(1);

  return (
    <div className="lg:flex min-h-screen">
      <Sidebar
        groups={groups}
        orgName={org?.name ?? "Workshop"}
        user={{ name: user.name, email: user.email, role: user.role }}
        onLogout={logout}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
