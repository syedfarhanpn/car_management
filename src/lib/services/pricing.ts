import "server-only";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";

/**
 * PRICE RESOLUTION
 *
 * Most specific match wins. A row scores by how narrowly it targets:
 *
 *   4  this client, this exact model   (fleet deal on their Innovas)
 *   3  this client, this size class    (corporate rate card)
 *   2  any client, this exact model    (a model that is genuinely harder)
 *   1  any client, this size class     (the published rate — the common case)
 *
 * Expressed as ORDER BY on a stored `specificity` column rather than a CASE
 * over four nullable columns, so the query plan stays trivial and the rule is
 * legible to whoever reads it next.
 */
export async function resolveServicePrice({
  orgId,
  serviceId,
  vehicleClassId,
  vehicleModelId,
  clientId,
  on = new Date(),
}: {
  orgId: string;
  serviceId: string;
  vehicleClassId: string | null;
  vehicleModelId?: string | null;
  clientId?: string | null;
  on?: Date;
}): Promise<number | null> {
  const db = await getDb();
  const day = on.toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(s.servicePrices)
    .where(
      and(
        eq(s.servicePrices.orgId, orgId),
        eq(s.servicePrices.serviceId, serviceId),
        // Each dimension must either match, or be a wildcard on the price row.
        or(isNull(s.servicePrices.clientId), clientId ? eq(s.servicePrices.clientId, clientId) : sql`false`),
        or(
          isNull(s.servicePrices.vehicleModelId),
          vehicleModelId ? eq(s.servicePrices.vehicleModelId, vehicleModelId) : sql`false`,
        ),
        or(
          isNull(s.servicePrices.vehicleClassId),
          vehicleClassId ? eq(s.servicePrices.vehicleClassId, vehicleClassId) : sql`false`,
        ),
        or(isNull(s.servicePrices.effectiveFrom), sql`${s.servicePrices.effectiveFrom} <= ${day}`),
        or(isNull(s.servicePrices.effectiveTo), sql`${s.servicePrices.effectiveTo} >= ${day}`),
      ),
    )
    .orderBy(sql`${s.servicePrices.specificity} desc, ${s.servicePrices.effectiveFrom} desc nulls last`)
    .limit(1);

  return rows[0] ? Number(rows[0].priceMinor) : null;
}

/** Resolve prices for a whole catalogue at once — used by the job card picker. */
export async function resolvePriceList({
  orgId,
  vehicleClassId,
  clientId,
}: {
  orgId: string;
  vehicleClassId: string | null;
  clientId?: string | null;
}): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({
      serviceId: s.servicePrices.serviceId,
      priceMinor: s.servicePrices.priceMinor,
      specificity: s.servicePrices.specificity,
    })
    .from(s.servicePrices)
    .where(
      and(
        eq(s.servicePrices.orgId, orgId),
        or(isNull(s.servicePrices.clientId), clientId ? eq(s.servicePrices.clientId, clientId) : sql`false`),
        or(
          isNull(s.servicePrices.vehicleClassId),
          vehicleClassId ? eq(s.servicePrices.vehicleClassId, vehicleClassId) : sql`false`,
        ),
      ),
    )
    .orderBy(sql`${s.servicePrices.specificity} asc`);

  // Ascending specificity means a more specific row overwrites a broader one.
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.serviceId, Number(r.priceMinor));
  return out;
}

/**
 * The full matrix for the settings editor: every service x every class.
 * Returns only specificity-1 rows, which is what the grid edits.
 */
export async function getPriceMatrix(orgId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      id: s.servicePrices.id,
      serviceId: s.servicePrices.serviceId,
      vehicleClassId: s.servicePrices.vehicleClassId,
      priceMinor: s.servicePrices.priceMinor,
    })
    .from(s.servicePrices)
    .where(and(eq(s.servicePrices.orgId, orgId), eq(s.servicePrices.specificity, 1)));

  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.vehicleClassId) map.set(`${r.serviceId}:${r.vehicleClassId}`, Number(r.priceMinor));
  }
  return map;
}

export async function upsertMatrixPrice({
  orgId,
  serviceId,
  vehicleClassId,
  priceMinor,
}: {
  orgId: string;
  serviceId: string;
  vehicleClassId: string;
  priceMinor: number;
}) {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(s.servicePrices)
    .where(
      and(
        eq(s.servicePrices.orgId, orgId),
        eq(s.servicePrices.serviceId, serviceId),
        eq(s.servicePrices.vehicleClassId, vehicleClassId),
        eq(s.servicePrices.specificity, 1),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(s.servicePrices)
      .set({ priceMinor, updatedAt: new Date() })
      .where(eq(s.servicePrices.id, existing.id));
  } else {
    await db.insert(s.servicePrices).values({
      orgId,
      serviceId,
      vehicleClassId,
      specificity: 1,
      priceMinor,
    });
  }
}
