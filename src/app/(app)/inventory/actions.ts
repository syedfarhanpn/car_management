"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { toMinor } from "@/lib/money";
import { adjustStock, getStockOnHand } from "@/lib/services/stock";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: string): ActionResult<never> => ({ ok: false, error });

function fields(formData: FormData) {
  return Object.fromEntries(formData.entries()) as Record<string, string>;
}

const itemSchema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  type: z.enum(["STOCKED_PART", "BULK_CONSUMABLE"]),
  baseUnit: z.enum(["PIECE", "ML", "GRAM"]),
  categoryId: z.string().optional(),
  sku: z.string().trim().optional(),
  purchaseUnitName: z.string().trim().optional(),
  baseUnitsPerPurchaseUnit: z.string().trim().optional(),
  hsnCode: z.string().trim().optional(),
  gstRate: z.string().trim().optional(),
  salePrice: z.string().trim().optional(),
  reorderLevel: z.string().trim().optional(),
  openingQty: z.string().trim().optional(),
  openingCost: z.string().trim().optional(),
});

export async function saveItem(id: string | null, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const parsed = itemSchema.safeParse(fields(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const perUnit = parsed.data.baseUnitsPerPurchaseUnit ? Number(parsed.data.baseUnitsPerPurchaseUnit) : 1;
  if (!Number.isFinite(perUnit) || perUnit <= 0) return fail("Units per pack must be more than zero");

  /**
   * A stocked part is counted in whole pieces and picked onto a job card.
   * A bulk consumable is measured (ml/g) and deducted by service recipe.
   * Pieces that are bought in packs still hold: "Pack of 10" cloths is a
   * bulk consumable whose base unit happens to be PIECE.
   */
  if (parsed.data.type === "STOCKED_PART" && parsed.data.baseUnit !== "PIECE") {
    return fail("A stocked part is counted in pieces — use a bulk consumable for measured items");
  }

  const db = await getDb();
  const values = {
    name: parsed.data.name,
    type: parsed.data.type,
    baseUnit: parsed.data.baseUnit,
    categoryId: parsed.data.categoryId || null,
    sku: parsed.data.sku || null,
    purchaseUnitName: parsed.data.purchaseUnitName || "Piece",
    baseUnitsPerPurchaseUnit: perUnit,
    hsnCode: parsed.data.hsnCode || null,
    gstRate: parsed.data.gstRate ? Number(parsed.data.gstRate) : 18,
    salePriceMinor: parsed.data.salePrice ? toMinor(parsed.data.salePrice) : 0,
    reorderLevelBase: parsed.data.reorderLevel ? Number(parsed.data.reorderLevel) : 0,
  };

  if (id) {
    await db
      .update(s.inventoryItems)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(s.inventoryItems.id, id), eq(s.inventoryItems.orgId, user.orgId)));
  } else {
    // Cost per BASE unit. Entered per pack because that is how it is bought.
    const openingQtyPacks = parsed.data.openingQty ? Number(parsed.data.openingQty) : 0;
    const costPerPack = parsed.data.openingCost ? toMinor(parsed.data.openingCost) : 0;
    const costPerBase = perUnit > 0 ? Math.round(costPerPack / perUnit) : 0;

    const [item] = await db
      .insert(s.inventoryItems)
      .values({ orgId: user.orgId, ...values, avgCostMinor: costPerBase })
      .returning();

    if (openingQtyPacks > 0) {
      const [branch] = await db
        .select()
        .from(s.branches)
        .where(and(eq(s.branches.orgId, user.orgId), eq(s.branches.isDefault, true)))
        .limit(1);

      await db.insert(s.stockLedger).values({
        orgId: user.orgId,
        branchId: branch?.id ?? user.branchId!,
        itemId: item.id,
        movementType: "OPENING",
        quantityBase: openingQtyPacks * perUnit,
        unitCostMinor: costPerBase,
        referenceType: "manual",
        note: "Opening stock",
        occurredAt: new Date(),
        createdBy: user.id,
      });
    }
  }

  revalidatePath("/inventory");
  revalidatePath("/settings/recipes");
  return ok(undefined);
}

export async function setItemActive(id: string, isActive: boolean): Promise<ActionResult> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();
  await db
    .update(s.inventoryItems)
    .set({ isActive, archivedAt: isActive ? null : new Date(), updatedAt: new Date() })
    .where(and(eq(s.inventoryItems.id, id), eq(s.inventoryItems.orgId, user.orgId)));
  revalidatePath("/inventory");
  return ok(undefined);
}

export async function saveItemCategory(name: string): Promise<ActionResult> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  if (name.trim().length < 2) return fail("Enter a category name");
  const db = await getDb();
  await db.insert(s.itemCategories).values({ orgId: user.orgId, name: name.trim() });
  revalidatePath("/inventory");
  return ok(undefined);
}

const adjustSchema = z.object({
  itemId: z.string().uuid(),
  direction: z.enum(["IN", "OUT"]),
  quantity: z.string().trim().min(1, "Enter a quantity"),
  reason: z.string().trim().min(3, "Give a reason — an unexplained adjustment is a hole in the count"),
});

export async function adjustItemStock(formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const parsed = adjustSchema.safeParse(fields(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const qty = Number(parsed.data.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return fail("Quantity must be more than zero");

  await adjustStock({
    orgId: user.orgId,
    branchId: user.branchId!,
    itemId: parsed.data.itemId,
    quantityBase: parsed.data.direction === "IN" ? qty : -qty,
    reason: parsed.data.reason,
    userId: user.id,
  });

  revalidatePath("/inventory");
  return ok(undefined);
}

/**
 * STOCK TAKE
 *
 * Counts are entered against what the system thinks is there, and the
 * difference is written as a single STOCK_TAKE movement per item so the
 * ledger stays the only source of truth. The variance — and its value — is
 * the number worth looking at: recipes say what SHOULD have been used, this
 * says what is actually on the shelf, and the gap is where leakage shows up.
 */
export async function submitStockTake(formData: FormData): Promise<ActionResult<{ variances: number }>> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();
  const now = new Date();

  const onHand = await getStockOnHand(user.orgId);
  const items = await db
    .select()
    .from(s.inventoryItems)
    .where(and(eq(s.inventoryItems.orgId, user.orgId), eq(s.inventoryItems.isActive, true)));

  const counted: { item: (typeof items)[number]; system: number; count: number }[] = [];
  for (const item of items) {
    const raw = formData.get(`count:${item.id}`);
    if (raw === null || String(raw).trim() === "") continue;
    const count = Number(String(raw));
    if (!Number.isFinite(count) || count < 0) return fail(`"${raw}" is not a valid count for ${item.name}`);
    counted.push({ item, system: onHand.get(item.id) ?? 0, count });
  }

  if (counted.length === 0) return fail("Enter at least one count");

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.stockTakes)
    .where(eq(s.stockTakes.orgId, user.orgId));

  const [take] = await db
    .insert(s.stockTakes)
    .values({
      orgId: user.orgId,
      branchId: user.branchId!,
      reference: `ST-${String((n ?? 0) + 1).padStart(4, "0")}`,
      status: "COMPLETED",
      takenAt: now,
      completedAt: now,
      note: String(formData.get("note") ?? "") || null,
      createdBy: user.id,
    })
    .returning();

  let variances = 0;
  for (const row of counted) {
    const variance = row.count - row.system;
    await db.insert(s.stockTakeLines).values({
      stockTakeId: take.id,
      itemId: row.item.id,
      systemQtyBase: row.system,
      countedQtyBase: row.count,
      varianceBase: variance,
      varianceValueMinor: Math.round(variance * Number(row.item.avgCostMinor)),
    });

    if (variance !== 0) {
      variances += 1;
      await db.insert(s.stockLedger).values({
        orgId: user.orgId,
        branchId: user.branchId!,
        itemId: row.item.id,
        movementType: "STOCK_TAKE",
        quantityBase: variance,
        unitCostMinor: Number(row.item.avgCostMinor),
        referenceType: "stock_take",
        referenceId: take.id,
        note: `Counted ${row.count}, system said ${row.system}`,
        occurredAt: now,
        createdBy: user.id,
      });
    }
  }

  revalidatePath("/inventory");
  revalidatePath("/inventory/stock-take");
  return ok({ variances });
}
