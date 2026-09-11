import { TrendingDown, TrendingUp } from "lucide-react";

/**
 * A delta of null means there is no meaningful comparison — yesterday was
 * zero, so "up 100%" would be noise dressed up as insight. It renders as
 * nothing rather than a misleading number.
 */
export function StatCard({
  label,
  value,
  icon,
  hint,
  delta,
  deltaSuffix,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  hint?: string;
  delta?: number | null;
  deltaSuffix?: string;
  tone?: "success" | "warning" | "danger";
}) {
  const toneColor =
    tone === "success"
      ? "var(--success)"
      : tone === "warning"
        ? "var(--warning)"
        : tone === "danger"
          ? "var(--destructive)"
          : undefined;

  const hasDelta = typeof delta === "number";
  const up = hasDelta && delta > 0;
  const flat = hasDelta && Math.abs(delta) < 0.05;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium" style={{ color: "var(--muted-foreground)" }}>
          {label}
        </p>
        <span style={{ color: "var(--muted-foreground)" }}>{icon}</span>
      </div>

      <p className="mt-2.5 text-[28px] font-semibold leading-none tracking-tight tnum" style={{ color: toneColor }}>
        {value}
      </p>

      {hasDelta ? (
        <p
          className="mt-2 flex items-center gap-1 text-[12px] font-medium"
          style={{ color: flat ? "var(--muted-foreground)" : up ? "var(--success)" : "var(--destructive)" }}
        >
          {!flat && (up ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
          <span className="tnum">
            {flat ? "No change" : `${up ? "+" : ""}${delta.toFixed(1)}%`}
          </span>
          {deltaSuffix && (
            <span style={{ color: "var(--muted-foreground)" }} className="font-normal">
              {deltaSuffix}
            </span>
          )}
        </p>
      ) : (
        hint && (
          <p className="mt-2 text-[12px]" style={{ color: "var(--muted-foreground)" }}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}
