import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { getTaxConfig } from "@/lib/settings";
import { getPriceMatrix } from "@/lib/services/pricing";
import { Page, PageHeader } from "@/components/ui";
import { PriceMatrixEditor } from "./price-matrix-editor";

export default async function PricingSettingsPage() {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();

  const [classes, services, matrix, config] = await Promise.all([
    db.select().from(s.vehicleClasses).where(eq(s.vehicleClasses.orgId, user.orgId)).orderBy(asc(s.vehicleClasses.sortOrder)),
    db
      .select({
        id: s.services.id,
        name: s.services.name,
        categoryName: s.serviceCategories.name,
        categorySort: s.serviceCategories.sortOrder,
      })
      .from(s.services)
      .innerJoin(s.serviceCategories, eq(s.serviceCategories.id, s.services.categoryId))
      .where(and(eq(s.services.orgId, user.orgId), eq(s.services.isActive, true)))
      .orderBy(asc(s.serviceCategories.sortOrder), asc(s.services.name)),
    getPriceMatrix(user.orgId),
    getTaxConfig(user.orgId),
  ]);

  return (
    <Page wide>
      <PageHeader
        title="Price matrix"
        backHref="/settings"
        backLabel="Settings"
        subtitle={
          config.enabled
            ? config.pricesIncludeTax
              ? "Enter the price the customer pays. GST is included and broken out on the invoice."
              : "Enter the pre-tax price. GST is added on top at billing."
            : "Enter the price the customer pays."
        }
      />

      <PriceMatrixEditor
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        services={services.map((svc) => ({
          id: svc.id,
          name: svc.name,
          categoryName: svc.categoryName,
          prices: Object.fromEntries(
            classes.map((c) => [c.id, matrix.get(`${svc.id}:${c.id}`) ?? null]),
          ),
        }))}
      />
    </Page>
  );
}
