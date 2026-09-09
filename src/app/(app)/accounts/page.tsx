import Link from "next/link";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { ArrowRight, Banknote, HandCoins, Receipt, TrendingDown } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { Badge, Page, PageHeader, Table, Td, Th } from "@/components/ui";

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default async function AccountsPage() {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();
  const mStart = monthStart();
  const mStartIso = mStart.toISOString().slice(0, 10);

  const [collected, expensesRow, receivables, payables, reimbursables, byCategory, recentClosings] = await Promise.all([
    db
      .select({
        total: sql<string>`coalesce(sum(${s.payments.amountMinor}), 0)`,
        cash: sql<string>`coalesce(sum(case when ${s.payments.method} = 'CASH' then ${s.payments.amountMinor} else 0 end), 0)`,
        upi: sql<string>`coalesce(sum(case when ${s.payments.method} = 'UPI' then ${s.payments.amountMinor} else 0 end), 0)`,
        card: sql<string>`coalesce(sum(case when ${s.payments.method} = 'CARD' then ${s.payments.amountMinor} else 0 end), 0)`,
      })
      .from(s.payments)
      .where(and(eq(s.payments.orgId, user.orgId), gte(s.payments.receivedAt, mStart)))
      .then((r) => r[0]),

    db
      .select({ total: sql<string>`coalesce(sum(${s.expenses.amountMinor}), 0)` })
      .from(s.expenses)
      .where(and(eq(s.expenses.orgId, user.orgId), sql`${s.expenses.expenseDate} >= ${mStartIso}`))
      .then((r) => r[0]),

    db
      .select({ total: sql<string>`coalesce(sum(${s.invoices.balanceMinor}), 0)` })
      .from(s.invoices)
      .where(and(eq(s.invoices.orgId, user.orgId), sql`${s.invoices.status} in ('ISSUED','PARTIALLY_PAID','OVERDUE')`))
      .then((r) => r[0]),

    db
      .select({ total: sql<string>`coalesce(sum(${s.purchases.totalMinor} - ${s.purchases.paidMinor}), 0)` })
      .from(s.purchases)
      .where(
        and(
          eq(s.purchases.orgId, user.orgId),
          eq(s.purchases.isPassThrough, false),
          sql`${s.purchases.paymentStatus} <> 'PAID'`,
        ),
      )
      .then((r) => r[0]),

    db
      .select({ total: sql<string>`coalesce(sum(${s.purchases.totalMinor}), 0)` })
      .from(s.purchases)
      .leftJoin(s.invoices, and(eq(s.invoices.jobCardId, s.purchases.jobCardId), sql`${s.invoices.status} <> 'CANCELLED'`))
      .where(
        and(
          eq(s.purchases.orgId, user.orgId),
          eq(s.purchases.isPassThrough, true),
          sql`(${s.invoices.id} is null or ${s.invoices.status} <> 'PAID')`,
        ),
      )
      .then((r) => r[0]),

    db
      .select({
        name: sql<string>`coalesce(${s.expenseCategories.name}, 'Uncategorised')`,
        isFixed: s.expenseCategories.isFixed,
        total: sql<string>`sum(${s.expenses.amountMinor})`,
      })
      .from(s.expenses)
      .leftJoin(s.expenseCategories, eq(s.expenseCategories.id, s.expenses.categoryId))
      .where(and(eq(s.expenses.orgId, user.orgId), sql`${s.expenses.expenseDate} >= ${mStartIso}`))
      .groupBy(s.expenseCategories.name, s.expenseCategories.isFixed)
      .orderBy(sql`sum(${s.expenses.amountMinor}) desc`),

    db
      .select()
      .from(s.dailyClosings)
      .where(eq(s.dailyClosings.orgId, user.orgId))
      .orderBy(desc(s.dailyClosings.businessDate))
      .limit(7),
  ]);

  const income = Number(collected?.total ?? 0);
  const spend = Number(expensesRow?.total ?? 0);
  const monthName = mStart.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const tiles = [
    {
      label: `Collected in ${monthName}`,
      value: formatINR(income),
      hint: `Cash ${formatINR(Number(collected?.cash ?? 0))} · UPI ${formatINR(Number(collected?.upi ?? 0))}`,
      icon: Banknote,
      tone: undefined as string | undefined,
    },
    {
      label: "Expenses this month",
      value: formatINR(spend),
      hint: `${byCategory.length} categories`,
      icon: TrendingDown,
      tone: undefined,
    },
    {
      label: "Owed by customers",
      value: formatINR(Number(receivables?.total ?? 0)),
      hint: "Unpaid invoices",
      icon: HandCoins,
      tone: Number(receivables?.total ?? 0) > 0 ? "var(--warning)" : undefined,
    },
    {
      label: "Owed to suppliers",
      value: formatINR(Number(payables?.total ?? 0)),
      hint: "Unpaid stock bills",
      icon: Receipt,
      tone: Number(payables?.total ?? 0) > 0 ? "var(--warning)" : undefined,
    },
  ];

  return (
    <Page wide>
      <PageHeader
        title="Accounts"
        backHref="/dashboard"
        subtitle="Cash in, cash out, and who owes whom."
        actions={
          <>
            <Link href="/accounts/expenses" className="btn btn-ghost">
              Expenses
            </Link>
            <Link href="/accounts/closing" className="btn btn-primary">
              Daily closing
            </Link>
          </>
        }
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
        {tiles.map((t) => (
          <div key={t.label} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                {t.label}
              </p>
              <t.icon size={15} style={{ color: "var(--text-subtle)" }} />
            </div>
            <p className="mt-1.5 text-[22px] font-semibold tnum leading-none" style={{ color: t.tone }}>
              {t.value}
            </p>
            <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-subtle)" }}>
              {t.hint}
            </p>
          </div>
        ))}
      </div>

      {/*
        The shop's own money sitting in customer parts. It is neither an
        expense nor stock, so it appears nowhere else in the accounts — which
        is exactly why it needs its own line.
      */}
      {Number(reimbursables?.total ?? 0) > 0 && (
        <div
          className="card p-4 mb-5 flex flex-wrap items-center justify-between gap-3"
          style={{ borderColor: "var(--warning)", background: "var(--warning-soft)" }}
        >
          <div>
            <p className="text-[13.5px] font-semibold" style={{ color: "var(--warning)" }}>
              {formatINR(Number(reimbursables?.total ?? 0))} fronted on customer parts
            </p>
            <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              Not an expense and not stock — your cash, recoverable when those invoices are settled.
            </p>
          </div>
          <Link href="/purchases?filter=pass-through" className="btn btn-ghost text-[13px]">
            View <ArrowRight size={14} />
          </Link>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-subtle)" }}>
            Where the money went · {monthName}
          </h2>
          {byCategory.length === 0 ? (
            <div className="card p-5 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
              No expenses recorded this month.
            </div>
          ) : (
            <div className="card p-4">
              {byCategory.map((c) => {
                const amt = Number(c.total);
                const pct = spend > 0 ? (amt / spend) * 100 : 0;
                return (
                  <div key={c.name} className="mb-3 last:mb-0">
                    <div className="flex justify-between items-baseline gap-2 mb-1">
                      <span className="text-[13px]">
                        {c.name}
                        {c.isFixed && (
                          <span className="ml-1.5">
                            <Badge>Fixed</Badge>
                          </span>
                        )}
                      </span>
                      <span className="text-[13px] tnum font-medium">{formatINR(amt)}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: c.isFixed ? "var(--text-subtle)" : "var(--brand)" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-subtle)" }}>
            Recent cash closings
          </h2>
          {recentClosings.length === 0 ? (
            <div className="card p-5 text-center">
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                No day has been closed yet.
              </p>
              <Link href="/accounts/closing" className="btn btn-ghost mt-3 text-[13px]">
                Close today
              </Link>
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th align="right">Expected</Th>
                  <Th align="right">Counted</Th>
                  <Th align="right">Variance</Th>
                </tr>
              </thead>
              <tbody>
                {recentClosings.map((c) => {
                  const v = Number(c.varianceMinor);
                  return (
                    <tr key={c.id} className="border-t">
                      <Td nowrap>
                        {new Date(c.businessDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                        })}
                      </Td>
                      <Td align="right" muted>
                        <span className="tnum">{formatINR(Number(c.expectedCashMinor))}</span>
                      </Td>
                      <Td align="right">
                        <span className="tnum">{formatINR(Number(c.countedCashMinor))}</span>
                      </Td>
                      <Td align="right">
                        <span
                          className="tnum font-medium"
                          style={{ color: v === 0 ? "var(--success)" : v < 0 ? "var(--danger)" : "var(--warning)" }}
                        >
                          {v === 0 ? "—" : `${v > 0 ? "+" : ""}${formatINR(v)}`}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </section>
      </div>
    </Page>
  );
}
