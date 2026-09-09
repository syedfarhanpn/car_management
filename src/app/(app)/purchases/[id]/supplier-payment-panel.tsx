"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, IndianRupee } from "lucide-react";
import { Field } from "@/components/ui";
import { formatINR } from "@/lib/money";
import { paySupplierBill } from "../actions";

type Payment = { id: string; amountMinor: number; method: string; paidAt: string };

export function SupplierPaymentPanel({
  purchaseId,
  dueMinor,
  hasSupplier,
  payments,
}: {
  purchaseId: string;
  dueMinor: number;
  hasSupplier: boolean;
  payments: Payment[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="card p-4">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
          Supplier payment
        </h3>

        {dueMinor <= 0 ? (
          <div className="mt-3 flex items-center gap-2 text-[13.5px] font-medium" style={{ color: "var(--success)" }}>
            <Check size={16} />
            Settled
          </div>
        ) : (
          <>
            <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
              Still owed
            </p>
            <p className="text-[22px] font-semibold tnum tracking-tight" style={{ color: "var(--warning)" }}>
              {formatINR(dueMinor)}
            </p>

            {!open ? (
              <button className="btn btn-primary w-full mt-3" onClick={() => setOpen(true)}>
                <IndianRupee size={15} />
                Record payment
              </button>
            ) : (
              <form
                className="mt-3 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(null);
                  const fd = new FormData(e.currentTarget);
                  start(async () => {
                    const res = await paySupplierBill(
                      purchaseId,
                      String(fd.get("amount") ?? "0"),
                      String(fd.get("method") ?? "CASH"),
                    );
                    if (!res.ok) setError(res.error);
                    else {
                      setOpen(false);
                      router.refresh();
                    }
                  });
                }}
              >
                <Field label="Amount (₹)" required>
                  <input
                    name="amount"
                    className="input tnum"
                    required
                    autoFocus
                    inputMode="decimal"
                    defaultValue={(dueMinor / 100).toFixed(2)}
                  />
                </Field>
                <Field label="Method" required>
                  <select name="method" className="input" defaultValue="CASH">
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </Field>
                <div className="flex gap-2">
                  <button type="submit" className="btn btn-primary flex-1" disabled={pending}>
                    {pending ? "Saving…" : "Save"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {!hasSupplier && (
              <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                One-off vendor — the payment is recorded against the bill only, not a supplier ledger.
              </p>
            )}
          </>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg px-3 py-2 text-[12.5px]"
            style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
          >
            {error}
          </p>
        )}
      </section>

      {payments.length > 0 && (
        <section className="card p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-subtle)" }}>
            Payments
          </h3>
          <ul className="space-y-1.5">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between text-[12.5px]">
                <span style={{ color: "var(--text-muted)" }}>
                  {new Date(p.paidAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })} ·{" "}
                  {p.method.toLowerCase().replace("_", " ")}
                </span>
                <span className="tnum font-medium">{formatINR(p.amountMinor)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
