"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { toMinor } from "@/lib/money";
import { postPurchaseStock } from "@/lib/services/stock";
import { normalizePhone } from "@/lib/phone";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: string): ActionResult<never> => ({ ok: false, error });

const supplierSchema = z.object({
  name: z.string().trim().min(2, "Enter a supplier name"),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  gstin: z.string().trim().optional(),
  city: z.string().trim().optional(),
  paymentTermsDays: z.string().trim().optional(),
});

export async function saveSupplier(id: string | null, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const parsed = supplierSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const db = await getDb();
  const values = {
    name: parsed.data.name,
    phone: parsed.data.phone ? normalizePhone(parsed.data.phone) : null,
    email: parsed.data.email || null,
    gstin: parsed.data.gstin?.toUpperCase() || null,
    city: parsed.data.city || null,
    paymentTermsDays: parsed.data.paymentTermsDays ? Number(parsed.data.paymentTermsDays) : 0,
  };

  if (id) {
    await db
      .update(s.suppliers)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(s.suppliers.id, id), eq(s.suppliers.orgId, user.orgId)));
  } else {
    await db.insert(s.suppliers).values({ orgId: user.orgId, ...values });
  }

  revalidatePath("/purchases/suppliers");
  revalidatePath("/purchases/new");
  return ok(undefined);
}

type LineInput = {
  itemId: string;
  quantity: string;
  unitCost: string;
  gstRate: string;
};

/**
 * Record a supplier bill for STOCK.
 *
 * Posting it does two things at once: writes the purchase movements into the
 * ledger, and rolls the moving-average cost forward. That average is what
 * every margin figure downstream is built on, so it is updated here rather
 * than being recomputed on demand from a purchase history that may be edited.
 *
 * Parts bought for a specific customer do NOT come through here — those are
 * added on the job card and deliberately never touch stock.
 */
export async function createPurchase(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();

  const supplierId = String(formData.get("supplierId") ?? "");
  const supplierNameText = String(formData.get("supplierNameText") ?? "").trim();
  if (!supplierId && !supplierNameText) return fail("Pick a supplier or type a name");

  const billNumber = String(formData.get("billNumber") ?? "").trim();
  const billDate = String(formData.get("billDate") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const paidNow = String(formData.get("paidNow") ?? "0");

  const raw = String(formData.get("lines") ?? "[]");
  let lines: LineInput[];
  try {
    lines = JSON.parse(raw);
  } catch {
    return fail("Could not read the bill lines");
  }
  if (!Array.isArray(lines) || lines.length === 0) return fail("Add at least one line");

  const items = await db.select().from(s.inventoryItems).where(eq(s.inventoryItems.orgId, user.orgId));

  let subtotal = 0;
  let taxTotal = 0;
  const prepared: {
    itemId: string;
    description: string;
    quantity: number;
    unitCostMinor: number;
    gstRate: number;
    taxMinor: number;
    lineTotalMinor: number;
  }[] = [];

  for (const line of lines) {
    const item = items.find((i) => i.id === line.itemId);
    if (!item) return fail("One of the lines refers to an item that no longer exists");

    const qty = Number(line.quantity);
    const unitCost = toMinor(line.unitCost);
    if (!Number.isFinite(qty) || qty <= 0) return fail(`Enter a quantity for ${item.name}`);
    if (unitCost < 0) return fail(`Cost cannot be negative for ${item.name}`);

    const net = Math.round(qty * unitCost);
    const gstRate = line.gstRate ? Number(line.gstRate) : item.gstRate;
    // A supplier bill is quoted before tax, so GST is added on top here —
    // the opposite of the customer-facing prices, which are tax-inclusive.
    const tax = Math.round((net * gstRate) / 100);

    subtotal += net;
    taxTotal += tax;
    prepared.push({
      itemId: item.id,
      description: item.name,
      quantity: qty,
      unitCostMinor: unitCost,
      gstRate,
      taxMinor: tax,
      lineTotalMinor: net + tax,
    });
  }

  const total = subtotal + taxTotal;
  const paid = Math.min(toMinor(paidNow), total);

  const purchaseId = await db.transaction(async (tx) => {
    const [purchase] = await tx
      .insert(s.purchases)
      .values({
        orgId: user.orgId,
        branchId: user.branchId!,
        supplierId: supplierId || null,
        supplierNameText: supplierId ? null : supplierNameText,
        billNumber: billNumber || null,
        billDate,
        status: "RECEIVED",
        paymentStatus: paid >= total ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID",
        isPassThrough: false,
        subtotalMinor: subtotal,
        taxMinor: taxTotal,
        totalMinor: total,
        paidMinor: paid,
        notes: String(formData.get("notes") ?? "") || null,
        receivedAt: new Date(),
        createdBy: user.id,
      })
      .returning();

    await tx.insert(s.purchaseLines).values(
      prepared.map((p) => ({
        purchaseId: purchase.id,
        itemId: p.itemId,
        description: p.description,
        quantity: p.quantity,
        unitCostMinor: p.unitCostMinor,
        gstRate: p.gstRate,
        taxMinor: p.taxMinor,
        lineTotalMinor: p.lineTotalMinor,
        affectsInventory: true,
      })),
    );

    if (paid > 0 && supplierId) {
      await tx.insert(s.supplierPayments).values({
        orgId: user.orgId,
        branchId: user.branchId!,
        supplierId,
        purchaseId: purchase.id,
        amountMinor: paid,
        method: String(formData.get("paymentMethod") ?? "CASH"),
        paidAt: new Date(),
        createdBy: user.id,
      });
    }

    return purchase.id;
  });

  // Outside the transaction: the stock posting opens its own queries, and on a
  // single-connection driver those would deadlock against an open transaction.
  await postPurchaseStock({
    orgId: user.orgId,
    branchId: user.branchId!,
    purchaseId,
    userId: user.id,
  });

  revalidatePath("/purchases");
  revalidatePath("/inventory");
  return ok({ id: purchaseId });
}

export async function paySupplierBill(purchaseId: string, amount: string, method: string): Promise<ActionResult> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();

  const [purchase] = await db
    .select()
    .from(s.purchases)
    .where(and(eq(s.purchases.id, purchaseId), eq(s.purchases.orgId, user.orgId)))
    .limit(1);
  if (!purchase) return fail("Purchase not found");

  const due = Number(purchase.totalMinor) - Number(purchase.paidMinor);
  const amt = toMinor(amount);
  if (amt <= 0) return fail("Amount must be more than zero");
  if (amt > due) return fail(`That is more than the ₹${(due / 100).toFixed(2)} outstanding`);

  const paid = Number(purchase.paidMinor) + amt;

  await db.transaction(async (tx) => {
    if (purchase.supplierId) {
      await tx.insert(s.supplierPayments).values({
        orgId: user.orgId,
        branchId: purchase.branchId,
        supplierId: purchase.supplierId,
        purchaseId,
        amountMinor: amt,
        method,
        paidAt: new Date(),
        createdBy: user.id,
      });
    }
    await tx
      .update(s.purchases)
      .set({
        paidMinor: paid,
        paymentStatus: paid >= Number(purchase.totalMinor) ? "PAID" : "PARTIAL",
        updatedAt: new Date(),
      })
      .where(eq(s.purchases.id, purchaseId));
  });

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${purchaseId}`);
  return ok(undefined);
}
