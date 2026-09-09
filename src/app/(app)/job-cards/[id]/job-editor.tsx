"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus, Tag, Trash2, Wrench } from "lucide-react";
import { formatINR } from "@/lib/money";
import { Badge, Field } from "@/components/ui";
import { addPartLine, addPassThroughLine, addServiceLine, applyLineDiscount, removeLine } from "../actions";

type Line = {
  id: string;
  lineType: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  costMinor: number;
  markupMinor: number;
  supplierName: string | null;
  displayMinor: number;
};

type ServiceOpt = {
  id: string;
  name: string;
  categoryName: string;
  requiresEstimate: boolean;
  priceMinor: number | null;
};

type PartOpt = { id: string; name: string; salePriceMinor: number; stock: number };

const TYPE_META: Record<string, { label: string; tone: "neutral" | "brand" | "warning" }> = {
  SERVICE: { label: "Service", tone: "brand" },
  PART: { label: "Part", tone: "neutral" },
  PASS_THROUGH: { label: "Bought for customer", tone: "warning" },
  LABOUR: { label: "Labour", tone: "neutral" },
  MISC: { label: "Other", tone: "neutral" },
};

export function JobEditor({
  jobCardId,
  locked,
  canDiscount,
  canSeeCost,
  lines,
  services,
  parts,
}: {
  jobCardId: string;
  locked: boolean;
  canDiscount: boolean;
  canSeeCost: boolean;
  lines: Line[];
  services: ServiceOpt[];
  parts: PartOpt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "service" | "part" | "outside">(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong");
      else {
        setPanel(null);
        router.refresh();
      }
    });
  }

  const grouped = services.reduce<Record<string, ServiceOpt[]>>((acc, svc) => {
    (acc[svc.categoryName] ??= []).push(svc);
    return acc;
  }, {});

  return (
    <section className="card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="text-[14px] font-semibold">Work & parts</h2>
        {!locked && (
          <div className="flex flex-wrap gap-1.5">
            <button className="btn btn-ghost text-[12.5px] py-1.5" onClick={() => setPanel(panel === "service" ? null : "service")}>
              <Wrench size={14} />
              Service
            </button>
            <button className="btn btn-ghost text-[12.5px] py-1.5" onClick={() => setPanel(panel === "part" ? null : "part")}>
              <Package size={14} />
              Part
            </button>
            <button className="btn btn-ghost text-[12.5px] py-1.5" onClick={() => setPanel(panel === "outside" ? null : "outside")}>
              <Tag size={14} />
              Outside purchase
            </button>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------- pickers */}
      {panel === "service" && (
        <div className="p-4" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
          <p className="text-[12px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-subtle)" }}>
            Add a service — prices are for this vehicle&apos;s class
          </p>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <p className="text-[11.5px] font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  {cat}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {items.map((svc) => (
                    <button
                      key={svc.id}
                      disabled={pending || svc.priceMinor === null}
                      onClick={() => run(() => addServiceLine(jobCardId, svc.id))}
                      className="card px-3 py-2 text-left flex items-center justify-between gap-2 disabled:opacity-50"
                    >
                      <span className="text-[13px] truncate">
                        {svc.name}
                        {svc.requiresEstimate && (
                          <span className="ml-1.5 text-[10.5px]" style={{ color: "var(--warning)" }}>
                            needs estimate
                          </span>
                        )}
                      </span>
                      <span className="text-[13px] font-medium tnum shrink-0">
                        {svc.priceMinor === null ? (
                          <span style={{ color: "var(--danger)" }}>No price</span>
                        ) : (
                          formatINR(svc.priceMinor)
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {panel === "part" && (
        <div className="p-4" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
          <p className="text-[12px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-subtle)" }}>
            Add a part from stock
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2 max-h-72 overflow-y-auto">
            {parts.map((p) => (
              <button
                key={p.id}
                disabled={pending}
                onClick={() => run(() => addPartLine(jobCardId, p.id, 1))}
                className="card px-3 py-2 text-left flex items-center justify-between gap-2 disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] truncate">{p.name}</span>
                  <span
                    className="block text-[11px] tnum"
                    style={{ color: p.stock <= 0 ? "var(--danger)" : "var(--text-subtle)" }}
                  >
                    {p.stock <= 0 ? "Out of stock" : `${p.stock} in stock`}
                  </span>
                </span>
                <span className="text-[13px] font-medium tnum shrink-0">{formatINR(p.salePriceMinor)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {panel === "outside" && (
        <form
          className="p-4"
          style={{ background: "var(--warning-soft)", borderBottom: "1px solid var(--border)" }}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => addPassThroughLine(jobCardId, f));
          }}
        >
          <p className="text-[12.5px] font-semibold" style={{ color: "var(--warning)" }}>
            Part bought from outside for this customer
          </p>
          <p className="mt-0.5 mb-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Never enters your stock. The cost is money you have fronted and will recover; only the markup counts as
            your income.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Part description" required>
                <input name="description" className="input" required placeholder="Fortuner OEM radiator assembly" />
              </Field>
            </div>
            <Field label="What you paid (₹)" required>
              <input name="cost" className="input tnum" required inputMode="decimal" placeholder="24500" />
            </Field>
            <Field label="Your markup (₹)" hint="Leave blank to bill at exact cost">
              <input name="markup" className="input tnum" inputMode="decimal" placeholder="2500" />
            </Field>
            <Field label="Supplier">
              <input name="supplierName" className="input" placeholder="Toyota Spares Kochi" />
            </Field>
            <Field label="Their bill number">
              <input name="supplierBillRef" className="input tnum" placeholder="TSK/4471" />
            </Field>
          </div>

          <button type="submit" className="btn btn-primary mt-3" disabled={pending}>
            <Plus size={15} />
            Add to job card
          </button>
        </form>
      )}

      {error && (
        <p
          role="alert"
          className="px-4 py-2.5 text-[13px]"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {error}
        </p>
      )}

      {/* ---------------------------------------------------------- lines */}
      {lines.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-[13.5px] font-medium">Nothing added yet</p>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Add the services being done, then any parts.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                <th className="text-left font-medium px-4 py-2.5">Item</th>
                <th className="text-center font-medium px-2 py-2.5">Qty</th>
                <th className="text-right font-medium px-4 py-2.5">Rate</th>
                <th className="text-right font-medium px-4 py-2.5">Amount</th>
                {!locked && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const meta = TYPE_META[l.lineType] ?? TYPE_META.MISC;
                return (
                  <tr key={l.id} className="border-t">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{l.description}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                      {l.lineType === "PASS_THROUGH" && (
                        <div className="mt-0.5 text-[11.5px] tnum" style={{ color: "var(--text-subtle)" }}>
                          Cost {formatINR(l.costMinor)}
                          {l.markupMinor > 0 && ` + markup ${formatINR(l.markupMinor)}`}
                          {l.supplierName && ` · ${l.supplierName}`}
                        </div>
                      )}
                      {l.discountMinor > 0 && (
                        <div className="mt-0.5 text-[11.5px] tnum" style={{ color: "var(--success)" }}>
                          Discount −{formatINR(l.discountMinor)}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-center tnum">{l.quantity}</td>
                    <td className="px-4 py-2.5 text-right tnum" style={{ color: "var(--text-muted)" }}>
                      {formatINR(l.unitPriceMinor)}
                    </td>
                    <td className="px-4 py-2.5 text-right tnum font-medium">{formatINR(l.displayMinor)}</td>
                    {!locked && (
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          {canDiscount && l.lineType !== "PASS_THROUGH" && (
                            <button
                              title="Apply discount"
                              aria-label="Apply discount"
                              disabled={pending}
                              onClick={() => {
                                const v = window.prompt(`Discount on "${l.description}" (₹)`, String(l.discountMinor / 100));
                                if (v !== null) run(() => applyLineDiscount(jobCardId, l.id, v));
                              }}
                              className="grid place-items-center w-7 h-7 rounded"
                              style={{ color: "var(--text-subtle)" }}
                            >
                              <Tag size={14} />
                            </button>
                          )}
                          <button
                            title="Remove"
                            aria-label="Remove line"
                            disabled={pending}
                            onClick={() => run(() => removeLine(jobCardId, l.id))}
                            className="grid place-items-center w-7 h-7 rounded"
                            style={{ color: "var(--danger)" }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!canDiscount && !locked && lines.length > 0 && (
        <p className="px-4 py-2.5 text-[11.5px]" style={{ background: "var(--surface-2)", color: "var(--text-subtle)" }}>
          Billing at list price. Discounts need an admin.
        </p>
      )}

      {canSeeCost && lines.some((l) => l.lineType === "PASS_THROUGH") && (
        <p className="px-4 py-2.5 text-[11.5px]" style={{ background: "var(--surface-2)", color: "var(--text-subtle)" }}>
          Outside purchases on this card:{" "}
          <span className="tnum font-medium">
            {formatINR(lines.filter((l) => l.lineType === "PASS_THROUGH").reduce((a, l) => a + l.costMinor, 0))}
          </span>{" "}
          of your cash, recovered when this bill is paid.
        </p>
      )}
    </section>
  );
}
