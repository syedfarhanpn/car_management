"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isValidIndianMobile, normalizePhone } from "@/lib/phone";
import { normalizeRegistration, registrationLast4 } from "@/lib/vehicle";
import { toMinor } from "@/lib/money";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

const clientSchema = z.object({
  name: z.string().trim().min(2, "Enter the client name"),
  phone: z.string().trim().refine(isValidIndianMobile, "Enter a valid 10-digit mobile number"),
  email: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]).optional(),
  type: z.enum(["INDIVIDUAL", "CORPORATE"]).default("INDIVIDUAL"),
  gstin: z.string().trim().optional(),
  addressLine1: z.string().trim().optional(),
  city: z.string().trim().optional(),
  creditLimit: z.string().trim().optional(),
  creditDays: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

const vehicleSchema = z.object({
  registrationNumber: z
    .string()
    .trim()
    .min(4, "Enter the registration number")
    .refine((v) => /\d/.test(v), "Registration must contain digits"),
  modelId: z.string().uuid().optional().or(z.literal("")),
  makeText: z.string().trim().optional(),
  modelText: z.string().trim().optional(),
  vehicleClassId: z.string().uuid("Select a vehicle class"),
  color: z.string().trim().optional(),
  manufactureYear: z.string().trim().optional(),
  odometerKm: z.string().trim().optional(),
});

function fd(formData: FormData) {
  return Object.fromEntries(formData.entries()) as Record<string, string>;
}

export async function createClient(_prev: unknown, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = clientSchema.safeParse(fd(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const db = await getDb();
  const phone = normalizePhone(parsed.data.phone);

  // The unique index would catch this, but a clear message beats a 500 and
  // stops staff creating a second record for a customer who already exists.
  const [existing] = await db
    .select({ id: s.clients.id, name: s.clients.name })
    .from(s.clients)
    .where(and(eq(s.clients.orgId, user.orgId), eq(s.clients.phone, phone)))
    .limit(1);
  if (existing) return { ok: false, error: `${existing.name} is already registered on this number` };

  const [client] = await db
    .insert(s.clients)
    .values({
      orgId: user.orgId,
      name: parsed.data.name,
      phone,
      email: parsed.data.email || null,
      type: parsed.data.type,
      gstin: parsed.data.gstin || null,
      addressLine1: parsed.data.addressLine1 || null,
      city: parsed.data.city || null,
      creditLimitMinor: parsed.data.creditLimit ? toMinor(parsed.data.creditLimit) : 0,
      creditDays: parsed.data.creditDays ? Number(parsed.data.creditDays) : 0,
      notes: parsed.data.notes || null,
      createdBy: user.id,
    })
    .returning();

  revalidatePath("/clients");
  return { ok: true, data: { id: client.id } };
}

export async function updateClient(clientId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = clientSchema.safeParse(fd(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const db = await getDb();
  await db
    .update(s.clients)
    .set({
      name: parsed.data.name,
      phone: normalizePhone(parsed.data.phone),
      email: parsed.data.email || null,
      type: parsed.data.type,
      gstin: parsed.data.gstin || null,
      addressLine1: parsed.data.addressLine1 || null,
      city: parsed.data.city || null,
      creditLimitMinor: parsed.data.creditLimit ? toMinor(parsed.data.creditLimit) : 0,
      creditDays: parsed.data.creditDays ? Number(parsed.data.creditDays) : 0,
      notes: parsed.data.notes || null,
      updatedAt: new Date(),
    })
    .where(and(eq(s.clients.id, clientId), eq(s.clients.orgId, user.orgId)));

  revalidatePath(`/clients/${clientId}`);
  return { ok: true, data: undefined };
}

export async function addVehicle(clientId: string, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = vehicleSchema.safeParse(fd(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const db = await getDb();
  const regNormalized = normalizeRegistration(parsed.data.registrationNumber);

  const [existing] = await db
    .select({ id: s.vehicles.id, reg: s.vehicles.registrationNumber })
    .from(s.vehicles)
    .where(and(eq(s.vehicles.orgId, user.orgId), eq(s.vehicles.regNormalized, regNormalized)))
    .limit(1);
  if (existing) return { ok: false, error: `${existing.reg} is already on record` };

  const [vehicle] = await db
    .insert(s.vehicles)
    .values({
      orgId: user.orgId,
      registrationNumber: parsed.data.registrationNumber.toUpperCase().trim(),
      regNormalized,
      regLast4: registrationLast4(parsed.data.registrationNumber),
      modelId: parsed.data.modelId || null,
      makeText: parsed.data.makeText || null,
      modelText: parsed.data.modelText || null,
      vehicleClassId: parsed.data.vehicleClassId,
      color: parsed.data.color || null,
      manufactureYear: parsed.data.manufactureYear ? Number(parsed.data.manufactureYear) : null,
      lastOdometerKm: parsed.data.odometerKm ? Number(parsed.data.odometerKm) : null,
      currentClientId: clientId,
    })
    .returning();

  // Ownership is a history table — the current owner is the open-ended row.
  await db.insert(s.vehicleOwnerships).values({
    orgId: user.orgId,
    vehicleId: vehicle.id,
    clientId,
    fromDate: new Date().toISOString().slice(0, 10),
  });

  revalidatePath(`/clients/${clientId}`);
  return { ok: true, data: { id: vehicle.id } };
}

/**
 * Transfer a car to a new owner. Closes the previous ownership row rather than
 * overwriting it, so the outgoing owner's invoices still make sense and the
 * incoming owner inherits the service history attached to the vehicle.
 */
export async function transferVehicle(vehicleId: string, newClientId: string): Promise<ActionResult> {
  const user = await requireUser();
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);

  const [vehicle] = await db
    .select()
    .from(s.vehicles)
    .where(and(eq(s.vehicles.id, vehicleId), eq(s.vehicles.orgId, user.orgId)))
    .limit(1);
  if (!vehicle) return { ok: false, error: "Vehicle not found" };
  if (vehicle.currentClientId === newClientId) return { ok: false, error: "Already owned by that client" };

  const open = await db
    .select()
    .from(s.vehicleOwnerships)
    .where(and(eq(s.vehicleOwnerships.vehicleId, vehicleId), eq(s.vehicleOwnerships.orgId, user.orgId)));

  for (const row of open.filter((r) => r.toDate === null)) {
    await db.update(s.vehicleOwnerships).set({ toDate: today }).where(eq(s.vehicleOwnerships.id, row.id));
  }

  await db.insert(s.vehicleOwnerships).values({
    orgId: user.orgId,
    vehicleId,
    clientId: newClientId,
    fromDate: today,
  });

  await db.update(s.vehicles).set({ currentClientId: newClientId, updatedAt: new Date() }).where(eq(s.vehicles.id, vehicleId));

  revalidatePath(`/clients/${newClientId}`);
  if (vehicle.currentClientId) revalidatePath(`/clients/${vehicle.currentClientId}`);
  return { ok: true, data: undefined };
}
