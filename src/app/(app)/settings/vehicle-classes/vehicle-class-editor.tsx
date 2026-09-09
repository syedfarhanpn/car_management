"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, Pencil, Plus, X } from "lucide-react";
import { Field } from "@/components/ui";
import { archiveVehicleClass, saveVehicleClass } from "../catalog-actions";

type VClass = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  vehicleCount: number;
};

export function VehicleClassEditor({ classes }: { classes: VClass[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong");
      else {
        done?.();
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
          Add class
        </button>
      </div>

      {editing === "new" && (
        <ClassForm
          pending={pending}
          onCancel={() => setEditing(null)}
          onSubmit={(fd) => run(() => saveVehicleClass(null, fd), () => setEditing(null))}
        />
      )}

      <div className="space-y-2">
        {classes.map((c) =>
          editing === c.id ? (
            <ClassForm
              key={c.id}
              initial={c}
              pending={pending}
              onCancel={() => setEditing(null)}
              onSubmit={(fd) => run(() => saveVehicleClass(c.id, fd), () => setEditing(null))}
            />
          ) : (
            <div key={c.id} className="card p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold">{c.name}</p>
                {c.description && (
                  <p className="text-[12.5px] truncate" style={{ color: "var(--text-muted)" }}>
                    {c.description}
                  </p>
                )}
              </div>
              <span className="text-[12.5px] tnum shrink-0" style={{ color: "var(--text-subtle)" }}>
                {c.vehicleCount} {c.vehicleCount === 1 ? "vehicle" : "vehicles"}
              </span>
              <div className="flex gap-0.5 shrink-0">
                <button
                  aria-label={`Edit ${c.name}`}
                  className="grid place-items-center w-8 h-8 rounded"
                  style={{ color: "var(--text-subtle)" }}
                  onClick={() => setEditing(c.id)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  aria-label={`Archive ${c.name}`}
                  className="grid place-items-center w-8 h-8 rounded disabled:opacity-40"
                  style={{ color: "var(--danger)" }}
                  disabled={pending || c.vehicleCount > 0}
                  title={c.vehicleCount > 0 ? "Move its vehicles to another class first" : "Archive"}
                  onClick={() => run(() => archiveVehicleClass(c.id))}
                >
                  <Archive size={15} />
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
        A new class starts at ₹0 for every service and appears immediately in the price matrix — set its prices there
        before booking work against it.
      </p>
    </div>
  );
}

function ClassForm({
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: VClass;
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
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_100px]">
        <Field label="Name" required>
          <input name="name" className="input" required autoFocus defaultValue={initial?.name} placeholder="Compact SUV" />
        </Field>
        <Field label="Examples">
          <input
            name="description"
            className="input"
            defaultValue={initial?.description ?? ""}
            placeholder="Creta, Seltos, Brezza"
          />
        </Field>
        <Field label="Order">
          <input name="sortOrder" className="input tnum" inputMode="numeric" defaultValue={initial?.sortOrder ?? 0} />
        </Field>
      </div>

      <div className="flex gap-2 mt-3">
        <button type="submit" className="btn btn-primary text-[13px] py-1.5" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-ghost text-[13px] py-1.5" onClick={onCancel}>
          <X size={14} />
          Cancel
        </button>
      </div>
    </form>
  );
}
