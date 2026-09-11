import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import {
  getConsumptionVariance,
  getPeriodSummary,
  getReceivablesAgeing,
  getServiceMargins,
  getTopClients,
  monthPeriod,
} from "@/lib/queries/reports";
import { Badge, Page, PageHeader, Table, Td, Th } from "@/components/ui";

const UNIT: Record<string, string> = { ML: "ml", GRAM: "g", PIECE: "pcs" };

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const { m = "0" } = await searchParams;
  const offset = Number(m) || 0;
  const period = monthPeriod(offset);

  const [summary, margins, variance, ageing, topClients] = await Promise.all([
    getPeriodSummary(user.orgId, period),
    getServiceMargins(user.orgId, period),
    getConsumptionVariance(user.orgId, period),
    getReceivablesAgeing(user.orgId),
    getTopClients(user.orgId, period),
  ]);

  const netMinor = summary.revenueMinor - summary.expensesMinor;
  const varianceValue = variance.reduce((a, v) => a + v.varianceValueMinor, 0);

  return (
    <Page wide>
      <PageHeader
        title="Revenue & Reports"
        subtitle={period.label}
        actions={
          <div className="flex gap-1.5">
            <Link href={`/revenue?m=${offset - 1}`} className="btn btn-ghost text-[13px] py-1.5">
              ← Previous
            </Link>
            {offset < 0 && (
              <Link href={`/revenue?m=${offset + 1}`} className="btn btn-ghost text-[13px] py-1.5">
                Next →
              </Link>
            )}
          </div>
        }
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        <div className="card p-4">
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Revenue
          </p>
          <p className="mt-1 text-[22px] font-semibold tnum leading-none">{formatINR(summary.revenueMinor)}</p>
          {/* Revenue is the taxable value: GST and reimbursed parts are not income. */}
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-subtle)" }}>
            Excludes GST{summary.reimbursableMinor > 0 ? " & customer parts" : ""}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Collected
          </p>
          <p className="mt-1 text-[22px] font-semibold tnum leading-none">{formatINR(summary.collectedMinor)}</p>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-subtle)" }}>
            Cash actually received
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Expenses
          </p>
          <p className="mt-1 text-[22px] font-semibold tnum leading-none">{formatINR(summary.expensesMinor)}</p>
        </div>
        <div className="card p-4" style={{ borderColor: netMinor >= 0 ? "var(--success)" : "var(--danger)" }}>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Revenue − expenses
          </p>
          <p
            className="mt-1 text-[22px] font-semibold tnum leading-none"
            style={{ color: netMinor >= 0 ? "var(--success)" : "var(--danger)" }}
          >
            {formatINR(netMinor)}
          </p>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-subtle)" }}>
            {summary.jobCount} jobs · {summary.invoiceCount} invoices
          </p>
        </div>
      </div>

      {/* ------------------------------------------------ margin by service */}
      <section className="mb-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-subtle)" }}>
          Margin by service
        </h2>
        {margins.length === 0 ? (
          <div className="card p-5 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            No completed work in {period.label}.
          </div>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Service</Th>
                  <Th align="right">Jobs</Th>
                  <Th align="right">Revenue</Th>
                  <Th align="right">Consumables</Th>
                  <Th align="right">Margin</Th>
                  <Th align="right">%</Th>
                </tr>
              </thead>
              <tbody>
                {margins.map((r) => (
                  <tr key={r.serviceId} className="border-t">
                    <Td>
                      <span className="font-medium">{r.name}</span>
                      <div className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                        {r.categoryName}
                      </div>
                    </Td>
                    <Td align="right" muted>
                      <span className="tnum">{r.jobs}</span>
                    </Td>
                    <Td align="right">
                      <span className="tnum">{formatINR(r.revenueMinor)}</span>
                    </Td>
                    <Td align="right" muted>
                      <span className="tnum">
                        {r.consumableCostMinor > 0 ? formatINR(r.consumableCostMinor) : "no recipe"}
                      </span>
                    </Td>
                    <Td align="right" strong>
                      <span className="tnum">{formatINR(r.marginMinor)}</span>
                    </Td>
                    <Td align="right">
                      <span
                        className="tnum font-medium"
                        style={{ color: r.marginPct >= 70 ? "var(--success)" : r.marginPct >= 40 ? undefined : "var(--warning)" }}
                      >
                        {r.marginPct.toFixed(0)}%
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
              Cost is the service&apos;s consumable recipe at current average cost. Salaries and rent are period costs and
              sit in expenses, not here — a service showing &ldquo;no recipe&rdquo; has no cost attached and will look
              more profitable than it is.
            </p>
          </>
        )}
      </section>

      {/* ------------------------------------------- consumption variance */}
      <section className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
            Consumption variance
          </h2>
          {variance.length > 0 && (
            <span
              className="text-[13px] tnum font-medium"
              style={{ color: varianceValue > 0 ? "var(--danger)" : "var(--success)" }}
            >
              {varianceValue > 0 ? `${formatINR(varianceValue)} more used than expected` : "Within expectations"}
            </span>
          )}
        </div>

        {variance.length === 0 ? (
          <div className="card p-5 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            No consumable movement in {period.label}.
          </div>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th align="right">Recipes expected</Th>
                  <Th align="right">Actually used</Th>
                  <Th align="right">Difference</Th>
                  <Th align="right">Value</Th>
                </tr>
              </thead>
              <tbody>
                {variance.map((v) => {
                  const unit = UNIT[v.baseUnit] ?? "";
                  const off = Math.abs(v.varianceBase) > 0.01;
                  return (
                    <tr key={v.itemId} className="border-t">
                      <Td strong>{v.name}</Td>
                      <Td align="right" muted>
                        <span className="tnum">
                          {v.expectedBase.toFixed(0)} {unit}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="tnum">
                          {v.actualBase.toFixed(0)} {unit}
                        </span>
                      </Td>
                      <Td align="right">
                        <span
                          className="tnum font-medium"
                          style={{ color: !off ? "var(--success)" : v.varianceBase > 0 ? "var(--danger)" : "var(--warning)" }}
                        >
                          {!off ? "matches" : `${v.varianceBase > 0 ? "+" : ""}${v.varianceBase.toFixed(0)} ${unit}`}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="tnum" style={{ color: v.varianceValueMinor > 0 ? "var(--danger)" : "var(--text-subtle)" }}>
                          {off ? formatINR(v.varianceValueMinor) : "—"}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
              Expected comes from the recipes on the jobs done this period. Actual is every outward movement, including
              adjustments and stock-take corrections. A steady gap means either the recipe is wrong or stock is leaving
              without a job attached.
            </p>
          </>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ------------------------------------------------------- ageing */}
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-subtle)" }}>
            Receivables ageing
          </h2>
          <div className="card p-4">
            {ageing.buckets.every((b) => b.count === 0) ? (
              <p className="text-[13px] text-center py-4" style={{ color: "var(--text-muted)" }}>
                Nothing outstanding.
              </p>
            ) : (
              ageing.buckets.map((b) => {
                const overdue = b.label !== "Not yet due";
                return (
                  <div key={b.label} className="flex items-center justify-between py-1.5">
                    <span className="text-[13px]">
                      {b.label}
                      {b.count > 0 && (
                        <span className="ml-1.5 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                          {b.count} invoice{b.count === 1 ? "" : "s"}
                        </span>
                      )}
                    </span>
                    <span
                      className="text-[13px] tnum font-medium"
                      style={{
                        color:
                          b.totalMinor === 0
                            ? "var(--text-subtle)"
                            : b.label === "Over 90 days"
                              ? "var(--danger)"
                              : overdue
                                ? "var(--warning)"
                                : undefined,
                      }}
                    >
                      {b.totalMinor > 0 ? formatINR(b.totalMinor) : "—"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* -------------------------------------------------- top clients */}
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-subtle)" }}>
            Top customers · {period.label}
          </h2>
          {topClients.length === 0 ? (
            <div className="card p-5 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
              No billing this period.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th align="right">Visits</Th>
                  <Th align="right">Revenue</Th>
                </tr>
              </thead>
              <tbody>
                {topClients.map((c) => (
                  <tr key={c.clientId} className="border-t">
                    <Td>
                      <Link href={`/clients/${c.clientId}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                    </Td>
                    <Td align="right" muted>
                      <span className="tnum">{c.visits}</span>
                    </Td>
                    <Td align="right" strong>
                      <span className="tnum">{formatINR(c.total)}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>
    </Page>
  );
}
