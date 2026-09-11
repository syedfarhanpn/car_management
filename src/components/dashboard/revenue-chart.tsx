import { formatCompactINR, formatINR } from "@/lib/money";
import type { RevenueDay } from "@/lib/queries/dashboard";

const PLOT_HEIGHT = 150;

/**
 * Seven bars, drawn in CSS.
 *
 * A charting library would be several hundred kilobytes and a client component
 * for something that is a handful of divs and needs no interaction beyond the
 * tooltip the browser already gives us.
 *
 * The plot area has a fixed pixel height and the day labels sit in their own
 * row beneath it, so a bar's height is a plain percentage of the plot rather
 * than a percentage with the label row subtracted back out of it.
 */
export function RevenueChart({ days }: { days: RevenueDay[] }) {
  if (days.length === 0) {
    return (
      <p className="py-10 text-center text-[12.5px]" style={{ color: "var(--muted-foreground)" }}>
        No collections recorded yet.
      </p>
    );
  }

  const peak = Math.max(...days.map((d) => d.amountMinor));
  const total = days.reduce((a, d) => a + d.amountMinor, 0);

  // Keep a sensible axis on a quiet week so the grid does not collapse to zero.
  const axisTop = peak > 0 ? peak : 100_00;
  const ticks = [1, 0.75, 0.5, 0.25, 0];

  return (
    <div>
      <div className="flex gap-2.5">
        {/* Axis labels, positioned to line up with the grid lines opposite. */}
        <div
          className="flex flex-col justify-between shrink-0 text-[10px] tnum text-right"
          style={{ height: PLOT_HEIGHT, color: "var(--text-subtle)" }}
        >
          {ticks.map((t) => (
            <span key={t} className="leading-none -translate-y-[3px]">
              {formatCompactINR(Math.round(axisTop * t))}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <div className="relative" style={{ height: PLOT_HEIGHT }}>
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              {ticks.map((t) => (
                <div key={t} className="border-t" style={{ borderColor: "var(--border)" }} />
              ))}
            </div>

            <div className="relative h-full flex items-end gap-1.5 sm:gap-2">
              {days.map((d) => {
                const pct = peak > 0 ? (d.amountMinor / peak) * 100 : 0;
                return (
                  <div
                    key={d.date}
                    className="flex-1 rounded-t-[3px] transition-[height] duration-300"
                    style={{
                      // A non-zero day always gets a visible sliver; a zero day
                      // gets nothing, so the two are never confused.
                      height: d.amountMinor > 0 ? `max(${pct}%, 4px)` : 0,
                      background: "var(--chart-1)",
                    }}
                    title={`${d.label}: ${formatINR(d.amountMinor)}`}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex gap-1.5 sm:gap-2 mt-1.5">
            {days.map((d) => (
              <span
                key={d.date}
                className="flex-1 text-center text-[10.5px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[12px]" style={{ color: "var(--muted-foreground)" }}>
        <span className="font-medium tnum" style={{ color: "var(--foreground)" }}>
          {formatINR(total)}
        </span>{" "}
        collected this week
      </p>
    </div>
  );
}
