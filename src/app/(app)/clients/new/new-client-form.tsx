"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Field } from "@/components/ui";
import { addVehicle, createClient } from "../actions";

type ClassOpt = { id: string; name: string };
type ModelOpt = { id: string; label: string; vehicleClassId: string };

export function NewClientForm({ classes, models }: { classes: ClassOpt[]; models: ModelOpt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isCorporate, setIsCorporate] = useState(false);
  const [addCar, setAddCar] = useState(true);
  // Picking a model fills the class automatically — the class drives pricing,
  // so leaving it to the user to remember is how cars end up priced wrong.
  const [classId, setClassId] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    start(async () => {
      const res = await createClient(null, form);
      if (!res.ok) {
        setError(res.error);
        return;
      }

      if (addCar && String(form.get("registrationNumber") ?? "").trim()) {
        const vres = await addVehicle(res.data.id, form);
        if (!vres.ok) {
          // The client was created; only the vehicle failed. Say so plainly and
          // send them to the client page rather than losing the record.
          setError(`Client saved, but the vehicle was not added: ${vres.error}`);
          setTimeout(() => router.push(`/clients/${res.data.id}`), 2200);
          return;
        }
      }
      router.push(`/clients/${res.data.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <section className="card p-5">
        <h2 className="text-[14px] font-semibold">Customer details</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <input name="name" className="input" required autoFocus placeholder="Rahul Menon" />
          </Field>

          <Field label="Mobile number" required hint="Used for WhatsApp and to find the customer later">
            <input name="phone" className="input tnum" required inputMode="tel" placeholder="98470 12345" />
          </Field>

          <Field label="Email">
            <input name="email" type="email" className="input" placeholder="rahul@example.com" />
          </Field>

          <Field label="City">
            <input name="city" className="input" defaultValue="Kochi" />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Address">
              <input name="addressLine1" className="input" placeholder="Street, area" />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                name="__corporate"
                checked={isCorporate}
                onChange={(e) => setIsCorporate(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-[13px] font-medium">Corporate / fleet account</span>
            </label>
            <input type="hidden" name="type" value={isCorporate ? "CORPORATE" : "INDIVIDUAL"} />
          </div>

          {isCorporate && (
            <>
              <Field label="GSTIN">
                <input name="gstin" className="input tnum uppercase" placeholder="32ABCDE1234F1Z5" />
              </Field>
              <Field label="Credit limit (₹)" hint="0 means no credit — must pay on delivery">
                <input name="creditLimit" className="input tnum" inputMode="decimal" defaultValue="0" />
              </Field>
              <Field label="Credit days">
                <input name="creditDays" className="input tnum" inputMode="numeric" defaultValue="0" />
              </Field>
            </>
          )}
        </div>
      </section>

      <section className="card p-5">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={addCar} onChange={(e) => setAddCar(e.target.checked)} className="w-4 h-4" />
          <span className="text-[14px] font-semibold">Add their first vehicle now</span>
        </label>

        {addCar && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Registration number" required hint="Any format — KL 07 CH 4521 or KL07CH4521">
              <input
                name="registrationNumber"
                className="input tnum uppercase"
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

            <Field
              label="Vehicle class"
              required
              hint="Decides the price for every service — a wash on an SUV is not a wash on a hatchback"
            >
              <select
                name="vehicleClassId"
                className="input"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
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
          </div>
        )}
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
          {pending ? "Saving…" : "Save client"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
