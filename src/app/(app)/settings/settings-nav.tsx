"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "Overview", exact: true },
  { href: "/settings/business", label: "Business" },
  { href: "/settings/tax", label: "Tax" },
  { href: "/settings/services", label: "Services" },
  { href: "/settings/pricing", label: "Prices" },
  { href: "/settings/vehicle-classes", label: "Vehicle classes" },
  { href: "/settings/models", label: "Models" },
  { href: "/settings/recipes", label: "Recipes" },
  { href: "/settings/users", label: "Users" },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-20 border-b overflow-x-auto" style={{ background: "var(--surface)" }}>
      <nav className="flex gap-0.5 px-3 sm:px-5 min-w-max">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className="px-3 py-3 text-[13px] font-medium whitespace-nowrap transition-colors"
              style={{
                color: active ? "var(--brand)" : "var(--text-muted)",
                boxShadow: active ? "inset 0 -2px 0 var(--brand)" : undefined,
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
