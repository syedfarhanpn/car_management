"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MoveDown, MoveUp, X } from "lucide-react";
import { Badge, Field } from "@/components/ui";
import { formatINR } from "@/lib/money";
import { adjustItemStock } from "./actions";

export type Row = {
  id: string;
  name: string;
  sku: string | null;
  type: string;
  baseUnit: string;
  purchaseUnitName: string;
  baseUnitsPerPurchaseUnit: number;
  categoryName: string | null;
  gstRate: number;
  avgCostMinor: number;
  salePriceMinor: number;
  reorderLevelBase: number;
  onHand: number;
  valueMinor: number;
  low: boolean;
};

const UNIT: Record<string, string> = { ML: "ml", GRAM: "g", PIECE: "pcs" };

/** Show measured stock in the unit a human would say out loud. */
function displayQty(qty: number, baseUnit: string) {
  if (baseUnit === "ML" && Math.abs(qty) >= 1000) return `${(qty / 1000).toFixed(2)} L`;
  if (baseUnit === "GRAM" && Math.abs(qty) >= 1000) return `${(qty / 1000).toFixed(2)} kg`;
  return `${Number.isInteger(qty) ? qty : qty.toFixed(1)} ${UNIT[baseUnit] ?? ""}`;
}

export function InventoryTable({ rows, canSeeCost }: { rows: Row[]; canSeeCost: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adjusting, setAdjusting] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-lg px-3.5 py-2.5 text-[13px]"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {error}
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                <th className="text-left font-medium px-4 py-2.5">Item</th>
                <th className="text-left font-medium px-3 py-2.5">Type</th>
                <th className="text-right font-medium px-3 py-2.5">On hand</th>
                <th className="text-right font-medium px-3 py-2.5">Reorder at</th>
                {canSeeCost && <th className="text-right font-medium px-3 py-2.5">Cost</th>}
                {canSeeCost && <th className="text-right font-medium px-3 py-2.5">Value</th>}
                <th className="text-right font-medium px-3 py-2.5">Sells at</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{r.name}</span>
                    <div className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                      {r.categoryName ?? "Uncategorised"}
                      {r.sku && <span className="tnum"> · {r.sku}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {r.type === "STOCKED_PART" ? <Badge>Part</Badge> : <Badge tone="brand">Consumable</Badge>}
                  </td>
                  <td className="px-3 py-2.5 text-right tnum font-medium">
                    <span style={{ color: r.low ? "var(--warning)" : undefined }}>
                      {displayQty(r.onHand, r.baseUnit)}
                    </span>
                    {r.baseUnitsPerPurchaseUnit > 1 && (
                      <div className="text-[11px] font-normal" style={{ color: "var(--text-subtle)" }}>
                        {(r.onHand / r.baseUnitsPerPurchaseUnit).toFixed(1)} × {r.purchaseUnitName}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tnum" style={{ color: "var(--text-subtle)" }}>
                    {displayQty(r.reorderLevelBase, r.baseUnit)}
                  </td>
                  {canSeeCost && (
                    <td className="px-3 py-2.5 text-right tnum" style={{ color: "var(--text-muted)" }}>
                      {formatINR(r.avgCostMinor)}
                      <div className="text-[11px]" style={{ color: "var(--text-subtle)" }}>
                        per {UNIT[r.baseUnit] ?? "unit"}
                      </div>
                    </td>
                  )}
                  {canSeeCost && <td className="px-3 py-2.5 text-right tnum">{formatINR(r.valueMinor)}</td>}
                  <td className="px-3 py-2.5 text-right tnum">
                    {r.salePriceMinor > 0 ? formatINR(r.salePriceMinor) : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1.5 justify-end">
                      <button
                        className="text-[12px] font-medium"
                        style={{ color: "var(--brand)" }}
                        onClick={() => {
                          setError(null);
                          setAdjusting(r);
                        }}
                      >
                        Adjust
                      </button>
                      <Link href={`/inventory/${r.id}`} className="text-[12px] font-medium" style={{ color: "var(--text-subtle)" }}>
                        History
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {adjusting && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          style={{ background: "rgba(0,0,0,.45)" }}
          onClick={() => setAdjusting(null)}
        >
          <form
            className="card p-5 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              const fd = new FormData(e.currentTarget);
              fd.set("itemId", adjusting.id);
              start(async () => {
                const res = await adjustItemStock(fd);
                if (!res.ok) setError(res.error);
                else {
                  setAdjusting(null);
                  router.refresh();
                }
              });
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold">Adjust stock</h2>
                <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  {adjusting.name} · currently {displayQty(adjusting.onHand, adjusting.baseUnit)}
                </p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setAdjusting(null)} style={{ color: "var(--text-subtle)" }}>
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Direction" required>
                <select name="direction" className="input" defaultValue="OUT">
                  <option value="IN">Add to stock</option>
                  <option value="OUT">Remove from stock</option>
                </select>
              </Field>
              <Field label={`Quantity (${UNIT[adjusting.baseUnit] ?? ""})`} required>
                <input name="quantity" className="input tnum" required autoFocus inputMode="decimal" />
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Reason" required hint="Spillage, damage, correction after a recount, personal use…">
                <input name="reason" className="input" required placeholder="Bottle broken during service" />
              </Field>
            </div>

            {/* Every adjustment is a ledger row with a name and a reason on it,
                which is what makes an unexplained shortfall traceable later. */}
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
              Recorded against your name in the movement ledger.
            </p>

            <div className="flex gap-2 mt-4">
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "Saving…" : "Record adjustment"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setAdjusting(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
