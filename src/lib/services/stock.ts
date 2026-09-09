import "server-only";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";

/** Current stock per item, derived from the append-only ledger. */
export async function getStockOnHand(orgId: string): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({
      itemId: s.stockLedger.itemId,
      qty: sql<string>`sum(${s.stockLedger.quantityBase})`,
    })
    .from(s.stockLedger)
    .where(eq(s.stockLedger.orgId, orgId))
    .groupBy(s.stockLedger.itemId);

  return new Map(rows.map((r) => [r.itemId, Number(r.qty)]));
}

export async function getItemStock(orgId: string, itemId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ qty: sql<string>`coalesce(sum(${s.stockLedger.quantityBase}), 0)` })
    .from(s.stockLedger)
    .where(and(eq(s.stockLedger.orgId, orgId), eq(s.stockLedger.itemId, itemId)));
  return Number(row?.qty ?? 0);
}

/**
 * POST A JOB CARD'S STOCK CONSUMPTION.
 *
 * Two sources of movement, both written as negative ledger rows:
 *
 *   1. PART lines      - explicit, one row per part picked.
 *   2. SERVICE recipes - the consumables the service is expected to burn
 *                        (shampoo, wax, oil). Nobody logs these by hand; the
 *                        recipe is the whole point of the bulk-consumable model.
 *
 * IDEMPOTENT. jobCards.stockPostedAt is the guard: closing a job twice, or a
 * double-submitted form, must not deduct stock twice. That is a real failure
 * mode on a workshop tablet with bad wifi, and the resulting phantom shortage
 * is close to impossible to trace back afterwards.
 *
 * PASS_THROUGH lines are skipped entirely by construction - they are filtered
 * out below and carry affectsInventory = false besides. A part bought for one
 * customer never enters stock.
 */
export async function postJobCardStock({
  orgId,
  branchId,
  jobCardId,
  userId,
  occurredAt = new Date(),
}: {
  orgId: string;
  branchId: string;
  jobCardId: string;
  userId: string;
  occurredAt?: Date;
}): Promise<{ posted: boolean; movements: number }> {
  const db = await getDb();

  const [job] = await db.select().from(s.jobCards).where(eq(s.jobCards.id, jobCardId)).limit(1);
  if (!job) throw new Error("Job card not found");
  if (job.stockPostedAt) return { posted: false, movements: 0 };

  const lines = await db.select().from(s.jobCardLines).where(eq(s.jobCardLines.jobCardId, jobCardId));

  const movements: (typeof s.stockLedger.$inferInsert)[] = [];

  // 1. Explicit parts.
  for (const line of lines) {
    if (line.lineType !== "PART" || !line.itemId || !line.affectsInventory) continue;
    movements.push({
      orgId,
      branchId,
      itemId: line.itemId,
      movementType: "CONSUMPTION",
      quantityBase: -Number(line.quantity),
      unitCostMinor: Number(line.costMinor) || 0,
      referenceType: "job_card",
      referenceId: jobCardId,
      note: `${line.description} — ${job.jobNumber}`,
      occurredAt,
      createdBy: userId,
    });
  }

  // 2. Recipe consumables for each service line.
  const serviceLines = lines.filter((l) => l.lineType === "SERVICE" && l.serviceId);
  if (serviceLines.length > 0) {
    const recipes = await db
      .select()
      .from(s.serviceRecipes)
      .where(
        and(
          eq(s.serviceRecipes.orgId, orgId),
          // Recipe matches this vehicle's class, or is a catch-all.
          or(isNull(s.serviceRecipes.vehicleClassId), job.vehicleClassId ? eq(s.serviceRecipes.vehicleClassId, job.vehicleClassId) : sql`false`),
        ),
      );

    for (const line of serviceLines) {
      const forService = recipes.filter((r) => r.serviceId === line.serviceId);

      // A class-specific recipe row overrides the catch-all for the same item.
      const byItem = new Map<string, (typeof forService)[number]>();
      for (const r of forService) {
        const existing = byItem.get(r.itemId);
        if (!existing || (r.vehicleClassId && !existing.vehicleClassId)) byItem.set(r.itemId, r);
      }

      for (const r of byItem.values()) {
        movements.push({
          orgId,
          branchId,
          itemId: r.itemId,
          movementType: "CONSUMPTION",
          quantityBase: -(Number(r.quantityBase) * Number(line.quantity)),
          referenceType: "job_card",
          referenceId: jobCardId,
          note: `${line.description} — ${job.jobNumber}`,
          occurredAt,
          createdBy: userId,
        });
      }
    }
  }

  if (movements.length > 0) await db.insert(s.stockLedger).values(movements);
  await db.update(s.jobCards).set({ stockPostedAt: occurredAt }).where(eq(s.jobCards.id, jobCardId));

  return { posted: true, movements: movements.length };
}

/** Manual correction. Reason is required — an unexplained adjustment is a hole. */
export async function adjustStock({
  orgId,
  branchId,
  itemId,
  quantityBase,
  reason,
  userId,
}: {
  orgId: string;
  branchId: string;
  itemId: string;
  quantityBase: number;
  reason: string;
  userId: string;
}) {
  const db = await getDb();
  await db.insert(s.stockLedger).values({
    orgId,
    branchId,
    itemId,
    movementType: "ADJUSTMENT",
    quantityBase,
    referenceType: "manual",
    note: reason,
    occurredAt: new Date(),
    createdBy: userId,
  });
}

/** Post a received purchase into stock and refresh the moving-average cost. */
export async function postPurchaseStock({
  orgId,
  branchId,
  purchaseId,
  userId,
}: {
  orgId: string;
  branchId: string;
  purchaseId: string;
  userId: string;
}) {
  const db = await getDb();
  const [purchase] = await db.select().from(s.purchases).where(eq(s.purchases.id, purchaseId)).limit(1);
  if (!purchase) throw new Error("Purchase not found");
  // Parts bought on a customer's behalf never touch stock.
  if (purchase.isPassThrough) return { posted: false };

  const lines = await db.select().from(s.purchaseLines).where(eq(s.purchaseLines.purchaseId, purchaseId));

  for (const line of lines) {
    if (!line.itemId || !line.affectsInventory) continue;
    const [item] = await db.select().from(s.inventoryItems).where(eq(s.inventoryItems.id, line.itemId)).limit(1);
    if (!item) continue;

    // Purchase units -> base units. Buying "2 cans" of a 5L shampoo adds 10000ml.
    const perUnit = Number(item.baseUnitsPerPurchaseUnit) || 1;
    const qtyBase = Number(line.quantity) * perUnit;
    const costPerBase = Math.round(Number(line.unitCostMinor) / perUnit);

    const onHand = await getItemStock(orgId, item.id);
    const oldValue = onHand * Number(item.avgCostMinor);
    const newValue = qtyBase * costPerBase;
    const newQty = onHand + qtyBase;
    const newAvg = newQty > 0 ? Math.round((oldValue + newValue) / newQty) : costPerBase;

    await db.insert(s.stockLedger).values({
      orgId,
      branchId,
      itemId: item.id,
      movementType: "PURCHASE",
      quantityBase: qtyBase,
      unitCostMinor: costPerBase,
      referenceType: "purchase",
      referenceId: purchaseId,
      note: purchase.billNumber ? `Bill ${purchase.billNumber}` : null,
      occurredAt: purchase.receivedAt ?? new Date(),
      createdBy: userId,
    });

    await db.update(s.inventoryItems).set({ avgCostMinor: newAvg, updatedAt: new Date() }).where(eq(s.inventoryItems.id, item.id));
  }

  return { posted: true };
}
