import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";
import { SupplierEditor } from "./supplier-editor";

export default async function SuppliersPage() {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();

  const suppliers = await db
    .select({
      id: s.suppliers.id,
      name: s.suppliers.name,
      phone: s.suppliers.phone,
      email: s.suppliers.email,
      gstin: s.suppliers.gstin,
      city: s.suppliers.city,
      paymentTermsDays: s.suppliers.paymentTermsDays,
      outstanding: sql<string>`(
        select coalesce(sum(${s.purchases.totalMinor} - ${s.purchases.paidMinor}), 0)
        from ${s.purchases}
        where ${s.purchases.supplierId} = ${s.suppliers.id}
          and ${s.purchases.paymentStatus} <> 'PAID'
      )`,
      billCount: sql<number>`(
        select count(*)::int from ${s.purchases} where ${s.purchases.supplierId} = ${s.suppliers.id}
      )`,
    })
    .from(s.suppliers)
    .where(eq(s.suppliers.orgId, user.orgId))
    .orderBy(asc(s.suppliers.name));

  return (
    <Page>
      <PageHeader title="Suppliers" backHref="/purchases" backLabel="Purchases" />
      <SupplierEditor
        suppliers={suppliers.map((sup) => ({ ...sup, outstanding: Number(sup.outstanding) }))}
      />
    </Page>
  );
}
