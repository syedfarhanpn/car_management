/**
 * Where every open car currently sits. Bars are scaled against the busiest
 * stage rather than the total, so a queue of one still reads as a visible bar
 * instead of a sliver — the point is to spot the pile-up, not to compare
 * proportions.
 */
const STAGES: { status: string; label: string; color: string }[] = [
  { status: "DRAFT", label: "New", color: "var(--muted-foreground)" },
  { status: "ESTIMATE_SENT", label: "Awaiting approval", color: "var(--chart-2)" },
  { status: "ESTIMATE_APPROVED", label: "Approved", color: "var(--chart-3)" },
  { status: "IN_PROGRESS", label: "In progress", color: "var(--chart-1)" },
  { status: "COMPLETED", label: "Ready", color: "var(--chart-4)" },
  { status: "INVOICED", label: "Invoiced", color: "var(--success)" },
];

export function WorkloadBars({ counts }: { counts: Record<string, number> }) {
  const rows = STAGES.map((s) => ({ ...s, n: counts[s.status] ?? 0 }));
  const peak = Math.max(1, ...rows.map((r) => r.n));

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.status}>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-[12.5px] font-medium">{r.label}</span>
            <span
              className="text-[12.5px] tnum font-medium"
              style={{ color: r.n === 0 ? "var(--text-subtle)" : "var(--foreground)" }}
            >
              {r.n}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${(r.n / peak) * 100}%`, background: r.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
