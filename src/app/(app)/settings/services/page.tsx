import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";
import { ServiceCatalogueEditor } from "./service-catalogue-editor";

export default async function ServicesSettingsPage() {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();

  const [categories, services] = await Promise.all([
    db
      .select()
      .from(s.serviceCategories)
      .where(and(eq(s.serviceCategories.orgId, user.orgId), sql`${s.serviceCategories.archivedAt} is null`))
      .orderBy(asc(s.serviceCategories.sortOrder), asc(s.serviceCategories.name)),
    db
      .select()
      .from(s.services)
      .where(eq(s.services.orgId, user.orgId))
      .orderBy(asc(s.services.name)),
  ]);

  return (
    <Page wide>
      <PageHeader
        title="Service catalogue"
        subtitle="What the shop sells. Categories decide whether a job needs a customer-approved estimate first."
      />
      <ServiceCatalogueEditor
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          requiresEstimate: c.requiresEstimate,
          sortOrder: c.sortOrder,
        }))}
        services={services.map((svc) => ({
          id: svc.id,
          name: svc.name,
          categoryId: svc.categoryId,
          sacCode: svc.sacCode,
          gstRate: svc.gstRate,
          estimatedMinutes: svc.estimatedMinutes,
          description: svc.description,
          isActive: svc.isActive && svc.archivedAt === null,
        }))}
      />
    </Page>
  );
}
