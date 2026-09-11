"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { MODULES } from "@/lib/modules";
import { CommandPalette } from "./command-palette";

/**
 * Page title is derived from the route rather than passed down, so a new page
 * gets a correct header without having to remember to wire one up.
 */
function titleFor(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard";
  const match = MODULES.filter((m) => pathname.startsWith(m.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return match?.name ?? "PitStop";
}

export function Topbar() {
  const pathname = usePathname();

  return (
    <header
      className="sticky top-0 z-20 hidden lg:flex items-center gap-4 h-14 px-5 border-b"
      style={{ background: "color-mix(in srgb, var(--background) 85%, transparent)", backdropFilter: "blur(8px)" }}
    >
      <h1 className="text-[15px] font-semibold tracking-tight shrink-0">{titleFor(pathname)}</h1>

      <div className="flex-1 flex justify-center px-4">
        <CommandPalette />
      </div>

      <Link href="/job-cards/new" className="btn btn-primary shrink-0">
        <Plus size={15} />
        New job card
      </Link>
    </header>
  );
}
