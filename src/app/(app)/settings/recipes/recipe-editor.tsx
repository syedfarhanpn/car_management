"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Badge, Field } from "@/components/ui";
import { deleteRecipeLine, saveRecipeLine } from "../catalog-actions";

type ServiceOpt = { id: string; name: string; categoryName: string };
type ItemOpt = { id: string; name: string; baseUnit: string };
type ClassOpt = { id: string; name: string };
type Recipe = {
  id: string;
  serviceId: string;
  itemId: string;
  vehicleClassId: string | null;
  quantityBase: number;
};

const UNIT_LABEL: Record<string, string> = { ML: "ml", GRAM: "g", PIECE: "pcs" };

export function RecipeEditor({
  services,
  items,
  classes,
  recipes,
}: {
  services: ServiceOpt[];
  items: ItemOpt[];
  classes: ClassOpt[];
  recipes: Recipe[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(services[0]?.id ?? "");
  const [adding, setAdding] = useState(false);

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

  const forService = recipes.filter((r) => r.serviceId === selected);
  const service = services.find((svc) => svc.id === selected);

  const grouped = services.reduce<Record<string, ServiceOpt[]>>((acc, svc) => {
    (acc[svc.categoryName] ??= []).push(svc);
    return acc;
  }, {});

  if (items.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-[14px] font-medium">No bulk consumables yet</p>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          Add shampoo, wax, polish or oil as a bulk consumable in Inventory first — recipes are built from those.
        </p>
      </div>
    );
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

      <div className="grid gap-4 lg:grid-cols-[260px_1fr] items-start">
        <aside className="card p-2 max-h-[70vh] overflow-y-auto">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat} className="mb-2">
              <p className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
                {cat}
              </p>
              {list.map((svc) => {
                const count = recipes.filter((r) => r.serviceId === svc.id).length;
                return (
                  <button
                    key={svc.id}
                    onClick={() => {
                      setSelected(svc.id);
                      setAdding(false);
                    }}
                    className="w-full text-left rounded-lg px-2 py-1.5 text-[12.5px] flex items-center justify-between gap-2"
                    style={
                      selected === svc.id
                        ? { background: "var(--brand-soft)", color: "var(--brand)" }
                        : { color: "var(--text-muted)" }
                    }
                  >
                    <span className="truncate">{svc.name}</span>
                    {count > 0 && (
                      <span className="tnum text-[11px] shrink-0" style={{ color: "var(--text-subtle)" }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-[14px] font-semibold">{service?.name ?? "Pick a service"}</h2>
            {service && (
              <button className="btn btn-primary text-[12.5px] py-1.5" onClick={() => setAdding(true)}>
                <Plus size={14} />
                Add consumable
              </button>
            )}
          </div>

          {adding && service && (
            <form
              className="card p-4 mb-2"
              style={{ borderColor: "var(--brand)" }}
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                fd.set("serviceId", service.id);
                run(() => saveRecipeLine(null, fd), () => setAdding(false));
              }}
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Consumable" required>
                  <select name="itemId" className="input" required autoFocus>
                    <option value="">Select</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({UNIT_LABEL[i.baseUnit] ?? i.baseUnit})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Quantity per job" required hint="In the item's base unit">
                  <input name="quantityBase" className="input tnum" required inputMode="decimal" placeholder="150" />
                </Field>
                <Field label="Vehicle class" hint="Blank applies to every class">
                  <select name="vehicleClassId" className="input">
                    <option value="">All classes</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="flex gap-2 mt-3">
                <button type="submit" className="btn btn-primary text-[13px] py-1.5" disabled={pending}>
                  {pending ? "Saving…" : "Add"}
                </button>
                <button type="button" className="btn btn-ghost text-[13px] py-1.5" onClick={() => setAdding(false)}>
                  <X size={14} />
                  Cancel
                </button>
              </div>
            </form>
          )}

          {forService.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-[13.5px] font-medium">No consumables set for this service</p>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                Without a recipe, this service deducts nothing from stock and its true margin cannot be worked out.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                    <th className="text-left font-medium px-4 py-2.5">Consumable</th>
                    <th className="text-left font-medium px-3 py-2.5">Applies to</th>
                    <th className="text-right font-medium px-3 py-2.5">Per job</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {forService.map((r) => {
                    const item = items.find((i) => i.id === r.itemId);
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="px-4 py-2.5 font-medium">{item?.name ?? "Unknown item"}</td>
                        <td className="px-3 py-2.5">
                          {r.vehicleClassId ? (
                            <Badge tone="brand">{classes.find((c) => c.id === r.vehicleClassId)?.name}</Badge>
                          ) : (
                            <Badge>All classes</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tnum font-medium">
                          {r.quantityBase} {UNIT_LABEL[item?.baseUnit ?? ""] ?? ""}
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            aria-label="Remove"
                            className="grid place-items-center w-7 h-7 rounded ml-auto"
                            style={{ color: "var(--danger)" }}
                            disabled={pending}
                            onClick={() => run(() => deleteRecipeLine(r.id))}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* A class-specific row wins over the all-classes row for the same item. */}
          <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
            A class-specific quantity overrides the all-classes one for that size, so an SUV can use more shampoo
            without repeating the whole recipe.
          </p>
        </section>
      </div>
    </div>
  );
}
