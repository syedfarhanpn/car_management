import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { DEFAULT_TAX_CONFIG, type TaxConfig } from "./tax";

export async function getSettings(orgId: string): Promise<Record<string, unknown>> {
  const db = await getDb();
  const rows = await db.select().from(s.settings).where(eq(s.settings.orgId, orgId));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getTaxConfig(orgId: string): Promise<TaxConfig> {
  const all = await getSettings(orgId);
  const [org] = await (await getDb()).select().from(s.organizations).where(eq(s.organizations.id, orgId)).limit(1);
  return {
    enabled: (all["tax.enabled"] as boolean) ?? DEFAULT_TAX_CONFIG.enabled,
    pricesIncludeTax: (all["tax.pricesIncludeTax"] as boolean) ?? DEFAULT_TAX_CONFIG.pricesIncludeTax,
    passThroughTreatment:
      (all["tax.passThroughTreatment"] as TaxConfig["passThroughTreatment"]) ??
      DEFAULT_TAX_CONFIG.passThroughTreatment,
    homeStateCode: org?.stateCode ?? DEFAULT_TAX_CONFIG.homeStateCode,
  };
}

export async function setSetting(orgId: string, key: string, value: unknown) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(s.settings)
    .where(eq(s.settings.orgId, orgId))
    .then((rows) => rows.find((r) => r.key === key));

  if (existing) {
    await db.update(s.settings).set({ value, updatedAt: new Date() }).where(eq(s.settings.id, existing.id));
  } else {
    await db.insert(s.settings).values({ orgId, key, value });
  }
}
