import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";
import { AddVehicleForm } from "./add-vehicle-form";

export default async function AddVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const db = await getDb();

  const [client] = await db
    .select()
    .from(s.clients)
    .where(and(eq(s.clients.id, id), eq(s.clients.orgId, user.orgId)))
    .limit(1);
  if (!client) notFound();

  const [classes, models] = await Promise.all([
    db.select().from(s.vehicleClasses).where(eq(s.vehicleClasses.orgId, user.orgId)).orderBy(s.vehicleClasses.sortOrder),
    db.select().from(s.vehicleModels).where(eq(s.vehicleModels.orgId, user.orgId)).orderBy(s.vehicleModels.make),
  ]);

  return (
    <Page>
      <PageHeader
        title="Add vehicle"
        subtitle={`For ${client.name}`}
        backHref={`/clients/${id}`}
        backLabel={client.name}
      />
      <AddVehicleForm
        clientId={id}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        models={models.map((m) => ({ id: m.id, label: `${m.make} ${m.model}`, vehicleClassId: m.vehicleClassId }))}
      />
    </Page>
  );
}
