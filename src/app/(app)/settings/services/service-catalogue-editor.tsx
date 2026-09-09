"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { Badge, Field } from "@/components/ui";
import {
  archiveService,
  archiveServiceCategory,
  restoreService,
  saveService,
  saveServiceCategory,
} from "../catalog-actions";

type Category = { id: string; name: string; requiresEstimate: boolean; sortOrder: number };
type Service = {
  id: string;
  name: string;
  categoryId: string;
  sacCode: string | null;
  gstRate: number;
  estimatedMinutes: number | null;
  description: string | null;
  isActive: boolean;
};

export function ServiceCatalogueEditor({
  categories,
  services,
}: {
  categories: Category[];
  services: Service[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingCat, setEditingCat] = useState<string | "new" | null>(null);
  const [editingSvc, setEditingSvc] = useState<string | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);

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

  const visible = services.filter((svc) => showArchived || svc.isActive);

  return (
    <div className="space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-lg px-3.5 py-2.5 text-[13px]"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {error}
        </p>
      )}

      {/* ------------------------------------------------------- categories */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
            Categories
          </h2>
          <button className="btn btn-ghost text-[12.5px] py-1.5" onClick={() => setEditingCat("new")}>
            <Plus size={14} />
            Add category
          </button>
        </div>

        {editingCat === "new" && (
          <CategoryForm
            key="new-cat"
            pending={pending}
            onCancel={() => setEditingCat(null)}
            onSubmit={(fd) => run(() => saveServiceCategory(null, fd), () => setEditingCat(null))}
          />
        )}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) =>
            editingCat === c.id ? (
              <CategoryForm
                key={c.id}
                initial={c}
                pending={pending}
                onCancel={() => setEditingCat(null)}
                onSubmit={(fd) => run(() => saveServiceCategory(c.id, fd), () => setEditingCat(null))}
              />
            ) : (
              <div key={c.id} className="card p-3.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium truncate">{c.name}</p>
                  <div className="mt-1">
                    {c.requiresEstimate ? (
                      <Badge tone="warning">Estimate required</Badge>
                    ) : (
                      <Badge>Straight to job card</Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <button
                    aria-label={`Edit ${c.name}`}
                    className="grid place-items-center w-7 h-7 rounded"
                    style={{ color: "var(--text-subtle)" }}
                    onClick={() => setEditingCat(c.id)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label={`Archive ${c.name}`}
                    className="grid place-items-center w-7 h-7 rounded"
                    style={{ color: "var(--danger)" }}
                    disabled={pending}
                    onClick={() => run(() => archiveServiceCategory(c.id))}
                  >
                    <Archive size={14} />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      {/* --------------------------------------------------------- services */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
            Services ({visible.length})
          </h2>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived
            </label>
            <button className="btn btn-primary text-[12.5px] py-1.5" onClick={() => setEditingSvc("new")}>
              <Plus size={14} />
              Add service
            </button>
          </div>
        </div>

        {editingSvc === "new" && (
          <div className="mb-2">
            <ServiceForm
              key="new-svc"
              categories={categories}
              pending={pending}
              isNew
              onCancel={() => setEditingSvc(null)}
              onSubmit={(fd) => run(() => saveService(null, fd), () => setEditingSvc(null))}
            />
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                  <th className="text-left font-medium px-4 py-2.5">Service</th>
                  <th className="text-left font-medium px-3 py-2.5">Category</th>
                  <th className="text-left font-medium px-3 py-2.5">SAC</th>
                  <th className="text-right font-medium px-3 py-2.5">GST</th>
                  <th className="text-right font-medium px-3 py-2.5">Mins</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {visible.map((svc) =>
                  editingSvc === svc.id ? (
                    <tr key={svc.id} className="border-t">
                      <td colSpan={6} className="p-3" style={{ background: "var(--surface-2)" }}>
                        <ServiceForm
                          categories={categories}
                          initial={svc}
                          pending={pending}
                          onCancel={() => setEditingSvc(null)}
                          onSubmit={(fd) => run(() => saveService(svc.id, fd), () => setEditingSvc(null))}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={svc.id} className="border-t" style={{ opacity: svc.isActive ? 1 : 0.5 }}>
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{svc.name}</span>
                        {!svc.isActive && (
                          <span className="ml-2">
                            <Badge>Archived</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>
                        {categories.find((c) => c.id === svc.categoryId)?.name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 tnum" style={{ color: "var(--text-muted)" }}>
                        {svc.sacCode ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tnum">{svc.gstRate}%</td>
                      <td className="px-3 py-2.5 text-right tnum" style={{ color: "var(--text-muted)" }}>
                        {svc.estimatedMinutes ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-0.5 justify-end">
                          <button
                            aria-label={`Edit ${svc.name}`}
                            className="grid place-items-center w-7 h-7 rounded"
                            style={{ color: "var(--text-subtle)" }}
                            onClick={() => setEditingSvc(svc.id)}
                          >
                            <Pencil size={14} />
                          </button>
                          {svc.isActive ? (
                            <button
                              aria-label={`Archive ${svc.name}`}
                              className="grid place-items-center w-7 h-7 rounded"
                              style={{ color: "var(--danger)" }}
                              disabled={pending}
                              onClick={() => run(() => archiveService(svc.id))}
                            >
                              <Archive size={14} />
                            </button>
                          ) : (
                            <button
                              aria-label={`Restore ${svc.name}`}
                              className="grid place-items-center w-7 h-7 rounded"
                              style={{ color: "var(--success)" }}
                              disabled={pending}
                              onClick={() => run(() => restoreService(svc.id))}
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Archiving rather than deleting keeps every past job card and invoice
            that referenced the service resolvable. */}
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
          Archiving hides a service from the job card picker. Past jobs and invoices that used it are unaffected.
        </p>
      </section>
    </div>
  );
}

function CategoryForm({
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: Category;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="card p-3.5 mb-2"
      style={{ borderColor: "var(--brand)" }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category name" required>
          <input name="name" className="input" required autoFocus defaultValue={initial?.name} />
        </Field>
        <Field label="Sort order">
          <input name="sortOrder" className="input tnum" inputMode="numeric" defaultValue={initial?.sortOrder ?? 0} />
        </Field>
      </div>

      <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
        <input
          type="checkbox"
          name="requiresEstimate"
          defaultChecked={initial?.requiresEstimate}
          className="w-4 h-4 mt-0.5"
        />
        <span>
          <span className="text-[13px] font-medium">Requires a customer-approved estimate</span>
          <span className="block text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
            Repairs and parts work usually do. Wash and detailing go straight to a job card.
          </span>
        </span>
      </label>

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

function ServiceForm({
  categories,
  initial,
  pending,
  isNew,
  onSubmit,
  onCancel,
}: {
  categories: Category[];
  initial?: Service;
  pending: boolean;
  isNew?: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form
      className={isNew ? "card p-4" : ""}
      style={isNew ? { borderColor: "var(--brand)" } : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Field label="Service name" required>
            <input name="name" className="input" required autoFocus defaultValue={initial?.name} />
          </Field>
        </div>

        <Field label="Category" required>
          <select name="categoryId" className="input" defaultValue={initial?.categoryId ?? ""} required>
            <option value="">Select</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="SAC code" hint="998714 covers motor vehicle maintenance and repair">
          <input name="sacCode" className="input tnum" defaultValue={initial?.sacCode ?? "998714"} />
        </Field>

        <Field label="GST rate (%)" required>
          <input name="gstRate" className="input tnum" inputMode="numeric" defaultValue={initial?.gstRate ?? 18} />
        </Field>

        <Field label="Typical minutes">
          <input
            name="estimatedMinutes"
            className="input tnum"
            inputMode="numeric"
            defaultValue={initial?.estimatedMinutes ?? ""}
          />
        </Field>

        {isNew && (
          <Field label="Starting price (₹)" hint="Applied to every vehicle class — fine-tune in Prices">
            <input name="defaultPrice" className="input tnum" inputMode="decimal" defaultValue="0" />
          </Field>
        )}

        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="Description">
            <input name="description" className="input" defaultValue={initial?.description ?? ""} />
          </Field>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button type="submit" className="btn btn-primary text-[13px] py-1.5" disabled={pending}>
          {pending ? "Saving…" : "Save service"}
        </button>
        <button type="button" className="btn btn-ghost text-[13px] py-1.5" onClick={onCancel}>
          <X size={14} />
          Cancel
        </button>
      </div>
    </form>
  );
}
