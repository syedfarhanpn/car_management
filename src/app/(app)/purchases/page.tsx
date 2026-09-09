import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { HandCoins, Plus, Truck } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { formatRegistration } from "@/lib/vehicle";
import { Badge, EmptyState, Page, PageHeader, Table, Td, Th } from "@/components/ui";

const TABS = [
  { key: "stock", label: "Stock purchases" },
  { key: "pass-through", label: "Bought for customers" },
  { key: "all", label: "All" },
] as const;

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const { filter = "stock" } = await searchParams;
  const active = TABS.find((t) => t.key === filter) ?? TABS[0];
  const db = await getDb();

  const rows = await db
    .select({
      id: s.purchases.id,
      billNumber: s.purchases.billNumber,
      billDate: s.purchases.billDate,
      isPassThrough: s.purchases.isPassThrough,
      totalMinor: s.purchases.totalMinor,
      paidMinor: s.purchases.paidMinor,
      paymentStatus: s.purchases.paymentStatus,
      supplierName: sql<string>`coalesce(${s.suppliers.name}, ${s.purchases.supplierNameText}, '—')`,
      jobCardId: s.purchases.jobCardId,
      jobNumber: s.jobCards.jobNumber,
      clientName: s.clients.name,
      registration: s.vehicles.registrationNumber,
      invoiceStatus: s.invoices.status,
    })
    .from(s.purchases)
    .leftJoin(s.suppliers, eq(s.suppliers.id, s.purchases.supplierId))
    .leftJoin(s.jobCards, eq(s.jobCards.id, s.purchases.jobCardId))
    .leftJoin(s.clients, eq(s.clients.id, s.purchases.forClientId))
    .leftJoin(s.vehicles, eq(s.vehicles.id, s.jobCards.vehicleId))
    .leftJoin(s.invoices, eq(s.invoices.jobCardId, s.purchases.jobCardId))
    .where(
      and(
        eq(s.purchases.orgId, user.orgId),
        active.key === "all" ? undefined : eq(s.purchases.isPassThrough, active.key === "pass-through"),
      ),
    )
    .orderBy(desc(s.purchases.billDate), desc(s.purchases.createdAt))
    .limit(100);

  /**
   * Money the shop has fronted on customer parts and not yet recovered.
   * Recovery is tracked through the customer's invoice, not the supplier
   * payment — the shop paying its supplier does not mean the customer paid us.
   */
  const [reimb] = await db
    .select({ total: sql<string>`coalesce(sum(${s.purchases.totalMinor}), 0)` })
    .from(s.purchases)
    .leftJoin(s.invoices, and(eq(s.invoices.jobCardId, s.purchases.jobCardId), sql`${s.invoices.status} <> 'CANCELLED'`))
    .where(
      and(
        eq(s.purchases.orgId, user.orgId),
        eq(s.purchases.isPassThrough, true),
        sql`(${s.invoices.id} is null or ${s.invoices.status} <> 'PAID')`,
      ),
    );

  const [payable] = await db
    .select({ total: sql<string>`coalesce(sum(${s.purchases.totalMinor} - ${s.purchases.paidMinor}), 0)` })
    .from(s.purchases)
    .where(
      and(eq(s.purchases.orgId, user.orgId), eq(s.purchases.isPassThrough, false), sql`${s.purchases.paymentStatus} <> 'PAID'`),
    );

  const outstanding = Number(reimb?.total ?? 0);
  const owed = Number(payable?.total ?? 0);

  return (
    <Page wide>
      <PageHeader
        title="Purchases"
        backHref="/dashboard"
        actions={
          <>
            <Link href="/purchases/suppliers" className="btn btn-ghost">
              <Truck size={16} />
              Suppliers
            </Link>
            <Link href="/purchases/new" className="btn btn-primary">
              <Plus size={16} />
              Record bill
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <div className="card p-4" style={owed > 0 ? { borderColor: "var(--warning)" } : undefined}>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Owed to suppliers
          </p>
          <p
            className="mt-1 text-[24px] font-semibold tnum leading-none"
            style={{ color: owed > 0 ? "var(--warning)" : undefined }}
          >
            {formatINR(owed)}
          </p>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
            Unpaid stock bills
          </p>
        </div>

        <div className="card p-4" style={outstanding > 0 ? { borderColor: "var(--warning)" } : undefined}>
          <div className="flex items-start gap-2">
            <HandCoins size={16} style={{ color: "var(--warning)" }} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                Your cash in customer parts
              </p>
              <p
                className="mt-1 text-[24px] font-semibold tnum leading-none"
                style={{ color: outstanding > 0 ? "var(--warning)" : undefined }}
              >
                {formatINR(outstanding)}
              </p>
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                Fronted for customers, not yet recovered. Neither revenue nor stock.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/purchases?filter=${t.key}`}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium"
            style={
              t.key === active.key
                ? { background: "var(--brand)", color: "var(--brand-fg)" }
                : { background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Nothing recorded yet"
            description={
              active.key === "pass-through"
                ? "Parts bought for a specific customer are added on their job card, and show up here automatically."
                : "Record a supplier bill to bring stock in and roll the average cost forward."
            }
            action={
              active.key !== "pass-through" ? (
                <Link href="/purchases/new" className="btn btn-primary">
                  <Plus size={16} />
                  Record bill
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Bill</Th>
              <Th>Supplier</Th>
              {active.key !== "stock" && <Th>For</Th>}
              <Th align="right">Total</Th>
              {active.key !== "pass-through" && <Th align="right">Unpaid</Th>}
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const due = Number(r.totalMinor) - Number(r.paidMinor);
              const recovered = r.invoiceStatus === "PAID";
              return (
                <tr key={r.id} className="border-t">
                  <Td>
                    <Link href={`/purchases/${r.id}`} className="font-medium tnum hover:underline">
                      {r.billNumber ?? "No bill no."}
                    </Link>
                    <div className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                      {new Date(r.billDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                    </div>
                  </Td>
                  <Td muted>{r.supplierName}</Td>
                  {active.key !== "stock" && (
                    <Td muted>
                      {r.isPassThrough ? (
                        <>
                          {r.clientName ?? "—"}
                          {r.registration && (
                            <div className="text-[11.5px] tnum" style={{ color: "var(--text-subtle)" }}>
                              {formatRegistration(r.registration)} · {r.jobNumber}
                            </div>
                          )}
                        </>
                      ) : (
                        <span style={{ color: "var(--text-subtle)" }}>Stock</span>
                      )}
                    </Td>
                  )}
                  <Td align="right" strong>
                    <span className="tnum">{formatINR(Number(r.totalMinor))}</span>
                  </Td>
                  {active.key !== "pass-through" && (
                    <Td align="right">
                      <span className="tnum" style={{ color: due > 0 ? "var(--warning)" : "var(--text-subtle)" }}>
                        {due > 0 ? formatINR(due) : "—"}
                      </span>
                    </Td>
                  )}
                  <Td>
                    {r.isPassThrough ? (
                      recovered ? (
                        <Badge tone="success">Recovered</Badge>
                      ) : (
                        <Badge tone="warning">Awaiting customer</Badge>
                      )
                    ) : r.paymentStatus === "PAID" ? (
                      <Badge tone="success">Paid</Badge>
                    ) : r.paymentStatus === "PARTIAL" ? (
                      <Badge tone="warning">Part paid</Badge>
                    ) : (
                      <Badge tone="danger">Unpaid</Badge>
                    )}
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
