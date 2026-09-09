import Link from "next/link";
import { ArrowLeft, Check, Circle } from "lucide-react";
import { Icon } from "./icon";
import { MODULES } from "@/lib/modules";

/**
 * Honest placeholder. Rather than a blank "coming soon", each module states
 * what already exists underneath it (the schema and rules are built) versus
 * what the screens will add. Useful in a client demo: it shows the foundation
 * is real, not vapour.
 */
export function ModulePlaceholder({
  moduleKey,
  ready,
  upcoming,
}: {
  moduleKey: string;
  ready: string[];
  upcoming: string[];
}) {
  const mod = MODULES.find((m) => m.key === moduleKey);
  if (!mod) return null;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[900px] mx-auto">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium"
        style={{ color: "var(--text-muted)" }}
      >
        <ArrowLeft size={14} />
        Dashboard
      </Link>

      <header className="mt-4 flex items-start gap-3.5">
        <div
          className="grid place-items-center w-12 h-12 rounded-xl shrink-0"
          style={{ background: `color-mix(in srgb, ${mod.accent} 12%, transparent)`, color: mod.accent }}
        >
          <Icon name={mod.icon} size={24} />
        </div>
        <div>
          <h1 className="text-[21px] font-semibold tracking-tight">{mod.name}</h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
            {mod.description}
          </p>
        </div>
      </header>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="card p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--success)" }}>
            Already built
          </p>
          <ul className="mt-2.5 space-y-2">
            {ready.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13px]">
                <Check size={15} className="mt-0.5 shrink-0" style={{ color: "var(--success)" }} />
                <span style={{ color: "var(--text-muted)" }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
            Phase {mod.phase} screens
          </p>
          <ul className="mt-2.5 space-y-2">
            {upcoming.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13px]">
                <Circle size={15} className="mt-0.5 shrink-0" style={{ color: "var(--text-subtle)" }} />
                <span style={{ color: "var(--text-muted)" }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
