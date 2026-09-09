import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { getStockOnHand } from "@/lib/services/stock";
import { formatINR } from "@/lib/money";
import { Badge, Page, PageHeader, Table, Td, Th } from "@/components/ui";
import { StockTakeForm } from "./stock-take-form";

export default async function StockTakePage() {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();

  const [items, categories, onHand, recent] = await Promise.all([
    db
      .select()
      .from(s.inventoryItems)
      .where(and(eq(s.inventoryItems.orgId, user.orgId), eq(s.inventoryItems.isActive, true)))
      .orderBy(asc(s.inventoryItems.name)),
    db.select().from(s.itemCategories).where(eq(s.itemCategories.orgId, user.orgId)),
    getStockOnHand(user.orgId),
    db
      .select({
        id: s.stockTakes.id,
        reference: s.stockTakes.reference,
        takenAt: s.stockTakes.takenAt,
        note: s.stockTakes.note,
        userName: s.users.name,
      })
      .from(s.stockTakes)
      .leftJoin(s.users, eq(s.users.id, s.stockTakes.createdBy))
      .where(eq(s.stockTakes.orgId, user.orgId))
      .orderBy(desc(s.stockTakes.takenAt))
      .limit(5),
  ]);

  const lines = recent.length
    ? await db
        .select({
          takeId: s.stockTakeLines.stockTakeId,
          itemName: s.inventoryItems.name,
          baseUnit: s.inventoryItems.baseUnit,
          systemQty: s.stockTakeLines.systemQtyBase,
          countedQty: s.stockTakeLines.countedQtyBase,
          variance: s.stockTakeLines.varianceBase,
          varianceValue: s.stockTakeLines.varianceValueMinor,
        })
        .from(s.stockTakeLines)
        .innerJoin(s.inventoryItems, eq(s.inventoryItems.id, s.stockTakeLines.itemId))
        .where(eq(s.stockTakeLines.stockTakeId, recent[0].id))
    : [];

  const variances = lines.filter((l) => Number(l.variance) !== 0);

  return (
    <Page wide>
      <PageHeader
        title="Stock take"
        backHref="/inventory"
        backLabel="Inventory"
        subtitle="Count what is actually on the shelf. The difference against what the system expected is where leakage shows up."
      />

      <StockTakeForm
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          type: i.type,
          baseUnit: i.baseUnit,
          categoryName: categories.find((c) => c.id === i.categoryId)?.name ?? "Uncategorised",
          system: onHand.get(i.id) ?? 0,
          avgCostMinor: Number(i.avgCostMinor),
        }))}
      />

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-subtle)" }}>
            Last count · {recent[0].reference}
          </h2>
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {new Date(recent[0].takenAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            {recent[0].userName && ` · ${recent[0].userName}`}
            {" · "}
            {variances.length === 0 ? "no variances" : `${variances.length} item(s) off`}
          </p>

          {variances.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th align="right">System said</Th>
                  <Th align="right">Counted</Th>
                  <Th align="right">Variance</Th>
                  <Th align="right">Value</Th>
                </tr>
              </thead>
              <tbody>
                {variances.map((l, i) => {
                  const v = Number(l.variance);
                  return (
                    <tr key={i} className="border-t">
                      <Td strong>{l.itemName}</Td>
                      <Td align="right" muted>
                        <span className="tnum">{Number(l.systemQty)}</span>
                      </Td>
                      <Td align="right">
                        <span className="tnum">{Number(l.countedQty)}</span>
                      </Td>
                      <Td align="right">
                        <span className="tnum font-medium" style={{ color: v < 0 ? "var(--danger)" : "var(--success)" }}>
                          {v > 0 ? "+" : ""}
                          {v}
                        </span>
                      </Td>
                      <Td align="right">
                        <span
                          className="tnum"
                          style={{ color: Number(l.varianceValue) < 0 ? "var(--danger)" : "var(--text-muted)" }}
                        >
                          {formatINR(Number(l.varianceValue))}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}

          {variances.length === 0 && (
            <div className="card p-5 text-center">
              <Badge tone="success">Everything matched</Badge>
            </div>
          )}
        </section>
      )}
    </Page>
  );
}
