import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Car,
  CircleCheck,
  ClipboardList,
  IndianRupee,
  Package,
  TrendingUp,
  UserPlus,
  Wrench,
} from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { formatCompactINR, formatINR } from "@/lib/money";
import { formatRegistration } from "@/lib/vehicle";
import {
  getActiveJobs,
  getDashboardStats,
  getPopularServices,
  getRevenueWeek,
  getTodaySchedule,
  getWorkload,
} from "@/lib/queries/dashboard";
import { JOB_STATUS } from "@/components/ui";
import { StatCard } from "@/components/dashboard/stat-card";
import { WorkloadBars } from "@/components/dashboard/workload-bars";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { PopularServices } from "@/components/dashboard/popular-services";

const QUICK_ACTIONS = [
  { href: "/job-cards/new", label: "New Job", icon: Wrench, accent: "var(--chart-1)" },
  { href: "/clients/new", label: "Add Customer", icon: UserPlus, accent: "var(--chart-4)" },
  { href: "/inventory/new", label: "Add Item", icon: Package, accent: "var(--chart-2)" },
  { href: "/purchases/new", label: "Record Bill", icon: IndianRupee, accent: "var(--chart-3)" },
];

export default async function DashboardPage() {
  const user = await requireUser();
  const showMoney = can.viewReports(user);

  const [stats, workload, activeJobs, revenueWeek, popular, schedule] = await Promise.all([
    getDashboardStats(user.orgId),
    getWorkload(user.orgId),
    getActiveJobs(user.orgId),
    showMoney ? getRevenueWeek(user.orgId) : Promise.resolve([]),
    getPopularServices(user.orgId),
    getTodaySchedule(user.orgId),
  ]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1500px] mx-auto">
      <header className="mb-6">
        <h2 className="text-[22px] font-semibold tracking-tight">Dashboard</h2>
        <p className="mt-0.5 text-[13.5px]" style={{ color: "var(--muted-foreground)" }}>
          Overview of today&apos;s workshop activity.
        </p>
      </header>

      {/* ------------------------------------------------------------ stats */}
      <section className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Vehicles Today"
          value={String(stats.vehiclesToday)}
          icon={<Car size={15} />}
          delta={stats.vehiclesTodayDelta}
          deltaSuffix="vs yesterday"
        />
        <StatCard
          label="Active Jobs"
          value={String(stats.activeJobs)}
          icon={<ClipboardList size={15} />}
          hint={
            stats.unassignedJobs > 0
              ? `${stats.unassignedJobs} awaiting assignment`
              : "All assigned"
          }
        />
        <StatCard
          label="Ready for Delivery"
          value={String(stats.readyForDelivery)}
          icon={<CircleCheck size={15} />}
          hint={stats.readyForDelivery > 0 ? "Waiting on the customer" : "Nothing waiting"}
          tone={stats.readyForDelivery > 0 ? "success" : undefined}
        />
        {showMoney ? (
          <StatCard
            label="Today's Revenue"
            value={formatCompactINR(stats.revenueToday)}
            icon={<TrendingUp size={15} />}
            delta={stats.revenueTodayDelta}
            deltaSuffix="vs yesterday"
          />
        ) : (
          <StatCard
            label="Vehicles on Record"
            value={String(stats.vehicleCount)}
            icon={<Car size={15} />}
            hint={`${stats.clientCount} customers`}
          />
        )}
      </section>

      {/*
        Money the shop has fronted on customer parts. Given its own row rather
        than folded into a tile — it is neither revenue nor stock, so it appears
        nowhere else, which is exactly why it goes unnoticed.
      */}
      {can.viewCosts(user) && stats.reimbursablesOutstanding > 0 && (
        <div
          className="mt-3 card p-3.5 flex flex-wrap items-center justify-between gap-3"
          style={{ borderColor: "var(--warning)" }}
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} style={{ color: "var(--warning)" }} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-[13px] font-medium">
                {formatINR(stats.reimbursablesOutstanding)} of your cash is sitting in customer parts
              </p>
              <p className="mt-0.5 text-[12px]" style={{ color: "var(--muted-foreground)" }}>
                Bought from outside on a customer&apos;s behalf and not yet recovered. Not revenue, not stock.
              </p>
            </div>
          </div>
          <Link href="/purchases?filter=pass-through" className="btn btn-ghost text-[12.5px] py-1.5">
            View <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {/* ----------------------------------------- workload / actions / today */}
      <section className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="card p-4">
          <h3 className="text-[14px] font-semibold">Workshop Workload</h3>
          <div className="mt-3.5">
            <WorkloadBars counts={Object.fromEntries(workload)} />
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-[14px] font-semibold">Quick Actions</h3>
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="rounded-lg border p-3 flex flex-col items-center justify-center gap-2 transition-colors hover:bg-[var(--accent)]"
              >
                <span
                  className="grid place-items-center w-8 h-8 rounded-lg"
                  style={{ background: `color-mix(in srgb, ${a.accent} 14%, transparent)`, color: a.accent }}
                >
                  <a.icon size={16} />
                </span>
                <span className="text-[12px] font-medium text-center leading-tight">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-[14px] font-semibold">Today&apos;s Schedule</h3>
          {schedule.length === 0 ? (
            <p className="mt-6 mb-6 text-center text-[12.5px]" style={{ color: "var(--muted-foreground)" }}>
              Nothing booked in yet today.
            </p>
          ) : (
            <ol className="mt-3.5 space-y-3">
              {schedule.map((item) => (
                <li key={item.id} className="flex gap-3">
                  <div className="shrink-0 w-11 pt-0.5 text-right">
                    <span className="text-[11.5px] tnum font-medium" style={{ color: "var(--muted-foreground)" }}>
                      {item.time}
                    </span>
                  </div>
                  <div className="relative pl-3 flex-1 min-w-0" style={{ borderLeft: "1px solid var(--border)" }}>
                    <span
                      className="absolute -left-[3.5px] top-1.5 w-[6px] h-[6px] rounded-full"
                      style={{ background: "var(--primary)" }}
                    />
                    <Link href={`/job-cards/${item.id}`} className="block rounded-md px-2 py-1.5 -mx-1 transition-colors hover:bg-[var(--accent)]">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[12.5px] font-semibold tnum">
                          {formatRegistration(item.registration)}
                        </span>
                        {item.assignedTo && (
                          <span
                            className="badge shrink-0"
                            style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                          >
                            {item.assignedTo.split(" ")[0]}
                          </span>
                        )}
                      </div>
                      <p className="text-[11.5px]" style={{ color: "var(--muted-foreground)" }}>
                        {item.vehicle}
                      </p>
                      <p className="mt-0.5 text-[12px] font-medium truncate" style={{ color: "var(--primary)" }}>
                        {item.service}
                        {item.extraServices > 0 && ` +${item.extraServices} more`}
                      </p>
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------ active jobs */}
      <section className="mt-4 card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-[14px] font-semibold">Active Jobs</h3>
          <Link href="/job-cards" className="text-[12.5px] font-medium" style={{ color: "var(--primary)" }}>
            View all
          </Link>
        </div>

        {activeJobs.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[13.5px] font-medium">No active jobs</p>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--muted-foreground)" }}>
              Open one by searching the last four digits of a number plate.
            </p>
            <Link href="/job-cards/new" className="btn btn-primary mt-4">
              <Wrench size={15} />
              New job card
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ color: "var(--muted-foreground)" }}>
                  <th className="text-left font-medium px-4 py-2.5">Job</th>
                  <th className="text-left font-medium px-3 py-2.5">Vehicle</th>
                  <th className="text-left font-medium px-3 py-2.5">Customer</th>
                  <th className="text-left font-medium px-3 py-2.5">Services</th>
                  <th className="text-left font-medium px-3 py-2.5">Assigned</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-right font-medium px-4 py-2.5">Amount</th>
                </tr>
              </thead>
              <tbody>
                {activeJobs.map((j) => {
                  const st = JOB_STATUS[j.status] ?? JOB_STATUS.DRAFT;
                  return (
                    <tr key={j.id} className="border-t">
                      <td className="px-4 py-2.5">
                        <Link href={`/job-cards/${j.id}`} className="font-medium tnum hover:underline">
                          {j.jobNumber.split("/").slice(-1)[0]}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-medium tnum">{formatRegistration(j.registration)}</span>
                        <div className="text-[11.5px]" style={{ color: "var(--muted-foreground)" }}>
                          {j.make && j.model ? `${j.make} ${j.model}` : "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2.5" style={{ color: "var(--muted-foreground)" }}>
                        {j.clientName}
                      </td>
                      <td className="px-3 py-2.5 max-w-[200px]">
                        <span className="block truncate" style={{ color: "var(--muted-foreground)" }}>
                          {j.services}
                          {j.serviceCount > 1 && ` +${j.serviceCount - 1}`}
                        </span>
                      </td>
                      <td className="px-3 py-2.5" style={{ color: "var(--muted-foreground)" }}>
                        {j.assignedTo?.split(" ")[0] ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill label={st.label} tone={st.tone} />
                      </td>
                      <td className="px-4 py-2.5 text-right tnum font-medium">{formatINR(j.totalMinor)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------------------------- revenue / popular */}
      <section className="mt-4 grid gap-3 lg:grid-cols-2">
        {showMoney && (
          <div className="card p-4">
            <h3 className="text-[14px] font-semibold">Revenue Overview</h3>
            <p className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>
              Collected over the last 7 days
            </p>
            <div className="mt-4">
              <RevenueChart days={revenueWeek} />
            </div>
          </div>
        )}

        <div className={`card p-4 ${showMoney ? "" : "lg:col-span-2"}`}>
          <h3 className="text-[14px] font-semibold">Popular Services</h3>
          <p className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>
            Last 90 days
          </p>
          <div className="mt-4">
            <PopularServices services={popular} />
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: "var(--muted)", fg: "var(--muted-foreground)" },
    brand: { bg: "color-mix(in srgb, var(--chart-1) 16%, transparent)", fg: "var(--chart-1)" },
    success: { bg: "color-mix(in srgb, var(--success) 16%, transparent)", fg: "var(--success)" },
    warning: { bg: "color-mix(in srgb, var(--warning) 18%, transparent)", fg: "var(--warning)" },
    danger: { bg: "color-mix(in srgb, var(--destructive) 16%, transparent)", fg: "var(--destructive)" },
  };
  const c = map[tone] ?? map.neutral;
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg }}>
      {label}
    </span>
  );
}
