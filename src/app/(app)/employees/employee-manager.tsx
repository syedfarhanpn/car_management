"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil, Plus, UserCheck, UserX, X } from "lucide-react";
import { Badge, Field } from "@/components/ui";
import { formatINR } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { saveEmployee, setEmployeeActive } from "./actions";

type UserOpt = { id: string; name: string; role: string };

export type Employee = {
  id: string;
  name: string;
  employeeCode: string | null;
  phone: string | null;
  designation: string | null;
  joiningDate: string | null;
  monthlySalaryMinor: number;
  userId: string | null;
  idProofType: string | null;
  idProofNumber: string | null;
  emergencyContact: string | null;
  address: string | null;
  isActive: boolean;
  jobsThisMonth: number;
  revenueThisMonth: number;
};

export function EmployeeManager({
  employees,
  users,
  canSeeSalary,
}: {
  employees: Employee[];
  users: UserOpt[];
  canSeeSalary: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [showInactive, setShowInactive] = useState(false);

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

  const visible = employees.filter((e) => showInactive || e.isActive);

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

      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <label className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show former staff
        </label>
        <button className="btn btn-primary text-[12.5px] py-1.5" onClick={() => setEditing("new")}>
          <Plus size={14} />
          Add employee
        </button>
      </div>

      {editing === "new" && (
        <EmployeeForm
          users={users}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSubmit={(fd) => run(() => saveEmployee(null, fd), () => setEditing(null))}
        />
      )}

      <div className="space-y-2">
        {visible.map((e) =>
          editing === e.id ? (
            <EmployeeForm
              key={e.id}
              users={users}
              initial={e}
              pending={pending}
              onCancel={() => setEditing(null)}
              onSubmit={(fd) => run(() => saveEmployee(e.id, fd), () => setEditing(null))}
            />
          ) : (
            <div key={e.id} className="card p-4 flex flex-wrap items-center gap-3" style={{ opacity: e.isActive ? 1 : 0.55 }}>
              <div
                className="grid place-items-center w-10 h-10 rounded-full text-[12.5px] font-semibold shrink-0"
                style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
              >
                {e.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
              </div>

              <div className="flex-1 min-w-[160px]">
                <p className="text-[14px] font-medium">
                  {e.name}
                  {e.employeeCode && (
                    <span className="ml-2 text-[11.5px] tnum font-normal" style={{ color: "var(--text-subtle)" }}>
                      {e.employeeCode}
                    </span>
                  )}
                </p>
                <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  {e.designation ?? "No designation"}
                  {e.phone && <span className="tnum"> · {formatPhone(e.phone)}</span>}
                </p>
              </div>

              {e.userId && <Badge tone="brand">Has login</Badge>}
              {!e.isActive && <Badge>Former</Badge>}

              {/* Attribution comes from job card lines, which have carried a
                  technician from day one even though commission is switched off. */}
              <div className="min-w-[120px] text-right">
                <p className="text-[13px] tnum font-medium">{e.jobsThisMonth}</p>
                <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>
                  jobs this month
                </p>
              </div>

              {canSeeSalary && (
                <div className="min-w-[110px] text-right">
                  <p className="text-[13px] tnum">
                    {e.monthlySalaryMinor > 0 ? formatINR(e.monthlySalaryMinor) : "—"}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>
                    per month
                  </p>
                </div>
              )}

              <div className="flex gap-0.5 shrink-0">
                <button
                  aria-label={`Edit ${e.name}`}
                  className="grid place-items-center w-8 h-8 rounded"
                  style={{ color: "var(--text-subtle)" }}
                  onClick={() => setEditing(e.id)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  aria-label={e.isActive ? `Mark ${e.name} as left` : `Reinstate ${e.name}`}
                  className="grid place-items-center w-8 h-8 rounded"
                  style={{ color: e.isActive ? "var(--danger)" : "var(--success)" }}
                  disabled={pending}
                  onClick={() => run(() => setEmployeeActive(e.id, !e.isActive))}
                >
                  {e.isActive ? <UserX size={15} /> : <UserCheck size={15} />}
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function EmployeeForm({
  users,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  users: UserOpt[];
  initial?: Employee;
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
        <Field label="Employee code">
          <input name="employeeCode" className="input tnum" defaultValue={initial?.employeeCode ?? ""} placeholder="EMP-005" />
        </Field>
        <Field label="Designation">
          <input name="designation" className="input" defaultValue={initial?.designation ?? ""} placeholder="Senior Detailer" />
        </Field>

        <Field label="Mobile">
          <input name="phone" className="input tnum" defaultValue={initial?.phone ?? ""} />
        </Field>
        <Field label="Joining date">
          <input name="joiningDate" type="date" className="input tnum" defaultValue={initial?.joiningDate ?? ""} />
        </Field>
        <Field label="Monthly salary (₹)">
          <input
            name="monthlySalary"
            className="input tnum"
            inputMode="decimal"
            defaultValue={initial ? (initial.monthlySalaryMinor / 100).toFixed(0) : "0"}
          />
        </Field>

        <Field label="Linked login" hint="Only if this person signs into the system">
          <select name="userId" className="input" defaultValue={initial?.userId ?? ""}>
            <option value="">No login</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role.toLowerCase()})
              </option>
            ))}
          </select>
        </Field>
        <Field label="ID proof type">
          <input name="idProofType" className="input" defaultValue={initial?.idProofType ?? ""} placeholder="Aadhaar" />
        </Field>
        <Field label="ID proof number">
          <input name="idProofNumber" className="input tnum" defaultValue={initial?.idProofNumber ?? ""} />
        </Field>

        <Field label="Emergency contact">
          <input name="emergencyContact" className="input tnum" defaultValue={initial?.emergencyContact ?? ""} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Address">
            <input name="address" className="input" defaultValue={initial?.address ?? ""} />
          </Field>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button type="submit" className="btn btn-primary text-[13px] py-1.5" disabled={pending}>
          {pending ? "Saving…" : "Save employee"}
        </button>
        <button type="button" className="btn btn-ghost text-[13px] py-1.5" onClick={onCancel}>
          <X size={14} />
          Cancel
        </button>
      </div>
    </form>
  );
}
