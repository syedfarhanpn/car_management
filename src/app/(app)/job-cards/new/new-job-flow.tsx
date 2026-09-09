"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Car, Search, UserPlus } from "lucide-react";
import { Field } from "@/components/ui";
import { formatRegistration } from "@/lib/vehicle";
import { formatPhone } from "@/lib/phone";
import { createJobCard } from "../actions";
import { lookupVehicles, quickCreateClientAndVehicle } from "../search-actions";
import type { VehicleHit } from "@/lib/services/search";

type ClassOpt = { id: string; name: string };
type ModelOpt = { id: string; label: string; vehicleClassId: string };

export function NewJobFlow({
  preselectedVehicleId,
  classes,
  models,
}: {
  preselectedVehicleId?: string;
  classes: ClassOpt[];
  models: ModelOpt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<VehicleHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<VehicleHit | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newClassId, setNewClassId] = useState("");
  const seq = useRef(0);

  // Debounced live search. The counter is a two-hands-full environment;
  // making staff press a button to search is a needless extra motion.
  useEffect(() => {
    if (preselectedVehicleId) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const results = await lookupVehicles(q);
      // Ignore a slow response that lost the race to a newer keystroke.
      if (id !== seq.current) return;
      setHits(results);
      setSearching(false);
    }, 220);
    return () => clearTimeout(t);
  }, [query, preselectedVehicleId]);

  useEffect(() => {
    if (!preselectedVehicleId) return;
    start(async () => {
      const results = await lookupVehicles(preselectedVehicleId.slice(0, 8));
      const hit = results.find((r) => r.vehicleId === preselectedVehicleId);
      if (hit) setSelected(hit);
    });
  }, [preselectedVehicleId]);

  function openJob(vehicleId: string, form: FormData) {
    form.set("vehicleId", vehicleId);
    start(async () => {
      const res = await createJobCard(form);
      if (!res.ok) setError(res.error);
      else router.push(`/job-cards/${res.data.id}`);
    });
  }

  // ---------------------------------------------------------------- selected
  if (selected) {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          openJob(selected.vehicleId, new FormData(e.currentTarget));
        }}
      >
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[19px] font-semibold tnum tracking-tight">
                {formatRegistration(selected.registration)}
              </p>
              <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
                {selected.make && selected.model ? `${selected.make} ${selected.model}` : "Model not recorded"}
                {selected.color ? ` · ${selected.color}` : ""}
                {selected.className ? ` · ${selected.className}` : ""}
              </p>
              <p className="mt-2 text-[13px]">
                <span className="font-medium">{selected.clientName}</span>
                {selected.clientPhone && (
                  <span className="tnum" style={{ color: "var(--text-muted)" }}>
                    {" · "}
                    {formatPhone(selected.clientPhone)}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost text-[13px]"
              onClick={() => {
                setSelected(null);
                setQuery("");
              }}
            >
              Change vehicle
            </button>
          </div>
        </section>

        <section className="card p-5 grid gap-4 sm:grid-cols-2">
          <Field label="Odometer (km)" hint="Drives the service-due reminder later">
            <input
              name="odometerKm"
              className="input tnum"
              inputMode="numeric"
              defaultValue={selected.lastOdometerKm ?? ""}
              placeholder="42500"
            />
          </Field>

          <Field label="Fuel level">
            <select name="fuelLevel" className="input" defaultValue="">
              <option value="">Not recorded</option>
              <option>Empty</option>
              <option>1/4</option>
              <option>1/2</option>
              <option>3/4</option>
              <option>Full</option>
            </select>
          </Field>

          <div className="sm:col-span-2">
            <Field label="Customer complaint / request">
              <textarea
                name="customerComplaint"
                className="input"
                rows={3}
                placeholder="e.g. Full wash and interior cleaning. Noise from front left wheel."
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

        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Opening…" : "Open job card"}
        </button>
      </form>
    );
  }

  // ---------------------------------------------------------------- new car
  if (showNew) {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const f = new FormData(e.currentTarget);
          start(async () => {
            const res = await quickCreateClientAndVehicle({
              name: String(f.get("name") ?? ""),
              phone: String(f.get("phone") ?? ""),
              email: String(f.get("email") ?? ""),
              registrationNumber: String(f.get("registrationNumber") ?? ""),
              vehicleClassId: String(f.get("vehicleClassId") ?? ""),
              modelId: String(f.get("modelId") ?? ""),
              modelText: String(f.get("modelText") ?? ""),
              color: String(f.get("color") ?? ""),
              odometerKm: String(f.get("odometerKm") ?? ""),
            });
            if (!res.ok) {
              setError(res.error);
              return;
            }
            const jobForm = new FormData();
            jobForm.set("odometerKm", String(f.get("odometerKm") ?? ""));
            jobForm.set("customerComplaint", String(f.get("customerComplaint") ?? ""));
            openJob(res.vehicleId, jobForm);
          });
        }}
      >
        <section className="card p-5">
          <h2 className="text-[14px] font-semibold">New customer & vehicle</h2>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            If this number already belongs to an existing customer, the car is added to them rather than creating a
            duplicate.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Customer name" required>
              <input name="name" className="input" required autoFocus placeholder="Rahul Menon" />
            </Field>
            <Field label="Mobile number" required>
              <input name="phone" className="input tnum" required inputMode="tel" placeholder="98470 12345" />
            </Field>
            <Field label="Email">
              <input name="email" type="email" className="input" />
            </Field>
            <Field label="Registration number" required>
              <input
                name="registrationNumber"
                className="input tnum uppercase"
                required
                defaultValue={query.toUpperCase()}
                placeholder="KL 07 CH 4521"
              />
            </Field>
            <Field label="Make & model">
              <select
                name="modelId"
                className="input"
                onChange={(e) => {
                  const m = models.find((x) => x.id === e.target.value);
                  if (m) setNewClassId(m.vehicleClassId);
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
            <Field label="Vehicle class" required hint="Sets the price for every service">
              <select
                name="vehicleClassId"
                className="input"
                value={newClassId}
                onChange={(e) => setNewClassId(e.target.value)}
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
              <input name="color" className="input" />
            </Field>
            <Field label="Odometer (km)">
              <input name="odometerKm" className="input tnum" inputMode="numeric" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Customer complaint / request">
                <textarea name="customerComplaint" className="input" rows={2} />
              </Field>
            </div>
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

        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Creating…" : "Create & open job card"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)} disabled={pending}>
            Back to search
          </button>
        </div>
      </form>
    );
  }

  // ---------------------------------------------------------------- search
  return (
    <div>
      <div className="card p-5">
        <label className="label" htmlFor="plate">
          Vehicle number, phone or customer name
        </label>
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-subtle)" }}
          />
          <input
            id="plate"
            className="input pl-11 text-[17px] py-3 tnum uppercase"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="4521"
            autoFocus
            autoComplete="off"
            inputMode="text"
          />
        </div>
        <p className="mt-2 text-[12px]" style={{ color: "var(--text-subtle)" }}>
          Type the last four digits of the plate. Full numbers, phone numbers and names work too.
        </p>
      </div>

      <div className="mt-4">
        {searching && (
          <p className="text-[13px] px-1" style={{ color: "var(--text-subtle)" }}>
            Searching…
          </p>
        )}

        {!searching && query.trim().length >= 2 && hits.length === 0 && (
          <div className="card p-6 text-center">
            <p className="text-[14px] font-medium">No vehicle matches “{query}”</p>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              First visit? Add the customer and car, and the job card opens straight after.
            </p>
            <button type="button" className="btn btn-primary mt-4" onClick={() => setShowNew(true)}>
              <UserPlus size={16} />
              Add new customer & vehicle
            </button>
          </div>
        )}

        {hits.length > 0 && (
          <>
            {/* Two customers can genuinely share the last four digits. Every
                match is listed with its owner so the right one gets picked. */}
            {hits.length > 1 && (
              <p className="mb-2 px-1 text-[12.5px]" style={{ color: "var(--warning)" }}>
                {hits.length} vehicles match — check the owner before you pick.
              </p>
            )}
            <div className="space-y-2">
              {hits.map((h) => (
                <button
                  key={h.vehicleId}
                  type="button"
                  onClick={() => setSelected(h)}
                  className="card p-4 w-full text-left flex items-center gap-3.5 transition-shadow hover:shadow-[var(--shadow-md)]"
                >
                  <div
                    className="grid place-items-center w-10 h-10 rounded-lg shrink-0"
                    style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
                  >
                    <Car size={19} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold tnum tracking-tight">{formatRegistration(h.registration)}</p>
                    <p className="text-[12.5px] truncate" style={{ color: "var(--text-muted)" }}>
                      {h.make && h.model ? `${h.make} ${h.model}` : "Model not recorded"}
                      {h.className ? ` · ${h.className}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13px] font-medium">{h.clientName ?? "No owner"}</p>
                    {h.clientPhone && (
                      <p className="text-[12px] tnum" style={{ color: "var(--text-subtle)" }}>
                        {formatPhone(h.clientPhone)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost mt-3 w-full" onClick={() => setShowNew(true)}>
              <UserPlus size={16} />
              None of these — add a new customer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
