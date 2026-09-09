"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, Lock } from "lucide-react";
import { Field } from "@/components/ui";
import { formatINR, toMinor } from "@/lib/money";
import { closeDay } from "../actions";

export function ClosingForm({
  businessDate,
  cashSales,
  upiSales,
  cardSales,
  otherSales,
  paymentCount,
  cashExpenses,
  suggestedOpening,
  existing,
}: {
  businessDate: string;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  otherSales: number;
  paymentCount: number;
  cashExpenses: number;
  suggestedOpening: number;
  existing: {
    openingCashMinor: number;
    countedCashMinor: number;
    expectedCashMinor: number;
    varianceMinor: number;
    note: string | null;
    closedAt: string | null;
  } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(
    ((existing?.openingCashMinor ?? suggestedOpening) / 100).toFixed(2),
  );
  const [counted, setCounted] = useState(existing ? (existing.countedCashMinor / 100).toFixed(2) : "");

  // Expected is always derived, never typed — otherwise the control is
  // meaningless, because the person counting could just enter what they found.
  const expected = toMinor(opening || "0") + cashSales - cashExpenses;
  const variance = counted.trim() === "" ? null : toMinor(counted) - expected;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await closeDay(fd);
          if (!res.ok) setError(res.error);
          else router.refresh();
        });
      }}
    >
      <input type="hidden" name="businessDate" value={businessDate} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          {new Date(businessDate).toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}{" "}
          · {paymentCount} payment{paymentCount === 1 ? "" : "s"}
        </p>
        {existing?.closedAt && (
          <span className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
            <Lock size={13} />
            Closed {new Date(existing.closedAt).toLocaleString("en-IN", { hour: "numeric", minute: "2-digit" })} · saving
            again will overwrite it
          </span>
        )}
      </div>

      <section className="card p-5">
        <h2 className="text-[14px] font-semibold mb-3">Takings</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Cash", value: cashSales, note: "goes in the drawer" },
            { label: "UPI", value: upiSales, note: "straight to bank" },
            { label: "Card", value: cardSales, note: "straight to bank" },
            { label: "Other", value: otherSales, note: "transfer, cheque" },
          ].map((t) => (
            <div key={t.label} className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
              <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                {t.label}
              </p>
              <p className="mt-0.5 text-[17px] font-semibold tnum">{formatINR(t.value)}</p>
              <p className="text-[10.5px]" style={{ color: "var(--text-subtle)" }}>
                {t.note}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-[14px] font-semibold mb-3">The drawer</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Opening float (₹)" hint="Carried over from the last close">
            <input
              name="openingCash"
              className="input tnum"
              inputMode="decimal"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
            />
          </Field>
          <Field label="Cash counted now (₹)" required hint="What is physically in the drawer">
            <input
              name="countedCash"
              className="input tnum"
              required
              inputMode="decimal"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>

        <dl className="mt-4 text-[13px] space-y-1.5 max-w-sm">
          <div className="flex justify-between">
            <dt style={{ color: "var(--text-muted)" }}>Opening float</dt>
            <dd className="tnum">{formatINR(toMinor(opening || "0"))}</dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: "var(--text-muted)" }}>+ Cash taken today</dt>
            <dd className="tnum" style={{ color: "var(--success)" }}>
              {formatINR(cashSales)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: "var(--text-muted)" }}>− Cash paid out</dt>
            <dd className="tnum" style={{ color: "var(--danger)" }}>
              {formatINR(cashExpenses)}
            </dd>
          </div>
          <div className="flex justify-between font-semibold pt-1.5" style={{ borderTop: "1px solid var(--border)" }}>
            <dt>Should be in the drawer</dt>
            <dd className="tnum">{formatINR(expected)}</dd>
          </div>
        </dl>

        {variance !== null && (
          <div
            className="mt-4 rounded-lg p-3.5 flex items-start gap-2.5"
            style={{
              background: variance === 0 ? "var(--success-soft)" : "var(--danger-soft)",
              color: variance === 0 ? "var(--success)" : "var(--danger)",
            }}
          >
            {variance === 0 ? <Check size={17} className="mt-0.5" /> : <AlertTriangle size={17} className="mt-0.5" />}
            <div>
              <p className="text-[13.5px] font-semibold">
                {variance === 0
                  ? "Balances exactly"
                  : `${variance < 0 ? "Short" : "Over"} by ${formatINR(Math.abs(variance))}`}
              </p>
              {variance !== 0 && (
                <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  {variance < 0
                    ? "Less cash than expected. Check for an unrecorded payout or a payment taken as cash but logged as UPI."
                    : "More cash than expected. Usually a payment taken but not yet entered."}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-4">
          <Field label="Note">
            <input
              name="note"
              className="input"
              defaultValue={existing?.note ?? ""}
              placeholder="Two customers paid cash after the system was closed"
            />
          </Field>
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-lg px-3.5 py-2.5 text-[13px]"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={pending || counted.trim() === ""}>
        {pending ? "Saving…" : existing ? "Update close" : "Close the day"}
      </button>
    </form>
  );
}
