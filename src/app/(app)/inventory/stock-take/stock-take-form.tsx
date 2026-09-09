"use client";

import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
import { ClipboardCheck, Eye, EyeOff } from "lucide-react";
import { formatINR } from "@/lib/money";

import { submitStockTake } from "../actions";

type Item = {
  id: string;
  name: string;
  type: string;
  baseUnit: string;
  categoryName: string;
  system: number;
  avgCostMinor: number;
};

const UNIT: Record<string, string> = { ML: "ml", GRAM: "g", PIECE: "pcs" };

export function StockTakeForm({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  /**
   * Blind counting is the honest default: if the counter can see what the
   * system expects, the count drifts towards it and the whole exercise stops
   * detecting anything. Revealing it is a deliberate act.
   */
  const [blind, setBlind] = useState(true);

  const grouped = useMemo(() => {
    return items.reduce<Record<string, Item[]>>((acc, i) => {
      (acc[i.categoryName] ??= []).push(i);
      return acc;
    }, {});
  }, [items]);

  const entered = Object.entries(counts).filter(([, v]) => v.trim() !== "");
  const preview = entered.map(([id, v]) => {
    const item = items.find((i) => i.id === id)!;
    const variance = Number(v) - item.system;
    return { item, variance, value: Math.round(variance * item.avgCostMinor) };
  });
  const offCount = preview.filter((p) => p.variance !== 0).length;
  const netValue = preview.reduce((a, p) => a + p.value, 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await submitStockTake(fd);
          if (!res.ok) setMessage({ tone: "err", text: res.error });
          else {
            setMessage({
              tone: "ok",
              text: res.data.variances === 0 ? "Count saved — everything matched" : `Count saved — ${res.data.variances} item(s) adjusted`,
            });
            setCounts({});
            router.refresh();
          }
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          {entered.length} of {items.length} counted
          {entered.length > 0 && !blind && (
            <>
              {" · "}
              <span style={{ color: offCount > 0 ? "var(--warning)" : "var(--success)" }}>
                {offCount === 0 ? "all matching" : `${offCount} off`}
              </span>
              {netValue !== 0 && (
                <span className="tnum" style={{ color: netValue < 0 ? "var(--danger)" : "var(--success)" }}>
                  {" · "}
                  {formatINR(netValue)}
                </span>
              )}
            </>
          )}
        </p>
        <button
          type="button"
          className="btn btn-ghost text-[12.5px] py-1.5"
          onClick={() => setBlind((v) => !v)}
        >
          {blind ? <Eye size={14} /> : <EyeOff size={14} />}
          {blind ? "Show expected" : "Hide expected"}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                <th className="text-left font-medium px-4 py-2.5">Item</th>
                {!blind && <th className="text-right font-medium px-3 py-2.5">Expected</th>}
                <th className="text-right font-medium px-3 py-2.5 w-40">Counted</th>
                {!blind && <th className="text-right font-medium px-3 py-2.5">Variance</th>}
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([cat, list]) => (
                <Fragment key={cat}>
                  <tr>
                    <td
                      colSpan={blind ? 2 : 4}
                      className="px-4 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-subtle)" }}
                    >
                      {cat}
                    </td>
                  </tr>
                  {list.map((i) => {
                    const raw = counts[i.id] ?? "";
                    const variance = raw.trim() === "" ? null : Number(raw) - i.system;
                    return (
                      <tr key={i.id} className="border-t">
                        <td className="px-4 py-1.5">
                          {i.name}
                          <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-subtle)" }}>
                            {UNIT[i.baseUnit]}
                          </span>
                        </td>
                        {!blind && (
                          <td className="px-3 py-1.5 text-right tnum" style={{ color: "var(--text-subtle)" }}>
                            {i.system}
                          </td>
                        )}
                        <td className="px-3 py-1.5">
                          <input
                            name={`count:${i.id}`}
                            className="input tnum text-right py-1.5 px-2"
                            inputMode="decimal"
                            placeholder="—"
                            aria-label={`Counted quantity for ${i.name}`}
                            value={raw}
                            onChange={(e) => setCounts((c) => ({ ...c, [i.id]: e.target.value }))}
                          />
                        </td>
                        {!blind && (
                          <td className="px-3 py-1.5 text-right tnum font-medium">
                            {variance === null ? (
                              <span style={{ color: "var(--text-subtle)" }}>—</span>
                            ) : (
                              <span
                                style={{
                                  color:
                                    variance === 0 ? "var(--text-subtle)" : variance < 0 ? "var(--danger)" : "var(--success)",
                                }}
                              >
                                {variance > 0 ? "+" : ""}
                                {variance}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="note">
          Note
        </label>
        <input id="note" name="note" className="input max-w-md" placeholder="Month-end count, both stores" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending || entered.length === 0}>
          <ClipboardCheck size={16} />
          {pending ? "Saving…" : `Save count (${entered.length})`}
        </button>
        {message && (
          <span
            role="status"
            className="text-[13px] font-medium"
            style={{ color: message.tone === "ok" ? "var(--success)" : "var(--danger)" }}
          >
            {message.text}
          </span>
        )}
        <span className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
          Items left blank are not touched. Each difference is written to the ledger as its own movement.
        </span>
      </div>
    </form>
  );
}
