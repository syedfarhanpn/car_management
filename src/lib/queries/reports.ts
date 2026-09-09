import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";

export type Period = { from: Date; to: Date; label: string };

export function monthPeriod(offset = 0): Period {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { from, to, label: from.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
}

/** Collected vs billed vs spent for a period. */
export async function getPeriodSummary(orgId: string, period: Period) {
  const db = await getDb();
  const fromIso = period.from.toISOString().slice(0, 10);
  const toIso = period.to.toISOString().slice(0, 10);

  const [billed] = await db
    .select({
      taxable: sql<string>`coalesce(sum(${s.invoices.taxableMinor}), 0)`,
      tax: sql<string>`coalesce(sum(${s.invoices.cgstMinor} + ${s.invoices.sgstMinor} + ${s.invoices.igstMinor}), 0)`,
      reimbursable: sql<string>`coalesce(sum(${s.invoices.reimbursableMinor}), 0)`,
      total: sql<string>`coalesce(sum(${s.invoices.totalMinor}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(s.invoices)
    .where(
      and(
        eq(s.invoices.orgId, orgId),
        sql`${s.invoices.status} <> 'CANCELLED'`,
        sql`${s.invoices.invoiceDate} >= ${fromIso}`,
        sql`${s.invoices.invoiceDate} < ${toIso}`,
      ),
    );

  const [collected] = await db
    .select({ total: sql<string>`coalesce(sum(${s.payments.amountMinor}), 0)` })
    .from(s.payments)
    .where(and(eq(s.payments.orgId, orgId), gte(s.payments.receivedAt, period.from), lt(s.payments.receivedAt, period.to)));

  const [spent] = await db
    .select({ total: sql<string>`coalesce(sum(${s.expenses.amountMinor}), 0)` })
    .from(s.expenses)
    .where(
      and(
        eq(s.expenses.orgId, orgId),
        sql`${s.expenses.expenseDate} >= ${fromIso}`,
        sql`${s.expenses.expenseDate} < ${toIso}`,
      ),
    );

  const [jobs] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(s.jobCards)
    .where(and(eq(s.jobCards.orgId, orgId), gte(s.jobCards.createdAt, period.from), lt(s.jobCards.createdAt, period.to)));

  /**
   * Revenue here is the TAXABLE value, not the invoice total: GST is collected
   * on behalf of the government and reimbursed parts are the customer's money
   * passing through. Neither is income, and counting them would flatter the
   * figure by a wide margin on any job involving an outside part.
   */
  return {
    revenueMinor: Number(billed?.taxable ?? 0),
    taxMinor: Number(billed?.tax ?? 0),
    reimbursableMinor: Number(billed?.reimbursable ?? 0),
    billedMinor: Number(billed?.total ?? 0),
    invoiceCount: billed?.count ?? 0,
    collectedMinor: Number(collected?.total ?? 0),
    expensesMinor: Number(spent?.total ?? 0),
    jobCount: jobs?.count ?? 0,
  };
}

export type ServiceMargin = {
  serviceId: string;
  name: string;
  categoryName: string;
  jobs: number;
  revenueMinor: number;
  consumableCostMinor: number;
  marginMinor: number;
  marginPct: number;
};

/**
 * MARGIN BY SERVICE
 *
 * Revenue comes from what was actually billed. Cost comes from the service's
 * consumable recipe valued at the current average cost — which is the only
 * reason recipes are worth maintaining: without them a wash has no cost at
 * all and every service looks 100% profitable.
 *
 * Labour is deliberately excluded. Technicians are on fixed salary here, so
 * it is a period cost rather than a per-job one; folding an invented hourly
 * rate in would make the number look precise while being made up.
 */
export async function getServiceMargins(orgId: string, period: Period): Promise<ServiceMargin[]> {
  const db = await getDb();

  const lines = await db
    .select({
      serviceId: s.jobCardLines.serviceId,
      name: s.services.name,
      categoryName: s.serviceCategories.name,
      vehicleClassId: s.jobCards.vehicleClassId,
      quantity: s.jobCardLines.quantity,
      lineTotalMinor: s.jobCardLines.lineTotalMinor,
      discountMinor: s.jobCardLines.discountMinor,
      gstRate: s.jobCardLines.gstRate,
    })
    .from(s.jobCardLines)
    .innerJoin(s.jobCards, eq(s.jobCards.id, s.jobCardLines.jobCardId))
    .innerJoin(s.services, eq(s.services.id, s.jobCardLines.serviceId))
    .innerJoin(s.serviceCategories, eq(s.serviceCategories.id, s.services.categoryId))
    .where(
      and(
        eq(s.jobCardLines.orgId, orgId),
        eq(s.jobCardLines.lineType, "SERVICE"),
        sql`${s.jobCards.status} in ('COMPLETED','INVOICED','DELIVERED')`,
        gte(s.jobCards.createdAt, period.from),
        lt(s.jobCards.createdAt, period.to),
      ),
    );

  const [recipes, items] = await Promise.all([
    db.select().from(s.serviceRecipes).where(eq(s.serviceRecipes.orgId, orgId)),
    db.select().from(s.inventoryItems).where(eq(s.inventoryItems.orgId, orgId)),
  ]);
  const costOf = new Map(items.map((i) => [i.id, Number(i.avgCostMinor)]));

  const acc = new Map<string, ServiceMargin>();

  for (const line of lines) {
    if (!line.serviceId) continue;
    const row =
      acc.get(line.serviceId) ??
      ({
        serviceId: line.serviceId,
        name: line.name,
        categoryName: line.categoryName,
        jobs: 0,
        revenueMinor: 0,
        consumableCostMinor: 0,
        marginMinor: 0,
        marginPct: 0,
      } satisfies ServiceMargin);

    const gross = Number(line.lineTotalMinor) - Number(line.discountMinor);
    // Strip GST out so revenue is comparable to cost, which is tax-exclusive.
    const net = line.gstRate > 0 ? Math.round((gross * 100) / (100 + line.gstRate)) : gross;

    // Class-specific recipe rows override the all-classes row for the same item.
    const applicable = recipes.filter(
      (r) => r.serviceId === line.serviceId && (r.vehicleClassId === null || r.vehicleClassId === line.vehicleClassId),
    );
    const byItem = new Map<string, (typeof applicable)[number]>();
    for (const r of applicable) {
      const seen = byItem.get(r.itemId);
      if (!seen || (r.vehicleClassId && !seen.vehicleClassId)) byItem.set(r.itemId, r);
    }

    let cost = 0;
    for (const r of byItem.values()) {
      cost += Number(r.quantityBase) * (costOf.get(r.itemId) ?? 0);
    }

    row.jobs += 1;
    row.revenueMinor += net;
    row.consumableCostMinor += Math.round(cost * Number(line.quantity));
    acc.set(line.serviceId, row);
  }

  return [...acc.values()]
    .map((r) => {
      const margin = r.revenueMinor - r.consumableCostMinor;
      return { ...r, marginMinor: margin, marginPct: r.revenueMinor > 0 ? (margin / r.revenueMinor) * 100 : 0 };
    })
    .sort((a, b) => b.revenueMinor - a.revenueMinor);
}

export type ConsumptionVariance = {
  itemId: string;
  name: string;
  baseUnit: string;
  expectedBase: number;
  actualBase: number;
  varianceBase: number;
  varianceValueMinor: number;
};

/**
 * CONSUMPTION VARIANCE — the leakage report.
 *
 * Expected = what the recipes say the jobs done in this period should have
 * consumed. Actual = every negative movement in the ledger over the same
 * period, which includes recipe deductions AND manual adjustments, wastage
 * and stock-take corrections.
 *
 * The two agreeing means the recipes are right and nothing is walking off.
 * A persistent gap is either a recipe that no longer matches reality or
 * stock leaving without a job attached — and both are worth knowing.
 */
export async function getConsumptionVariance(orgId: string, period: Period): Promise<ConsumptionVariance[]> {
  const db = await getDb();

  const [serviceLines, recipes, items, actuals] = await Promise.all([
    db
      .select({
        serviceId: s.jobCardLines.serviceId,
        quantity: s.jobCardLines.quantity,
        vehicleClassId: s.jobCards.vehicleClassId,
      })
      .from(s.jobCardLines)
      .innerJoin(s.jobCards, eq(s.jobCards.id, s.jobCardLines.jobCardId))
      .where(
        and(
          eq(s.jobCardLines.orgId, orgId),
          eq(s.jobCardLines.lineType, "SERVICE"),
          sql`${s.jobCards.stockPostedAt} is not null`,
          gte(s.jobCards.stockPostedAt, period.from),
          lt(s.jobCards.stockPostedAt, period.to),
        ),
      ),
    db.select().from(s.serviceRecipes).where(eq(s.serviceRecipes.orgId, orgId)),
    db.select().from(s.inventoryItems).where(eq(s.inventoryItems.orgId, orgId)),
    db
      .select({
        itemId: s.stockLedger.itemId,
        used: sql<string>`coalesce(sum(-${s.stockLedger.quantityBase}), 0)`,
      })
      .from(s.stockLedger)
      .where(
        and(
          eq(s.stockLedger.orgId, orgId),
          sql`${s.stockLedger.quantityBase} < 0`,
          gte(s.stockLedger.occurredAt, period.from),
          lt(s.stockLedger.occurredAt, period.to),
        ),
      )
      .groupBy(s.stockLedger.itemId),
  ]);

  const expected = new Map<string, number>();
  for (const line of serviceLines) {
    const applicable = recipes.filter(
      (r) => r.serviceId === line.serviceId && (r.vehicleClassId === null || r.vehicleClassId === line.vehicleClassId),
    );
    const byItem = new Map<string, (typeof applicable)[number]>();
    for (const r of applicable) {
      const seen = byItem.get(r.itemId);
      if (!seen || (r.vehicleClassId && !seen.vehicleClassId)) byItem.set(r.itemId, r);
    }
    for (const r of byItem.values()) {
      expected.set(r.itemId, (expected.get(r.itemId) ?? 0) + Number(r.quantityBase) * Number(line.quantity));
    }
  }

  const actualMap = new Map(actuals.map((a) => [a.itemId, Number(a.used)]));
  const ids = new Set([...expected.keys(), ...actualMap.keys()]);

  // flatMap rather than map+filter so the nulls are gone before the type is
  // narrowed — a predicate over a union of the row type and null fights the
  // enum-typed baseUnit column for no benefit.
  const rows: ConsumptionVariance[] = [...ids].flatMap((id) => {
    const item = items.find((i) => i.id === id);
    if (!item) return [];

    /**
     * Only bulk consumables belong in this report.
     *
     * A stocked part is picked explicitly onto a job card and never has a
     * recipe, so it always reads as "expected 0, actually used 1" — a
     * variance that is entirely an artefact of the model rather than a real
     * discrepancy. Leaving parts in here buries the genuine signal (shampoo
     * quietly running 20% over) under rows that can never balance.
     */
    if (item.type !== "BULK_CONSUMABLE") return [];

    const exp = expected.get(id) ?? 0;
    const act = actualMap.get(id) ?? 0;
    if (exp <= 0 && act <= 0) return [];
    const variance = act - exp;
    return [
      {
        itemId: id,
        name: item.name,
        baseUnit: item.baseUnit as string,
        expectedBase: exp,
        actualBase: act,
        varianceBase: variance,
        varianceValueMinor: Math.round(variance * Number(item.avgCostMinor)),
      },
    ];
  });

  return rows.sort((a, b) => Math.abs(b.varianceValueMinor) - Math.abs(a.varianceValueMinor));
}

/** Unpaid invoices bucketed by how long they have been outstanding. */
export async function getReceivablesAgeing(orgId: string) {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: s.invoices.id,
      invoiceNumber: s.invoices.invoiceNumber,
      clientId: s.invoices.clientId,
      clientName: s.invoices.billToName,
      invoiceDate: s.invoices.invoiceDate,
      dueDate: s.invoices.dueDate,
      balanceMinor: s.invoices.balanceMinor,
      days: sql<number>`(current_date - ${s.invoices.invoiceDate})::int`,
    })
    .from(s.invoices)
    .where(and(eq(s.invoices.orgId, orgId), sql`${s.invoices.status} in ('ISSUED','PARTIALLY_PAID','OVERDUE')`))
    .orderBy(sql`${s.invoices.invoiceDate} asc`);

  const buckets = [
    { label: "Not yet due", min: -Infinity, max: 0, totalMinor: 0, count: 0 },
    { label: "1–30 days", min: 1, max: 30, totalMinor: 0, count: 0 },
    { label: "31–60 days", min: 31, max: 60, totalMinor: 0, count: 0 },
    { label: "61–90 days", min: 61, max: 90, totalMinor: 0, count: 0 },
    { label: "Over 90 days", min: 91, max: Infinity, totalMinor: 0, count: 0 },
  ];

  for (const r of rows) {
    const overdueDays = r.dueDate ? Math.floor((Date.parse(today) - Date.parse(r.dueDate)) / 86400000) : r.days;
    const bucket = buckets.find((b) => overdueDays >= b.min && overdueDays <= b.max) ?? buckets[0];
    bucket.totalMinor += Number(r.balanceMinor);
    bucket.count += 1;
  }

  return { buckets, invoices: rows.map((r) => ({ ...r, balanceMinor: Number(r.balanceMinor) })) };
}

export async function getTopClients(orgId: string, period: Period, limit = 8) {
  const db = await getDb();
  const fromIso = period.from.toISOString().slice(0, 10);
  const toIso = period.to.toISOString().slice(0, 10);

  return db
    .select({
      clientId: s.invoices.clientId,
      name: s.invoices.billToName,
      total: sql<string>`sum(${s.invoices.taxableMinor})`,
      visits: sql<number>`count(*)::int`,
    })
    .from(s.invoices)
    .where(
      and(
        eq(s.invoices.orgId, orgId),
        sql`${s.invoices.status} <> 'CANCELLED'`,
        sql`${s.invoices.invoiceDate} >= ${fromIso}`,
        sql`${s.invoices.invoiceDate} < ${toIso}`,
      ),
    )
    .groupBy(s.invoices.clientId, s.invoices.billToName)
    .orderBy(sql`sum(${s.invoices.taxableMinor}) desc`)
    .limit(limit)
    .then((rows) => rows.map((r) => ({ ...r, total: Number(r.total) })));
}
