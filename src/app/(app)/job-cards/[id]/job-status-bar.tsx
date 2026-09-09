"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Ban, Check, FileText, Send } from "lucide-react";
import { setJobStatus } from "../actions";
import { generateInvoice } from "@/app/(app)/billing/actions";
import { SendWhatsAppButton } from "@/components/send-whatsapp-button";

/**
 * The status transitions a user can actually take from here, as buttons rather
 * than a dropdown of every state. The server re-checks the transition anyway —
 * this just stops staff being offered moves that will be rejected.
 */
export function JobStatusBar({
  jobCardId,
  status,
  hasLines,
  needsEstimate,
  invoiceId,
}: {
  jobCardId: string;
  status: string;
  hasLines: boolean;
  needsEstimate: boolean;
  invoiceId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function move(to: string) {
    setError(null);
    start(async () => {
      const res = await setJobStatus(jobCardId, to);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function bill() {
    setError(null);
    start(async () => {
      const res = await generateInvoice(jobCardId);
      if (!res.ok) setError(res.error);
      else router.push(`/billing/${res.data.invoiceId}`);
    });
  }

  const actions: React.ReactNode[] = [];

  if (status === "DRAFT") {
    if (needsEstimate) {
      actions.push(
        <button key="est" className="btn btn-primary w-full" disabled={pending || !hasLines} onClick={() => move("ESTIMATE_SENT")}>
          <Send size={15} />
          Send estimate for approval
        </button>,
      );
    }
    actions.push(
      <button
        key="start"
        className={`btn w-full ${needsEstimate ? "btn-ghost" : "btn-primary"}`}
        disabled={pending || !hasLines}
        onClick={() => move("IN_PROGRESS")}
      >
        <ArrowRight size={15} />
        Start work
      </button>,
    );
  }

  if (status === "ESTIMATE_SENT") {
    actions.push(
      <button key="ok" className="btn btn-primary w-full" disabled={pending} onClick={() => move("ESTIMATE_APPROVED")}>
        <Check size={15} />
        Customer approved
      </button>,
      <button key="no" className="btn btn-ghost w-full" disabled={pending} onClick={() => move("ESTIMATE_REJECTED")}>
        <Ban size={15} />
        Customer declined
      </button>,
    );
  }

  if (status === "ESTIMATE_APPROVED") {
    actions.push(
      <button key="start" className="btn btn-primary w-full" disabled={pending} onClick={() => move("IN_PROGRESS")}>
        <ArrowRight size={15} />
        Start work
      </button>,
    );
  }

  if (status === "IN_PROGRESS") {
    actions.push(
      <button key="done" className="btn btn-primary w-full" disabled={pending} onClick={() => move("COMPLETED")}>
        <Check size={15} />
        Mark work complete
      </button>,
    );
  }

  if (status === "COMPLETED") {
    actions.push(
      <button key="bill" className="btn btn-primary w-full" disabled={pending} onClick={bill}>
        <FileText size={15} />
        Generate invoice
      </button>,
      // Telling the customer the car is ready is the point at which most
      // "is it done yet?" phone calls stop happening.
      <SendWhatsAppButton key="ready" kind="job-ready" id={jobCardId} full />,
      <button key="back" className="btn btn-ghost w-full" disabled={pending} onClick={() => move("IN_PROGRESS")}>
        Reopen for more work
      </button>,
    );
  }

  if (status === "INVOICED") {
    actions.push(
      <button key="deliver" className="btn btn-primary w-full" disabled={pending} onClick={() => move("DELIVERED")}>
        <Check size={15} />
        Vehicle delivered
      </button>,
    );
  }

  if (actions.length === 0 && !invoiceId) return null;

  return (
    <section className="card p-4">
      <h3 className="text-[12px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-subtle)" }}>
        Next step
      </h3>

      <div className="space-y-2">{actions}</div>

      {status === "COMPLETED" && (
        <p className="mt-2.5 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
          Consumables and parts were deducted from stock when this was marked complete.
        </p>
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
  );
}
