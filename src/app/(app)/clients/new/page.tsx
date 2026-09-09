import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";
import { NewClientForm } from "./new-client-form";

export default async function NewClientPage() {
  const user = await requireUser();
  const db = await getDb();

  const [classes, models] = await Promise.all([
    db.select().from(s.vehicleClasses).where(eq(s.vehicleClasses.orgId, user.orgId)).orderBy(s.vehicleClasses.sortOrder),
    db.select().from(s.vehicleModels).where(eq(s.vehicleModels.orgId, user.orgId)).orderBy(s.vehicleModels.make),
  ]);

  return (
    <Page>
      <PageHeader
        title="New client"
        subtitle="Add the customer and, if you have it, their first vehicle"
        backHref="/clients"
        backLabel="Clients"
      />
      <NewClientForm
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        models={models.map((m) => ({
          id: m.id,
          label: `${m.make} ${m.model}`,
          vehicleClassId: m.vehicleClassId,
        }))}
      />
    </Page>
  );
}
