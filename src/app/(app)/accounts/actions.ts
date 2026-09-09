"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { toMinor } from "@/lib/money";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: string): ActionResult<never> => ({ ok: false, error });

const expenseSchema = z.object({
  description: z.string().trim().min(2, "What was it for?"),
  amount: z.string().trim().min(1, "Enter an amount"),
  categoryId: z.string().optional(),
  expenseDate: z.string().trim().min(1, "Pick a date"),
  method: z.string().trim().optional(),
  reference: z.string().trim().optional(),
});

export async function saveExpense(id: string | null, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const amount = toMinor(parsed.data.amount);
  if (amount <= 0) return fail("Amount must be more than zero");

  const db = await getDb();
  const values = {
    description: parsed.data.description,
    amountMinor: amount,
    categoryId: parsed.data.categoryId || null,
    expenseDate: parsed.data.expenseDate,
    method: parsed.data.method || "CASH",
    reference: parsed.data.reference || null,
  };

  if (id) {
    await db
      .update(s.expenses)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(s.expenses.id, id), eq(s.expenses.orgId, user.orgId)));
  } else {
    await db.insert(s.expenses).values({
      orgId: user.orgId,
      branchId: user.branchId!,
      ...values,
      createdBy: user.id,
    });
  }

  revalidatePath("/accounts");
  revalidatePath("/accounts/expenses");
  return ok(undefined);
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();
  const [row] = await db.select().from(s.expenses).where(eq(s.expenses.id, id)).limit(1);
  if (!row) return fail("Expense not found");

  await db.delete(s.expenses).where(and(eq(s.expenses.id, id), eq(s.expenses.orgId, user.orgId)));
  await db.insert(s.auditLogs).values({
    orgId: user.orgId,
    userId: user.id,
    entityType: "expense",
    entityId: id,
    action: "DELETE",
    before: { description: row.description, amountMinor: Number(row.amountMinor) },
  });

  revalidatePath("/accounts/expenses");
  return ok(undefined);
}

export async function saveExpenseCategory(name: string, isFixed: boolean): Promise<ActionResult> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  if (name.trim().length < 2) return fail("Enter a category name");
  const db = await getDb();
  await db.insert(s.expenseCategories).values({ orgId: user.orgId, name: name.trim(), isFixed });
  revalidatePath("/accounts/expenses");
  return ok(undefined);
}

/**
 * DAILY CASH CLOSING
 *
 * Expected cash is derived, never typed: opening float, plus cash taken in
 * today, minus cash paid out today. The only thing a human enters is what
 * they actually counted, and the variance falls out of the difference.
 *
 * Letting someone type the expected figure would defeat the entire control.
 */
export async function closeDay(formData: FormData): Promise<ActionResult<{ varianceMinor: number }>> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();

  const businessDate = String(formData.get("businessDate") ?? new Date().toISOString().slice(0, 10));
  const openingCash = toMinor(String(formData.get("openingCash") ?? "0"));
  const countedCash = toMinor(String(formData.get("countedCash") ?? "0"));
  const note = String(formData.get("note") ?? "") || null;

  const dayStart = new Date(`${businessDate}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [takings] = await db
    .select({
      cash: sql<string>`coalesce(sum(case when ${s.payments.method} = 'CASH' then ${s.payments.amountMinor} else 0 end), 0)`,
      upi: sql<string>`coalesce(sum(case when ${s.payments.method} = 'UPI' then ${s.payments.amountMinor} else 0 end), 0)`,
      card: sql<string>`coalesce(sum(case when ${s.payments.method} = 'CARD' then ${s.payments.amountMinor} else 0 end), 0)`,
      other: sql<string>`coalesce(sum(case when ${s.payments.method} not in ('CASH','UPI','CARD') then ${s.payments.amountMinor} else 0 end), 0)`,
    })
    .from(s.payments)
    .where(
      and(eq(s.payments.orgId, user.orgId), gte(s.payments.receivedAt, dayStart), lt(s.payments.receivedAt, dayEnd)),
    );

  const [cashOut] = await db
    .select({ total: sql<string>`coalesce(sum(${s.expenses.amountMinor}), 0)` })
    .from(s.expenses)
    .where(
      and(
        eq(s.expenses.orgId, user.orgId),
        eq(s.expenses.method, "CASH"),
        eq(s.expenses.expenseDate, businessDate),
      ),
    );

  const cashSales = Number(takings?.cash ?? 0);
  const cashExpenses = Number(cashOut?.total ?? 0);
  const expected = openingCash + cashSales - cashExpenses;
  const variance = countedCash - expected;

  const existing = await db
    .select()
    .from(s.dailyClosings)
    .where(
      and(
        eq(s.dailyClosings.orgId, user.orgId),
        eq(s.dailyClosings.branchId, user.branchId!),
        eq(s.dailyClosings.businessDate, businessDate),
      ),
    )
    .limit(1);

  const values = {
    status: "CLOSED" as const,
    openingCashMinor: openingCash,
    cashSalesMinor: cashSales,
    upiSalesMinor: Number(takings?.upi ?? 0),
    cardSalesMinor: Number(takings?.card ?? 0),
    otherSalesMinor: Number(takings?.other ?? 0),
    cashExpensesMinor: cashExpenses,
    expectedCashMinor: expected,
    countedCashMinor: countedCash,
    varianceMinor: variance,
    note,
    closedById: user.id,
    closedAt: new Date(),
    updatedAt: new Date(),
  };

  if (existing.length) {
    await db.update(s.dailyClosings).set(values).where(eq(s.dailyClosings.id, existing[0].id));
  } else {
    await db.insert(s.dailyClosings).values({
      orgId: user.orgId,
      branchId: user.branchId!,
      businessDate,
      ...values,
    });
  }

  revalidatePath("/accounts");
  revalidatePath("/accounts/closing");
  return ok({ varianceMinor: variance });
}
