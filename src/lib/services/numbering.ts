import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { getDb } from "@/db";
import * as s from "@/db/schema";

/** Indian financial year: April to March. 9 Sep 2026 -> "26-27". */
export function financialYear(on = new Date()): string {
  const y = on.getFullYear();
  const start = on.getMonth() >= 3 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

/**
 * INVOICE NUMBERING
 *
 * Under GST the series must be sequential and GAPLESS within a financial year.
 * That makes allocation a genuine concurrency problem: two staff billing at
 * the same counter at the same second must not both get INV/26-27/0042.
 *
 * `UPDATE ... SET current_number = current_number + 1 RETURNING` does the
 * increment inside the row lock the update already takes, so the database
 * serialises the two callers for us. Reading then writing - the obvious
 * implementation - has a race window between the two statements and WILL
 * eventually issue a duplicate.
 *
 * Call this inside the same transaction that inserts the invoice, so a failed
 * insert rolls the number back rather than burning it.
 */
export async function allocateInvoiceNumber(
  tx: DB,
  { orgId, branchId, on = new Date() }: { orgId: string; branchId: string; on?: Date },
): Promise<{ seriesId: string; invoiceNumber: string }> {
  const fy = financialYear(on);

  const [series] = await tx
    .update(s.invoiceSeries)
    .set({ currentNumber: sql`${s.invoiceSeries.currentNumber} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(s.invoiceSeries.orgId, orgId),
        eq(s.invoiceSeries.branchId, branchId),
        eq(s.invoiceSeries.financialYear, fy),
        eq(s.invoiceSeries.isActive, true),
      ),
    )
    .returning();

  if (series) {
    return {
      seriesId: series.id,
      invoiceNumber: `${series.prefix}/${fy}/${String(series.currentNumber).padStart(series.padWidth, "0")}`,
    };
  }

  // First invoice of a new financial year - open the series at 1.
  const [created] = await tx
    .insert(s.invoiceSeries)
    .values({
      orgId,
      branchId,
      name: "Default",
      prefix: "INV",
      financialYear: fy,
      currentNumber: 1,
      padWidth: 4,
      isActive: true,
    })
    .returning();

  return {
    seriesId: created.id,
    invoiceNumber: `${created.prefix}/${fy}/${String(1).padStart(created.padWidth, "0")}`,
  };
}

/**
 * Job numbers carry no legal requirement, so a max-plus-one is fine here.
 * A collision only ever costs a retry, and the unique index catches it.
 */
export async function nextJobNumber(orgId: string, on = new Date()): Promise<string> {
  const db = await getDb();
  const fy = financialYear(on);
  const prefix = `JC/${fy}/`;

  const [row] = await db
    .select({ n: sql<number>`coalesce(max(cast(split_part(${s.jobCards.jobNumber}, '/', 3) as integer)), 0)::int` })
    .from(s.jobCards)
    .where(and(eq(s.jobCards.orgId, orgId), sql`${s.jobCards.jobNumber} like ${prefix + "%"}`));

  return `${prefix}${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

export async function nextReceiptNumber(orgId: string, on = new Date()): Promise<string> {
  const db = await getDb();
  const fy = financialYear(on);
  const prefix = `RCP/${fy}/`;

  const [row] = await db
    .select({ n: sql<number>`coalesce(max(cast(split_part(${s.payments.receiptNumber}, '/', 3) as integer)), 0)::int` })
    .from(s.payments)
    .where(and(eq(s.payments.orgId, orgId), sql`${s.payments.receiptNumber} like ${prefix + "%"}`));

  return `${prefix}${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}
