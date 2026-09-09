"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil, Plus, UserCheck, UserX, X } from "lucide-react";
import { Badge, Field, type Tone } from "@/components/ui";
import { formatPhone } from "@/lib/phone";
import { saveUser, setUserActive } from "../admin-actions";

type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
};

const ROLE_META: Record<string, { label: string; tone: Tone; blurb: string }> = {
  ADMIN: { label: "Admin", tone: "brand", blurb: "Everything: costs, margins, discounts, settings" },
  MANAGER: { label: "Manager", tone: "success", blurb: "Operations and reports, but not settings or users" },
  STAFF: { label: "Staff", tone: "neutral", blurb: "Job cards and billing at list price only" },
};

export function UserEditor({ users, currentUserId }: { users: User[]; currentUserId: string }) {
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
          Add user
        </button>
      </div>

      {editing === "new" && (
        <UserForm
          pending={pending}
          isNew
          onCancel={() => setEditing(null)}
          onSubmit={(fd) => run(() => saveUser(null, fd), () => setEditing(null))}
        />
      )}

      <div className="space-y-2">
        {users.map((u) =>
          editing === u.id ? (
            <UserForm
              key={u.id}
              initial={u}
              pending={pending}
              onCancel={() => setEditing(null)}
              onSubmit={(fd) => run(() => saveUser(u.id, fd), () => setEditing(null))}
            />
          ) : (
            <div key={u.id} className="card p-4 flex flex-wrap items-center gap-3" style={{ opacity: u.isActive ? 1 : 0.55 }}>
              <div
                className="grid place-items-center w-9 h-9 rounded-full text-[12px] font-semibold shrink-0"
                style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
              >
                {u.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
              </div>

              <div className="flex-1 min-w-[160px]">
                <p className="text-[14px] font-medium">
                  {u.name}
                  {u.id === currentUserId && (
                    <span className="ml-2 text-[11.5px] font-normal" style={{ color: "var(--text-subtle)" }}>
                      you
                    </span>
                  )}
                </p>
                <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  {u.email}
                  {u.phone && <span className="tnum"> · {formatPhone(u.phone)}</span>}
                </p>
              </div>

              <div className="min-w-[120px]">
                <Badge tone={ROLE_META[u.role]?.tone ?? "neutral"}>{ROLE_META[u.role]?.label ?? u.role}</Badge>
                {!u.isActive && (
                  <span className="ml-1.5">
                    <Badge tone="danger">Deactivated</Badge>
                  </span>
                )}
              </div>

              <span className="text-[11.5px] tnum min-w-[110px]" style={{ color: "var(--text-subtle)" }}>
                {u.lastLoginAt
                  ? `Last in ${new Date(u.lastLoginAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                  : "Never signed in"}
              </span>

              <div className="flex gap-0.5 shrink-0">
                <button
                  aria-label={`Edit ${u.name}`}
                  className="grid place-items-center w-8 h-8 rounded"
                  style={{ color: "var(--text-subtle)" }}
                  onClick={() => setEditing(u.id)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  aria-label={u.isActive ? `Deactivate ${u.name}` : `Reactivate ${u.name}`}
                  className="grid place-items-center w-8 h-8 rounded disabled:opacity-30"
                  style={{ color: u.isActive ? "var(--danger)" : "var(--success)" }}
                  disabled={pending || u.id === currentUserId}
                  title={u.id === currentUserId ? "You cannot deactivate yourself" : undefined}
                  onClick={() => run(() => setUserActive(u.id, !u.isActive))}
                >
                  {u.isActive ? <UserX size={15} /> : <UserCheck size={15} />}
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function UserForm({
  initial,
  pending,
  isNew,
  onSubmit,
  onCancel,
}: {
  initial?: User;
  pending: boolean;
  isNew?: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  const [role, setRole] = useState(initial?.role ?? "STAFF");

  return (
    <form
      className="card p-4 mb-2"
      style={{ borderColor: "var(--brand)" }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required>
          <input name="name" className="input" required autoFocus defaultValue={initial?.name} />
        </Field>
        <Field label="Email" required hint="Used to sign in">
          <input name="email" type="email" className="input" required defaultValue={initial?.email} />
        </Field>
        <Field label="Mobile">
          <input name="phone" className="input tnum" defaultValue={initial?.phone ?? ""} />
        </Field>
        <Field
          label={isNew ? "Password" : "New password"}
          required={isNew}
          hint={isNew ? "At least 6 characters" : "Leave blank to keep the current one"}
        >
          <input name="password" type="password" className="input" autoComplete="new-password" />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Role" required>
            <select name="role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="STAFF">Staff</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
          </Field>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
            {ROLE_META[role]?.blurb}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button type="submit" className="btn btn-primary text-[13px] py-1.5" disabled={pending}>
          {pending ? "Saving…" : "Save user"}
        </button>
        <button type="button" className="btn btn-ghost text-[13px] py-1.5" onClick={onCancel}>
          <X size={14} />
          Cancel
        </button>
      </div>
    </form>
  );
}
