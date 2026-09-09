"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Field } from "@/components/ui";
import { addVehicle } from "../../../actions";

type ClassOpt = { id: string; name: string };
type ModelOpt = { id: string; label: string; vehicleClassId: string };

export function AddVehicleForm({
  clientId,
  classes,
  models,
}: {
  clientId: string;
  classes: ClassOpt[];
  models: ModelOpt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [classId, setClassId] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    start(async () => {
      const res = await addVehicle(clientId, form);
      if (!res.ok) setError(res.error);
      else router.push(`/clients/${clientId}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <section className="card p-5 grid gap-4 sm:grid-cols-2">
        <Field label="Registration number" required hint="Any format — KL 07 CH 4521 or KL07CH4521">
          <input
            name="registrationNumber"
            className="input tnum uppercase"
            required
            autoFocus
            placeholder="KL 07 CH 4521"
            autoComplete="off"
          />
        </Field>

        <Field label="Make & model">
          <select
            name="modelId"
            className="input"
            onChange={(e) => {
              const m = models.find((x) => x.id === e.target.value);
              if (m) setClassId(m.vehicleClassId);
            }}
          >
            <option value="">Not listed</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Vehicle class" required hint="Decides the price for every service">
          <select name="vehicleClassId" className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Select</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Colour">
          <input name="color" className="input" placeholder="Pearl White" />
        </Field>

        <Field label="Odometer (km)">
          <input name="odometerKm" className="input tnum" inputMode="numeric" placeholder="42500" />
        </Field>

        <Field label="Model not listed? Type it">
          <input name="modelText" className="input" placeholder="e.g. Tata Nexon" />
        </Field>
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

      <div className="flex items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Add vehicle"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
