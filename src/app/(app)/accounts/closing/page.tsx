import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";
import { ClosingForm } from "./closing-form";

export default async function ClosingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const { date } = await searchParams;
  const businessDate = date ?? new Date().toISOString().slice(0, 10);

  const db = await getDb();
  const dayStart = new Date(`${businessDate}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [takings, cashOut, existing, previous] = await Promise.all([
    db
      .select({
        cash: sql<string>`coalesce(sum(case when ${s.payments.method} = 'CASH' then ${s.payments.amountMinor} else 0 end), 0)`,
        upi: sql<string>`coalesce(sum(case when ${s.payments.method} = 'UPI' then ${s.payments.amountMinor} else 0 end), 0)`,
        card: sql<string>`coalesce(sum(case when ${s.payments.method} = 'CARD' then ${s.payments.amountMinor} else 0 end), 0)`,
        other: sql<string>`coalesce(sum(case when ${s.payments.method} not in ('CASH','UPI','CARD') then ${s.payments.amountMinor} else 0 end), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(s.payments)
      .where(and(eq(s.payments.orgId, user.orgId), gte(s.payments.receivedAt, dayStart), lt(s.payments.receivedAt, dayEnd)))
      .then((r) => r[0]),

    db
      .select({ total: sql<string>`coalesce(sum(${s.expenses.amountMinor}), 0)` })
      .from(s.expenses)
      .where(
        and(
          eq(s.expenses.orgId, user.orgId),
          eq(s.expenses.method, "CASH"),
          eq(s.expenses.expenseDate, businessDate),
        ),
      )
      .then((r) => r[0]),

    db
      .select()
      .from(s.dailyClosings)
      .where(and(eq(s.dailyClosings.orgId, user.orgId), eq(s.dailyClosings.businessDate, businessDate)))
      .limit(1)
      .then((r) => r[0]),

    // Yesterday's counted cash is today's opening float.
    db
      .select()
      .from(s.dailyClosings)
      .where(and(eq(s.dailyClosings.orgId, user.orgId), sql`${s.dailyClosings.businessDate} < ${businessDate}`))
      .orderBy(desc(s.dailyClosings.businessDate))
      .limit(1)
      .then((r) => r[0]),
  ]);

  return (
    <Page>
      <PageHeader
        title="Daily cash closing"
        backHref="/accounts"
        backLabel="Accounts"
        subtitle="Count the drawer against what the system says should be in it. A gap found today is still attributable to a shift and a person."
      />
      <ClosingForm
        businessDate={businessDate}
        cashSales={Number(takings?.cash ?? 0)}
        upiSales={Number(takings?.upi ?? 0)}
        cardSales={Number(takings?.card ?? 0)}
        otherSales={Number(takings?.other ?? 0)}
        paymentCount={takings?.count ?? 0}
        cashExpenses={Number(cashOut?.total ?? 0)}
        suggestedOpening={Number(previous?.countedCashMinor ?? 0)}
        existing={
          existing
            ? {
                openingCashMinor: Number(existing.openingCashMinor),
                countedCashMinor: Number(existing.countedCashMinor),
                expectedCashMinor: Number(existing.expectedCashMinor),
                varianceMinor: Number(existing.varianceMinor),
                note: existing.note,
                closedAt: existing.closedAt ? existing.closedAt.toISOString() : null,
              }
            : null
        }
      />
    </Page>
  );
}
