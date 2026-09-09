"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { toMinor } from "@/lib/money";
import { getTaxConfig } from "@/lib/settings";
import { computeTotals, type TotalsLine } from "@/lib/services/totals";
import { isInterState } from "@/lib/tax";
import { nextJobNumber } from "@/lib/services/numbering";
import { resolveServicePrice } from "@/lib/services/pricing";
import { postJobCardStock } from "@/lib/services/stock";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Recompute and persist a job card's money after ANY line change.
 * Totals are never edited directly and never trusted from the client — they
 * are always derived from the lines by the shared totals engine.
 */
export async function recalcJobTotals(jobCardId: string) {
  const user = await requireUser();
  const db = await getDb();

  const [job] = await db.select().from(s.jobCards).where(eq(s.jobCards.id, jobCardId)).limit(1);
  if (!job) return;

  const [lines, config, client] = await Promise.all([
    db.select().from(s.jobCardLines).where(eq(s.jobCardLines.jobCardId, jobCardId)),
    getTaxConfig(user.orgId),
    db.select().from(s.clients).where(eq(s.clients.id, job.clientId)).limit(1).then((r) => r[0]),
  ]);

  const totals = computeTotals({
    lines: lines.map<TotalsLine>((l) => ({
      lineType: l.lineType,
      description: l.description,
      quantity: Number(l.quantity),
      unitPriceMinor: Number(l.unitPriceMinor),
      lineTotalMinor: Number(l.lineTotalMinor),
      discountMinor: Number(l.discountMinor),
      gstRate: l.gstRate,
      costMinor: Number(l.costMinor),
      markupMinor: Number(l.markupMinor),
    })),
    config,
    interState: isInterState(client?.state === "Kerala" ? "32" : null, config),
  });

  await db
    .update(s.jobCards)
    .set({
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      taxMinor: totals.taxMinor,
      reimbursableMinor: totals.reimbursableMinor,
      totalMinor: totals.totalMinor,
      updatedAt: new Date(),
    })
    .where(eq(s.jobCards.id, jobCardId));
}

const createSchema = z.object({
  vehicleId: z.string().uuid("Select a vehicle"),
  odometerKm: z.string().trim().optional(),
  fuelLevel: z.string().trim().optional(),
  customerComplaint: z.string().trim().optional(),
});

export async function createJobCard(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const db = await getDb();

  const [vehicle] = await db
    .select()
    .from(s.vehicles)
    .where(and(eq(s.vehicles.id, parsed.data.vehicleId), eq(s.vehicles.orgId, user.orgId)))
    .limit(1);
  if (!vehicle) return { ok: false, error: "Vehicle not found" };
  if (!vehicle.currentClientId) return { ok: false, error: "This vehicle has no owner on record" };

  const odometer = parsed.data.odometerKm ? Number(parsed.data.odometerKm) : null;

  const [job] = await db
    .insert(s.jobCards)
    .values({
      orgId: user.orgId,
      branchId: user.branchId!,
      jobNumber: await nextJobNumber(user.orgId),
      kind: "JOB",
      status: "DRAFT",
      clientId: vehicle.currentClientId,
      vehicleId: vehicle.id,
      // Snapshotted: reclassifying the car later must not silently reprice a
      // job that has already been quoted.
      vehicleClassId: vehicle.vehicleClassId,
      odometerKm: odometer,
      fuelLevel: parsed.data.fuelLevel || null,
      customerComplaint: parsed.data.customerComplaint || null,
      assignedToId: user.id,
      createdBy: user.id,
      startedAt: new Date(),
    })
    .returning();

  // Keep the odometer moving forward — it drives service-due reminders.
  if (odometer && (!vehicle.lastOdometerKm || odometer > vehicle.lastOdometerKm)) {
    await db.update(s.vehicles).set({ lastOdometerKm: odometer, updatedAt: new Date() }).where(eq(s.vehicles.id, vehicle.id));
  }

  await db.insert(s.jobCardStatusHistory).values({
    jobCardId: job.id,
    toStatus: "DRAFT",
    changedById: user.id,
  });

  revalidatePath("/job-cards");
  return { ok: true, data: { id: job.id } };
}

async function assertEditable(jobCardId: string, orgId: string) {
  const db = await getDb();
  const [job] = await db
    .select()
    .from(s.jobCards)
    .where(and(eq(s.jobCards.id, jobCardId), eq(s.jobCards.orgId, orgId)))
    .limit(1);
  if (!job) return { error: "Job card not found" as const, job: null };
  // Once billed, the lines are frozen. The invoice is a legal snapshot and
  // editing behind it would make the two disagree.
  if (["INVOICED", "DELIVERED", "CANCELLED"].includes(job.status)) {
    return { error: "This job card is already billed and cannot be changed" as const, job: null };
  }
  return { error: null, job };
}

export async function addServiceLine(jobCardId: string, serviceId: string): Promise<ActionResult> {
  const user = await requireUser();
  const { error, job } = await assertEditable(jobCardId, user.orgId);
  if (error) return { ok: false, error };

  const db = await getDb();
  const [service] = await db
    .select()
    .from(s.services)
    .where(and(eq(s.services.id, serviceId), eq(s.services.orgId, user.orgId)))
    .limit(1);
  if (!service) return { ok: false, error: "Service not found" };

  const [vehicle] = await db.select().from(s.vehicles).where(eq(s.vehicles.id, job!.vehicleId)).limit(1);

  const price = await resolveServicePrice({
    orgId: user.orgId,
    serviceId,
    vehicleClassId: job!.vehicleClassId,
    vehicleModelId: vehicle?.modelId,
    clientId: job!.clientId,
  });

  if (price === null) {
    return {
      ok: false,
      error: `No price set for ${service.name} on this vehicle class. Add one in Settings.`,
    };
  }

  const [{ n }] = await db
    .select({ n: s.jobCardLines.sortOrder })
    .from(s.jobCardLines)
    .where(eq(s.jobCardLines.jobCardId, jobCardId))
    .orderBy(s.jobCardLines.sortOrder)
    .limit(1)
    .then((r) => (r.length ? r : [{ n: 0 }]));

  await db.insert(s.jobCardLines).values({
    orgId: user.orgId,
    jobCardId,
    lineType: "SERVICE",
    sortOrder: (n ?? 0) + 1,
    serviceId,
    description: service.name,
    quantity: 1,
    unitPriceMinor: price,
    lineTotalMinor: price,
    gstRate: service.gstRate,
    technicianId: user.id,
  });

  await recalcJobTotals(jobCardId);
  revalidatePath(`/job-cards/${jobCardId}`);
  return { ok: true, data: undefined };
}

export async function addPartLine(jobCardId: string, itemId: string, quantity: number): Promise<ActionResult> {
  const user = await requireUser();
  const { error } = await assertEditable(jobCardId, user.orgId);
  if (error) return { ok: false, error };
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: "Enter a valid quantity" };

  const db = await getDb();
  const [item] = await db
    .select()
    .from(s.inventoryItems)
    .where(and(eq(s.inventoryItems.id, itemId), eq(s.inventoryItems.orgId, user.orgId)))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found" };

  const unit = Number(item.salePriceMinor);
  await db.insert(s.jobCardLines).values({
    orgId: user.orgId,
    jobCardId,
    lineType: "PART",
    sortOrder: 100,
    itemId,
    description: item.name,
    quantity,
    unitPriceMinor: unit,
    lineTotalMinor: unit * quantity,
    costMinor: Number(item.avgCostMinor) * quantity,
    gstRate: item.gstRate,
    technicianId: user.id,
  });

  await recalcJobTotals(jobCardId);
  revalidatePath(`/job-cards/${jobCardId}`);
  return { ok: true, data: undefined };
}

const passThroughSchema = z.object({
  description: z.string().trim().min(2, "Describe the part"),
  cost: z.string().trim().min(1, "Enter what you paid"),
  markup: z.string().trim().optional(),
  supplierName: z.string().trim().optional(),
  supplierBillRef: z.string().trim().optional(),
});

/**
 * A part bought from outside for this customer.
 *
 * Deliberately does NOT create an inventory item and does NOT write a stock
 * movement. It records a purchase so the fronted cash is traceable to the
 * customer who owes it, and marks the line so revenue reporting excludes the
 * cost while still counting the markup.
 */
export async function addPassThroughLine(jobCardId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const { error, job } = await assertEditable(jobCardId, user.orgId);
  if (error) return { ok: false, error };

  const parsed = passThroughSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const cost = toMinor(parsed.data.cost);
  const markup = parsed.data.markup ? toMinor(parsed.data.markup) : 0;
  if (cost <= 0) return { ok: false, error: "Cost must be more than zero" };

  const db = await getDb();

  await db.insert(s.jobCardLines).values({
    orgId: user.orgId,
    jobCardId,
    lineType: "PASS_THROUGH",
    sortOrder: 200,
    description: parsed.data.description,
    quantity: 1,
    unitPriceMinor: cost + markup,
    lineTotalMinor: cost + markup,
    costMinor: cost,
    markupMinor: markup,
    supplierName: parsed.data.supplierName || null,
    supplierBillRef: parsed.data.supplierBillRef || null,
    affectsInventory: false,
    affectsRevenue: false,
    technicianId: user.id,
  });

  await db.insert(s.purchases).values({
    orgId: user.orgId,
    branchId: user.branchId!,
    supplierNameText: parsed.data.supplierName || null,
    billNumber: parsed.data.supplierBillRef || null,
    billDate: new Date().toISOString().slice(0, 10),
    status: "RECEIVED",
    paymentStatus: "PAID",
    isPassThrough: true,
    jobCardId,
    forClientId: job!.clientId,
    subtotalMinor: cost,
    totalMinor: cost,
    paidMinor: cost,
    notes: "Bought on customer behalf — excluded from stock and revenue",
    receivedAt: new Date(),
    createdBy: user.id,
  });

  await recalcJobTotals(jobCardId);
  revalidatePath(`/job-cards/${jobCardId}`);
  return { ok: true, data: undefined };
}

export async function removeLine(jobCardId: string, lineId: string): Promise<ActionResult> {
  const user = await requireUser();
  const { error } = await assertEditable(jobCardId, user.orgId);
  if (error) return { ok: false, error };

  const db = await getDb();
  const [line] = await db.select().from(s.jobCardLines).where(eq(s.jobCardLines.id, lineId)).limit(1);
  if (!line || line.jobCardId !== jobCardId) return { ok: false, error: "Line not found" };

  // Removing a pass-through line must also remove the purchase it created,
  // or the reimbursables report keeps chasing money nobody owes.
  if (line.lineType === "PASS_THROUGH") {
    await db
      .delete(s.purchases)
      .where(and(eq(s.purchases.jobCardId, jobCardId), eq(s.purchases.isPassThrough, true), eq(s.purchases.totalMinor, Number(line.costMinor))));
  }

  await db.delete(s.jobCardLines).where(eq(s.jobCardLines.id, lineId));
  await recalcJobTotals(jobCardId);
  revalidatePath(`/job-cards/${jobCardId}`);
  return { ok: true, data: undefined };
}

/** Admin only, by locked decision. Enforced here, not just hidden in the UI. */
export async function applyLineDiscount(jobCardId: string, lineId: string, amount: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can.discount(user)) return { ok: false, error: "Only an admin can apply a discount" };

  const { error } = await assertEditable(jobCardId, user.orgId);
  if (error) return { ok: false, error };

  const db = await getDb();
  const [line] = await db.select().from(s.jobCardLines).where(eq(s.jobCardLines.id, lineId)).limit(1);
  if (!line || line.jobCardId !== jobCardId) return { ok: false, error: "Line not found" };

  const discount = toMinor(amount);
  if (discount < 0) return { ok: false, error: "Discount cannot be negative" };
  if (discount > Number(line.lineTotalMinor)) return { ok: false, error: "Discount cannot exceed the line amount" };

  await db
    .update(s.jobCardLines)
    .set({ discountMinor: discount, discountedById: user.id, updatedAt: new Date() })
    .where(eq(s.jobCardLines.id, lineId));

  await db.insert(s.auditLogs).values({
    orgId: user.orgId,
    userId: user.id,
    entityType: "job_card_line",
    entityId: lineId,
    action: "DISCOUNT",
    before: { discountMinor: Number(line.discountMinor) },
    after: { discountMinor: discount },
    note: `Job ${jobCardId}`,
  });

  await recalcJobTotals(jobCardId);
  revalidatePath(`/job-cards/${jobCardId}`);
  return { ok: true, data: undefined };
}

const ALLOWED: Record<string, string[]> = {
  DRAFT: ["ESTIMATE_SENT", "IN_PROGRESS", "CANCELLED"],
  ESTIMATE_SENT: ["ESTIMATE_APPROVED", "ESTIMATE_REJECTED", "CANCELLED"],
  ESTIMATE_APPROVED: ["IN_PROGRESS", "CANCELLED"],
  ESTIMATE_REJECTED: ["CANCELLED", "DRAFT"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["INVOICED", "IN_PROGRESS"],
  INVOICED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export async function setJobStatus(jobCardId: string, to: string, note?: string): Promise<ActionResult> {
  const user = await requireUser();
  const db = await getDb();

  const [job] = await db
    .select()
    .from(s.jobCards)
    .where(and(eq(s.jobCards.id, jobCardId), eq(s.jobCards.orgId, user.orgId)))
    .limit(1);
  if (!job) return { ok: false, error: "Job card not found" };

  if (!ALLOWED[job.status]?.includes(to)) {
    return { ok: false, error: `Cannot move from ${job.status} to ${to}` };
  }

  const now = new Date();
  const patch: Partial<typeof s.jobCards.$inferInsert> = { status: to as never, updatedAt: now };

  if (to === "IN_PROGRESS" && !job.startedAt) patch.startedAt = now;
  if (to === "COMPLETED") patch.completedAt = now;
  if (to === "DELIVERED") patch.deliveredAt = now;
  if (to === "ESTIMATE_SENT") patch.kind = "ESTIMATE";

  await db.update(s.jobCards).set(patch).where(eq(s.jobCards.id, jobCardId));

  // Stock leaves the shelf when the work is done, not when it is billed —
  // a completed job that is never invoiced still consumed the shampoo.
  if (to === "COMPLETED") {
    await postJobCardStock({
      orgId: user.orgId,
      branchId: job.branchId,
      jobCardId,
      userId: user.id,
      occurredAt: now,
    });
  }

  await db.insert(s.jobCardStatusHistory).values({
    jobCardId,
    fromStatus: job.status,
    toStatus: to as never,
    changedById: user.id,
    note: note ?? null,
  });

  revalidatePath(`/job-cards/${jobCardId}`);
  revalidatePath("/job-cards");
  return { ok: true, data: undefined };
}

/** Does this job contain work that requires a customer-approved estimate? */
export async function jobNeedsEstimate(jobCardId: string): Promise<boolean> {
  const db = await getDb();
  const lines = await db
    .select({ serviceId: s.jobCardLines.serviceId })
    .from(s.jobCardLines)
    .where(and(eq(s.jobCardLines.jobCardId, jobCardId), eq(s.jobCardLines.lineType, "SERVICE")));

  const ids = lines.map((l) => l.serviceId).filter((x): x is string => Boolean(x));
  if (ids.length === 0) return false;

  const rows = await db
    .select({ requiresEstimate: s.serviceCategories.requiresEstimate })
    .from(s.services)
    .innerJoin(s.serviceCategories, eq(s.serviceCategories.id, s.services.categoryId))
    .where(inArray(s.services.id, ids));

  return rows.some((r) => r.requiresEstimate);
}
