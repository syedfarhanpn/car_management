import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { formatAmount, formatINR } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { formatRegistration } from "@/lib/vehicle";
import { Badge, INVOICE_STATUS, Page, PageHeader } from "@/components/ui";
import { PaymentPanel } from "./payment-panel";
import { PrintButton } from "./print-button";
import { SendWhatsAppButton } from "@/components/send-whatsapp-button";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const db = await getDb();

  const [invoice] = await db
    .select()
    .from(s.invoices)
    .where(and(eq(s.invoices.id, id), eq(s.invoices.orgId, user.orgId)))
    .limit(1);
  if (!invoice) notFound();

  const [org, lines, vehicle, payments] = await Promise.all([
    db.select().from(s.organizations).where(eq(s.organizations.id, user.orgId)).limit(1).then((r) => r[0]),
    db.select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, id)).orderBy(asc(s.invoiceLines.sortOrder)),
    invoice.vehicleId
      ? db
          .select({
            registration: s.vehicles.registrationNumber,
            make: s.vehicleModels.make,
            model: s.vehicleModels.model,
          })
          .from(s.vehicles)
          .leftJoin(s.vehicleModels, eq(s.vehicleModels.id, s.vehicles.modelId))
          .where(eq(s.vehicles.id, invoice.vehicleId))
          .limit(1)
          .then((r) => r[0])
      : Promise.resolve(undefined),
    db
      .select({
        id: s.payments.id,
        receiptNumber: s.payments.receiptNumber,
        amountMinor: s.paymentAllocations.amountMinor,
        method: s.payments.method,
        reference: s.payments.reference,
        receivedAt: s.payments.receivedAt,
      })
      .from(s.paymentAllocations)
      .innerJoin(s.payments, eq(s.payments.id, s.paymentAllocations.paymentId))
      .where(eq(s.paymentAllocations.invoiceId, id))
      .orderBy(asc(s.payments.receivedAt)),
  ]);

  const st = INVOICE_STATUS[invoice.status] ?? INVOICE_STATUS.DRAFT;
  const balance = Number(invoice.balanceMinor);
  const serviceLines = lines.filter((l) => !l.isReimbursable);
  const reimbursableLines = lines.filter((l) => l.isReimbursable);
  const hasTax = Number(invoice.cgstMinor) + Number(invoice.sgstMinor) + Number(invoice.igstMinor) > 0;

  // GST summary grouped by rate — a tax invoice must carry this block.
  const byRate = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const l of lines) {
    if (l.gstRate === 0) continue;
    const row = byRate.get(l.gstRate) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    row.taxable += Number(l.taxableMinor);
    row.cgst += Number(l.cgstMinor);
    row.sgst += Number(l.sgstMinor);
    row.igst += Number(l.igstMinor);
    byRate.set(l.gstRate, row);
  }

  return (
    <Page>
      <div className="print:hidden">
        <PageHeader
          title={invoice.invoiceNumber}
          backHref="/billing"
          backLabel="Billing"
          subtitle={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge tone={st.tone}>{st.label}</Badge>
              <span>
                {new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
              {invoice.jobCardId && (
                <Link href={`/job-cards/${invoice.jobCardId}`} style={{ color: "var(--brand)" }}>
                  View job card
                </Link>
              )}
            </span>
          }
          actions={
            <>
              {balance > 0 && invoice.status !== "CANCELLED" && (
                <SendWhatsAppButton kind="payment-reminder" id={id} label="Payment reminder" />
              )}
              <SendWhatsAppButton kind="invoice" id={id} />
              <PrintButton />
            </>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px] items-start">
        {/* ------------------------------------------------ the document */}
        <article
          className="card p-6 sm:p-8 print:shadow-none print:border-0"
          style={{ background: "var(--surface)" }}
        >
          <header className="flex flex-wrap justify-between gap-4 pb-5" style={{ borderBottom: "2px solid var(--text)" }}>
            <div>
              <h2 className="text-[19px] font-bold tracking-tight">{org?.name}</h2>
              <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {org?.addressLine1}
                {org?.addressLine2 && <>, {org.addressLine2}</>}
                <br />
                {org?.city}, {org?.state} {org?.pincode}
                <br />
                {org?.phone}
              </p>
              {org?.gstin && (
                <p className="mt-1.5 text-[12px] font-semibold tnum">GSTIN: {org.gstin}</p>
              )}
            </div>

            <div className="text-right">
              <p className="text-[15px] font-bold uppercase tracking-wide">
                {invoice.isTaxInvoice ? "Tax Invoice" : "Invoice"}
              </p>
              <p className="mt-1.5 text-[13px] font-semibold tnum">{invoice.invoiceNumber}</p>
              <p className="text-[12px] tnum" style={{ color: "var(--text-muted)" }}>
                {new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              {invoice.placeOfSupply && (
                <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  Place of supply: {invoice.placeOfSupply}
                </p>
              )}
            </div>
          </header>

          <section className="py-4 flex flex-wrap justify-between gap-4">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
                Bill to
              </p>
              <p className="mt-1 text-[14px] font-semibold">{invoice.billToName}</p>
              {invoice.billToPhone && (
                <p className="text-[12.5px] tnum" style={{ color: "var(--text-muted)" }}>
                  {formatPhone(invoice.billToPhone)}
                </p>
              )}
              {invoice.billToAddress && (
                <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  {invoice.billToAddress}
                </p>
              )}
              {invoice.billToGstin && (
                <p className="mt-0.5 text-[12px] font-medium tnum">GSTIN: {invoice.billToGstin}</p>
              )}
            </div>

            {vehicle && (
              <div className="text-right">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
                  Vehicle
                </p>
                <p className="mt-1 text-[14px] font-semibold tnum">{formatRegistration(vehicle.registration)}</p>
                {vehicle.make && (
                  <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {vehicle.make} {vehicle.model}
                  </p>
                )}
              </div>
            )}
          </section>

          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr style={{ borderTop: "1px solid var(--border-strong)", borderBottom: "1px solid var(--border-strong)" }}>
                  <th className="text-left font-semibold py-2 pr-2">Description</th>
                  {invoice.isTaxInvoice && <th className="text-left font-semibold py-2 px-2 whitespace-nowrap">HSN/SAC</th>}
                  <th className="text-center font-semibold py-2 px-2">Qty</th>
                  <th className="text-right font-semibold py-2 px-2">Rate</th>
                  {hasTax && <th className="text-right font-semibold py-2 px-2">Taxable</th>}
                  {hasTax && <th className="text-center font-semibold py-2 px-2">GST</th>}
                  <th className="text-right font-semibold py-2 pl-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {serviceLines.map((l) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="py-2 pr-2">{l.description}</td>
                    {invoice.isTaxInvoice && (
                      <td className="py-2 px-2 tnum" style={{ color: "var(--text-muted)" }}>
                        {l.hsnSacCode ?? "—"}
                      </td>
                    )}
                    <td className="py-2 px-2 text-center tnum">{Number(l.quantity)}</td>
                    <td className="py-2 px-2 text-right tnum">{formatAmount(Number(l.unitPriceMinor))}</td>
                    {hasTax && <td className="py-2 px-2 text-right tnum">{formatAmount(Number(l.taxableMinor))}</td>}
                    {hasTax && (
                      <td className="py-2 px-2 text-center tnum" style={{ color: "var(--text-muted)" }}>
                        {l.gstRate}%
                      </td>
                    )}
                    <td className="py-2 pl-2 text-right tnum font-medium">{formatAmount(Number(l.lineTotalMinor))}</td>
                  </tr>
                ))}

                {/*
                  Parts bought for the customer are shown in their own block and
                  labelled, because they are a reimbursement rather than a sale.
                  Burying them among the service lines is how a customer ends up
                  thinking the shop marked up a part it merely fetched.
                */}
                {reimbursableLines.length > 0 && (
                  <>
                    <tr>
                      <td
                        colSpan={invoice.isTaxInvoice ? (hasTax ? 7 : 5) : hasTax ? 6 : 4}
                        className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--text-subtle)" }}
                      >
                        Purchased on your behalf
                      </td>
                    </tr>
                    {reimbursableLines.map((l) => (
                      <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="py-2 pr-2">{l.description}</td>
                        {invoice.isTaxInvoice && (
                          <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>
                            —
                          </td>
                        )}
                        <td className="py-2 px-2 text-center tnum">{Number(l.quantity)}</td>
                        <td className="py-2 px-2 text-right tnum">{formatAmount(Number(l.unitPriceMinor))}</td>
                        {hasTax && <td className="py-2 px-2 text-right tnum">{formatAmount(Number(l.taxableMinor))}</td>}
                        {hasTax && (
                          <td className="py-2 px-2 text-center tnum" style={{ color: "var(--text-muted)" }}>
                            {l.gstRate ? `${l.gstRate}%` : "—"}
                          </td>
                        )}
                        <td className="py-2 pl-2 text-right tnum font-medium">{formatAmount(Number(l.lineTotalMinor))}</td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap justify-between gap-6">
            {invoice.isTaxInvoice && byRate.size > 0 && (
              <div className="min-w-[240px]">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-subtle)" }}>
                  Tax summary
                </p>
                <table className="text-[11.5px] tnum">
                  <thead>
                    <tr style={{ color: "var(--text-muted)" }}>
                      <th className="text-left font-medium pr-3 pb-1">Rate</th>
                      <th className="text-right font-medium px-3 pb-1">Taxable</th>
                      <th className="text-right font-medium px-3 pb-1">CGST</th>
                      <th className="text-right font-medium pl-3 pb-1">SGST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...byRate.entries()].map(([rate, r]) => (
                      <tr key={rate}>
                        <td className="pr-3">{rate}%</td>
                        <td className="text-right px-3">{formatAmount(r.taxable)}</td>
                        <td className="text-right px-3">{formatAmount(r.cgst)}</td>
                        <td className="text-right pl-3">{formatAmount(r.sgst)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <dl className="ml-auto min-w-[230px] text-[13px] space-y-1">
              <div className="flex justify-between">
                <dt style={{ color: "var(--text-muted)" }}>Taxable value</dt>
                <dd className="tnum">{formatAmount(Number(invoice.taxableMinor))}</dd>
              </div>
              {Number(invoice.discountMinor) > 0 && (
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-muted)" }}>Discount</dt>
                  <dd className="tnum" style={{ color: "var(--success)" }}>
                    −{formatAmount(Number(invoice.discountMinor))}
                  </dd>
                </div>
              )}
              {Number(invoice.cgstMinor) > 0 && (
                <>
                  <div className="flex justify-between">
                    <dt style={{ color: "var(--text-muted)" }}>CGST</dt>
                    <dd className="tnum">{formatAmount(Number(invoice.cgstMinor))}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt style={{ color: "var(--text-muted)" }}>SGST</dt>
                    <dd className="tnum">{formatAmount(Number(invoice.sgstMinor))}</dd>
                  </div>
                </>
              )}
              {Number(invoice.igstMinor) > 0 && (
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-muted)" }}>IGST</dt>
                  <dd className="tnum">{formatAmount(Number(invoice.igstMinor))}</dd>
                </div>
              )}
              {Number(invoice.reimbursableMinor) > 0 && (
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-muted)" }}>Reimbursable parts</dt>
                  <dd className="tnum">{formatAmount(Number(invoice.reimbursableMinor))}</dd>
                </div>
              )}
              {Number(invoice.roundOffMinor) !== 0 && (
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-muted)" }}>Round off</dt>
                  <dd className="tnum">
                    {Number(invoice.roundOffMinor) > 0 ? "+" : "−"}
                    {formatAmount(Math.abs(Number(invoice.roundOffMinor)))}
                  </dd>
                </div>
              )}
              <div
                className="flex justify-between pt-2 mt-1 text-[15px] font-bold"
                style={{ borderTop: "1px solid var(--text)" }}
              >
                <dt>Total</dt>
                <dd className="tnum">{formatINR(Number(invoice.totalMinor))}</dd>
              </div>
              {Number(invoice.paidMinor) > 0 && (
                <>
                  <div className="flex justify-between">
                    <dt style={{ color: "var(--text-muted)" }}>Paid</dt>
                    <dd className="tnum" style={{ color: "var(--success)" }}>
                      {formatAmount(Number(invoice.paidMinor))}
                    </dd>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <dt>Balance due</dt>
                    <dd className="tnum" style={{ color: balance > 0 ? "var(--warning)" : "var(--success)" }}>
                      {formatAmount(balance)}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </div>

          <footer className="mt-8 pt-4 flex flex-wrap justify-between gap-4" style={{ borderTop: "1px solid var(--border)" }}>
            <p className="text-[11px] max-w-xs" style={{ color: "var(--text-subtle)" }}>
              {invoice.isTaxInvoice
                ? "This is a computer-generated tax invoice."
                : "This is a computer-generated invoice."}
            </p>
            <div className="text-right">
              <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>
                For {org?.name}
              </p>
              <p className="mt-8 text-[11px]" style={{ color: "var(--text-subtle)" }}>
                Authorised signatory
              </p>
            </div>
          </footer>
        </article>

        {/* ------------------------------------------------ side panel */}
        <aside className="space-y-4 print:hidden lg:sticky lg:top-4">
          <PaymentPanel
            invoiceId={id}
            balanceMinor={balance}
            status={invoice.status}
            canCancel={can.voidInvoice(user)}
            payments={payments.map((p) => ({
              id: p.id,
              receiptNumber: p.receiptNumber,
              amountMinor: Number(p.amountMinor),
              method: p.method,
              reference: p.reference,
              receivedAt: p.receivedAt.toISOString(),
            }))}
          />
        </aside>
      </div>
    </Page>
  );
}
