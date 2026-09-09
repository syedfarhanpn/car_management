import Link from "next/link";
import { AlertTriangle, ArrowRight, HandCoins, Package, Wrench } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { modulesFor } from "@/lib/modules";
import { Icon } from "@/components/icon";
import { formatINR } from "@/lib/money";
import { getDashboardStats, getRecentJobs } from "@/lib/queries/dashboard";
import { formatRegistration } from "@/lib/vehicle";

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  DRAFT: { bg: "var(--surface-2)", fg: "var(--text-muted)", label: "Draft" },
  ESTIMATE_SENT: { bg: "var(--warning-soft)", fg: "var(--warning)", label: "Estimate sent" },
  ESTIMATE_APPROVED: { bg: "var(--brand-soft)", fg: "var(--brand)", label: "Approved" },
  ESTIMATE_REJECTED: { bg: "var(--danger-soft)", fg: "var(--danger)", label: "Rejected" },
  IN_PROGRESS: { bg: "var(--brand-soft)", fg: "var(--brand)", label: "In progress" },
  COMPLETED: { bg: "var(--success-soft)", fg: "var(--success)", label: "Ready" },
  INVOICED: { bg: "var(--success-soft)", fg: "var(--success)", label: "Invoiced" },
  DELIVERED: { bg: "var(--surface-2)", fg: "var(--text-muted)", label: "Delivered" },
  CANCELLED: { bg: "var(--surface-2)", fg: "var(--text-subtle)", label: "Cancelled" },
};

function Stat({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning" | "danger";
  icon: React.ReactNode;
}) {
  const fg =
    tone === "warning" ? "var(--warning)" : tone === "danger" ? "var(--danger)" : "var(--text)";
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
          {label}
        </p>
        <span style={{ color: "var(--text-subtle)" }}>{icon}</span>
      </div>
      <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight tnum" style={{ color: fg }}>
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const modules = modulesFor(user.role);
  const [stats, recentJobs] = await Promise.all([
    getDashboardStats(user.orgId),
    getRecentJobs(user.orgId),
  ]);

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">
            {greeting}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
            Prestige Auto Care · Vyttila (Main) ·{" "}
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <Link href="/job-cards/new" className="btn btn-primary">
          <Wrench size={16} />
          New job card
        </Link>
      </header>

      {/* Numbers a workshop owner actually opens the app to check. */}
      <section className="mt-6 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Open job cards"
          value={String(stats.openJobs)}
          hint={`${stats.jobsToday} opened today`}
          icon={<Wrench size={16} />}
        />
        {can.viewReports(user) ? (
          <Stat
            label="Collected today"
            value={formatINR(stats.revenueToday)}
            hint="All payment methods"
            icon={<HandCoins size={16} />}
          />
        ) : (
          <Stat
            label="Vehicles on record"
            value={String(stats.vehicleCount)}
            hint={`${stats.clientCount} clients`}
            icon={<Package size={16} />}
          />
        )}
        {can.viewReports(user) && (
          <Stat
            label="Outstanding from clients"
            value={formatINR(stats.receivables)}
            hint="Unpaid issued invoices"
            tone={stats.receivables > 0 ? "warning" : "default"}
            icon={<HandCoins size={16} />}
          />
        )}
        {can.viewReports(user) ? (
          <Stat
            label="Low stock items"
            value={String(stats.lowStockCount)}
            hint="At or below reorder level"
            tone={stats.lowStockCount > 0 ? "warning" : "default"}
            icon={<AlertTriangle size={16} />}
          />
        ) : (
          <Stat
            label="Clients on record"
            value={String(stats.clientCount)}
            hint="Searchable by plate or phone"
            icon={<Package size={16} />}
          />
        )}
      </section>

      {/*
        Money the shop has fronted on parts bought for customers. Deliberately
        given its own row rather than folded into a generic tile - it is the
        number the owner has never been able to see before.
      */}
      {can.viewCosts(user) && stats.reimbursablesOutstanding > 0 && (
        <div
          className="mt-3 card p-4 flex flex-wrap items-center justify-between gap-3"
          style={{ borderColor: "var(--warning)", background: "var(--warning-soft)" }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} style={{ color: "var(--warning)" }} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-[13.5px] font-semibold" style={{ color: "var(--warning)" }}>
                {formatINR(stats.reimbursablesOutstanding)} of your cash is sitting in customer parts
              </p>
              <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                Parts bought from outside on a customer&apos;s behalf, not yet recovered. Not revenue, not stock.
              </p>
            </div>
          </div>
          <Link href="/purchases?filter=pass-through" className="btn btn-ghost text-[13px]">
            View
            <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {/* The module grid — the client's "icons for each module" requirement. */}
      <section className="mt-7">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
          Modules
        </h2>
        <div className="mt-3 grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {modules.map((m) => (
            <Link
              key={m.key}
              href={m.href}
              className="card p-4 group transition-shadow hover:shadow-[var(--shadow-md)]"
            >
              <div className="flex items-start justify-between">
                <div
                  className="grid place-items-center w-10 h-10 rounded-lg shrink-0"
                  style={{ background: `color-mix(in srgb, ${m.accent} 12%, transparent)`, color: m.accent }}
                >
                  <Icon name={m.icon} size={20} />
                </div>
                <span
                  className="badge"
                  style={{ background: "var(--surface-2)", color: "var(--text-subtle)" }}
                  title={`Delivered in phase ${m.phase}`}
                >
                  P{m.phase}
                </span>
              </div>
              <p className="mt-3 text-[14.5px] font-semibold tracking-tight">{m.name}</p>
              <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--text-muted)" }}>
                {m.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-7">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
            Recent job cards
          </h2>
          <Link href="/job-cards" className="text-[12.5px] font-medium" style={{ color: "var(--brand)" }}>
            View all
          </Link>
        </div>

        <div className="mt-3 card overflow-hidden">
          {recentJobs.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[13.5px] font-medium">No job cards yet</p>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                Job cards arrive in Phase 2. The schema, pricing matrix and search behind them are already in place.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                    <th className="text-left font-medium px-4 py-2.5">Job no.</th>
                    <th className="text-left font-medium px-4 py-2.5">Vehicle</th>
                    <th className="text-left font-medium px-4 py-2.5">Client</th>
                    <th className="text-left font-medium px-4 py-2.5">Status</th>
                    <th className="text-right font-medium px-4 py-2.5">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map((j) => {
                    const st = STATUS_STYLE[j.status] ?? STATUS_STYLE.DRAFT;
                    return (
                      <tr key={j.id} className="border-t">
                        <td className="px-4 py-2.5 font-medium tnum">{j.jobNumber}</td>
                        <td className="px-4 py-2.5 tnum">{formatRegistration(j.registration)}</td>
                        <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>
                          {j.clientName}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="badge" style={{ background: st.bg, color: st.fg }}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tnum font-medium">{formatINR(j.totalMinor)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
