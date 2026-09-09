import { requireUser } from "@/lib/auth";
import { modulesFor } from "@/lib/modules";
import { Sidebar } from "@/components/sidebar";
import { logout } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const modules = modulesFor(user.role);

  return (
    <div className="lg:flex min-h-screen">
      <Sidebar
        modules={modules}
        user={{ name: user.name, email: user.email, role: user.role }}
        onLogout={logout}
      />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
