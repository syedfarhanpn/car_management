import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { getTaxConfig } from "@/lib/settings";
import { computeTotals, type TotalsLine } from "@/lib/services/totals";
import { resolvePriceList } from "@/lib/services/pricing";
import { getStockOnHand } from "@/lib/services/stock";
import { isInterState } from "@/lib/tax";
import { formatPhone } from "@/lib/phone";
import { formatRegistration } from "@/lib/vehicle";
import { Badge, JOB_STATUS, Page, PageHeader } from "@/components/ui";
import { JobEditor } from "./job-editor";
import { JobStatusBar } from "./job-status-bar";

export default async function JobCardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const db = await getDb();

  const [job] = await db
    .select()
    .from(s.jobCards)
    .where(and(eq(s.jobCards.id, id), eq(s.jobCards.orgId, user.orgId)))
    .limit(1);
  if (!job) notFound();

  const [client, vehicle, lines, config] = await Promise.all([
    db.select().from(s.clients).where(eq(s.clients.id, job.clientId)).limit(1).then((r) => r[0]),
    db
      .select({
        id: s.vehicles.id,
        registration: s.vehicles.registrationNumber,
        color: s.vehicles.color,
        className: s.vehicleClasses.name,
        make: s.vehicleModels.make,
        model: s.vehicleModels.model,
        modelText: s.vehicles.modelText,
        oilGrade: s.vehicleModels.engineOilGrade,
        oilCapacity: s.vehicleModels.engineOilCapacityMl,
      })
      .from(s.vehicles)
      .leftJoin(s.vehicleModels, eq(s.vehicleModels.id, s.vehicles.modelId))
      .leftJoin(s.vehicleClasses, eq(s.vehicleClasses.id, s.vehicles.vehicleClassId))
      .where(eq(s.vehicles.id, job.vehicleId))
      .limit(1)
      .then((r) => r[0]),
    db.select().from(s.jobCardLines).where(eq(s.jobCardLines.jobCardId, id)).orderBy(asc(s.jobCardLines.sortOrder)),
    getTaxConfig(user.orgId),
  ]);

  const [services, parts, priceList, stock, invoice] = await Promise.all([
    db
      .select({
        id: s.services.id,
        name: s.services.name,
        categoryId: s.services.categoryId,
        categoryName: s.serviceCategories.name,
        requiresEstimate: s.serviceCategories.requiresEstimate,
        gstRate: s.services.gstRate,
      })
      .from(s.services)
      .innerJoin(s.serviceCategories, eq(s.serviceCategories.id, s.services.categoryId))
      .where(and(eq(s.services.orgId, user.orgId), eq(s.services.isActive, true)))
      .orderBy(asc(s.serviceCategories.sortOrder), asc(s.services.name)),
    db
      .select()
      .from(s.inventoryItems)
      .where(and(eq(s.inventoryItems.orgId, user.orgId), eq(s.inventoryItems.type, "STOCKED_PART"), eq(s.inventoryItems.isActive, true)))
      .orderBy(asc(s.inventoryItems.name)),
    resolvePriceList({ orgId: user.orgId, vehicleClassId: job.vehicleClassId, clientId: job.clientId }),
    getStockOnHand(user.orgId),
    db.select({ id: s.invoices.id, number: s.invoices.invoiceNumber }).from(s.invoices).where(eq(s.invoices.jobCardId, id)).limit(1).then((r) => r[0]),
  ]);

  const totals = computeTotals({
    lines: lines.map<TotalsLine>((l) => ({
      lineType: l.lineType,
      description: l.description,
      quantity: Number(l.quantity),
      unitPriceMinor: Number(l.unitPriceMinor),
      lineTotalMinor: Number(l.lineTotalMinor),
      discountMinor: Number(l.discountMinor),
      gstRate: l.gstRate,
      costMinor: Number(l.costMinor),
      markupMinor: Number(l.markupMinor),
    })),
    config,
    interState: isInterState(client?.state === "Kerala" ? "32" : null, config),
  });

  const st = JOB_STATUS[job.status] ?? JOB_STATUS.DRAFT;
  const locked = ["INVOICED", "DELIVERED", "CANCELLED"].includes(job.status);
  const needsEstimate = services.some(
    (svc) => svc.requiresEstimate && lines.some((l) => l.serviceId === svc.id),
  );

  return (
    <Page wide>
      <PageHeader
        title={job.jobNumber}
        backHref="/job-cards"
        backLabel="Job cards"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone={st.tone}>{st.label}</Badge>
            {job.kind === "ESTIMATE" && <Badge tone="warning">Estimate</Badge>}
            <span>
              {new Date(job.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </span>
        }
        actions={
          invoice ? (
            <Link href={`/billing/${invoice.id}`} className="btn btn-primary">
              View invoice {invoice.number}
            </Link>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        <div className="space-y-4 min-w-0">
          <section className="card p-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
                Vehicle
              </p>
              <p className="mt-1 text-[16px] font-semibold tnum tracking-tight">
                {vehicle ? formatRegistration(vehicle.registration) : "—"}
              </p>
              <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                {vehicle?.make && vehicle?.model ? `${vehicle.make} ${vehicle.model}` : vehicle?.modelText ?? "Model not recorded"}
                {vehicle?.className ? ` · ${vehicle.className}` : ""}
                {job.odometerKm ? ` · ${job.odometerKm.toLocaleString("en-IN")} km` : ""}
              </p>
              {vehicle?.oilGrade && (
                <p className="mt-1 text-[12px]" style={{ color: "var(--text-subtle)" }}>
                  Takes {vehicle.oilCapacity ? `${(vehicle.oilCapacity / 1000).toFixed(1)}L of ` : ""}
                  {vehicle.oilGrade}
                </p>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
                Customer
              </p>
              <p className="mt-1 text-[14px] font-medium">
                <Link href={`/clients/${job.clientId}`} className="hover:underline">
                  {client?.name}
                </Link>
              </p>
              <p className="text-[12.5px] tnum" style={{ color: "var(--text-muted)" }}>
                {client?.phone ? formatPhone(client.phone) : ""}
              </p>
            </div>
            {job.customerComplaint && (
              <div className="sm:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
                  Customer request
                </p>
                <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
                  {job.customerComplaint}
                </p>
              </div>
            )}
          </section>

          <JobEditor
            jobCardId={id}
            locked={locked}
            canDiscount={can.discount(user)}
            canSeeCost={can.viewCosts(user)}
            lines={lines.map((l, i) => ({
              id: l.id,
              lineType: l.lineType,
              description: l.description,
              quantity: Number(l.quantity),
              unitPriceMinor: Number(l.unitPriceMinor),
              discountMinor: Number(l.discountMinor),
              costMinor: Number(l.costMinor),
              markupMinor: Number(l.markupMinor),
              supplierName: l.supplierName,
              displayMinor: totals.lines[i]?.displayMinor ?? Number(l.lineTotalMinor),
            }))}
            services={services.map((svc) => ({
              id: svc.id,
              name: svc.name,
              categoryName: svc.categoryName,
              requiresEstimate: svc.requiresEstimate,
              priceMinor: priceList.get(svc.id) ?? null,
            }))}
            parts={parts.map((p) => ({
              id: p.id,
              name: p.name,
              salePriceMinor: Number(p.salePriceMinor),
              stock: stock.get(p.id) ?? 0,
            }))}
          />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <section className="card p-4">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
              Bill summary
            </h3>

            <dl className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <dt style={{ color: "var(--text-muted)" }}>Taxable value</dt>
                <dd className="tnum">₹{(totals.taxableMinor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</dd>
              </div>

              {totals.discountMinor > 0 && (
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-muted)" }}>Discount</dt>
                  <dd className="tnum" style={{ color: "var(--success)" }}>
                    −₹{(totals.discountMinor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </dd>
                </div>
              )}

              {config.enabled && totals.cgstMinor > 0 && (
                <>
                  <div className="flex justify-between">
                    <dt style={{ color: "var(--text-muted)" }}>CGST</dt>
                    <dd className="tnum">₹{(totals.cgstMinor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt style={{ color: "var(--text-muted)" }}>SGST</dt>
                    <dd className="tnum">₹{(totals.sgstMinor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</dd>
                  </div>
                </>
              )}

              {config.enabled && totals.igstMinor > 0 && (
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-muted)" }}>IGST</dt>
                  <dd className="tnum">₹{(totals.igstMinor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</dd>
                </div>
              )}

              {totals.reimbursableMinor > 0 && (
                <div className="flex justify-between pt-1.5" style={{ borderTop: "1px dashed var(--border)" }}>
                  <dt style={{ color: "var(--text-muted)" }}>
                    Parts on your behalf
                    <span className="block text-[11px]" style={{ color: "var(--text-subtle)" }}>
                      Reimbursement, not a sale
                    </span>
                  </dt>
                  <dd className="tnum">₹{(totals.reimbursableMinor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</dd>
                </div>
              )}

              {totals.roundOffMinor !== 0 && (
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-muted)" }}>Round off</dt>
                  <dd className="tnum">
                    {totals.roundOffMinor > 0 ? "+" : "−"}₹
                    {(Math.abs(totals.roundOffMinor) / 100).toFixed(2)}
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-3 pt-3 flex justify-between items-baseline" style={{ borderTop: "1px solid var(--border)" }}>
              <span className="text-[13px] font-semibold">Total</span>
              <span className="text-[20px] font-semibold tnum tracking-tight">
                ₹{(totals.totalMinor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {config.enabled && (
              <p className="mt-2 text-[11px]" style={{ color: "var(--text-subtle)" }}>
                {config.pricesIncludeTax ? "Prices include GST" : "GST added on top of listed prices"}
              </p>
            )}
          </section>

          <JobStatusBar
            jobCardId={id}
            status={job.status}
            hasLines={lines.length > 0}
            needsEstimate={needsEstimate}
            invoiceId={invoice?.id ?? null}
          />
        </aside>
      </div>
    </Page>
  );
}
