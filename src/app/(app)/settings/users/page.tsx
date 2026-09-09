import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";
import { UserEditor } from "./user-editor";

export default async function UsersPage() {
  const actor = await requireRole(["ADMIN"]);
  const db = await getDb();

  const users = await db
    .select()
    .from(s.users)
    .where(eq(s.users.orgId, actor.orgId))
    .orderBy(asc(s.users.name));

  return (
    <Page>
      <PageHeader
        title="Users"
        subtitle="Who can sign in, and what they can see. Deactivating someone takes effect on their very next request, not when their session expires."
      />
      <UserEditor
        currentUserId={actor.id}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          role: u.role,
          isActive: u.isActive,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        }))}
      />
    </Page>
  );
}
