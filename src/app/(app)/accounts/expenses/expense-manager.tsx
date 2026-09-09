"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge, Field } from "@/components/ui";
import { formatINR } from "@/lib/money";
import { deleteExpense, saveExpense, saveExpenseCategory } from "../actions";

type Category = { id: string; name: string; isFixed: boolean };
type Expense = {
  id: string;
  description: string;
  amountMinor: number;
  expenseDate: string;
  method: string;
  reference: string | null;
  categoryId: string | null;
  categoryName: string | null;
  userName: string | null;
};

const METHODS = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"];

export function ExpenseManager({
  expenses,
  categories,
  canDelete,
}: {
  expenses: Expense[];
  categories: Category[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [newCategory, setNewCategory] = useState("");

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

  const total = useMemo(() => expenses.reduce((a, e) => a + e.amountMinor, 0), [expenses]);

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

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          {expenses.length} recorded · <span className="tnum font-medium">{formatINR(total)}</span>
        </p>
        <button className="btn btn-primary text-[12.5px] py-1.5" onClick={() => setEditing("new")}>
          <Plus size={14} />
          Record expense
        </button>
      </div>

      {editing === "new" && (
        <ExpenseForm
          categories={categories}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSubmit={(fd) => run(() => saveExpense(null, fd), () => setEditing(null))}
        />
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                <th className="text-left font-medium px-4 py-2.5">Date</th>
                <th className="text-left font-medium px-3 py-2.5">Description</th>
                <th className="text-left font-medium px-3 py-2.5">Category</th>
                <th className="text-left font-medium px-3 py-2.5">Paid by</th>
                <th className="text-right font-medium px-3 py-2.5">Amount</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) =>
                editing === e.id ? (
                  <tr key={e.id} className="border-t">
                    <td colSpan={6} className="p-3" style={{ background: "var(--surface-2)" }}>
                      <ExpenseForm
                        categories={categories}
                        initial={e}
                        pending={pending}
                        onCancel={() => setEditing(null)}
                        onSubmit={(fd) => run(() => saveExpense(e.id, fd), () => setEditing(null))}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={e.id} className="border-t">
                    <td className="px-4 py-2.5 tnum whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                      {new Date(e.expenseDate).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{e.description}</span>
                      {e.userName && (
                        <div className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                          {e.userName}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>
                      {e.categoryName ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge>{e.method.toLowerCase().replace("_", " ")}</Badge>
                      {e.reference && (
                        <span className="ml-1.5 text-[11.5px] tnum" style={{ color: "var(--text-subtle)" }}>
                          {e.reference}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tnum font-medium">{formatINR(e.amountMinor)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-0.5 justify-end">
                        <button
                          aria-label="Edit"
                          className="grid place-items-center w-7 h-7 rounded"
                          style={{ color: "var(--text-subtle)" }}
                          onClick={() => setEditing(e.id)}
                        >
                          <Pencil size={14} />
                        </button>
                        {canDelete && (
                          <button
                            aria-label="Delete"
                            className="grid place-items-center w-7 h-7 rounded"
                            style={{ color: "var(--danger)" }}
                            disabled={pending}
                            onClick={() => {
                              if (window.confirm(`Delete "${e.description}"? This is recorded in the audit log.`)) {
                                run(() => deleteExpense(e.id));
                              }
                            }}
                          >
                            <Trash2 size={14} />
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

      <section className="card p-4 mt-5">
        <h2 className="text-[13px] font-semibold">Categories</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <Badge key={c.id} tone={c.isFixed ? "neutral" : "brand"}>
              {c.name}
            </Badge>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="label" htmlFor="newcat">
              Add a category
            </label>
            <input
              id="newcat"
              className="input"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Workshop consumables"
            />
          </div>
          <label className="flex items-center gap-1.5 text-[12.5px] pb-2.5" style={{ color: "var(--text-muted)" }}>
            <input type="checkbox" id="fixedcat" />
            Fixed cost
          </label>
          <button
            type="button"
            className="btn btn-ghost mb-0.5"
            disabled={pending || newCategory.trim().length < 2}
            onClick={() => {
              const fixed = (document.getElementById("fixedcat") as HTMLInputElement)?.checked ?? false;
              run(() => saveExpenseCategory(newCategory, fixed), () => setNewCategory(""));
            }}
          >
            <Plus size={15} />
            Add
          </button>
        </div>
        {/* Fixed vs variable is what makes a break-even figure possible later. */}
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
          Marking a category as fixed (rent, salaries) separates costs that run whether or not a car comes in.
        </p>
      </section>
    </div>
  );
}

function ExpenseForm({
  categories,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  categories: Category[];
  initial?: Expense;
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Field label="Description" required>
            <input
              name="description"
              className="input"
              required
              autoFocus
              defaultValue={initial?.description}
              placeholder="KSEB electricity bill"
            />
          </Field>
        </div>
        <Field label="Amount (₹)" required>
          <input
            name="amount"
            className="input tnum"
            required
            inputMode="decimal"
            defaultValue={initial ? (initial.amountMinor / 100).toFixed(2) : ""}
          />
        </Field>
        <Field label="Date" required>
          <input
            name="expenseDate"
            type="date"
            className="input tnum"
            required
            defaultValue={initial?.expenseDate ?? new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label="Category">
          <select name="categoryId" className="input" defaultValue={initial?.categoryId ?? ""}>
            <option value="">Uncategorised</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Paid by" required>
          <select name="method" className="input" defaultValue={initial?.method ?? "CASH"}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m.toLowerCase().replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reference">
          <input name="reference" className="input tnum" defaultValue={initial?.reference ?? ""} />
        </Field>
      </div>

      <div className="flex gap-2 mt-3">
        <button type="submit" className="btn btn-primary text-[13px] py-1.5" disabled={pending}>
          {pending ? "Saving…" : "Save expense"}
        </button>
        <button type="button" className="btn btn-ghost text-[13px] py-1.5" onClick={onCancel}>
          <X size={14} />
          Cancel
        </button>
      </div>
    </form>
  );
}
