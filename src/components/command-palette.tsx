"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Car, Search, User } from "lucide-react";
import { globalSearch, type SearchHit } from "@/app/(app)/global-search";

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
    else {
      setQuery("");
      setHits([]);
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(() => {
      start(async () => {
        const results = await globalSearch(q);
        // Ignore a slow response that lost the race to a newer keystroke.
        if (id !== seq.current) return;
        setHits(results);
        setActive(0);
      });
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  function go(hit: SearchHit) {
    setOpen(false);
    router.push(hit.href);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full max-w-md rounded-md border px-3 py-[7px] text-[13px] transition-colors hover:bg-[var(--accent)]"
        style={{ background: "var(--background)", color: "var(--muted-foreground)" }}
      >
        <Search size={14} />
        <span className="flex-1 text-left">Search a plate, phone or name…</span>
        <kbd
          className="hidden sm:inline-flex items-center rounded border px-1.5 text-[10.5px] font-medium tnum"
          style={{ color: "var(--text-subtle)" }}
        >
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
          style={{ background: "rgba(0,0,0,.5)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="card w-full max-w-lg overflow-hidden"
            style={{ background: "var(--popover)", boxShadow: "var(--shadow-md)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 px-3.5 border-b">
              <Search size={16} style={{ color: "var(--muted-foreground)" }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((i) => Math.min(i + 1, hits.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  }
                  if (e.key === "Enter" && hits[active]) {
                    e.preventDefault();
                    go(hits[active]);
                  }
                }}
                placeholder="4521, 98470 12345, or Rahul"
                className="flex-1 bg-transparent py-3 text-[14px] outline-none tnum"
                style={{ color: "var(--foreground)" }}
              />
            </div>

            <div className="max-h-[320px] overflow-y-auto p-1.5">
              {query.trim().length < 2 && (
                <p className="px-2.5 py-6 text-center text-[12.5px]" style={{ color: "var(--muted-foreground)" }}>
                  Type the last four digits of a plate, a phone number, or a name.
                </p>
              )}

              {query.trim().length >= 2 && hits.length === 0 && (
                <p className="px-2.5 py-6 text-center text-[12.5px]" style={{ color: "var(--muted-foreground)" }}>
                  Nothing matches “{query}”.
                </p>
              )}

              {hits.map((hit, i) => (
                <button
                  key={`${hit.kind}-${hit.id}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(hit)}
                  className="w-full flex items-center gap-3 rounded-md px-2.5 py-2 text-left"
                  style={i === active ? { background: "var(--accent)" } : undefined}
                >
                  <span
                    className="grid place-items-center w-7 h-7 rounded-md shrink-0"
                    style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                  >
                    {hit.kind === "vehicle" ? <Car size={14} /> : <User size={14} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium tnum truncate">{hit.title}</span>
                    <span className="block text-[11.5px] truncate" style={{ color: "var(--muted-foreground)" }}>
                      {hit.subtitle}
                    </span>
                  </span>
                  {hit.kind === "vehicle" && (
                    <span className="text-[11px] shrink-0" style={{ color: "var(--text-subtle)" }}>
                      New job →
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
