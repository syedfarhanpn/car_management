import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { AlertTriangle, ClipboardCheck, Plus } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { can, requireRole } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { getStockOnHand } from "@/lib/services/stock";
import { Badge, EmptyState, Page, PageHeader } from "@/components/ui";
import { InventoryTable } from "./inventory-table";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const { type = "all" } = await searchParams;
  const db = await getDb();

  const [items, categories, onHand] = await Promise.all([
    db
      .select()
      .from(s.inventoryItems)
      .where(and(eq(s.inventoryItems.orgId, user.orgId), eq(s.inventoryItems.isActive, true)))
      .orderBy(asc(s.inventoryItems.name)),
    db.select().from(s.itemCategories).where(eq(s.itemCategories.orgId, user.orgId)).orderBy(asc(s.itemCategories.name)),
    getStockOnHand(user.orgId),
  ]);

  const rows = items
    .filter((i) => (type === "all" ? true : type === "parts" ? i.type === "STOCKED_PART" : i.type === "BULK_CONSUMABLE"))
    .map((i) => {
      const qty = onHand.get(i.id) ?? 0;
      return {
        id: i.id,
        name: i.name,
        sku: i.sku,
        type: i.type,
        baseUnit: i.baseUnit,
        purchaseUnitName: i.purchaseUnitName,
        baseUnitsPerPurchaseUnit: Number(i.baseUnitsPerPurchaseUnit),
        categoryId: i.categoryId,
        categoryName: categories.find((c) => c.id === i.categoryId)?.name ?? null,
        hsnCode: i.hsnCode,
        gstRate: i.gstRate,
        avgCostMinor: Number(i.avgCostMinor),
        salePriceMinor: Number(i.salePriceMinor),
        reorderLevelBase: Number(i.reorderLevelBase),
        onHand: qty,
        valueMinor: Math.round(qty * Number(i.avgCostMinor)),
        low: qty <= Number(i.reorderLevelBase),
      };
    });

  const totalValue = rows.reduce((a, r) => a + r.valueMinor, 0);
  const lowCount = rows.filter((r) => r.low).length;

  return (
    <Page wide>
      <PageHeader
        title="Inventory"
        subtitle="Stock on hand is derived from the movement ledger, never stored — so every number here can be traced to what caused it."
        actions={
          <>
            <Link href="/inventory/stock-take" className="btn btn-ghost">
              <ClipboardCheck size={16} />
              Stock take
            </Link>
            <Link href="/inventory/new" className="btn btn-primary">
              <Plus size={16} />
              New item
            </Link>
          </>
        }
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
        <div className="card p-4">
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Items tracked
          </p>
          <p className="mt-1 text-[24px] font-semibold tnum leading-none">{rows.length}</p>
        </div>
        {can.viewCosts(user) && (
          <div className="card p-4">
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Stock value
            </p>
            <p className="mt-1 text-[24px] font-semibold tnum leading-none">{formatINR(totalValue)}</p>
            <p className="mt-1 text-[11px]" style={{ color: "var(--text-subtle)" }}>
              At moving-average cost
            </p>
          </div>
        )}
        <div className="card p-4" style={lowCount > 0 ? { borderColor: "var(--warning)" } : undefined}>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            At or below reorder
          </p>
          <p
            className="mt-1 text-[24px] font-semibold tnum leading-none"
            style={{ color: lowCount > 0 ? "var(--warning)" : undefined }}
          >
            {lowCount}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Consumables
          </p>
          <p className="mt-1 text-[24px] font-semibold tnum leading-none">
            {rows.filter((r) => r.type === "BULK_CONSUMABLE").length}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {[
          { key: "all", label: "All" },
          { key: "parts", label: "Stocked parts" },
          { key: "consumables", label: "Bulk consumables" },
        ].map((f) => (
          <Link
            key={f.key}
            href={`/inventory?type=${f.key}`}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium"
            style={
              f.key === type
                ? { background: "var(--brand)", color: "var(--brand-fg)" }
                : { background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      {lowCount > 0 && (
        <div
          className="card p-3.5 mb-4 flex items-center gap-3"
          style={{ borderColor: "var(--warning)", background: "var(--warning-soft)" }}
        >
          <AlertTriangle size={17} style={{ color: "var(--warning)" }} className="shrink-0" />
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            <span className="font-semibold" style={{ color: "var(--warning)" }}>
              {lowCount} item(s)
            </span>{" "}
            at or below reorder level.{" "}
            <Link href="/purchases/new" style={{ color: "var(--brand)" }}>
              Record a purchase
            </Link>
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Nothing here yet"
            description="Add the parts you stock and the chemicals you buy in bulk."
            action={
              <Link href="/inventory/new" className="btn btn-primary">
                <Plus size={16} />
                New item
              </Link>
            }
          />
        </div>
      ) : (
        <InventoryTable rows={rows} canSeeCost={can.viewCosts(user)} />
      )}
    </Page>
  );
}
