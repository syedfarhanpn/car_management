import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";
import { RecipeEditor } from "./recipe-editor";

export default async function RecipesPage() {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();

  const [services, items, classes, recipes] = await Promise.all([
    db
      .select({ id: s.services.id, name: s.services.name, categoryName: s.serviceCategories.name })
      .from(s.services)
      .innerJoin(s.serviceCategories, eq(s.serviceCategories.id, s.services.categoryId))
      .where(and(eq(s.services.orgId, user.orgId), eq(s.services.isActive, true)))
      .orderBy(asc(s.serviceCategories.sortOrder), asc(s.services.name)),
    db
      .select()
      .from(s.inventoryItems)
      .where(
        and(
          eq(s.inventoryItems.orgId, user.orgId),
          eq(s.inventoryItems.type, "BULK_CONSUMABLE"),
          eq(s.inventoryItems.isActive, true),
        ),
      )
      .orderBy(asc(s.inventoryItems.name)),
    db
      .select()
      .from(s.vehicleClasses)
      .where(and(eq(s.vehicleClasses.orgId, user.orgId), sql`${s.vehicleClasses.archivedAt} is null`))
      .orderBy(asc(s.vehicleClasses.sortOrder)),
    db.select().from(s.serviceRecipes).where(eq(s.serviceRecipes.orgId, user.orgId)),
  ]);

  return (
    <Page wide>
      <PageHeader
        title="Consumable recipes"
        subtitle="How much shampoo, wax or oil a service is expected to use. Closing a job deducts these automatically, so nobody logs consumables by hand — and the gap against a physical count becomes the variance report."
      />
      <RecipeEditor
        services={services}
        items={items.map((i) => ({ id: i.id, name: i.name, baseUnit: i.baseUnit }))}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        recipes={recipes.map((r) => ({
          id: r.id,
          serviceId: r.serviceId,
          itemId: r.itemId,
          vehicleClassId: r.vehicleClassId,
          quantityBase: Number(r.quantityBase),
        }))}
      />
    </Page>
  );
}
