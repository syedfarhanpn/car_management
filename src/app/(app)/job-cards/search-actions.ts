"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { searchVehicles, type VehicleHit } from "@/lib/services/search";
import { normalizePhone } from "@/lib/phone";
import { normalizeRegistration, registrationLast4 } from "@/lib/vehicle";

export async function lookupVehicles(query: string): Promise<VehicleHit[]> {
  const user = await requireUser();
  return searchVehicles(user.orgId, query);
}

export type QuickCreateResult =
  | { ok: true; vehicleId: string }
  | { ok: false; error: string };

/**
 * The "no match" path at the counter: a walk-in whose car has never been here.
 * Creating the client and the vehicle in one step matters — the alternative is
 * a half-finished client record when the phone rings mid-entry.
 */
export async function quickCreateClientAndVehicle(input: {
  name: string;
  phone: string;
  email?: string;
  registrationNumber: string;
  vehicleClassId: string;
  modelId?: string;
  modelText?: string;
  color?: string;
  odometerKm?: string;
}): Promise<QuickCreateResult> {
  const user = await requireUser();
  const db = await getDb();

  if (input.name.trim().length < 2) return { ok: false, error: "Enter the customer name" };
  const phone = normalizePhone(input.phone);
  if (!/^\+91[6-9]\d{9}$/.test(phone)) return { ok: false, error: "Enter a valid 10-digit mobile number" };
  if (!input.vehicleClassId) return { ok: false, error: "Select a vehicle class" };

  const regNormalized = normalizeRegistration(input.registrationNumber);
  if (regNormalized.length < 4) return { ok: false, error: "Enter the full registration number" };

  const [existingVehicle] = await db
    .select({ id: s.vehicles.id })
    .from(s.vehicles)
    .where(eq(s.vehicles.regNormalized, regNormalized))
    .limit(1);
  if (existingVehicle) return { ok: false, error: "That registration number is already on record" };

  // Reuse the client if the number is already known — a returning customer
  // buying a second car should not become a second customer.
  const existingClients = await db.select().from(s.clients).where(eq(s.clients.orgId, user.orgId));
  const match = existingClients.find((c) => c.phone === phone);

  let clientId = match?.id;
  if (!clientId) {
    const [created] = await db
      .insert(s.clients)
      .values({
        orgId: user.orgId,
        name: input.name.trim(),
        phone,
        email: input.email?.trim() || null,
        city: "Kochi",
        state: "Kerala",
        createdBy: user.id,
      })
      .returning();
    clientId = created.id;
  }

  const [vehicle] = await db
    .insert(s.vehicles)
    .values({
      orgId: user.orgId,
      registrationNumber: input.registrationNumber.toUpperCase().trim(),
      regNormalized,
      regLast4: registrationLast4(input.registrationNumber),
      modelId: input.modelId || null,
      modelText: input.modelText || null,
      vehicleClassId: input.vehicleClassId,
      color: input.color || null,
      lastOdometerKm: input.odometerKm ? Number(input.odometerKm) : null,
      currentClientId: clientId,
    })
    .returning();

  await db.insert(s.vehicleOwnerships).values({
    orgId: user.orgId,
    vehicleId: vehicle.id,
    clientId,
    fromDate: new Date().toISOString().slice(0, 10),
  });

  return { ok: true, vehicleId: vehicle.id };
}
