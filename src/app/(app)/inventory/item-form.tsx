"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Field } from "@/components/ui";
import { saveItem } from "./actions";

type CategoryOpt = { id: string; name: string };

export type ItemInitial = {
  id: string;
  name: string;
  type: string;
  baseUnit: string;
  categoryId: string | null;
  sku: string | null;
  purchaseUnitName: string;
  baseUnitsPerPurchaseUnit: number;
  hsnCode: string | null;
  gstRate: number;
  salePriceMinor: number;
  reorderLevelBase: number;
};

export function ItemForm({ categories, initial }: { categories: CategoryOpt[]; initial?: ItemInitial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState(initial?.type ?? "BULK_CONSUMABLE");
  const [baseUnit, setBaseUnit] = useState(initial?.baseUnit ?? "ML");

  const isPart = type === "STOCKED_PART";

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await saveItem(initial?.id ?? null, fd);
          if (!res.ok) setError(res.error);
          else router.push("/inventory");
        });
      }}
    >
      <section className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Item name" required>
              <input name="name" className="input" required autoFocus defaultValue={initial?.name} placeholder="Car Shampoo" />
            </Field>
          </div>

          <Field label="Type" required>
            <select
              name="type"
              className="input"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                // A stocked part is always whole pieces; force it so the
                // server-side rule and the form cannot disagree.
                if (e.target.value === "STOCKED_PART") setBaseUnit("PIECE");
              }}
            >
              <option value="BULK_CONSUMABLE">Bulk consumable — measured, deducted by recipe</option>
              <option value="STOCKED_PART">Stocked part — counted, picked onto a job</option>
            </select>
          </Field>

          <Field label="Measured in" required>
            <select
              name="baseUnit"
              className="input"
              value={baseUnit}
              onChange={(e) => setBaseUnit(e.target.value)}
              disabled={isPart}
            >
              <option value="ML">Millilitres</option>
              <option value="GRAM">Grams</option>
              <option value="PIECE">Pieces</option>
            </select>
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

          <Field label="SKU / part number">
            <input name="sku" className="input tnum" defaultValue={initial?.sku ?? ""} />
          </Field>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-[14px] font-semibold">How it is bought</h2>
        <p className="mt-0.5 mb-4 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          Buying happens in packs, consumption happens in {baseUnit === "PIECE" ? "pieces" : baseUnit === "ML" ? "millilitres" : "grams"}.
          Recording both means a 5L can and a 500ml bottle compare directly.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pack name" hint="What you order — 5L Can, Pack of 10, Piece">
            <input
              name="purchaseUnitName"
              className="input"
              defaultValue={initial?.purchaseUnitName ?? (isPart ? "Piece" : "5L Can")}
            />
          </Field>
          <Field label={`Units per pack (${baseUnit === "PIECE" ? "pcs" : baseUnit === "ML" ? "ml" : "g"})`} required>
            <input
              name="baseUnitsPerPurchaseUnit"
              className="input tnum"
              inputMode="decimal"
              defaultValue={initial?.baseUnitsPerPurchaseUnit ?? (isPart ? 1 : 5000)}
            />
          </Field>

          {!initial && (
            <>
              <Field label="Opening stock (packs)">
                <input name="openingQty" className="input tnum" inputMode="decimal" defaultValue="0" />
              </Field>
              <Field label="Cost per pack (₹)" hint="Sets the starting average cost">
                <input name="openingCost" className="input tnum" inputMode="decimal" defaultValue="0" />
              </Field>
            </>
          )}
        </div>
      </section>

      <section className="card p-5 grid gap-4 sm:grid-cols-2">
        <Field label="HSN code">
          <input name="hsnCode" className="input tnum" defaultValue={initial?.hsnCode ?? (isPart ? "8708" : "")} />
        </Field>
        <Field label="GST rate (%)" required>
          <input name="gstRate" className="input tnum" inputMode="numeric" defaultValue={initial?.gstRate ?? (isPart ? 28 : 18)} />
        </Field>
        <Field
          label="Sale price (₹)"
          hint={isPart ? "What the customer pays per piece" : "Leave 0 — consumables are billed through the service, not separately"}
        >
          <input
            name="salePrice"
            className="input tnum"
            inputMode="decimal"
            defaultValue={initial ? (initial.salePriceMinor / 100).toFixed(2) : "0"}
          />
        </Field>
        <Field
          label={`Reorder level (${baseUnit === "PIECE" ? "pcs" : baseUnit === "ML" ? "ml" : "g"})`}
          hint="Flags the item on the dashboard when stock drops to this"
        >
          <input
            name="reorderLevel"
            className="input tnum"
            inputMode="decimal"
            defaultValue={initial?.reorderLevelBase ?? 0}
          />
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

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : initial ? "Save changes" : "Add item"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
