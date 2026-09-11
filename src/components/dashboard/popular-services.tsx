import type { PopularService } from "@/lib/queries/dashboard";

export function PopularServices({ services }: { services: PopularService[] }) {
  if (services.length === 0) {
    return (
      <p className="py-10 text-center text-[12.5px]" style={{ color: "var(--muted-foreground)" }}>
        No services billed in the last 90 days.
      </p>
    );
  }

  // Scaled against the most-booked service, so the leader fills the bar and
  // the rest read as a share of it at a glance.
  const peak = services[0].jobs;

  return (
    <div className="space-y-3">
      {services.map((s) => (
        <div key={s.name}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-[12.5px] font-medium truncate">{s.name}</span>
            <span className="text-[12px] tnum shrink-0" style={{ color: "var(--muted-foreground)" }}>
              {s.jobs} {s.jobs === 1 ? "job" : "jobs"}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${(s.jobs / peak) * 100}%`, background: "var(--chart-1)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
