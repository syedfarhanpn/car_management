"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Save } from "lucide-react";
import { Field } from "@/components/ui";
import { saveOrgProfile } from "../admin-actions";

type Org = Record<
  | "name"
  | "legalName"
  | "gstin"
  | "phone"
  | "email"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "state"
  | "stateCode"
  | "pincode",
  string
>;

export function BusinessForm({ org }: { org: Org }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await saveOrgProfile(fd);
          if (!res.ok) setMessage({ tone: "err", text: res.error });
          else {
            setMessage({ tone: "ok", text: "Saved" });
            router.refresh();
          }
        });
      }}
    >
      <section className="card p-5 grid gap-4 sm:grid-cols-2">
        <Field label="Trading name" required hint="Shown large at the top of the invoice">
          <input name="name" className="input" required defaultValue={org.name} />
        </Field>
        <Field label="Legal name">
          <input name="legalName" className="input" defaultValue={org.legalName} />
        </Field>

        <Field label="GSTIN" hint="Sets the state code that decides CGST/SGST vs IGST">
          <input name="gstin" className="input tnum uppercase" defaultValue={org.gstin} placeholder="32AABCP1234M1Z5" />
        </Field>
        <Field label="Phone">
          <input name="phone" className="input tnum" defaultValue={org.phone} />
        </Field>

        <Field label="Email">
          <input name="email" type="email" className="input" defaultValue={org.email} />
        </Field>
        <Field label="PIN code">
          <input name="pincode" className="input tnum" defaultValue={org.pincode} />
        </Field>

        <Field label="Address line 1">
          <input name="addressLine1" className="input" defaultValue={org.addressLine1} />
        </Field>
        <Field label="Address line 2">
          <input name="addressLine2" className="input" defaultValue={org.addressLine2} />
        </Field>

        <Field label="City">
          <input name="city" className="input" defaultValue={org.city} />
        </Field>
        <Field label="State">
          <input name="state" className="input" defaultValue={org.state} />
        </Field>
      </section>

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : <><Save size={16} />Save profile</>}
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
