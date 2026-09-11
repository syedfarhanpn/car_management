"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutGrid, LogOut, Menu, PanelLeftClose, X } from "lucide-react";
import { Icon } from "./icon";
import type { ModuleGroup, ModuleDef } from "@/lib/modules";

type Group = { group: ModuleGroup; items: ModuleDef[] };

const GROUP_LABEL: Record<ModuleGroup, string> = {
  WORKSPACE: "Workspace",
  OPERATIONS: "Operations",
  ANALYTICS: "Analytics",
  SYSTEM: "System",
};

export function Sidebar({
  groups,
  orgName,
  user,
  onLogout,
}: {
  groups: Group[];
  orgName: string;
  user: { name: string; email: string; role: string };
  onLogout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Remember the collapsed state per browser — a small convenience, and the
  // kind of thing that is annoying to lose on every navigation.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("pitstop:sidebar") === "collapsed");
    } catch {
      /* private mode, blocked storage — the default is fine */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("pitstop:sidebar", next ? "collapsed" : "open");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const brand = (
    <div className="flex items-center gap-2.5 min-w-0">
      <div
        className="grid place-items-center w-7 h-7 rounded-md shrink-0"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M5 17h14M6.5 17V9.5L8 6h8l1.5 3.5V17" />
          <circle cx="8" cy="17" r="1.5" />
          <circle cx="16" cy="17" r="1.5" />
        </svg>
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold tracking-tight leading-tight truncate">PitStop</p>
          <p className="text-[11px] truncate" style={{ color: "var(--muted-foreground)" }}>
            {orgName}
          </p>
        </div>
      )}
    </div>
  );

  function navLink(href: string, label: string, icon: string, active: boolean) {
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setOpen(false)}
        title={collapsed ? label : undefined}
        className={`flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] font-medium transition-colors ${
          collapsed ? "justify-center" : ""
        }`}
        style={
          active
            ? { background: "var(--accent)", color: "var(--foreground)" }
            : { color: "var(--muted-foreground)" }
        }
      >
        <Icon name={icon} size={16} className="shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
  }

  const nav = (
    <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
      <div className="space-y-0.5">
        {navLink("/dashboard", "Dashboard", "LayoutGrid", pathname === "/dashboard")}
      </div>

      {groups.map((g) => (
        <div key={g.group} className="space-y-0.5">
          {!collapsed && <p className="eyebrow px-2 pb-1">{GROUP_LABEL[g.group]}</p>}
          {collapsed && <div className="mx-2 my-2 border-t" />}
          {g.items.map((m) => navLink(m.href, m.name, m.icon, isActive(m.href)))}
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t p-2">
      <div className={`flex items-center gap-2.5 px-1 py-1 ${collapsed ? "justify-center" : ""}`}>
        <div
          className="grid place-items-center w-7 h-7 rounded-full text-[11px] font-semibold shrink-0"
          style={{ background: "var(--accent)", color: "var(--foreground)" }}
          title={collapsed ? user.name : undefined}
        >
          {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium leading-tight">{user.name}</p>
              <p className="truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
              </p>
            </div>
            <form action={onLogout}>
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                className="grid place-items-center w-7 h-7 rounded-md transition-colors hover:bg-[var(--accent)]"
                style={{ color: "var(--muted-foreground)" }}
              >
                <LogOut size={15} />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile bar — the workshop floor uses phones. */}
      <div
        className="lg:hidden sticky top-0 z-30 flex items-center justify-between border-b px-3 py-2"
        style={{ background: "var(--background)" }}
      >
        {brand}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          className="grid place-items-center w-9 h-9 rounded-md"
          style={{ color: "var(--muted-foreground)" }}
        >
          {open ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col" style={{ background: "var(--background)" }}>
          <div className="flex items-center justify-between border-b px-3 py-2">
            {brand}
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="grid place-items-center w-9 h-9 rounded-md"
              style={{ color: "var(--muted-foreground)" }}
            >
              <X size={19} />
            </button>
          </div>
          {nav}
          {footer}
        </div>
      )}

      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r h-screen sticky top-0 transition-[width] duration-150 ${
          collapsed ? "w-[60px]" : "w-[228px]"
        }`}
        style={{ background: "var(--sidebar)", borderColor: "var(--sidebar-border)" }}
      >
        <div className={`flex items-center h-14 px-3 border-b ${collapsed ? "justify-center" : "justify-between"}`}>
          {brand}
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
              className="grid place-items-center w-7 h-7 rounded-md transition-colors hover:bg-[var(--accent)]"
              style={{ color: "var(--muted-foreground)" }}
            >
              <PanelLeftClose size={15} />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            className="mx-auto mt-2 grid place-items-center w-7 h-7 rounded-md transition-colors hover:bg-[var(--accent)]"
            style={{ color: "var(--muted-foreground)" }}
          >
            <Menu size={15} />
          </button>
        )}

        {nav}
        {footer}
      </aside>
    </>
  );
}
