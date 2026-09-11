import "server-only";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number) {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}

/** Percentage change, guarding the divide-by-zero that a first day always hits. */
function delta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export type DashboardStats = {
  vehiclesToday: number;
  vehiclesTodayDelta: number | null;
  activeJobs: number;
  unassignedJobs: number;
  readyForDelivery: number;
  revenueToday: number;
  revenueTodayDelta: number | null;
  receivables: number;
  reimbursablesOutstanding: number;
  lowStockCount: number;
  clientCount: number;
  vehicleCount: number;
};

const OPEN_STATUSES = ["DRAFT", "ESTIMATE_SENT", "ESTIMATE_APPROVED", "IN_PROGRESS"] as const;

export async function getDashboardStats(orgId: string): Promise<DashboardStats> {
  const db = await getDb();
  const todayStart = startOfToday();
  const yesterdayStart = daysAgo(1);

  const [
    today,
    yesterday,
    active,
    ready,
    revToday,
    revYesterday,
    receivables,
    reimbursables,
    lowStock,
    counts,
  ] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.jobCards)
      .where(and(eq(s.jobCards.orgId, orgId), gte(s.jobCards.createdAt, todayStart)))
      .then((r) => r[0]?.n ?? 0),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.jobCards)
      .where(
        and(
          eq(s.jobCards.orgId, orgId),
          gte(s.jobCards.createdAt, yesterdayStart),
          lt(s.jobCards.createdAt, todayStart),
        ),
      )
      .then((r) => r[0]?.n ?? 0),

    db
      .select({
        n: sql<number>`count(*)::int`,
        unassigned: sql<number>`count(*) filter (where ${s.jobCards.assignedToId} is null)::int`,
      })
      .from(s.jobCards)
      .where(and(eq(s.jobCards.orgId, orgId), inArray(s.jobCards.status, [...OPEN_STATUSES])))
      .then((r) => r[0] ?? { n: 0, unassigned: 0 }),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.jobCards)
      .where(and(eq(s.jobCards.orgId, orgId), eq(s.jobCards.status, "COMPLETED")))
      .then((r) => r[0]?.n ?? 0),

    db
      .select({ total: sql<string>`coalesce(sum(${s.payments.amountMinor}), 0)` })
      .from(s.payments)
      .where(and(eq(s.payments.orgId, orgId), gte(s.payments.receivedAt, todayStart)))
      .then((r) => Number(r[0]?.total ?? 0)),

    db
      .select({ total: sql<string>`coalesce(sum(${s.payments.amountMinor}), 0)` })
      .from(s.payments)
      .where(
        and(
          eq(s.payments.orgId, orgId),
          gte(s.payments.receivedAt, yesterdayStart),
          lt(s.payments.receivedAt, todayStart),
        ),
      )
      .then((r) => Number(r[0]?.total ?? 0)),

    db
      .select({ total: sql<string>`coalesce(sum(${s.invoices.balanceMinor}), 0)` })
      .from(s.invoices)
      .where(and(eq(s.invoices.orgId, orgId), sql`${s.invoices.status} in ('ISSUED','PARTIALLY_PAID','OVERDUE')`))
      .then((r) => Number(r[0]?.total ?? 0)),

    /**
     * Money the shop has FRONTED on parts bought for customers and not yet
     * recovered FROM THE CUSTOMER — tracked through their invoice, not through
     * paying the supplier, which is money going the other way.
     */
    db
      .select({ total: sql<string>`coalesce(sum(${s.purchases.totalMinor}), 0)` })
      .from(s.purchases)
      .leftJoin(
        s.invoices,
        and(eq(s.invoices.jobCardId, s.purchases.jobCardId), sql`${s.invoices.status} <> 'CANCELLED'`),
      )
      .where(
        and(
          eq(s.purchases.orgId, orgId),
          eq(s.purchases.isPassThrough, true),
          sql`(${s.invoices.id} is null or ${s.invoices.status} <> 'PAID')`,
        ),
      )
      .then((r) => Number(r[0]?.total ?? 0)),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.inventoryItems)
      .leftJoin(
        db
          .select({
            itemId: s.stockLedger.itemId,
            qty: sql<number>`sum(${s.stockLedger.quantityBase})`.as("qty"),
          })
          .from(s.stockLedger)
          .where(eq(s.stockLedger.orgId, orgId))
          .groupBy(s.stockLedger.itemId)
          .as("on_hand"),
        sql`on_hand.item_id = ${s.inventoryItems.id}`,
      )
      .where(
        and(
          eq(s.inventoryItems.orgId, orgId),
          eq(s.inventoryItems.isActive, true),
          eq(s.inventoryItems.trackStock, true),
          sql`coalesce(on_hand.qty, 0) <= ${s.inventoryItems.reorderLevelBase}`,
        ),
      )
      .then((r) => r[0]?.n ?? 0),

    db
      .select({
        clients: sql<number>`(select count(*)::int from ${s.clients} where ${s.clients.orgId} = ${orgId})`,
        vehicles: sql<number>`(select count(*)::int from ${s.vehicles} where ${s.vehicles.orgId} = ${orgId})`,
      })
      .from(s.organizations)
      .where(eq(s.organizations.id, orgId))
      .limit(1)
      .then((r) => r[0] ?? { clients: 0, vehicles: 0 }),
  ]);

  return {
    vehiclesToday: today,
    vehiclesTodayDelta: delta(today, yesterday),
    activeJobs: active.n,
    unassignedJobs: active.unassigned,
    readyForDelivery: ready,
    revenueToday: revToday,
    revenueTodayDelta: delta(revToday, revYesterday),
    receivables,
    reimbursablesOutstanding: reimbursables,
    lowStockCount: lowStock,
    clientCount: counts.clients,
    vehicleCount: counts.vehicles,
  };
}

/** Live count per job status, for the workload bars. */
export async function getWorkload(orgId: string) {
  const db = await getDb();
  const rows = await db
    .select({ status: s.jobCards.status, n: sql<number>`count(*)::int` })
    .from(s.jobCards)
    .where(and(eq(s.jobCards.orgId, orgId), sql`${s.jobCards.status} <> 'CANCELLED'`))
    .groupBy(s.jobCards.status);

  return new Map(rows.map((r) => [r.status as string, r.n]));
}

export type ActiveJob = {
  id: string;
  jobNumber: string;
  status: string;
  registration: string;
  make: string | null;
  model: string | null;
  clientName: string;
  services: string;
  serviceCount: number;
  assignedTo: string | null;
  totalMinor: number;
};

export async function getActiveJobs(orgId: string, limit = 6): Promise<ActiveJob[]> {
  const db = await getDb();

  const rows = await db
    .select({
      id: s.jobCards.id,
      jobNumber: s.jobCards.jobNumber,
      status: s.jobCards.status,
      registration: s.vehicles.registrationNumber,
      make: s.vehicleModels.make,
      model: s.vehicleModels.model,
      clientName: s.clients.name,
      assignedTo: s.users.name,
      totalMinor: s.jobCards.totalMinor,
      createdAt: s.jobCards.createdAt,
    })
    .from(s.jobCards)
    .innerJoin(s.vehicles, eq(s.vehicles.id, s.jobCards.vehicleId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobCards.clientId))
    .leftJoin(s.vehicleModels, eq(s.vehicleModels.id, s.vehicles.modelId))
    .leftJoin(s.users, eq(s.users.id, s.jobCards.assignedToId))
    .where(
      and(
        eq(s.jobCards.orgId, orgId),
        inArray(s.jobCards.status, [...OPEN_STATUSES, "COMPLETED"]),
      ),
    )
    .orderBy(desc(s.jobCards.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  // One extra query for the service names rather than N — the list is short,
  // but this is the kind of loop that quietly becomes slow with real volume.
  const lines = await db
    .select({ jobCardId: s.jobCardLines.jobCardId, description: s.jobCardLines.description })
    .from(s.jobCardLines)
    .where(
      and(
        eq(s.jobCardLines.lineType, "SERVICE"),
        inArray(
          s.jobCardLines.jobCardId,
          rows.map((r) => r.id),
        ),
      ),
    );

  const byJob = new Map<string, string[]>();
  for (const l of lines) {
    const list = byJob.get(l.jobCardId) ?? [];
    list.push(l.description);
    byJob.set(l.jobCardId, list);
  }

  return rows.map((r) => {
    const names = byJob.get(r.id) ?? [];
    return {
      id: r.id,
      jobNumber: r.jobNumber,
      status: r.status,
      registration: r.registration,
      make: r.make,
      model: r.model,
      clientName: r.clientName,
      services: names.length === 0 ? "No services yet" : names[0],
      serviceCount: names.length,
      assignedTo: r.assignedTo,
      totalMinor: Number(r.totalMinor),
    };
  });
}

export type RevenueDay = { label: string; date: string; amountMinor: number };

/** Collections per day for the last 7 days, oldest first. */
export async function getRevenueWeek(orgId: string): Promise<RevenueDay[]> {
  const db = await getDb();
  const from = daysAgo(6);

  const rows = await db
    .select({
      day: sql<string>`to_char(${s.payments.receivedAt}, 'YYYY-MM-DD')`,
      total: sql<string>`sum(${s.payments.amountMinor})`,
    })
    .from(s.payments)
    .where(and(eq(s.payments.orgId, orgId), gte(s.payments.receivedAt, from)))
    .groupBy(sql`to_char(${s.payments.receivedAt}, 'YYYY-MM-DD')`);

  const totals = new Map(rows.map((r) => [r.day, Number(r.total)]));

  // Build all seven days so a quiet day renders as an empty bar rather than
  // vanishing and making the week look shorter than it was.
  const out: RevenueDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = daysAgo(i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({
      label: d.toLocaleDateString("en-IN", { weekday: "short" }),
      date: key,
      amountMinor: totals.get(key) ?? 0,
    });
  }
  return out;
}

export type PopularService = { name: string; jobs: number };

export async function getPopularServices(orgId: string, limit = 6): Promise<PopularService[]> {
  const db = await getDb();
  const from = daysAgo(90);

  const rows = await db
    .select({
      name: s.services.name,
      jobs: sql<number>`count(*)::int`,
    })
    .from(s.jobCardLines)
    .innerJoin(s.jobCards, eq(s.jobCards.id, s.jobCardLines.jobCardId))
    .innerJoin(s.services, eq(s.services.id, s.jobCardLines.serviceId))
    .where(
      and(
        eq(s.jobCardLines.orgId, orgId),
        eq(s.jobCardLines.lineType, "SERVICE"),
        gte(s.jobCards.createdAt, from),
      ),
    )
    .groupBy(s.services.name)
    .orderBy(sql`count(*) desc`)
    .limit(limit);

  return rows;
}

export type ScheduleItem = {
  id: string;
  time: string;
  registration: string;
  vehicle: string;
  service: string;
  extraServices: number;
  assignedTo: string | null;
};

/**
 * What is promised out today. Falls back to jobs opened today when nothing
 * carries a promised time, so the panel is useful before anyone starts
 * filling that field in.
 */
export async function getTodaySchedule(orgId: string, limit = 5): Promise<ScheduleItem[]> {
  const db = await getDb();
  const todayStart = startOfToday();
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const rows = await db
    .select({
      id: s.jobCards.id,
      promisedAt: s.jobCards.promisedAt,
      createdAt: s.jobCards.createdAt,
      registration: s.vehicles.registrationNumber,
      make: s.vehicleModels.make,
      model: s.vehicleModels.model,
      modelText: s.vehicles.modelText,
      assignedTo: s.users.name,
    })
    .from(s.jobCards)
    .innerJoin(s.vehicles, eq(s.vehicles.id, s.jobCards.vehicleId))
    .leftJoin(s.vehicleModels, eq(s.vehicleModels.id, s.vehicles.modelId))
    .leftJoin(s.users, eq(s.users.id, s.jobCards.assignedToId))
    .where(
      and(
        eq(s.jobCards.orgId, orgId),
        inArray(s.jobCards.status, [...OPEN_STATUSES, "COMPLETED"]),
        gte(s.jobCards.createdAt, todayStart),
      ),
    )
    .orderBy(s.jobCards.createdAt)
    .limit(limit);

  if (rows.length === 0) return [];

  const lines = await db
    .select({ jobCardId: s.jobCardLines.jobCardId, description: s.jobCardLines.description })
    .from(s.jobCardLines)
    .where(
      and(
        eq(s.jobCardLines.lineType, "SERVICE"),
        inArray(
          s.jobCardLines.jobCardId,
          rows.map((r) => r.id),
        ),
      ),
    );

  const byJob = new Map<string, string[]>();
  for (const l of lines) {
    const list = byJob.get(l.jobCardId) ?? [];
    list.push(l.description);
    byJob.set(l.jobCardId, list);
  }

  return rows.map((r) => {
    const names = byJob.get(r.id) ?? [];
    const when = r.promisedAt ?? r.createdAt;
    return {
      id: r.id,
      time: when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }),
      registration: r.registration,
      vehicle: r.make && r.model ? `${r.make} ${r.model}` : (r.modelText ?? "Vehicle"),
      service: names[0] ?? "No services yet",
      extraServices: Math.max(0, names.length - 1),
      assignedTo: r.assignedTo,
    };
  });
}
