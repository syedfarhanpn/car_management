import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { getStockOnHand } from "@/lib/services/stock";
import { Page, PageHeader } from "@/components/ui";
import { PurchaseForm } from "./purchase-form";

export default async function NewPurchasePage() {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();

  const [suppliers, items, onHand] = await Promise.all([
    db.select().from(s.suppliers).where(eq(s.suppliers.orgId, user.orgId)).orderBy(asc(s.suppliers.name)),
    db
      .select()
      .from(s.inventoryItems)
      .where(and(eq(s.inventoryItems.orgId, user.orgId), eq(s.inventoryItems.isActive, true)))
      .orderBy(asc(s.inventoryItems.name)),
    getStockOnHand(user.orgId),
  ]);

  return (
    <Page wide>
      <PageHeader
        title="Record a supplier bill"
        backHref="/purchases"
        backLabel="Purchases"
        subtitle="Brings stock in and rolls each item's average cost forward. For a part bought for one customer, add it on their job card instead — that must never enter stock."
      />
      <PurchaseForm
        suppliers={suppliers.map((sup) => ({ id: sup.id, name: sup.name, terms: sup.paymentTermsDays }))}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          purchaseUnitName: i.purchaseUnitName,
          baseUnitsPerPurchaseUnit: Number(i.baseUnitsPerPurchaseUnit),
          baseUnit: i.baseUnit,
          gstRate: i.gstRate,
          avgCostMinor: Number(i.avgCostMinor),
          onHand: onHand.get(i.id) ?? 0,
          reorder: Number(i.reorderLevelBase),
        }))}
      />
    </Page>
  );
}
