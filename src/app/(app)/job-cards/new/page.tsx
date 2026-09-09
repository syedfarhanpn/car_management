import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";
import { NewJobFlow } from "./new-job-flow";

export default async function NewJobCardPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string; client?: string }>;
}) {
  const user = await requireUser();
  const { vehicle } = await searchParams;
  const db = await getDb();

  const [classes, models] = await Promise.all([
    db.select().from(s.vehicleClasses).where(eq(s.vehicleClasses.orgId, user.orgId)).orderBy(s.vehicleClasses.sortOrder),
    db.select().from(s.vehicleModels).where(eq(s.vehicleModels.orgId, user.orgId)).orderBy(s.vehicleModels.make),
  ]);

  return (
    <Page>
      <PageHeader
        title="New job card"
        subtitle="Find the car by the last four digits of its number plate"
        backHref="/job-cards"
        backLabel="Job cards"
      />
      <NewJobFlow
        preselectedVehicleId={vehicle}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        models={models.map((m) => ({ id: m.id, label: `${m.make} ${m.model}`, vehicleClassId: m.vehicleClassId }))}
      />
    </Page>
  );
}
