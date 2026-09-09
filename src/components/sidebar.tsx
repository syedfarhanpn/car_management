"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutGrid, LogOut, Menu, X } from "lucide-react";
import { Icon } from "./icon";
import type { ModuleDef } from "@/lib/modules";

export function Sidebar({
  modules,
  user,
  onLogout,
}: {
  modules: ModuleDef[];
  user: { name: string; email: string; role: string };
  onLogout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const nav = (
    <nav className="flex-1 overflow-y-auto px-2.5 py-3">
      <Link
        href="/dashboard"
        onClick={() => setOpen(false)}
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors"
        style={
          pathname === "/dashboard"
            ? { background: "var(--brand-soft)", color: "var(--brand)" }
            : { color: "var(--text-muted)" }
        }
      >
        <LayoutGrid size={17} />
        Dashboard
      </Link>

      <p
        className="mt-5 mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-subtle)" }}
      >
        Modules
      </p>

      {modules.map((m) => (
        <Link
          key={m.key}
          href={m.href}
          onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors"
          style={
            isActive(m.href)
              ? { background: "var(--brand-soft)", color: "var(--brand)" }
              : { color: "var(--text-muted)" }
          }
        >
          <Icon name={m.icon} size={17} />
          {m.name}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t p-2.5">
      <div className="flex items-center gap-2.5 px-1.5 py-1.5">
        <div
          className="grid place-items-center w-8 h-8 rounded-full text-[12px] font-semibold shrink-0"
          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
        >
          {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{user.name}</p>
          <p className="truncate text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
            {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
          </p>
        </div>
        <form action={onLogout}>
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            className="grid place-items-center w-8 h-8 rounded-lg transition-colors hover:bg-[var(--surface-2)]"
            style={{ color: "var(--text-subtle)" }}
          >
            <LogOut size={16} />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile bar — the workshop floor uses phones. */}
      <div
        className="lg:hidden sticky top-0 z-30 flex items-center justify-between border-b px-3 py-2.5"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="grid place-items-center w-7 h-7 rounded-md"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 17h14M6.5 17V9.5L8 6h8l1.5 3.5V17" />
              <circle cx="8" cy="17" r="1.6" />
              <circle cx="16" cy="17" r="1.6" />
            </svg>
          </div>
          <span className="font-semibold tracking-tight">PitStop</span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          className="grid place-items-center w-9 h-9 rounded-lg"
          style={{ color: "var(--text-muted)" }}
        >
          {open ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 flex flex-col"
          style={{ background: "var(--surface)" }}
        >
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <span className="font-semibold tracking-tight">Menu</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="grid place-items-center w-9 h-9 rounded-lg"
              style={{ color: "var(--text-muted)" }}
            >
              <X size={19} />
            </button>
          </div>
          {nav}
          {footer}
        </div>
      )}

      <aside
        className="hidden lg:flex flex-col w-[232px] shrink-0 border-r h-screen sticky top-0"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-center gap-2.5 px-4 h-14 border-b">
          <div
            className="grid place-items-center w-7 h-7 rounded-md"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 17h14M6.5 17V9.5L8 6h8l1.5 3.5V17" />
              <circle cx="8" cy="17" r="1.6" />
              <circle cx="16" cy="17" r="1.6" />
            </svg>
          </div>
          <span className="font-semibold tracking-tight">PitStop</span>
        </div>
        {nav}
        {footer}
      </aside>
    </>
  );
}
