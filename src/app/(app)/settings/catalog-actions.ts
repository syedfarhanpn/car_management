"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { toMinor } from "@/lib/money";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: string): ActionResult<never> => ({ ok: false, error });

function fields(formData: FormData) {
  return Object.fromEntries(formData.entries()) as Record<string, string>;
}

function bump() {
  revalidatePath("/settings/services");
  revalidatePath("/settings/vehicle-classes");
  revalidatePath("/settings/models");
  revalidatePath("/settings/recipes");
  revalidatePath("/settings/pricing");
  revalidatePath("/job-cards");
}

/* ------------------------------------------------------------------ classes */

const classSchema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  description: z.string().trim().optional(),
  sortOrder: z.string().trim().optional(),
});

export async function saveVehicleClass(id: string | null, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["ADMIN"]);
  const parsed = classSchema.safeParse(fields(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const db = await getDb();
  const values = {
    name: parsed.data.name,
    description: parsed.data.description || null,
    sortOrder: parsed.data.sortOrder ? Number(parsed.data.sortOrder) : 0,
  };

  if (id) {
    await db
      .update(s.vehicleClasses)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(s.vehicleClasses.id, id), eq(s.vehicleClasses.orgId, user.orgId)));
  } else {
    const [created] = await db
      .insert(s.vehicleClasses)
      .values({ orgId: user.orgId, ...values })
      .returning();

    /**
     * A new size band starts with no prices, which would make every service
     * unaddable for cars in it. Seed a blank row per service so the class shows
     * up in the price matrix ready to be filled in, rather than silently
     * missing from the grid.
     */
    const services = await db.select({ id: s.services.id }).from(s.services).where(eq(s.services.orgId, user.orgId));
    if (services.length) {
      await db.insert(s.servicePrices).values(
        services.map((svc) => ({
          orgId: user.orgId,
          serviceId: svc.id,
          vehicleClassId: created.id,
          specificity: 1,
          priceMinor: 0,
        })),
      );
    }
  }

  bump();
  return ok(undefined);
}

export async function archiveVehicleClass(id: string): Promise<ActionResult> {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();

  // Refuse rather than orphan: cars pointing at a missing class lose pricing.
  const [inUse] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.vehicles)
    .where(and(eq(s.vehicles.orgId, user.orgId), eq(s.vehicles.vehicleClassId, id), sql`${s.vehicles.archivedAt} is null`));

  if ((inUse?.n ?? 0) > 0) {
    return fail(`${inUse.n} vehicle(s) are in this class. Move them to another class first.`);
  }

  await db
    .update(s.vehicleClasses)
    .set({ archivedAt: new Date() })
    .where(and(eq(s.vehicleClasses.id, id), eq(s.vehicleClasses.orgId, user.orgId)));

  bump();
  return ok(undefined);
}

/* --------------------------------------------------------------- categories */

const categorySchema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  requiresEstimate: z.string().optional(),
  colorHex: z.string().trim().optional(),
  sortOrder: z.string().trim().optional(),
});

export async function saveServiceCategory(id: string | null, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["ADMIN"]);
  const parsed = categorySchema.safeParse(fields(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const db = await getDb();
  const values = {
    name: parsed.data.name,
    // Drives the estimate-approval flow: repairs need sign-off, washes do not.
    requiresEstimate: parsed.data.requiresEstimate === "on" || parsed.data.requiresEstimate === "true",
    colorHex: parsed.data.colorHex || null,
    sortOrder: parsed.data.sortOrder ? Number(parsed.data.sortOrder) : 0,
  };

  if (id) {
    await db
      .update(s.serviceCategories)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(s.serviceCategories.id, id), eq(s.serviceCategories.orgId, user.orgId)));
  } else {
    await db.insert(s.serviceCategories).values({ orgId: user.orgId, ...values });
  }

  bump();
  return ok(undefined);
}

export async function archiveServiceCategory(id: string): Promise<ActionResult> {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();

  const [inUse] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.services)
    .where(and(eq(s.services.orgId, user.orgId), eq(s.services.categoryId, id), sql`${s.services.archivedAt} is null`));

  if ((inUse?.n ?? 0) > 0) return fail(`${inUse.n} service(s) still use this category.`);

  await db
    .update(s.serviceCategories)
    .set({ archivedAt: new Date() })
    .where(and(eq(s.serviceCategories.id, id), eq(s.serviceCategories.orgId, user.orgId)));

  bump();
  return ok(undefined);
}

/* ----------------------------------------------------------------- services */

const serviceSchema = z.object({
  name: z.string().trim().min(2, "Enter a service name"),
  categoryId: z.string().uuid("Pick a category"),
  sacCode: z.string().trim().optional(),
  gstRate: z.string().trim().optional(),
  estimatedMinutes: z.string().trim().optional(),
  description: z.string().trim().optional(),
  isActive: z.string().optional(),
});

export async function saveService(id: string | null, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["ADMIN"]);
  const parsed = serviceSchema.safeParse(fields(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const gstRate = parsed.data.gstRate ? Number(parsed.data.gstRate) : 18;
  if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) return fail("GST rate must be between 0 and 100");

  const db = await getDb();
  const values = {
    name: parsed.data.name,
    categoryId: parsed.data.categoryId,
    sacCode: parsed.data.sacCode || "998714",
    gstRate,
    estimatedMinutes: parsed.data.estimatedMinutes ? Number(parsed.data.estimatedMinutes) : null,
    description: parsed.data.description || null,
    isActive: parsed.data.isActive !== "false",
  };

  if (id) {
    await db
      .update(s.services)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(s.services.id, id), eq(s.services.orgId, user.orgId)));
  } else {
    const [created] = await db.insert(s.services).values({ orgId: user.orgId, ...values }).returning();

    // Same reasoning as a new class: give the new service a row per class so it
    // appears in the price matrix immediately instead of being invisible.
    const classes = await db
      .select({ id: s.vehicleClasses.id })
      .from(s.vehicleClasses)
      .where(and(eq(s.vehicleClasses.orgId, user.orgId), sql`${s.vehicleClasses.archivedAt} is null`));

    if (classes.length) {
      await db.insert(s.servicePrices).values(
        classes.map((c) => ({
          orgId: user.orgId,
          serviceId: created.id,
          vehicleClassId: c.id,
          specificity: 1,
          priceMinor: toMinor(formData.get("defaultPrice")?.toString() ?? "0"),
        })),
      );
    }
  }

  bump();
  return ok(undefined);
}

export async function archiveService(id: string): Promise<ActionResult> {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();

  /**
   * Archived, never deleted. Job cards and invoices reference this row, and a
   * hard delete would break history that has already been billed. Archiving
   * hides it from the picker while every past record still resolves.
   */
  await db
    .update(s.services)
    .set({ isActive: false, archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(s.services.id, id), eq(s.services.orgId, user.orgId)));

  bump();
  return ok(undefined);
}

export async function restoreService(id: string): Promise<ActionResult> {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();
  await db
    .update(s.services)
    .set({ isActive: true, archivedAt: null, updatedAt: new Date() })
    .where(and(eq(s.services.id, id), eq(s.services.orgId, user.orgId)));
  bump();
  return ok(undefined);
}

/* ------------------------------------------------------------------- models */

const modelSchema = z.object({
  make: z.string().trim().min(1, "Enter the make"),
  model: z.string().trim().min(1, "Enter the model"),
  variant: z.string().trim().optional(),
  vehicleClassId: z.string().uuid("Pick a vehicle class"),
  fuelType: z.string().trim().optional(),
  engineOilGrade: z.string().trim().optional(),
  engineOilCapacityMl: z.string().trim().optional(),
  oilFilterPartNo: z.string().trim().optional(),
  airFilterPartNo: z.string().trim().optional(),
  cabinFilterPartNo: z.string().trim().optional(),
});

export async function saveVehicleModel(id: string | null, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["ADMIN"]);
  const parsed = modelSchema.safeParse(fields(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const db = await getDb();
  const values = {
    make: parsed.data.make,
    model: parsed.data.model,
    variant: parsed.data.variant || null,
    vehicleClassId: parsed.data.vehicleClassId,
    fuelType: parsed.data.fuelType || null,
    engineOilGrade: parsed.data.engineOilGrade || null,
    // Entered in litres because that is how a workshop thinks; stored in ml
    // because that is the base unit the consumable ledger counts in.
    engineOilCapacityMl: parsed.data.engineOilCapacityMl
      ? Math.round(Number(parsed.data.engineOilCapacityMl) * 1000)
      : null,
    oilFilterPartNo: parsed.data.oilFilterPartNo || null,
    airFilterPartNo: parsed.data.airFilterPartNo || null,
    cabinFilterPartNo: parsed.data.cabinFilterPartNo || null,
  };

  if (id) {
    await db
      .update(s.vehicleModels)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(s.vehicleModels.id, id), eq(s.vehicleModels.orgId, user.orgId)));
  } else {
    await db.insert(s.vehicleModels).values({ orgId: user.orgId, ...values });
  }

  bump();
  return ok(undefined);
}

export async function archiveVehicleModel(id: string): Promise<ActionResult> {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();
  await db
    .update(s.vehicleModels)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(s.vehicleModels.id, id), eq(s.vehicleModels.orgId, user.orgId)));
  bump();
  return ok(undefined);
}

/* ------------------------------------------------------------------ recipes */

const recipeSchema = z.object({
  serviceId: z.string().uuid(),
  itemId: z.string().uuid("Pick a consumable"),
  vehicleClassId: z.string().optional(),
  quantityBase: z.string().trim().min(1, "Enter a quantity"),
});

/**
 * A recipe line says how much of a consumable a service is expected to use.
 * A blank vehicle class means "every class"; setting one overrides the
 * catch-all for that size, which is how an SUV can burn more shampoo than a
 * hatchback without duplicating the whole recipe.
 */
export async function saveRecipeLine(id: string | null, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["ADMIN"]);
  const parsed = recipeSchema.safeParse(fields(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const qty = Number(parsed.data.quantityBase);
  if (!Number.isFinite(qty) || qty <= 0) return fail("Quantity must be more than zero");

  const db = await getDb();
  const values = {
    serviceId: parsed.data.serviceId,
    itemId: parsed.data.itemId,
    vehicleClassId: parsed.data.vehicleClassId || null,
    quantityBase: qty,
  };

  if (id) {
    await db
      .update(s.serviceRecipes)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(s.serviceRecipes.id, id), eq(s.serviceRecipes.orgId, user.orgId)));
  } else {
    await db.insert(s.serviceRecipes).values({ orgId: user.orgId, ...values });
  }

  revalidatePath("/settings/recipes");
  return ok(undefined);
}

export async function deleteRecipeLine(id: string): Promise<ActionResult> {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();
  await db
    .delete(s.serviceRecipes)
    .where(and(eq(s.serviceRecipes.id, id), eq(s.serviceRecipes.orgId, user.orgId)));
  revalidatePath("/settings/recipes");
  return ok(undefined);
}
