"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { Check, Save } from "lucide-react";
import { savePriceMatrix } from "./actions";

type ClassOpt = { id: string; name: string };
type ServiceRow = {
  id: string;
  name: string;
  categoryName: string;
  prices: Record<string, number | null>;
};

export function PriceMatrixEditor({ classes, services }: { classes: ClassOpt[]; services: ServiceRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const grouped = services.reduce<Record<string, ServiceRow[]>>((acc, svc) => {
    (acc[svc.categoryName] ??= []).push(svc);
    return acc;
  }, {});

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        const data = new FormData(e.currentTarget);
        start(async () => {
          const res = await savePriceMatrix(data);
          if (!res.ok) setMessage({ tone: "err", text: res.error });
          else {
            setMessage({ tone: "ok", text: `Saved ${res.saved} prices` });
            router.refresh();
          }
        });
      }}
    >
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                <th className="text-left font-medium px-4 py-2.5 sticky left-0" style={{ background: "var(--surface-2)" }}>
                  Service
                </th>
                {classes.map((c) => (
                  <th key={c.id} className="text-right font-medium px-3 py-2.5 whitespace-nowrap min-w-[110px]">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([cat, rows]) => (
                <Fragment key={cat}>
                  <tr>
                    <td
                      colSpan={classes.length + 1}
                      className="px-4 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-subtle)" }}
                    >
                      {cat}
                    </td>
                  </tr>
                  {rows.map((svc) => (
                    <tr key={svc.id} className="border-t">
                      <td
                        className="px-4 py-1.5 sticky left-0"
                        style={{ background: "var(--surface)" }}
                      >
                        {svc.name}
                      </td>
                      {classes.map((c) => (
                        <td key={c.id} className="px-2 py-1.5">
                          <input
                            name={`price:${svc.id}:${c.id}`}
                            defaultValue={svc.prices[c.id] !== null ? (svc.prices[c.id]! / 100).toFixed(0) : ""}
                            className="input tnum text-right py-1.5 px-2"
                            inputMode="decimal"
                            placeholder="—"
                            aria-label={`${svc.name} price for ${c.name}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : <><Save size={16} />Save price list</>}
        </button>

        {message && (
          <span
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ color: message.tone === "ok" ? "var(--success)" : "var(--danger)" }}
            role="status"
          >
            {message.tone === "ok" && <Check size={15} />}
            {message.text}
          </span>
        )}

        {/* A blank cell is meaningful: the service is not offered at that size,
            and the job card screen will refuse to add it rather than bill zero. */}
        <span className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
          Leave a cell blank if you do not offer that service for that size.
        </span>
      </div>
    </form>
  );
}
