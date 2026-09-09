"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DB } from "@/db";
import * as s from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { toMinor } from "@/lib/money";
import { getTaxConfig } from "@/lib/settings";
import { computeTotals, type TotalsLine } from "@/lib/services/totals";
import { isInterState } from "@/lib/tax";
import { allocateInvoiceNumber, nextReceiptNumber } from "@/lib/services/numbering";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Turn a completed job card into an invoice.
 *
 * Everything happens in ONE transaction because the invoice number is
 * allocated by incrementing a shared counter. If the insert fails after the
 * increment, that number is burned and the series has a gap — which under GST
 * is a compliance problem, not a cosmetic one.
 */
export async function generateInvoice(jobCardId: string): Promise<ActionResult<{ invoiceId: string }>> {
  const user = await requireUser();
  const db = await getDb();

  const [job] = await db
    .select()
    .from(s.jobCards)
    .where(and(eq(s.jobCards.id, jobCardId), eq(s.jobCards.orgId, user.orgId)))
    .limit(1);
  if (!job) return { ok: false, error: "Job card not found" };

  const [existing] = await db.select().from(s.invoices).where(eq(s.invoices.jobCardId, jobCardId)).limit(1);
  if (existing) return { ok: true, data: { invoiceId: existing.id } };

  if (!["COMPLETED", "IN_PROGRESS"].includes(job.status)) {
    return { ok: false, error: "Mark the work complete before billing" };
  }

  const [lines, client, config, org] = await Promise.all([
    db.select().from(s.jobCardLines).where(eq(s.jobCardLines.jobCardId, jobCardId)),
    db.select().from(s.clients).where(eq(s.clients.id, job.clientId)).limit(1).then((r) => r[0]),
    getTaxConfig(user.orgId),
    db.select().from(s.organizations).where(eq(s.organizations.id, user.orgId)).limit(1).then((r) => r[0]),
  ]);

  if (lines.length === 0) return { ok: false, error: "Nothing to bill — the job card is empty" };

  const placeOfSupply = client?.state === "Kerala" || !client?.state ? "32-Kerala" : client.state;
  const interState = isInterState(placeOfSupply, config);

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
    interState,
  });

  const invoiceId = await db.transaction(async (tx) => {
    const { seriesId, invoiceNumber } = await allocateInvoiceNumber(tx as unknown as DB, {
      orgId: user.orgId,
      branchId: job.branchId,
    });

    const today = new Date();
    const dueDays = client?.creditDays ?? 0;

    const [invoice] = await tx
      .insert(s.invoices)
      .values({
        orgId: user.orgId,
        branchId: job.branchId,
        seriesId,
        invoiceNumber,
        status: "ISSUED",
        jobCardId,
        clientId: job.clientId,
        vehicleId: job.vehicleId,
        invoiceDate: today.toISOString().slice(0, 10),
        dueDate: new Date(today.getTime() + dueDays * 86400000).toISOString().slice(0, 10),
        // Snapshot the billing identity — the customer may move or rename later.
        billToName: client?.name ?? "Customer",
        billToPhone: client?.phone ?? null,
        billToAddress: [client?.addressLine1, client?.city, client?.state].filter(Boolean).join(", ") || null,
        billToGstin: client?.gstin ?? null,
        placeOfSupply,
        subtotalMinor: totals.subtotalMinor,
        discountMinor: totals.discountMinor,
        taxableMinor: totals.taxableMinor,
        cgstMinor: totals.cgstMinor,
        sgstMinor: totals.sgstMinor,
        igstMinor: totals.igstMinor,
        reimbursableMinor: totals.reimbursableMinor,
        roundOffMinor: totals.roundOffMinor,
        totalMinor: totals.totalMinor,
        paidMinor: 0,
        balanceMinor: totals.totalMinor,
        isTaxInvoice: config.enabled && Boolean(org?.gstin),
        publicToken: randomToken(),
        issuedAt: today,
        createdBy: user.id,
      })
      .returning();

    await tx.insert(s.invoiceLines).values(
      totals.lines.map((c, i) => ({
        invoiceId: invoice.id,
        sortOrder: i,
        description: c.description,
        hsnSacCode: c.lineType === "SERVICE" ? "998714" : c.lineType === "PART" ? "8708" : null,
        quantity: c.quantity,
        unitPriceMinor: c.unitPriceMinor,
        discountMinor: c.discountMinor,
        taxableMinor: c.tax.taxableMinor,
        gstRate: c.tax.gstRate,
        cgstMinor: c.tax.cgstMinor,
        sgstMinor: c.tax.sgstMinor,
        igstMinor: c.tax.igstMinor,
        lineTotalMinor: c.displayMinor,
        isReimbursable: c.isReimbursable,
      })),
    );

    await tx.update(s.jobCards).set({ status: "INVOICED", updatedAt: today }).where(eq(s.jobCards.id, jobCardId));

    await tx.insert(s.jobCardStatusHistory).values({
      jobCardId,
      fromStatus: job.status,
      toStatus: "INVOICED",
      changedById: user.id,
      note: `Invoice ${invoiceNumber}`,
    });

    return invoice.id;
  });

  revalidatePath("/billing");
  revalidatePath(`/job-cards/${jobCardId}`);
  return { ok: true, data: { invoiceId } };
}

const paymentSchema = z.object({
  amount: z.string().trim().min(1, "Enter the amount"),
  method: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"]),
  reference: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

/**
 * Record a payment against an invoice.
 *
 * Part payments are first-class: cars leave here unpaid, so an invoice can be
 * settled over several receipts. The allocation row is what keeps the ageing
 * report honest when one UPI transfer covers three invoices.
 */
export async function recordPayment(invoiceId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const db = await getDb();
  const [invoice] = await db
    .select()
    .from(s.invoices)
    .where(and(eq(s.invoices.id, invoiceId), eq(s.invoices.orgId, user.orgId)))
    .limit(1);
  if (!invoice) return { ok: false, error: "Invoice not found" };
  if (invoice.status === "CANCELLED") return { ok: false, error: "This invoice was cancelled" };

  const amount = toMinor(parsed.data.amount);
  if (amount <= 0) return { ok: false, error: "Amount must be more than zero" };

  const balance = Number(invoice.balanceMinor);
  if (amount > balance) {
    return { ok: false, error: `That is more than the ₹${(balance / 100).toFixed(2)} outstanding` };
  }

  const now = new Date();
  // Allocated BEFORE the transaction opens. nextReceiptNumber runs its own
  // query on the shared connection, and calling it from inside a transaction
  // deadlocks on a single-connection driver like PGlite - the query waits for
  // a connection the transaction is holding.
  const receiptNumber = await nextReceiptNumber(user.orgId);

  await db.transaction(async (tx) => {
    const [payment] = await tx
      .insert(s.payments)
      .values({
        orgId: user.orgId,
        branchId: invoice.branchId,
        clientId: invoice.clientId,
        receiptNumber,
        amountMinor: amount,
        method: parsed.data.method,
        reference: parsed.data.reference || null,
        note: parsed.data.note || null,
        receivedAt: now,
        receivedById: user.id,
      })
      .returning();

    await tx.insert(s.paymentAllocations).values({
      paymentId: payment.id,
      invoiceId,
      amountMinor: amount,
    });

    const paid = Number(invoice.paidMinor) + amount;
    const newBalance = Number(invoice.totalMinor) - paid;

    await tx
      .update(s.invoices)
      .set({
        paidMinor: paid,
        balanceMinor: newBalance,
        status: newBalance <= 0 ? "PAID" : "PARTIALLY_PAID",
        updatedAt: now,
      })
      .where(eq(s.invoices.id, invoiceId));
  });

  revalidatePath(`/billing/${invoiceId}`);
  revalidatePath("/billing");
  return { ok: true, data: undefined };
}

/**
 * Cancelling never deletes. A GST series must stay gapless, so the number
 * remains issued and the record remains, marked cancelled with a reason.
 */
export async function cancelInvoice(invoiceId: string, reason: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can.voidInvoice(user)) return { ok: false, error: "Only an admin can cancel an invoice" };
  if (reason.trim().length < 3) return { ok: false, error: "Give a reason for cancelling" };

  const db = await getDb();
  const [invoice] = await db
    .select()
    .from(s.invoices)
    .where(and(eq(s.invoices.id, invoiceId), eq(s.invoices.orgId, user.orgId)))
    .limit(1);
  if (!invoice) return { ok: false, error: "Invoice not found" };
  if (Number(invoice.paidMinor) > 0) {
    return { ok: false, error: "Payments are recorded against this invoice — refund them first" };
  }

  await db
    .update(s.invoices)
    .set({ status: "CANCELLED", cancelledAt: new Date(), cancelledReason: reason, balanceMinor: 0, updatedAt: new Date() })
    .where(eq(s.invoices.id, invoiceId));

  await db.insert(s.auditLogs).values({
    orgId: user.orgId,
    userId: user.id,
    entityType: "invoice",
    entityId: invoiceId,
    action: "CANCEL",
    before: { status: invoice.status },
    after: { status: "CANCELLED" },
    note: reason,
  });

  revalidatePath(`/billing/${invoiceId}`);
  return { ok: true, data: undefined };
}
