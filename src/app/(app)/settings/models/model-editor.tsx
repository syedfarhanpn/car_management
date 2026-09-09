"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Archive, Pencil, Plus, Search, X } from "lucide-react";
import { Field } from "@/components/ui";
import { archiveVehicleModel, saveVehicleModel } from "../catalog-actions";

type Model = {
  id: string;
  make: string;
  model: string;
  variant: string | null;
  vehicleClassId: string;
  fuelType: string | null;
  engineOilGrade: string | null;
  engineOilCapacityMl: number | null;
  oilFilterPartNo: string | null;
  airFilterPartNo: string | null;
  cabinFilterPartNo: string | null;
};

type ClassOpt = { id: string; name: string };

export function ModelEditor({ models, classes }: { models: Model[]; classes: ClassOpt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [query, setQuery] = useState("");

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => `${m.make} ${m.model} ${m.variant ?? ""}`.toLowerCase().includes(q));
  }, [models, query]);

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

      <div className="flex flex-wrap gap-2 items-center justify-between mb-2.5">
        <div className="relative max-w-xs flex-1 min-w-[180px]">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-subtle)" }}
          />
          <input
            className="input pl-9 py-1.5"
            placeholder="Filter models"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className="btn btn-primary text-[12.5px] py-1.5" onClick={() => setEditing("new")}>
          <Plus size={14} />
          Add model
        </button>
      </div>

      {editing === "new" && (
        <ModelForm
          classes={classes}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSubmit={(fd) => run(() => saveVehicleModel(null, fd), () => setEditing(null))}
        />
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                <th className="text-left font-medium px-4 py-2.5">Model</th>
                <th className="text-left font-medium px-3 py-2.5">Class</th>
                <th className="text-left font-medium px-3 py-2.5">Fuel</th>
                <th className="text-left font-medium px-3 py-2.5">Oil</th>
                <th className="text-right font-medium px-3 py-2.5">Capacity</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) =>
                editing === m.id ? (
                  <tr key={m.id} className="border-t">
                    <td colSpan={6} className="p-3" style={{ background: "var(--surface-2)" }}>
                      <ModelForm
                        classes={classes}
                        initial={m}
                        pending={pending}
                        onCancel={() => setEditing(null)}
                        onSubmit={(fd) => run(() => saveVehicleModel(m.id, fd), () => setEditing(null))}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id} className="border-t">
                    <td className="px-4 py-2.5 font-medium">
                      {m.make} {m.model}
                      {m.variant && (
                        <span className="font-normal" style={{ color: "var(--text-subtle)" }}>
                          {" "}
                          {m.variant}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>
                      {classes.find((c) => c.id === m.vehicleClassId)?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>
                      {m.fuelType ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 tnum" style={{ color: "var(--text-muted)" }}>
                      {m.engineOilGrade ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tnum" style={{ color: "var(--text-muted)" }}>
                      {m.engineOilCapacityMl ? `${(m.engineOilCapacityMl / 1000).toFixed(1)} L` : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-0.5 justify-end">
                        <button
                          aria-label={`Edit ${m.make} ${m.model}`}
                          className="grid place-items-center w-7 h-7 rounded"
                          style={{ color: "var(--text-subtle)" }}
                          onClick={() => setEditing(m.id)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          aria-label={`Archive ${m.make} ${m.model}`}
                          className="grid place-items-center w-7 h-7 rounded"
                          style={{ color: "var(--danger)" }}
                          disabled={pending}
                          onClick={() => run(() => archiveVehicleModel(m.id))}
                        >
                          <Archive size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ModelForm({
  classes,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  classes: ClassOpt[];
  initial?: Model;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form
      className={initial ? "" : "card p-4 mb-2"}
      style={initial ? undefined : { borderColor: "var(--brand)" }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Make" required>
          <input name="make" className="input" required autoFocus defaultValue={initial?.make} placeholder="Hyundai" />
        </Field>
        <Field label="Model" required>
          <input name="model" className="input" required defaultValue={initial?.model} placeholder="Creta" />
        </Field>
        <Field label="Variant">
          <input name="variant" className="input" defaultValue={initial?.variant ?? ""} placeholder="SX(O)" />
        </Field>
        <Field label="Vehicle class" required>
          <select name="vehicleClassId" className="input" required defaultValue={initial?.vehicleClassId ?? ""}>
            <option value="">Select</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Fuel">
          <select name="fuelType" className="input" defaultValue={initial?.fuelType ?? ""}>
            <option value="">—</option>
            <option>PETROL</option>
            <option>DIESEL</option>
            <option>CNG</option>
            <option>EV</option>
            <option>HYBRID</option>
          </select>
        </Field>
        <Field label="Engine oil grade">
          <input name="engineOilGrade" className="input tnum" defaultValue={initial?.engineOilGrade ?? ""} placeholder="5W-30" />
        </Field>
        <Field label="Oil capacity (L)" hint="Stored in ml so it costs out per job">
          <input
            name="engineOilCapacityMl"
            className="input tnum"
            inputMode="decimal"
            defaultValue={initial?.engineOilCapacityMl ? (initial.engineOilCapacityMl / 1000).toFixed(1) : ""}
            placeholder="3.8"
          />
        </Field>
        <Field label="Oil filter part no.">
          <input name="oilFilterPartNo" className="input tnum" defaultValue={initial?.oilFilterPartNo ?? ""} />
        </Field>
        <Field label="Air filter part no.">
          <input name="airFilterPartNo" className="input tnum" defaultValue={initial?.airFilterPartNo ?? ""} />
        </Field>
        <Field label="Cabin filter part no.">
          <input name="cabinFilterPartNo" className="input tnum" defaultValue={initial?.cabinFilterPartNo ?? ""} />
        </Field>
      </div>

      <div className="flex gap-2 mt-3">
        <button type="submit" className="btn btn-primary text-[13px] py-1.5" disabled={pending}>
          {pending ? "Saving…" : "Save model"}
        </button>
        <button type="button" className="btn btn-ghost text-[13px] py-1.5" onClick={onCancel}>
          <X size={14} />
          Cancel
        </button>
      </div>
    </form>
  );
}
