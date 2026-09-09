import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { getProvider } from "@/lib/services/whatsapp";
import { Page, PageHeader } from "@/components/ui";
import { WhatsAppConsole } from "./whatsapp-console";

export default async function WhatsAppPage() {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();
  const provider = getProvider();

  const [templates, messages, stats, dueCount] = await Promise.all([
    db
      .select()
      .from(s.messageTemplates)
      .where(eq(s.messageTemplates.orgId, user.orgId))
      .orderBy(s.messageTemplates.key),
    db
      .select({
        id: s.messages.id,
        toPhone: s.messages.toPhone,
        body: s.messages.body,
        status: s.messages.status,
        templateKey: s.messages.templateKey,
        errorMessage: s.messages.errorMessage,
        sentAt: s.messages.sentAt,
        createdAt: s.messages.createdAt,
        clientName: s.clients.name,
      })
      .from(s.messages)
      .leftJoin(s.clients, eq(s.clients.id, s.messages.clientId))
      .where(eq(s.messages.orgId, user.orgId))
      .orderBy(desc(s.messages.createdAt))
      .limit(60),
    db
      .select({
        total: sql<number>`count(*)::int`,
        sent: sql<number>`count(*) filter (where ${s.messages.status} in ('SENT','DELIVERED','READ'))::int`,
        failed: sql<number>`count(*) filter (where ${s.messages.status} = 'FAILED')::int`,
      })
      .from(s.messages)
      .where(eq(s.messages.orgId, user.orgId))
      .then((r) => r[0]),
    db
      .select({ n: sql<number>`count(distinct ${s.clients.id})::int` })
      .from(s.clients)
      .where(and(eq(s.clients.orgId, user.orgId), eq(s.clients.whatsappOptIn, true)))
      .then((r) => r[0]),
  ]);

  return (
    <Page wide>
      <PageHeader
        title="WhatsApp"
        backHref="/dashboard"
        subtitle="Reminders, receipts and promotions — with a log of every message so nothing is a guess."
      />
      <WhatsAppConsole
        providerName={provider.name}
        requiresTemplates={provider.requiresTemplates}
        optInCount={dueCount?.n ?? 0}
        stats={{ total: stats?.total ?? 0, sent: stats?.sent ?? 0, failed: stats?.failed ?? 0 }}
        templates={templates.map((t) => ({
          id: t.id,
          key: t.key,
          name: t.name,
          body: t.body,
          variables: (t.variables as string[]) ?? [],
          providerTemplateId: t.providerTemplateId,
          isActive: t.isActive,
        }))}
        messages={messages.map((m) => ({
          id: m.id,
          toPhone: m.toPhone,
          body: m.body,
          status: m.status,
          templateKey: m.templateKey,
          errorMessage: m.errorMessage,
          clientName: m.clientName,
          at: (m.sentAt ?? m.createdAt).toISOString(),
        }))}
      />
    </Page>
  );
}
