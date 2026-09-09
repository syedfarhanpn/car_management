"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { Badge, Field } from "@/components/ui";
import { formatINR } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { saveSupplier } from "../actions";

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  city: string | null;
  paymentTermsDays: number;
  outstanding: number;
  billCount: number;
};

export function SupplierEditor({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);

  function run(fd: FormData, id: string | null) {
    setError(null);
    start(async () => {
      const res = await saveSupplier(id, fd);
      if (!res.ok) setError(res.error);
      else {
        setEditing(null);
        router.refresh();
      }
    });
  }

  return (
    <div>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-lg px-3.5 py-2.5 text-[13px]"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {error}
        </p>
      )}

      <div className="flex justify-end mb-2.5">
        <button className="btn btn-primary text-[12.5px] py-1.5" onClick={() => setEditing("new")}>
          <Plus size={14} />
          Add supplier
        </button>
      </div>

      {editing === "new" && <SupplierForm pending={pending} onCancel={() => setEditing(null)} onSubmit={(fd) => run(fd, null)} />}

      <div className="space-y-2">
        {suppliers.map((sup) =>
          editing === sup.id ? (
            <SupplierForm
              key={sup.id}
              initial={sup}
              pending={pending}
              onCancel={() => setEditing(null)}
              onSubmit={(fd) => run(fd, sup.id)}
            />
          ) : (
            <div key={sup.id} className="card p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[180px]">
                <p className="text-[14px] font-medium">{sup.name}</p>
                <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  {sup.phone && <span className="tnum">{formatPhone(sup.phone)}</span>}
                  {sup.city && <span> · {sup.city}</span>}
                  {sup.gstin && <span className="tnum"> · {sup.gstin}</span>}
                </p>
              </div>

              {sup.paymentTermsDays > 0 && <Badge>{sup.paymentTermsDays}-day terms</Badge>}

              <span className="text-[12.5px] tnum min-w-[80px] text-right" style={{ color: "var(--text-subtle)" }}>
                {sup.billCount} {sup.billCount === 1 ? "bill" : "bills"}
              </span>

              <span
                className="text-[13px] tnum font-medium min-w-[100px] text-right"
                style={{ color: sup.outstanding > 0 ? "var(--warning)" : "var(--text-subtle)" }}
              >
                {sup.outstanding > 0 ? formatINR(sup.outstanding) : "Settled"}
              </span>

              <button
                aria-label={`Edit ${sup.name}`}
                className="grid place-items-center w-8 h-8 rounded shrink-0"
                style={{ color: "var(--text-subtle)" }}
                onClick={() => setEditing(sup.id)}
              >
                <Pencil size={15} />
              </button>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function SupplierForm({
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: Supplier;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="card p-4 mb-2"
      style={{ borderColor: "var(--brand)" }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Name" required>
          <input name="name" className="input" required autoFocus defaultValue={initial?.name} />
        </Field>
        <Field label="Phone">
          <input name="phone" className="input tnum" defaultValue={initial?.phone ?? ""} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" className="input" defaultValue={initial?.email ?? ""} />
        </Field>
        <Field label="GSTIN">
          <input name="gstin" className="input tnum uppercase" defaultValue={initial?.gstin ?? ""} />
        </Field>
        <Field label="City">
          <input name="city" className="input" defaultValue={initial?.city ?? ""} />
        </Field>
        <Field label="Payment terms (days)" hint="0 means cash on delivery">
          <input
            name="paymentTermsDays"
            className="input tnum"
            inputMode="numeric"
            defaultValue={initial?.paymentTermsDays ?? 0}
          />
        </Field>
      </div>

      <div className="flex gap-2 mt-3">
        <button type="submit" className="btn btn-primary text-[13px] py-1.5" disabled={pending}>
          {pending ? "Saving…" : "Save supplier"}
        </button>
        <button type="button" className="btn btn-ghost text-[13px] py-1.5" onClick={onCancel}>
          <X size={14} />
          Cancel
        </button>
      </div>
    </form>
  );
}
