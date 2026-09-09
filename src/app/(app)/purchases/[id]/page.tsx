import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { formatAmount, formatINR } from "@/lib/money";
import { formatRegistration } from "@/lib/vehicle";
import { Badge, Page, PageHeader, Table, Td, Th } from "@/components/ui";
import { SupplierPaymentPanel } from "./supplier-payment-panel";

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;
  const db = await getDb();

  const [purchase] = await db
    .select()
    .from(s.purchases)
    .where(and(eq(s.purchases.id, id), eq(s.purchases.orgId, user.orgId)))
    .limit(1);
  if (!purchase) notFound();

  const [lines, supplier, payments, job, client, invoice] = await Promise.all([
    db.select().from(s.purchaseLines).where(eq(s.purchaseLines.purchaseId, id)).orderBy(asc(s.purchaseLines.description)),
    purchase.supplierId
      ? db.select().from(s.suppliers).where(eq(s.suppliers.id, purchase.supplierId)).limit(1).then((r) => r[0])
      : Promise.resolve(undefined),
    db
      .select()
      .from(s.supplierPayments)
      .where(eq(s.supplierPayments.purchaseId, id))
      .orderBy(asc(s.supplierPayments.paidAt)),
    purchase.jobCardId
      ? db
          .select({
            id: s.jobCards.id,
            jobNumber: s.jobCards.jobNumber,
            registration: s.vehicles.registrationNumber,
          })
          .from(s.jobCards)
          .innerJoin(s.vehicles, eq(s.vehicles.id, s.jobCards.vehicleId))
          .where(eq(s.jobCards.id, purchase.jobCardId))
          .limit(1)
          .then((r) => r[0])
      : Promise.resolve(undefined),
    purchase.forClientId
      ? db.select().from(s.clients).where(eq(s.clients.id, purchase.forClientId)).limit(1).then((r) => r[0])
      : Promise.resolve(undefined),
    purchase.jobCardId
      ? db.select().from(s.invoices).where(eq(s.invoices.jobCardId, purchase.jobCardId)).limit(1).then((r) => r[0])
      : Promise.resolve(undefined),
  ]);

  const due = Number(purchase.totalMinor) - Number(purchase.paidMinor);
  const recovered = invoice?.status === "PAID";

  return (
    <Page>
      <PageHeader
        title={purchase.billNumber ?? "Supplier bill"}
        backHref="/purchases"
        backLabel="Purchases"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {new Date(purchase.billDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </span>
            <span>{supplier?.name ?? purchase.supplierNameText ?? "—"}</span>
            {purchase.isPassThrough && <Badge tone="warning">Bought for a customer</Badge>}
          </span>
        }
      />

      {purchase.isPassThrough && (
        <div
          className="card p-4 mb-4"
          style={{ borderColor: recovered ? "var(--success)" : "var(--warning)", background: recovered ? "var(--success-soft)" : "var(--warning-soft)" }}
        >
          <p className="text-[13.5px] font-semibold" style={{ color: recovered ? "var(--success)" : "var(--warning)" }}>
            {recovered
              ? "Recovered from the customer"
              : `${formatINR(Number(purchase.totalMinor))} of your cash is still out on this part`}
          </p>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {/* Deliberately excluded from stock and revenue — see the job card. */}
            This never entered stock and is not counted as revenue. It is recovered when the customer settles their
            invoice, not when you pay the supplier.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-3 text-[12.5px]">
            {client && (
              <Link href={`/clients/${client.id}`} style={{ color: "var(--brand)" }}>
                {client.name}
              </Link>
            )}
            {job && (
              <Link href={`/job-cards/${job.id}`} style={{ color: "var(--brand)" }} className="tnum">
                {job.jobNumber} · {formatRegistration(job.registration)}
              </Link>
            )}
            {invoice && (
              <Link href={`/billing/${invoice.id}`} style={{ color: "var(--brand)" }} className="tnum">
                {invoice.invoiceNumber} · {invoice.status === "PAID" ? "paid" : "unpaid"}
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px] items-start">
        <div>
          {lines.length > 0 ? (
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Unit cost</Th>
                  <Th align="right">GST</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t">
                    <Td strong>{l.description}</Td>
                    <Td align="right">
                      <span className="tnum">{Number(l.quantity)}</span>
                    </Td>
                    <Td align="right" muted>
                      <span className="tnum">{formatAmount(Number(l.unitCostMinor))}</span>
                    </Td>
                    <Td align="right" muted>
                      <span className="tnum">
                        {l.gstRate}% · {formatAmount(Number(l.taxMinor))}
                      </span>
                    </Td>
                    <Td align="right" strong>
                      <span className="tnum">{formatAmount(Number(l.lineTotalMinor))}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <div className="card p-5 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
              No itemised lines — this was recorded from a job card as a single pass-through part.
            </div>
          )}

          <dl className="mt-4 ml-auto max-w-[280px] text-[13px] space-y-1">
            <div className="flex justify-between">
              <dt style={{ color: "var(--text-muted)" }}>Subtotal</dt>
              <dd className="tnum">{formatAmount(Number(purchase.subtotalMinor))}</dd>
            </div>
            <div className="flex justify-between">
              <dt style={{ color: "var(--text-muted)" }}>GST</dt>
              <dd className="tnum">{formatAmount(Number(purchase.taxMinor))}</dd>
            </div>
            <div className="flex justify-between font-semibold pt-1.5" style={{ borderTop: "1px solid var(--border)" }}>
              <dt>Total</dt>
              <dd className="tnum">{formatINR(Number(purchase.totalMinor))}</dd>
            </div>
            <div className="flex justify-between">
              <dt style={{ color: "var(--text-muted)" }}>Paid</dt>
              <dd className="tnum" style={{ color: "var(--success)" }}>
                {formatAmount(Number(purchase.paidMinor))}
              </dd>
            </div>
            {due > 0 && (
              <div className="flex justify-between font-semibold">
                <dt>Still owed</dt>
                <dd className="tnum" style={{ color: "var(--warning)" }}>
                  {formatAmount(due)}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <aside className="space-y-4">
          <SupplierPaymentPanel
            purchaseId={id}
            dueMinor={due}
            hasSupplier={Boolean(purchase.supplierId)}
            payments={payments.map((p) => ({
              id: p.id,
              amountMinor: Number(p.amountMinor),
              method: p.method,
              paidAt: p.paidAt.toISOString(),
            }))}
          />

          {purchase.notes && (
            <section className="card p-4">
              <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
                Notes
              </p>
              <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                {purchase.notes}
              </p>
            </section>
          )}
        </aside>
      </div>
    </Page>
  );
}
