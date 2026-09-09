import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { getSettings, getTaxConfig } from "@/lib/settings";
import { Page, PageHeader } from "@/components/ui";
import { TaxForm } from "./tax-form";

export default async function TaxSettingsPage() {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();

  const [org, config, all, series] = await Promise.all([
    db.select().from(s.organizations).where(eq(s.organizations.id, user.orgId)).limit(1).then((r) => r[0]),
    getTaxConfig(user.orgId),
    getSettings(user.orgId),
    db.select().from(s.invoiceSeries).where(eq(s.invoiceSeries.orgId, user.orgId)).limit(1).then((r) => r[0]),
  ]);

  return (
    <Page>
      <PageHeader title="Tax" subtitle="How GST is calculated and shown on every bill." />
      <TaxForm
        config={config}
        defaultRate={(all["tax.defaultRate"] as number) ?? 18}
        hasGstin={Boolean(org?.gstin)}
        gstin={org?.gstin ?? null}
        series={
          series
            ? `${series.prefix}/${series.financialYear}/${String(series.currentNumber).padStart(series.padWidth, "0")}`
            : null
        }
      />
    </Page>
  );
}
