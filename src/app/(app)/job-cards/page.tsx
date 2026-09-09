import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { formatRegistration } from "@/lib/vehicle";
import { Badge, EmptyState, JOB_STATUS, Page, PageHeader, Table, Td, Th } from "@/components/ui";

const FILTERS = [
  { key: "open", label: "Open", statuses: ["DRAFT", "ESTIMATE_SENT", "ESTIMATE_APPROVED", "IN_PROGRESS"] },
  { key: "ready", label: "Ready", statuses: ["COMPLETED"] },
  { key: "billed", label: "Billed", statuses: ["INVOICED", "DELIVERED"] },
  { key: "all", label: "All", statuses: [] },
] as const;

export default async function JobCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireUser();
  const { filter = "open" } = await searchParams;
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];

  const db = await getDb();
  const jobs = await db
    .select({
      id: s.jobCards.id,
      jobNumber: s.jobCards.jobNumber,
      kind: s.jobCards.kind,
      status: s.jobCards.status,
      totalMinor: s.jobCards.totalMinor,
      createdAt: s.jobCards.createdAt,
      registration: s.vehicles.registrationNumber,
      clientName: s.clients.name,
      className: s.vehicleClasses.name,
    })
    .from(s.jobCards)
    .innerJoin(s.vehicles, eq(s.vehicles.id, s.jobCards.vehicleId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobCards.clientId))
    .leftJoin(s.vehicleClasses, eq(s.vehicleClasses.id, s.jobCards.vehicleClassId))
    .where(
      and(
        eq(s.jobCards.orgId, user.orgId),
        active.statuses.length
          ? sql`${s.jobCards.status} in (${sql.join(active.statuses.map((x) => sql`${x}`), sql`, `)})`
          : undefined,
      ),
    )
    .orderBy(desc(s.jobCards.createdAt))
    .limit(100);

  return (
    <Page wide>
      <PageHeader
        title="Job Cards"
        subtitle={`${jobs.length} ${active.label.toLowerCase()}`}
        backHref="/dashboard"
        actions={
          <Link href="/job-cards/new" className="btn btn-primary">
            <Plus size={16} />
            New job card
          </Link>
        }
      />

      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/job-cards?filter=${f.key}`}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors"
            style={
              f.key === active.key
                ? { background: "var(--brand)", color: "var(--brand-fg)" }
                : { background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      {jobs.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Nothing here"
            description="Open a job card by searching the last four digits of a number plate."
            action={
              <Link href="/job-cards/new" className="btn btn-primary">
                <Plus size={16} />
                New job card
              </Link>
            }
          />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Job no.</Th>
              <Th>Vehicle</Th>
              <Th>Client</Th>
              <Th>Status</Th>
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const st = JOB_STATUS[j.status] ?? JOB_STATUS.DRAFT;
              return (
                <tr key={j.id} className="border-t">
                  <Td>
                    <Link href={`/job-cards/${j.id}`} className="font-medium tnum hover:underline">
                      {j.jobNumber}
                    </Link>
                    <div className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                      {new Date(j.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {j.kind === "ESTIMATE" && " · Estimate"}
                    </div>
                  </Td>
                  <Td nowrap>
                    <span className="tnum font-medium">{formatRegistration(j.registration)}</span>
                    {j.className && (
                      <div className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                        {j.className}
                      </div>
                    )}
                  </Td>
                  <Td muted>{j.clientName}</Td>
                  <Td>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </Td>
                  <Td align="right" strong>
                    <span className="tnum">{formatINR(Number(j.totalMinor))}</span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Page>
  );
}
