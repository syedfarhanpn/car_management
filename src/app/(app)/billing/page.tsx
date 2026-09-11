import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { formatRegistration } from "@/lib/vehicle";
import { Badge, EmptyState, INVOICE_STATUS, Page, PageHeader, Table, Td, Th } from "@/components/ui";

const FILTERS = [
  { key: "unpaid", label: "Unpaid", statuses: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
  { key: "paid", label: "Paid", statuses: ["PAID"] },
  { key: "all", label: "All", statuses: [] },
] as const;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; client?: string }>;
}) {
  const user = await requireUser();
  const { filter = "unpaid", client: clientId } = await searchParams;
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const db = await getDb();

  const [invoices, summary] = await Promise.all([
    db
      .select({
        id: s.invoices.id,
        invoiceNumber: s.invoices.invoiceNumber,
        status: s.invoices.status,
        invoiceDate: s.invoices.invoiceDate,
        dueDate: s.invoices.dueDate,
        totalMinor: s.invoices.totalMinor,
        balanceMinor: s.invoices.balanceMinor,
        clientName: s.invoices.billToName,
        clientId: s.invoices.clientId,
        registration: s.vehicles.registrationNumber,
      })
      .from(s.invoices)
      .leftJoin(s.vehicles, eq(s.vehicles.id, s.invoices.vehicleId))
      .where(
        and(
          eq(s.invoices.orgId, user.orgId),
          clientId ? eq(s.invoices.clientId, clientId) : undefined,
          active.statuses.length
            ? sql`${s.invoices.status} in (${sql.join(active.statuses.map((x) => sql`${x}`), sql`, `)})`
            : undefined,
        ),
      )
      .orderBy(desc(s.invoices.invoiceDate), desc(s.invoices.createdAt))
      .limit(100),

    db
      .select({
        outstanding: sql<string>`coalesce(sum(${s.invoices.balanceMinor}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(s.invoices)
      .where(
        and(
          eq(s.invoices.orgId, user.orgId),
          sql`${s.invoices.status} in ('ISSUED','PARTIALLY_PAID','OVERDUE')`,
        ),
      ),
  ]);

  const outstanding = Number(summary[0]?.outstanding ?? 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Page wide>
      <PageHeader
        title="Billing & Invoices"
        subtitle={`${invoices.length} shown${clientId ? " · filtered by client" : ""}`}
      />

      {outstanding > 0 && (
        <div className="card p-4 mb-4" style={{ borderColor: "var(--warning)", background: "var(--warning-soft)" }}>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Outstanding from customers
          </p>
          <p className="text-[24px] font-semibold tnum tracking-tight" style={{ color: "var(--warning)" }}>
            {formatINR(outstanding)}
          </p>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            across {summary[0]?.count ?? 0} unpaid invoice(s)
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/billing?filter=${f.key}${clientId ? `&client=${clientId}` : ""}`}
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

      {invoices.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No invoices here"
            description="Invoices are generated from a completed job card."
            action={
              <Link href="/job-cards?filter=ready" className="btn btn-primary">
                Job cards ready to bill
              </Link>
            }
          />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Invoice</Th>
              <Th>Customer</Th>
              <Th>Vehicle</Th>
              <Th>Status</Th>
              <Th align="right">Total</Th>
              <Th align="right">Balance</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const st = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.DRAFT;
              const balance = Number(inv.balanceMinor);
              const overdue = balance > 0 && inv.dueDate !== null && inv.dueDate < today;
              return (
                <tr key={inv.id} className="border-t">
                  <Td>
                    <Link href={`/billing/${inv.id}`} className="font-medium tnum hover:underline">
                      {inv.invoiceNumber}
                    </Link>
                    <div className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                      {new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                    </div>
                  </Td>
                  <Td>
                    <Link href={`/clients/${inv.clientId}`} className="hover:underline">
                      {inv.clientName}
                    </Link>
                  </Td>
                  <Td muted nowrap>
                    <span className="tnum">{inv.registration ? formatRegistration(inv.registration) : "—"}</span>
                  </Td>
                  <Td>
                    <Badge tone={overdue ? "danger" : st.tone}>{overdue ? "Overdue" : st.label}</Badge>
                  </Td>
                  <Td align="right">
                    <span className="tnum">{formatINR(Number(inv.totalMinor))}</span>
                  </Td>
                  <Td align="right">
                    <span
                      className="tnum font-medium"
                      style={{ color: balance > 0 ? (overdue ? "var(--danger)" : "var(--warning)") : "var(--text-subtle)" }}
                    >
                      {balance > 0 ? formatINR(balance) : "—"}
                    </span>
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
