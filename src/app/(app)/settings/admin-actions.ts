"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { normalizePhone } from "@/lib/phone";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: string): ActionResult<never> => ({ ok: false, error });

function fields(formData: FormData) {
  return Object.fromEntries(formData.entries()) as Record<string, string>;
}

/* ------------------------------------------------------------------ profile */

const orgSchema = z.object({
  name: z.string().trim().min(2, "Enter the business name"),
  legalName: z.string().trim().optional(),
  gstin: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  addressLine1: z.string().trim().optional(),
  addressLine2: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  stateCode: z.string().trim().optional(),
  pincode: z.string().trim().optional(),
});

/** GSTIN: 2-digit state code, 10-char PAN, entity digit, 'Z', checksum. */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export async function saveOrgProfile(formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["ADMIN"]);
  const parsed = orgSchema.safeParse(fields(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const gstin = parsed.data.gstin?.toUpperCase().trim() || null;
  if (gstin && !GSTIN_RE.test(gstin)) {
    return fail("That GSTIN does not look valid (e.g. 32AABCP1234M1Z5)");
  }

  /**
   * The state code drives intra- vs inter-state tax. Taking it from the GSTIN
   * rather than a separate field removes the chance of the two disagreeing,
   * which would silently put CGST/SGST on a bill that needs IGST.
   */
  const stateCode = gstin ? gstin.slice(0, 2) : parsed.data.stateCode || null;

  const db = await getDb();
  await db
    .update(s.organizations)
    .set({
      name: parsed.data.name,
      legalName: parsed.data.legalName || null,
      gstin,
      phone: parsed.data.phone ? normalizePhone(parsed.data.phone) : null,
      email: parsed.data.email || null,
      addressLine1: parsed.data.addressLine1 || null,
      addressLine2: parsed.data.addressLine2 || null,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
      stateCode,
      pincode: parsed.data.pincode || null,
      updatedAt: new Date(),
    })
    .where(eq(s.organizations.id, user.orgId));

  revalidatePath("/settings");
  revalidatePath("/settings/business");
  return ok(undefined);
}

/* ---------------------------------------------------------------------- tax */

export async function saveTaxSettings(formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["ADMIN"]);
  const f = fields(formData);

  const enabled = f.enabled === "on" || f.enabled === "true";

  if (enabled) {
    const db = await getDb();
    const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, user.orgId)).limit(1);
    // Charging GST without a registration number is not something to let
    // through quietly - the invoice would claim to be a tax invoice it cannot be.
    if (!org?.gstin) return fail("Add the GSTIN on the business profile before switching GST on");
  }

  await setSetting(user.orgId, "tax.enabled", enabled);
  await setSetting(user.orgId, "tax.pricesIncludeTax", f.pricesIncludeTax === "on" || f.pricesIncludeTax === "true");
  await setSetting(
    user.orgId,
    "tax.passThroughTreatment",
    f.passThroughTreatment === "TAXABLE" ? "TAXABLE" : "PURE_AGENT",
  );
  if (f.defaultRate) await setSetting(user.orgId, "tax.defaultRate", Number(f.defaultRate));

  revalidatePath("/settings");
  revalidatePath("/settings/tax");
  revalidatePath("/billing");
  return ok(undefined);
}

/* -------------------------------------------------------------------- users */

const userSchema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().optional(),
  role: z.enum(["ADMIN", "MANAGER", "STAFF"]),
  password: z.string().optional(),
});

export async function saveUser(id: string | null, formData: FormData): Promise<ActionResult> {
  const actor = await requireRole(["ADMIN"]);
  const parsed = userSchema.safeParse(fields(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const email = parsed.data.email.toLowerCase();
  const db = await getDb();

  const clash = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(and(eq(s.users.orgId, actor.orgId), eq(s.users.email, email), id ? ne(s.users.id, id) : sql`true`))
    .limit(1);
  if (clash.length) return fail("Another user already has that email");

  const base = {
    name: parsed.data.name,
    email,
    phone: parsed.data.phone ? normalizePhone(parsed.data.phone) : null,
    role: parsed.data.role,
  };

  if (id) {
    // Losing the last admin would lock everyone out of settings permanently.
    if (parsed.data.role !== "ADMIN") {
      const [current] = await db.select().from(s.users).where(eq(s.users.id, id)).limit(1);
      if (current?.role === "ADMIN") {
        const [admins] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(s.users)
          .where(and(eq(s.users.orgId, actor.orgId), eq(s.users.role, "ADMIN"), eq(s.users.isActive, true)));
        if ((admins?.n ?? 0) <= 1) return fail("This is the only admin — promote someone else first");
      }
    }

    const patch: Record<string, unknown> = { ...base, updatedAt: new Date() };
    if (parsed.data.password && parsed.data.password.length > 0) {
      if (parsed.data.password.length < 6) return fail("Password must be at least 6 characters");
      patch.passwordHash = bcrypt.hashSync(parsed.data.password, 10);
    }
    await db.update(s.users).set(patch).where(and(eq(s.users.id, id), eq(s.users.orgId, actor.orgId)));
  } else {
    if (!parsed.data.password || parsed.data.password.length < 6) {
      return fail("Set a password of at least 6 characters");
    }
    const [branch] = await db
      .select()
      .from(s.branches)
      .where(and(eq(s.branches.orgId, actor.orgId), eq(s.branches.isDefault, true)))
      .limit(1);

    await db.insert(s.users).values({
      orgId: actor.orgId,
      branchId: branch?.id ?? null,
      ...base,
      passwordHash: bcrypt.hashSync(parsed.data.password, 10),
      isActive: true,
    });
  }

  revalidatePath("/settings/users");
  return ok(undefined);
}

export async function setUserActive(id: string, isActive: boolean): Promise<ActionResult> {
  const actor = await requireRole(["ADMIN"]);
  if (id === actor.id && !isActive) return fail("You cannot deactivate your own account");

  const db = await getDb();

  if (!isActive) {
    const [target] = await db.select().from(s.users).where(eq(s.users.id, id)).limit(1);
    if (target?.role === "ADMIN") {
      const [admins] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(s.users)
        .where(and(eq(s.users.orgId, actor.orgId), eq(s.users.role, "ADMIN"), eq(s.users.isActive, true)));
      if ((admins?.n ?? 0) <= 1) return fail("This is the only active admin");
    }
  }

  await db
    .update(s.users)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(s.users.id, id), eq(s.users.orgId, actor.orgId)));

  await db.insert(s.auditLogs).values({
    orgId: actor.orgId,
    userId: actor.id,
    entityType: "user",
    entityId: id,
    action: isActive ? "ACTIVATE" : "DEACTIVATE",
  });

  // Sessions re-check the user row on every request, so this takes effect
  // immediately rather than whenever their token happens to expire.
  revalidatePath("/settings/users");
  return ok(undefined);
}
