import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";
import { VehicleClassEditor } from "./vehicle-class-editor";

export default async function VehicleClassesPage() {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();

  const classes = await db
    .select({
      id: s.vehicleClasses.id,
      name: s.vehicleClasses.name,
      description: s.vehicleClasses.description,
      sortOrder: s.vehicleClasses.sortOrder,
      vehicleCount: sql<number>`(
        select count(*)::int from ${s.vehicles}
        where ${s.vehicles.vehicleClassId} = ${s.vehicleClasses.id}
          and ${s.vehicles.archivedAt} is null
      )`,
    })
    .from(s.vehicleClasses)
    .where(and(eq(s.vehicleClasses.orgId, user.orgId), sql`${s.vehicleClasses.archivedAt} is null`))
    .orderBy(asc(s.vehicleClasses.sortOrder), asc(s.vehicleClasses.name));

  return (
    <Page>
      <PageHeader
        title="Vehicle classes"
        subtitle="Size bands that drive pricing. Every service is priced once per class, so a wash on an SUV is not a wash on a hatchback."
      />
      <VehicleClassEditor classes={classes} />
    </Page>
  );
}
