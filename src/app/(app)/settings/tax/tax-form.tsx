"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, Save } from "lucide-react";
import { Field } from "@/components/ui";
import type { TaxConfig } from "@/lib/tax";
import { saveTaxSettings } from "../admin-actions";

export function TaxForm({
  config,
  defaultRate,
  hasGstin,
  gstin,
  series,
}: {
  config: TaxConfig;
  defaultRate: number;
  hasGstin: boolean;
  gstin: string | null;
  series: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [enabled, setEnabled] = useState(config.enabled);
  const [inclusive, setInclusive] = useState(config.pricesIncludeTax);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await saveTaxSettings(fd);
          if (!res.ok) setMessage({ tone: "err", text: res.error });
          else {
            setMessage({ tone: "ok", text: "Saved" });
            router.refresh();
          }
        });
      }}
      className="space-y-4"
    >
      {!hasGstin && (
        <div
          className="card p-4 flex items-start gap-3"
          style={{ borderColor: "var(--warning)", background: "var(--warning-soft)" }}
        >
          <AlertTriangle size={18} style={{ color: "var(--warning)" }} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-[13.5px] font-semibold" style={{ color: "var(--warning)" }}>
              No GSTIN on the business profile
            </p>
            <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              GST cannot be switched on without one — a bill that charges tax while claiming no registration is not a
              valid tax invoice.{" "}
              <Link href="/settings/business" style={{ color: "var(--brand)" }}>
                Add it here
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      <section className="card p-5 space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="enabled"
            checked={enabled}
            disabled={!hasGstin}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 mt-0.5"
          />
          <span>
            <span className="text-[13.5px] font-medium">Charge GST</span>
            <span className="block text-[12px]" style={{ color: "var(--text-subtle)" }}>
              {gstin ? `Invoices become tax invoices under ${gstin}` : "Needs a GSTIN first"}
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="pricesIncludeTax"
            checked={inclusive}
            onChange={(e) => setInclusive(e.target.checked)}
            className="w-4 h-4 mt-0.5"
          />
          <span>
            <span className="text-[13.5px] font-medium">Listed prices already include GST</span>
            <span className="block text-[12px]" style={{ color: "var(--text-subtle)" }}>
              {inclusive
                ? "A ₹500 wash stays ₹500 on the bill; tax is worked backwards out of it."
                : "A ₹500 wash becomes ₹590 on the bill; tax is added on top."}
            </span>
          </span>
        </label>

        {/* Getting this backwards silently reprices everything on the wall,
            so the consequence is spelled out rather than left to a label. */}
        <div
          className="rounded-lg px-3.5 py-2.5 text-[12px]"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
        >
          Most detailing shops quote the price the customer actually pays, so this is normally on. Turning it off
          raises every bill by the tax rate without changing a single price in the matrix.
        </div>

        <Field label="Default GST rate (%)" hint="Used for new services. Each service can override it.">
          <input name="defaultRate" className="input tnum max-w-[140px]" inputMode="numeric" defaultValue={defaultRate} />
        </Field>

        <Field
          label="Parts bought for a customer"
          hint="How outside purchases made on a customer's behalf are treated for tax"
        >
          <select name="passThroughTreatment" className="input" defaultValue={config.passThroughTreatment}>
            <option value="PURE_AGENT">Pure agent — cost is outside the taxable value, only the markup is taxed</option>
            <option value="TAXABLE">Taxable — the whole amount is taxed as a supply</option>
          </select>
        </Field>

        <p className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
          Pure agent is the usual treatment when the shop is genuinely just fetching a part, but it depends on the
          arrangement with the customer. Worth confirming with the shop&apos;s accountant.
        </p>
      </section>

      <section className="card p-5">
        <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
          Invoice numbering
        </p>
        <p className="mt-1.5 text-[13px] tnum">{series ?? "No series yet — created with the first invoice"}</p>
        <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
          Sequential and gapless within each April–March financial year, allocated inside the same transaction that
          writes the invoice. Cancelled invoices keep their number rather than freeing it.
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : <><Save size={16} />Save tax settings</>}
        </button>
        {message && (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ color: message.tone === "ok" ? "var(--success)" : "var(--danger)" }}
          >
            {message.tone === "ok" && <Check size={15} />}
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
