import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { can, requireRole } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { getItemStock } from "@/lib/services/stock";
import { Badge, Page, PageHeader, Table, Td, Th, type Tone } from "@/components/ui";

const MOVEMENT: Record<string, { label: string; tone: Tone }> = {
  OPENING: { label: "Opening", tone: "neutral" },
  PURCHASE: { label: "Purchase", tone: "success" },
  CONSUMPTION: { label: "Used on a job", tone: "brand" },
  ADJUSTMENT: { label: "Adjustment", tone: "warning" },
  RETURN_TO_SUPPLIER: { label: "Returned", tone: "neutral" },
  CUSTOMER_RETURN: { label: "Customer return", tone: "neutral" },
  STOCK_TAKE: { label: "Stock take", tone: "warning" },
  TRANSFER_IN: { label: "Transfer in", tone: "neutral" },
  TRANSFER_OUT: { label: "Transfer out", tone: "neutral" },
  WASTAGE: { label: "Wastage", tone: "danger" },
};

const UNIT: Record<string, string> = { ML: "ml", GRAM: "g", PIECE: "pcs" };

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;
  const db = await getDb();

  const [item] = await db
    .select()
    .from(s.inventoryItems)
    .where(and(eq(s.inventoryItems.id, id), eq(s.inventoryItems.orgId, user.orgId)))
    .limit(1);
  if (!item) notFound();

  const [onHand, movements, usage] = await Promise.all([
    getItemStock(user.orgId, id),
    db
      .select({
        id: s.stockLedger.id,
        movementType: s.stockLedger.movementType,
        quantityBase: s.stockLedger.quantityBase,
        unitCostMinor: s.stockLedger.unitCostMinor,
        note: s.stockLedger.note,
        occurredAt: s.stockLedger.occurredAt,
        userName: s.users.name,
      })
      .from(s.stockLedger)
      .leftJoin(s.users, eq(s.users.id, s.stockLedger.createdBy))
      .where(and(eq(s.stockLedger.orgId, user.orgId), eq(s.stockLedger.itemId, id)))
      .orderBy(desc(s.stockLedger.occurredAt))
      .limit(80),
    db
      .select({
        consumed: sql<string>`coalesce(sum(case when ${s.stockLedger.quantityBase} < 0 and ${s.stockLedger.movementType} = 'CONSUMPTION' then -${s.stockLedger.quantityBase} else 0 end), 0)`,
        purchased: sql<string>`coalesce(sum(case when ${s.stockLedger.movementType} in ('PURCHASE','OPENING') then ${s.stockLedger.quantityBase} else 0 end), 0)`,
        adjusted: sql<string>`coalesce(sum(case when ${s.stockLedger.movementType} in ('ADJUSTMENT','STOCK_TAKE','WASTAGE') then ${s.stockLedger.quantityBase} else 0 end), 0)`,
      })
      .from(s.stockLedger)
      .where(and(eq(s.stockLedger.orgId, user.orgId), eq(s.stockLedger.itemId, id)))
      .then((r) => r[0]),
  ]);

  const unit = UNIT[item.baseUnit] ?? "";
  const fmt = (q: number) => {
    if (item.baseUnit === "ML" && Math.abs(q) >= 1000) return `${(q / 1000).toFixed(2)} L`;
    if (item.baseUnit === "GRAM" && Math.abs(q) >= 1000) return `${(q / 1000).toFixed(2)} kg`;
    return `${Number.isInteger(q) ? q : q.toFixed(1)} ${unit}`;
  };

  const shrinkage = Number(usage?.adjusted ?? 0);

  return (
    <Page wide>
      <PageHeader
        title={item.name}
        backHref="/inventory"
        backLabel="Inventory"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {item.type === "STOCKED_PART" ? <Badge>Stocked part</Badge> : <Badge tone="brand">Bulk consumable</Badge>}
            {item.sku && <span className="tnum">{item.sku}</span>}
            <span>
              Bought as {item.purchaseUnitName} of {Number(item.baseUnitsPerPurchaseUnit)} {unit}
            </span>
          </span>
        }
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        <div className="card p-4">
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            On hand
          </p>
          <p
            className="mt-1 text-[22px] font-semibold tnum leading-none"
            style={{ color: onHand <= Number(item.reorderLevelBase) ? "var(--warning)" : undefined }}
          >
            {fmt(onHand)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Used on jobs
          </p>
          <p className="mt-1 text-[22px] font-semibold tnum leading-none">{fmt(Number(usage?.consumed ?? 0))}</p>
        </div>
        <div className="card p-4">
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Bought in
          </p>
          <p className="mt-1 text-[22px] font-semibold tnum leading-none">{fmt(Number(usage?.purchased ?? 0))}</p>
        </div>
        <div className="card p-4" style={shrinkage < 0 ? { borderColor: "var(--warning)" } : undefined}>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Adjustments
          </p>
          <p
            className="mt-1 text-[22px] font-semibold tnum leading-none"
            style={{ color: shrinkage < 0 ? "var(--warning)" : undefined }}
          >
            {fmt(shrinkage)}
          </p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-subtle)" }}>
            {shrinkage < 0 ? "Unexplained loss" : "Corrections & recounts"}
          </p>
        </div>
      </div>

      <h2 className="text-[13px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-subtle)" }}>
        Movement ledger
      </h2>

      <Table>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Movement</Th>
            <Th align="right">Quantity</Th>
            {can.viewCosts(user) && <Th align="right">Unit cost</Th>}
            <Th>Note</Th>
            <Th>By</Th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => {
            const meta = MOVEMENT[m.movementType] ?? { label: m.movementType, tone: "neutral" as Tone };
            const qty = Number(m.quantityBase);
            return (
              <tr key={m.id} className="border-t">
                <Td nowrap muted>
                  {new Date(m.occurredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                </Td>
                <Td>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </Td>
                <Td align="right">
                  <span
                    className="tnum font-medium"
                    style={{ color: qty < 0 ? "var(--danger)" : "var(--success)" }}
                  >
                    {qty > 0 ? "+" : ""}
                    {fmt(qty)}
                  </span>
                </Td>
                {can.viewCosts(user) && (
                  <Td align="right" muted>
                    <span className="tnum">{Number(m.unitCostMinor) > 0 ? formatINR(Number(m.unitCostMinor)) : "—"}</span>
                  </Td>
                )}
                <Td muted>{m.note ?? "—"}</Td>
                <Td muted nowrap>
                  {m.userName ?? "—"}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      {/* The ledger is append-only, which is the whole point: when a count
          disagrees with the system you can see exactly which movement caused it. */}
      <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
        Movements are never edited or deleted. A correction is a new row, so the history always explains the current
        number.{" "}
        <Link href="/inventory/stock-take" style={{ color: "var(--brand)" }}>
          Run a stock take
        </Link>
      </p>
    </Page>
  );
}
