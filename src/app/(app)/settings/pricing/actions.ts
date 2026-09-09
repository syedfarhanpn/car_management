"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { toMinor } from "@/lib/money";
import { upsertMatrixPrice } from "@/lib/services/pricing";

export type ActionResult = { ok: true; saved: number } | { ok: false; error: string };

/**
 * Bulk-save the whole grid in one submit.
 *
 * The grid is how the shop's real price list gets loaded, so it takes the
 * whole matrix at once rather than one cell at a time - typing 16 services
 * across 5 vehicle classes and saving 80 times is not a thing anyone will do.
 *
 * Blank cells are skipped, not zeroed: a blank means "this service is not
 * offered for that size", and writing 0 would quietly make it free.
 */
export async function savePriceMatrix(formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["ADMIN"]);

  let saved = 0;
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("price:")) continue;
    const value = String(raw).trim();
    if (value === "") continue;

    const [, serviceId, vehicleClassId] = key.split(":");
    if (!serviceId || !vehicleClassId) continue;

    const priceMinor = toMinor(value);
    if (!Number.isFinite(priceMinor) || priceMinor < 0) {
      return { ok: false, error: `"${value}" is not a valid price` };
    }

    await upsertMatrixPrice({ orgId: user.orgId, serviceId, vehicleClassId, priceMinor });
    saved += 1;
  }

  revalidatePath("/settings/pricing");
  return { ok: true, saved };
}
