import "server-only";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { normalizeRegistration } from "@/lib/vehicle";

export type VehicleHit = {
  vehicleId: string;
  registration: string;
  regNormalized: string;
  color: string | null;
  vehicleClassId: string | null;
  className: string | null;
  modelId: string | null;
  make: string | null;
  model: string | null;
  lastOdometerKm: number | null;
  clientId: string | null;
  clientName: string | null;
  clientPhone: string | null;
};

/**
 * THE COUNTER SEARCH.
 *
 * One box, four behaviours, because the person at the desk should not have to
 * choose a search mode while holding a customer's key:
 *
 *   "4521"        last four digits of the plate  (the primary path)
 *   "KL07CH4521"  full or partial registration
 *   "9847012345"  phone number
 *   "Rahul"       client name
 *
 * Returns EVERY match rather than the best one. Two customers genuinely can
 * share the last four digits - the seed has exactly that case - and silently
 * auto-selecting the first is how the wrong person gets billed for someone
 * else's ceramic coating.
 */
export async function searchVehicles(orgId: string, rawQuery: string, limit = 12): Promise<VehicleHit[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const db = await getDb();
  const normalized = normalizeRegistration(query);
  const digitsOnly = /^\d{1,4}$/.test(query);
  const digits = query.replace(/\D/g, "");

  const conditions = [
    // Last-4 exact match: the fast path staff use all day.
    digitsOnly ? eq(s.vehicles.regLast4, query.padStart(4, "0")) : undefined,
    digitsOnly ? eq(s.vehicles.regLast4, query) : undefined,
    // Partial plate anywhere in the normalised registration.
    normalized.length >= 2 ? ilike(s.vehicles.regNormalized, `%${normalized}%`) : undefined,
    ilike(s.clients.name, `%${query}%`),
    // Only match on phone when the query actually contains digits. Without
    // this guard a name search strips to "" and the pattern becomes '%%',
    // which matches every phone in the table and returns the whole database.
    digits.length >= 3 ? ilike(s.clients.phone, `%${digits}%`) : undefined,
  ].filter(Boolean);

  return db
    .select({
      vehicleId: s.vehicles.id,
      registration: s.vehicles.registrationNumber,
      regNormalized: s.vehicles.regNormalized,
      color: s.vehicles.color,
      vehicleClassId: s.vehicles.vehicleClassId,
      className: s.vehicleClasses.name,
      modelId: s.vehicles.modelId,
      make: s.vehicleModels.make,
      model: s.vehicleModels.model,
      lastOdometerKm: s.vehicles.lastOdometerKm,
      clientId: s.clients.id,
      clientName: s.clients.name,
      clientPhone: s.clients.phone,
    })
    .from(s.vehicles)
    .leftJoin(s.clients, eq(s.clients.id, s.vehicles.currentClientId))
    .leftJoin(s.vehicleModels, eq(s.vehicleModels.id, s.vehicles.modelId))
    .leftJoin(s.vehicleClasses, eq(s.vehicleClasses.id, s.vehicles.vehicleClassId))
    .where(and(eq(s.vehicles.orgId, orgId), sql`${s.vehicles.archivedAt} is null`, or(...conditions)))
    .orderBy(sql`${s.vehicles.registrationNumber} asc`)
    .limit(limit);
}

export type ClientHit = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  type: string;
  vehicleCount: number;
  outstandingMinor: number;
};

export async function searchClients(orgId: string, rawQuery: string, limit = 50): Promise<ClientHit[]> {
  const db = await getDb();
  const query = rawQuery.trim();

  const vehicleCounts = db
    .select({
      clientId: s.vehicles.currentClientId,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(s.vehicles)
    .where(eq(s.vehicles.orgId, orgId))
    .groupBy(s.vehicles.currentClientId)
    .as("vehicle_counts");

  const outstanding = db
    .select({
      clientId: s.invoices.clientId,
      total: sql<string>`sum(${s.invoices.balanceMinor})`.as("total"),
    })
    .from(s.invoices)
    .where(and(eq(s.invoices.orgId, orgId), sql`${s.invoices.status} in ('ISSUED','PARTIALLY_PAID','OVERDUE')`))
    .groupBy(s.invoices.clientId)
    .as("outstanding");

  const rows = await db
    .select({
      id: s.clients.id,
      name: s.clients.name,
      phone: s.clients.phone,
      email: s.clients.email,
      type: s.clients.type,
      vehicleCount: sql<number>`coalesce(${vehicleCounts.n}, 0)::int`,
      outstandingMinor: sql<string>`coalesce(${outstanding.total}, 0)`,
    })
    .from(s.clients)
    .leftJoin(vehicleCounts, eq(vehicleCounts.clientId, s.clients.id))
    .leftJoin(outstanding, eq(outstanding.clientId, s.clients.id))
    .where(
      and(
        eq(s.clients.orgId, orgId),
        sql`${s.clients.archivedAt} is null`,
        query.length > 0
          ? or(
              ilike(s.clients.name, `%${query}%`),
              // Same guard as above: a digit-free query must not become '%%'.
              ...(query.replace(/\D/g, "").length >= 3
                ? [ilike(s.clients.phone, `%${query.replace(/\D/g, "")}%`)]
                : []),
            )
          : undefined,
      ),
    )
    .orderBy(sql`${s.clients.name} asc`)
    .limit(limit);

  return rows.map((r) => ({ ...r, outstandingMinor: Number(r.outstandingMinor) }));
}
