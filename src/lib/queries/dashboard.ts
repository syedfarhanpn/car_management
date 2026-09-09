import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export type DashboardStats = {
  openJobs: number;
  jobsToday: number;
  revenueToday: number;
  receivables: number;
  reimbursablesOutstanding: number;
  lowStockCount: number;
  clientCount: number;
  vehicleCount: number;
};

export async function getDashboardStats(orgId: string): Promise<DashboardStats> {
  const db = await getDb();
  const todayStart = startOfToday();
  const todayIso = todayStart.toISOString().slice(0, 10);

  const [openJobs] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.jobCards)
    .where(
      and(
        eq(s.jobCards.orgId, orgId),
        inArray(s.jobCards.status, ["DRAFT", "ESTIMATE_SENT", "ESTIMATE_APPROVED", "IN_PROGRESS", "COMPLETED"]),
      ),
    );

  const [jobsToday] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.jobCards)
    .where(and(eq(s.jobCards.orgId, orgId), gte(s.jobCards.createdAt, todayStart)));

  const [revenueToday] = await db
    .select({ total: sql<number>`coalesce(sum(${s.payments.amountMinor}), 0)::bigint` })
    .from(s.payments)
    .where(and(eq(s.payments.orgId, orgId), gte(s.payments.receivedAt, todayStart)));

  // What customers owe us on issued invoices.
  const [receivables] = await db
    .select({ total: sql<number>`coalesce(sum(${s.invoices.balanceMinor}), 0)::bigint` })
    .from(s.invoices)
    .where(
      and(eq(s.invoices.orgId, orgId), inArray(s.invoices.status, ["ISSUED", "PARTIALLY_PAID", "OVERDUE"])),
    );

  /**
   * Money the shop has FRONTED on parts bought for customers and not yet
   * recovered FROM THE CUSTOMER. This is not revenue and not inventory - it is
   * the shop's own cash sitting on somebody else's car, and it is invisible in
   * most workshop software, which is exactly why it leaks.
   *
   * Note this is deliberately NOT (total - paid) on the purchase: that figure
   * is what the shop still owes its supplier, which is the opposite direction
   * of money. Recovery is tracked through the customer's invoice, so a
   * pass-through part counts as outstanding until the invoice covering its job
   * card is fully paid.
   */
  const [reimbursables] = await db
    .select({ total: sql<number>`coalesce(sum(${s.purchases.totalMinor}), 0)::bigint` })
    .from(s.purchases)
    .leftJoin(
      s.invoices,
      and(eq(s.invoices.jobCardId, s.purchases.jobCardId), sql`${s.invoices.status} <> 'CANCELLED'`),
    )
    .where(
      and(
        eq(s.purchases.orgId, orgId),
        eq(s.purchases.isPassThrough, true),
        // Not billed yet, or billed but not settled in full.
        sql`(${s.invoices.id} is null or ${s.invoices.status} <> 'PAID')`,
      ),
    );

  // Stock on hand is derived from the append-only ledger, never stored.
  const onHand = db
    .select({
      itemId: s.stockLedger.itemId,
      qty: sql<number>`sum(${s.stockLedger.quantityBase})`.as("qty"),
    })
    .from(s.stockLedger)
    .where(eq(s.stockLedger.orgId, orgId))
    .groupBy(s.stockLedger.itemId)
    .as("on_hand");

  const [lowStock] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.inventoryItems)
    .leftJoin(onHand, eq(onHand.itemId, s.inventoryItems.id))
    .where(
      and(
        eq(s.inventoryItems.orgId, orgId),
        eq(s.inventoryItems.isActive, true),
        eq(s.inventoryItems.trackStock, true),
        sql`coalesce(${onHand.qty}, 0) <= ${s.inventoryItems.reorderLevelBase}`,
      ),
    );

  const [clientCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.clients)
    .where(eq(s.clients.orgId, orgId));

  const [vehicleCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.vehicles)
    .where(eq(s.vehicles.orgId, orgId));

  return {
    openJobs: openJobs?.n ?? 0,
    jobsToday: jobsToday?.n ?? 0,
    revenueToday: Number(revenueToday?.total ?? 0),
    receivables: Number(receivables?.total ?? 0),
    reimbursablesOutstanding: Number(reimbursables?.total ?? 0),
    lowStockCount: lowStock?.n ?? 0,
    clientCount: clientCount?.n ?? 0,
    vehicleCount: vehicleCount?.n ?? 0,
  };
}

export type RecentJob = {
  id: string;
  jobNumber: string;
  status: string;
  kind: string;
  registration: string;
  clientName: string;
  totalMinor: number;
  createdAt: Date;
};

export async function getRecentJobs(orgId: string, limit = 6): Promise<RecentJob[]> {
  const db = await getDb();
  return db
    .select({
      id: s.jobCards.id,
      jobNumber: s.jobCards.jobNumber,
      status: s.jobCards.status,
      kind: s.jobCards.kind,
      registration: s.vehicles.registrationNumber,
      clientName: s.clients.name,
      totalMinor: s.jobCards.totalMinor,
      createdAt: s.jobCards.createdAt,
    })
    .from(s.jobCards)
    .innerJoin(s.vehicles, eq(s.vehicles.id, s.jobCards.vehicleId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobCards.clientId))
    .where(eq(s.jobCards.orgId, orgId))
    .orderBy(sql`${s.jobCards.createdAt} desc`)
    .limit(limit);
}
