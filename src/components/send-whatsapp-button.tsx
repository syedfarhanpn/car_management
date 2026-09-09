"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, MessageCircle } from "lucide-react";
import { formatPhone } from "@/lib/phone";
import { sendInvoiceMessage, sendJobReadyMessage, sendPaymentReminder } from "@/app/(app)/whatsapp/actions";

export type SendKind = "invoice" | "job-ready" | "payment-reminder";

const ACTIONS = {
  invoice: sendInvoiceMessage,
  "job-ready": sendJobReadyMessage,
  "payment-reminder": sendPaymentReminder,
} as const;

const DEFAULT_LABEL: Record<SendKind, string> = {
  invoice: "Send on WhatsApp",
  "job-ready": "Tell customer it's ready",
  "payment-reminder": "Payment reminder",
};

/**
 * One button for every "send this to the customer" case.
 *
 * It takes a kind and an id rather than a function, so a server component can
 * drop it in without constructing a server action inline — which is easy to
 * get subtly wrong and hard to read afterwards.
 */
export function SendWhatsAppButton({
  kind,
  id,
  label,
  variant = "ghost",
  full = false,
}: {
  kind: SendKind;
  id: string;
  label?: string;
  variant?: "ghost" | "primary";
  full?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  return (
    <div className={full ? "w-full" : undefined}>
      <button
        type="button"
        className={`btn btn-${variant} ${full ? "w-full" : ""}`}
        disabled={pending}
        onClick={() => {
          setState(null);
          start(async () => {
            const res = await ACTIONS[kind](id);
            if (res.ok) {
              setState({ tone: "ok", text: `Sent to ${formatPhone(res.data.to)}` });
              router.refresh();
            } else {
              setState({ tone: "err", text: res.error });
            }
          });
        }}
      >
        {state?.tone === "ok" ? <Check size={16} /> : <MessageCircle size={16} />}
        {pending ? "Sending…" : state?.tone === "ok" ? "Sent" : (label ?? DEFAULT_LABEL[kind])}
      </button>

      {state && (
        <p
          role="status"
          className="mt-1.5 text-[11.5px]"
          style={{ color: state.tone === "ok" ? "var(--success)" : "var(--danger)" }}
        >
          {state.text}
        </p>
      )}
    </div>
  );
}
