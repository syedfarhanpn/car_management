import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";
import { ItemForm } from "../item-form";

export default async function NewItemPage() {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();
  const categories = await db
    .select()
    .from(s.itemCategories)
    .where(eq(s.itemCategories.orgId, user.orgId))
    .orderBy(asc(s.itemCategories.name));

  return (
    <Page>
      <PageHeader
        title="New inventory item"
        backHref="/inventory"
        backLabel="Inventory"
        subtitle="Parts are counted in pieces and picked onto a job card. Consumables are measured and deducted by service recipe."
      />
      <ItemForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </Page>
  );
}
