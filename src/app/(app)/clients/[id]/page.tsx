import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { Car, Plus, Wrench } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { formatRegistration } from "@/lib/vehicle";
import { Badge, INVOICE_STATUS, JOB_STATUS, Page, PageHeader, Table, Td, Th } from "@/components/ui";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const db = await getDb();

  const [client] = await db
    .select()
    .from(s.clients)
    .where(and(eq(s.clients.id, id), eq(s.clients.orgId, user.orgId)))
    .limit(1);
  if (!client) notFound();

  const [vehicles, jobs, invoices, outstanding] = await Promise.all([
    db
      .select({
        id: s.vehicles.id,
        registration: s.vehicles.registrationNumber,
        color: s.vehicles.color,
        odometer: s.vehicles.lastOdometerKm,
        className: s.vehicleClasses.name,
        make: s.vehicleModels.make,
        model: s.vehicleModels.model,
        modelText: s.vehicles.modelText,
      })
      .from(s.vehicles)
      .leftJoin(s.vehicleModels, eq(s.vehicleModels.id, s.vehicles.modelId))
      .leftJoin(s.vehicleClasses, eq(s.vehicleClasses.id, s.vehicles.vehicleClassId))
      .where(and(eq(s.vehicles.orgId, user.orgId), eq(s.vehicles.currentClientId, id))),

    db
      .select({
        id: s.jobCards.id,
        jobNumber: s.jobCards.jobNumber,
        status: s.jobCards.status,
        totalMinor: s.jobCards.totalMinor,
        createdAt: s.jobCards.createdAt,
        registration: s.vehicles.registrationNumber,
      })
      .from(s.jobCards)
      .innerJoin(s.vehicles, eq(s.vehicles.id, s.jobCards.vehicleId))
      .where(and(eq(s.jobCards.orgId, user.orgId), eq(s.jobCards.clientId, id)))
      .orderBy(desc(s.jobCards.createdAt))
      .limit(15),

    db
      .select({
        id: s.invoices.id,
        invoiceNumber: s.invoices.invoiceNumber,
        status: s.invoices.status,
        invoiceDate: s.invoices.invoiceDate,
        totalMinor: s.invoices.totalMinor,
        balanceMinor: s.invoices.balanceMinor,
      })
      .from(s.invoices)
      .where(and(eq(s.invoices.orgId, user.orgId), eq(s.invoices.clientId, id)))
      .orderBy(desc(s.invoices.invoiceDate))
      .limit(15),

    db
      .select({ total: sql<string>`coalesce(sum(${s.invoices.balanceMinor}), 0)` })
      .from(s.invoices)
      .where(
        and(
          eq(s.invoices.orgId, user.orgId),
          eq(s.invoices.clientId, id),
          sql`${s.invoices.status} in ('ISSUED','PARTIALLY_PAID','OVERDUE')`,
        ),
      ),
  ]);

  const outstandingMinor = Number(outstanding[0]?.total ?? 0);

  return (
    <Page wide>
      <PageHeader
        title={client.name}
        backHref="/clients"
        backLabel="Clients"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="tnum">{formatPhone(client.phone)}</span>
            {client.email && <span>{client.email}</span>}
            {client.type === "CORPORATE" && <Badge tone="brand">Corporate</Badge>}
            {client.creditDays > 0 && <Badge tone="warning">{client.creditDays}-day credit</Badge>}
          </span>
        }
        actions={
          <>
            <Link href={`/clients/${id}/vehicles/new`} className="btn btn-ghost">
              <Car size={16} />
              Add vehicle
            </Link>
            <Link href={`/job-cards/new?client=${id}`} className="btn btn-primary">
              <Wrench size={16} />
              New job card
            </Link>
          </>
        }
      />

      {outstandingMinor > 0 && (
        <div
          className="card p-4 mb-4 flex items-center justify-between gap-3"
          style={{ borderColor: "var(--warning)", background: "var(--warning-soft)" }}
        >
          <div>
            <p className="text-[13.5px] font-semibold" style={{ color: "var(--warning)" }}>
              {formatINR(outstandingMinor)} outstanding
            </p>
            <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              Across {invoices.filter((i) => Number(i.balanceMinor) > 0).length} unpaid invoice(s)
            </p>
          </div>
          <Link href={`/billing?client=${id}`} className="btn btn-ghost text-[13px]">
            View invoices
          </Link>
        </div>
      )}

      <section className="mb-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-subtle)" }}>
          Vehicles ({vehicles.length})
        </h2>
        {vehicles.length === 0 ? (
          <div className="card p-5 text-center">
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              No vehicles on record for this client yet.
            </p>
            <Link href={`/clients/${id}/vehicles/new`} className="btn btn-ghost mt-3">
              <Plus size={15} />
              Add vehicle
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => (
              <div key={v.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold tnum tracking-tight">{formatRegistration(v.registration)}</p>
                  {v.className && <Badge>{v.className}</Badge>}
                </div>
                <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
                  {v.make && v.model ? `${v.make} ${v.model}` : v.modelText || "Model not recorded"}
                  {v.color ? ` · ${v.color}` : ""}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[12px] tnum" style={{ color: "var(--text-subtle)" }}>
                    {v.odometer ? `${v.odometer.toLocaleString("en-IN")} km` : "No odometer"}
                  </span>
                  <Link
                    href={`/job-cards/new?vehicle=${v.id}`}
                    className="text-[12.5px] font-medium"
                    style={{ color: "var(--brand)" }}
                  >
                    New job
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-subtle)" }}>
            Service history
          </h2>
          {jobs.length === 0 ? (
            <div className="card p-5 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
              No job cards yet.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Job</Th>
                  <Th>Vehicle</Th>
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
                          {new Date(j.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                        </div>
                      </Td>
                      <Td muted nowrap>
                        <span className="tnum">{formatRegistration(j.registration)}</span>
                      </Td>
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
        </section>

        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-subtle)" }}>
            Invoices
          </h2>
          {invoices.length === 0 ? (
            <div className="card p-5 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
              No invoices yet.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Status</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Balance</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const st = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.DRAFT;
                  const balance = Number(inv.balanceMinor);
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
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </Td>
                      <Td align="right">
                        <span className="tnum">{formatINR(Number(inv.totalMinor))}</span>
                      </Td>
                      <Td align="right">
                        <span className="tnum font-medium" style={{ color: balance > 0 ? "var(--warning)" : "var(--text-subtle)" }}>
                          {balance > 0 ? formatINR(balance) : "—"}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </section>
      </div>

      {can.viewCosts(user) && client.notes && (
        <section className="mt-5 card p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
            Internal notes
          </h3>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
            {client.notes}
          </p>
        </section>
      )}
    </Page>
  );
}
