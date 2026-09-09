"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Check, IndianRupee } from "lucide-react";
import { formatINR } from "@/lib/money";
import { Field } from "@/components/ui";
import { cancelInvoice, recordPayment } from "../actions";

type Payment = {
  id: string;
  receiptNumber: string | null;
  amountMinor: number;
  method: string;
  reference: string | null;
  receivedAt: string;
};

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
];

export function PaymentPanel({
  invoiceId,
  balanceMinor,
  status,
  canCancel,
  payments,
}: {
  invoiceId: string;
  balanceMinor: number;
  status: string;
  canCancel: boolean;
  payments: Payment[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const settled = balanceMinor <= 0;
  const cancelled = status === "CANCELLED";

  return (
    <>
      <section className="card p-4">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
          Payment
        </h3>

        {cancelled ? (
          <p className="mt-3 text-[13px]" style={{ color: "var(--text-muted)" }}>
            This invoice was cancelled.
          </p>
        ) : settled ? (
          <div className="mt-3 flex items-center gap-2 text-[13.5px] font-medium" style={{ color: "var(--success)" }}>
            <Check size={16} />
            Fully paid
          </div>
        ) : (
          <>
            <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
              Balance due
            </p>
            <p className="text-[24px] font-semibold tnum tracking-tight" style={{ color: "var(--warning)" }}>
              {formatINR(balanceMinor)}
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
                  const f = new FormData(e.currentTarget);
                  start(async () => {
                    const res = await recordPayment(invoiceId, f);
                    if (!res.ok) setError(res.error);
                    else {
                      setOpen(false);
                      router.refresh();
                    }
                  });
                }}
              >
                <Field label="Amount (₹)" required hint="Part payments are fine — the balance carries forward">
                  <input
                    name="amount"
                    className="input tnum"
                    required
                    autoFocus
                    inputMode="decimal"
                    defaultValue={(balanceMinor / 100).toFixed(2)}
                  />
                </Field>

                <Field label="Method" required>
                  <select name="method" className="input" defaultValue="CASH">
                    {METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Reference" hint="UPI transaction id, cheque number, card last 4">
                  <input name="reference" className="input tnum" />
                </Field>

                <div className="flex gap-2">
                  <button type="submit" className="btn btn-primary flex-1" disabled={pending}>
                    {pending ? "Saving…" : "Save"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>
                    Cancel
                  </button>
                </div>
              </form>
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
            Receipts
          </h3>
          <ul className="space-y-2">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-2 text-[12.5px]">
                <div className="min-w-0">
                  <p className="font-medium tnum">{p.receiptNumber ?? "Receipt"}</p>
                  <p style={{ color: "var(--text-subtle)" }}>
                    {METHODS.find((m) => m.value === p.method)?.label ?? p.method}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </p>
                  <p style={{ color: "var(--text-subtle)" }}>
                    {new Date(p.receivedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                  </p>
                </div>
                <span className="tnum font-medium shrink-0">{formatINR(p.amountMinor)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canCancel && !cancelled && payments.length === 0 && (
        <section className="card p-4">
          <button
            className="btn btn-ghost w-full text-[13px]"
            style={{ color: "var(--danger)" }}
            disabled={pending}
            onClick={() => {
              const reason = window.prompt("Why is this invoice being cancelled?");
              if (!reason) return;
              setError(null);
              start(async () => {
                const res = await cancelInvoice(invoiceId, reason);
                if (!res.ok) setError(res.error);
                else router.refresh();
              });
            }}
          >
            <Ban size={15} />
            Cancel invoice
          </button>
          {/* The number itself is never reused — a GST series must stay gapless. */}
          <p className="mt-2 text-[11px]" style={{ color: "var(--text-subtle)" }}>
            The invoice number stays on record, marked cancelled.
          </p>
        </section>
      )}
    </>
  );
}
