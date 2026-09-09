import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";
import { BusinessForm } from "./business-form";

export default async function BusinessSettingsPage() {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();
  const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, user.orgId)).limit(1);

  return (
    <Page>
      <PageHeader title="Business profile" subtitle="This is the letterhead printed at the top of every invoice." />
      <BusinessForm
        org={{
          name: org?.name ?? "",
          legalName: org?.legalName ?? "",
          gstin: org?.gstin ?? "",
          phone: org?.phone ?? "",
          email: org?.email ?? "",
          addressLine1: org?.addressLine1 ?? "",
          addressLine2: org?.addressLine2 ?? "",
          city: org?.city ?? "",
          state: org?.state ?? "",
          stateCode: org?.stateCode ?? "",
          pincode: org?.pincode ?? "",
        }}
      />
    </Page>
  );
}
