"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Field } from "@/components/ui";
import { formatAmount, formatINR, toMinor } from "@/lib/money";
import { createPurchase } from "../actions";

type Supplier = { id: string; name: string; terms: number };
type Item = {
  id: string;
  name: string;
  purchaseUnitName: string;
  baseUnitsPerPurchaseUnit: number;
  baseUnit: string;
  gstRate: number;
  avgCostMinor: number;
  onHand: number;
  reorder: number;
};

type Line = { key: number; itemId: string; quantity: string; unitCost: string; gstRate: string };

let nextKey = 1;

export function PurchaseForm({ suppliers, items }: { suppliers: Supplier[]; items: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([{ key: 0, itemId: "", quantity: "1", unitCost: "", gstRate: "" }]);

  // Suggest what is at or below reorder level — the whole point of tracking it.
  const lowStock = items.filter((i) => i.onHand <= i.reorder);

  function addLine(itemId = "") {
    const item = items.find((i) => i.id === itemId);
    setLines((ls) => [
      ...ls,
      {
        key: nextKey++,
        itemId,
        quantity: "1",
        // Suggest the last known pack cost so the common case is one keystroke.
        unitCost: item ? ((item.avgCostMinor * item.baseUnitsPerPurchaseUnit) / 100).toFixed(2) : "",
        gstRate: item ? String(item.gstRate) : "",
      },
    ]);
  }

  function patch(key: number, changes: Partial<Line>) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...changes };
        if (changes.itemId) {
          const item = items.find((i) => i.id === changes.itemId);
          if (item) {
            next.gstRate = String(item.gstRate);
            if (!l.unitCost) next.unitCost = ((item.avgCostMinor * item.baseUnitsPerPurchaseUnit) / 100).toFixed(2);
          }
        }
        return next;
      }),
    );
  }

  const computed = lines
    .filter((l) => l.itemId)
    .map((l) => {
      const item = items.find((i) => i.id === l.itemId)!;
      const qty = Number(l.quantity) || 0;
      const cost = toMinor(l.unitCost || "0");
      const net = Math.round(qty * cost);
      const rate = l.gstRate === "" ? item.gstRate : Number(l.gstRate);
      const tax = Math.round((net * rate) / 100);
      return { item, qty, net, tax, total: net + tax };
    });

  const subtotal = computed.reduce((a, c) => a + c.net, 0);
  const taxTotal = computed.reduce((a, c) => a + c.tax, 0);
  const grandTotal = subtotal + taxTotal;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        fd.set(
          "lines",
          JSON.stringify(
            lines
              .filter((l) => l.itemId)
              .map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitCost: l.unitCost, gstRate: l.gstRate })),
          ),
        );
        start(async () => {
          const res = await createPurchase(fd);
          if (!res.ok) setError(res.error);
          else router.push(`/purchases/${res.data.id}`);
        });
      }}
    >
      <section className="card p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Field label="Supplier" required>
            <select name="supplierId" className="input" defaultValue="">
              <option value="">Type a name instead…</option>
              {suppliers.map((sup) => (
                <option key={sup.id} value={sup.id}>
                  {sup.name}
                  {sup.terms > 0 ? ` (${sup.terms}-day terms)` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Or a one-off vendor">
            <input name="supplierNameText" className="input" placeholder="Cash purchase from local shop" />
          </Field>
        </div>
        <Field label="Bill number">
          <input name="billNumber" className="input tnum" placeholder="KAS/2291" />
        </Field>
        <Field label="Bill date" required>
          <input name="billDate" type="date" className="input tnum" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </Field>
        <Field label="Paid now (₹)" hint="Leave 0 if on credit">
          <input name="paidNow" className="input tnum" inputMode="decimal" defaultValue="0" />
        </Field>
        <Field label="Payment method">
          <select name="paymentMethod" className="input" defaultValue="CASH">
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CHEQUE">Cheque</option>
          </select>
        </Field>
      </section>

      {lowStock.length > 0 && (
        <section className="card p-4" style={{ background: "var(--warning-soft)", borderColor: "var(--warning)" }}>
          <p className="text-[12.5px] font-semibold mb-2" style={{ color: "var(--warning)" }}>
            At or below reorder level — tap to add
          </p>
          <div className="flex flex-wrap gap-1.5">
            {lowStock.map((i) => (
              <button
                key={i.id}
                type="button"
                className="btn btn-ghost text-[12px] py-1"
                onClick={() => addLine(i.id)}
                style={{ background: "var(--surface)" }}
              >
                <Plus size={12} />
                {i.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-[14px] font-semibold">Bill lines</h2>
          <button type="button" className="btn btn-ghost text-[12.5px] py-1.5" onClick={() => addLine()}>
            <Plus size={14} />
            Add line
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                <th className="text-left font-medium px-4 py-2.5 min-w-[220px]">Item</th>
                <th className="text-right font-medium px-2 py-2.5 w-24">Packs</th>
                <th className="text-right font-medium px-2 py-2.5 w-32">Cost / pack</th>
                <th className="text-right font-medium px-2 py-2.5 w-20">GST %</th>
                <th className="text-right font-medium px-3 py-2.5 w-32">Line total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const item = items.find((i) => i.id === l.itemId);
                const c = computed.find((x) => x.item.id === l.itemId && l.itemId);
                return (
                  <tr key={l.key} className="border-t">
                    <td className="px-4 py-2">
                      <select
                        className="input py-1.5"
                        value={l.itemId}
                        onChange={(e) => patch(l.key, { itemId: e.target.value })}
                        aria-label="Item"
                      >
                        <option value="">Select an item</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                      {item && (
                        <p className="mt-1 text-[11px]" style={{ color: "var(--text-subtle)" }}>
                          1 {item.purchaseUnitName} = {item.baseUnitsPerPurchaseUnit}{" "}
                          {item.baseUnit === "ML" ? "ml" : item.baseUnit === "GRAM" ? "g" : "pcs"} · on hand{" "}
                          {item.onHand}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="input tnum text-right py-1.5 px-2"
                        inputMode="decimal"
                        value={l.quantity}
                        onChange={(e) => patch(l.key, { quantity: e.target.value })}
                        aria-label="Quantity in packs"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="input tnum text-right py-1.5 px-2"
                        inputMode="decimal"
                        value={l.unitCost}
                        onChange={(e) => patch(l.key, { unitCost: e.target.value })}
                        aria-label="Cost per pack"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="input tnum text-right py-1.5 px-2"
                        inputMode="numeric"
                        value={l.gstRate}
                        onChange={(e) => patch(l.key, { gstRate: e.target.value })}
                        placeholder={item ? String(item.gstRate) : "18"}
                        aria-label="GST rate"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tnum font-medium">{c ? formatAmount(c.total) : "—"}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        aria-label="Remove line"
                        className="grid place-items-center w-7 h-7 rounded"
                        style={{ color: "var(--danger)" }}
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 flex justify-end" style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
          <dl className="text-[13px] min-w-[220px] space-y-1">
            <div className="flex justify-between">
              <dt style={{ color: "var(--text-muted)" }}>Subtotal</dt>
              <dd className="tnum">{formatAmount(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt style={{ color: "var(--text-muted)" }}>GST</dt>
              <dd className="tnum">{formatAmount(taxTotal)}</dd>
            </div>
            <div className="flex justify-between font-semibold pt-1" style={{ borderTop: "1px solid var(--border)" }}>
              <dt>Total</dt>
              <dd className="tnum">{formatINR(grandTotal)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div>
        <label className="label" htmlFor="notes">
          Notes
        </label>
        <input id="notes" name="notes" className="input max-w-lg" />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg px-3.5 py-2.5 text-[13px]"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending || computed.length === 0}>
          {pending ? "Saving…" : "Record bill & add to stock"}
        </button>
        <Badge>Supplier bills are quoted before tax — GST is added on top here</Badge>
      </div>
    </form>
  );
}
