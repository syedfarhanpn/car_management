import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { formatAmount, formatINR } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { formatRegistration } from "@/lib/vehicle";

/**
 * PUBLIC INVOICE VIEW
 *
 * Reached only by the unguessable token in the WhatsApp link — there is no
 * login, and nothing here is enumerable: the token is the credential, and the
 * query is by token alone, so an invoice id from elsewhere reveals nothing.
 *
 * Deliberately shows less than the internal view: no cost, no margin, no
 * internal notes, and no way to act on anything. It exists so a customer can
 * see what they are paying for without having to be sent a PDF.
 */
export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) notFound();

  const db = await getDb();
  const [invoice] = await db.select().from(s.invoices).where(eq(s.invoices.publicToken, token)).limit(1);
  if (!invoice || invoice.status === "DRAFT") notFound();

  const [org, lines, vehicle] = await Promise.all([
    db.select().from(s.organizations).where(eq(s.organizations.id, invoice.orgId)).limit(1).then((r) => r[0]),
    db.select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, invoice.id)).orderBy(asc(s.invoiceLines.sortOrder)),
    invoice.vehicleId
      ? db.select().from(s.vehicles).where(eq(s.vehicles.id, invoice.vehicleId)).limit(1).then((r) => r[0])
      : Promise.resolve(undefined),
  ]);

  const balance = Number(invoice.balanceMinor);
  const reimbursable = lines.filter((l) => l.isReimbursable);
  const regular = lines.filter((l) => !l.isReimbursable);
  const cancelled = invoice.status === "CANCELLED";

  return (
    <main className="min-h-screen py-8 px-4" style={{ background: "var(--bg)" }}>
      <div className="max-w-2xl mx-auto">
        <article className="card p-6 sm:p-8">
          <header className="flex flex-wrap justify-between gap-4 pb-5" style={{ borderBottom: "2px solid var(--text)" }}>
            <div>
              <h1 className="text-[19px] font-bold tracking-tight">{org?.name}</h1>
              <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {org?.addressLine1}
                {org?.city && <>, {org.city}</>}
                <br />
                {org?.phone}
              </p>
              {org?.gstin && <p className="mt-1.5 text-[12px] font-semibold tnum">GSTIN: {org.gstin}</p>}
            </div>
            <div className="text-right">
              <p className="text-[14px] font-bold uppercase tracking-wide">
                {invoice.isTaxInvoice ? "Tax Invoice" : "Invoice"}
              </p>
              <p className="mt-1 text-[13px] font-semibold tnum">{invoice.invoiceNumber}</p>
              <p className="text-[12px] tnum" style={{ color: "var(--text-muted)" }}>
                {new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          </header>

          {cancelled && (
            <p
              className="mt-4 rounded-lg px-3.5 py-2.5 text-[13px] font-semibold"
              style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
            >
              This invoice has been cancelled.
            </p>
          )}

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
            </div>
            {vehicle && (
              <div className="text-right">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
                  Vehicle
                </p>
                <p className="mt-1 text-[14px] font-semibold tnum">{formatRegistration(vehicle.registrationNumber)}</p>
              </div>
            )}
          </section>

          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr style={{ borderTop: "1px solid var(--border-strong)", borderBottom: "1px solid var(--border-strong)" }}>
                  <th className="text-left font-semibold py-2 pr-2">Description</th>
                  <th className="text-center font-semibold py-2 px-2">Qty</th>
                  <th className="text-right font-semibold py-2 pl-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {regular.map((l) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="py-2 pr-2">{l.description}</td>
                    <td className="py-2 px-2 text-center tnum">{Number(l.quantity)}</td>
                    <td className="py-2 pl-2 text-right tnum font-medium">{formatAmount(Number(l.lineTotalMinor))}</td>
                  </tr>
                ))}

                {reimbursable.length > 0 && (
                  <>
                    <tr>
                      <td
                        colSpan={3}
                        className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--text-subtle)" }}
                      >
                        Purchased on your behalf
                      </td>
                    </tr>
                    {reimbursable.map((l) => (
                      <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="py-2 pr-2">{l.description}</td>
                        <td className="py-2 px-2 text-center tnum">{Number(l.quantity)}</td>
                        <td className="py-2 pl-2 text-right tnum font-medium">{formatAmount(Number(l.lineTotalMinor))}</td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>

          <dl className="mt-5 ml-auto max-w-[240px] text-[13px] space-y-1">
            <div className="flex justify-between">
              <dt style={{ color: "var(--text-muted)" }}>Taxable value</dt>
              <dd className="tnum">{formatAmount(Number(invoice.taxableMinor))}</dd>
            </div>
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
            {Number(invoice.reimbursableMinor) > 0 && (
              <div className="flex justify-between">
                <dt style={{ color: "var(--text-muted)" }}>Parts on your behalf</dt>
                <dd className="tnum">{formatAmount(Number(invoice.reimbursableMinor))}</dd>
              </div>
            )}
            <div className="flex justify-between pt-2 mt-1 text-[15px] font-bold" style={{ borderTop: "1px solid var(--text)" }}>
              <dt>Total</dt>
              <dd className="tnum">{formatINR(Number(invoice.totalMinor))}</dd>
            </div>
            {Number(invoice.paidMinor) > 0 && (
              <div className="flex justify-between">
                <dt style={{ color: "var(--text-muted)" }}>Paid</dt>
                <dd className="tnum" style={{ color: "var(--success)" }}>
                  {formatAmount(Number(invoice.paidMinor))}
                </dd>
              </div>
            )}
            {!cancelled && balance > 0 && (
              <div className="flex justify-between font-semibold">
                <dt>Balance due</dt>
                <dd className="tnum" style={{ color: "var(--warning)" }}>
                  {formatAmount(balance)}
                </dd>
              </div>
            )}
            {!cancelled && balance <= 0 && (
              <p className="text-right text-[13px] font-semibold pt-1" style={{ color: "var(--success)" }}>
                Paid in full — thank you
              </p>
            )}
          </dl>
        </article>

        <p className="mt-4 text-center text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
          Questions about this bill? Call {org?.phone}.
        </p>
      </div>
    </main>
  );
}
