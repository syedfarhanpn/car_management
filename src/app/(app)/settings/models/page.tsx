import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";
import { ModelEditor } from "./model-editor";

export default async function ModelsPage() {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();

  const [models, classes] = await Promise.all([
    db
      .select()
      .from(s.vehicleModels)
      .where(and(eq(s.vehicleModels.orgId, user.orgId), sql`${s.vehicleModels.archivedAt} is null`))
      .orderBy(asc(s.vehicleModels.make), asc(s.vehicleModels.model)),
    db
      .select()
      .from(s.vehicleClasses)
      .where(and(eq(s.vehicleClasses.orgId, user.orgId), sql`${s.vehicleClasses.archivedAt} is null`))
      .orderBy(asc(s.vehicleClasses.sortOrder)),
  ]);

  return (
    <Page wide>
      <PageHeader
        title="Vehicle models"
        subtitle="Picking a model on a job card fills in the size class, the oil grade and how much oil the car takes — so the technician is not guessing and the oil gets costed."
      />
      <ModelEditor
        models={models.map((m) => ({
          id: m.id,
          make: m.make,
          model: m.model,
          variant: m.variant,
          vehicleClassId: m.vehicleClassId,
          fuelType: m.fuelType,
          engineOilGrade: m.engineOilGrade,
          engineOilCapacityMl: m.engineOilCapacityMl,
          oilFilterPartNo: m.oilFilterPartNo,
          airFilterPartNo: m.airFilterPartNo,
          cabinFilterPartNo: m.cabinFilterPartNo,
        }))}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
      />
    </Page>
  );
}
