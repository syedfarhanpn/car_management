import Link from "next/link";
import { eq } from "drizzle-orm";
import { ChevronRight, IndianRupee, Percent } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { getTaxConfig } from "@/lib/settings";
import { Badge, Page, PageHeader } from "@/components/ui";

export default async function SettingsPage() {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();

  const [org, config, series] = await Promise.all([
    db.select().from(s.organizations).where(eq(s.organizations.id, user.orgId)).limit(1).then((r) => r[0]),
    getTaxConfig(user.orgId),
    db.select().from(s.invoiceSeries).where(eq(s.invoiceSeries.orgId, user.orgId)).limit(1).then((r) => r[0]),
  ]);

  return (
    <Page>
      <PageHeader title="Settings" subtitle={org?.name} backHref="/dashboard" />

      <div className="space-y-3">
        <Link href="/settings/pricing" className="card p-4 flex items-center gap-4 transition-shadow hover:shadow-[var(--shadow-md)]">
          <div className="grid place-items-center w-10 h-10 rounded-lg shrink-0" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
            <IndianRupee size={19} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold">Price matrix</p>
            <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              Every service priced per vehicle class. This is where the shop&apos;s real price list goes.
            </p>
          </div>
          <ChevronRight size={18} style={{ color: "var(--text-subtle)" }} />
        </Link>

        <section className="card p-4">
          <div className="flex items-start gap-4">
            <div className="grid place-items-center w-10 h-10 rounded-lg shrink-0" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
              <Percent size={19} />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-semibold">
                Tax <Badge tone={config.enabled ? "success" : "neutral"}>{config.enabled ? "GST on" : "GST off"}</Badge>
              </p>
              <dl className="mt-2.5 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-[12.5px]">
                <div className="flex justify-between gap-3">
                  <dt style={{ color: "var(--text-muted)" }}>GSTIN</dt>
                  <dd className="tnum">{org?.gstin ?? "Not set"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt style={{ color: "var(--text-muted)" }}>Listed prices</dt>
                  <dd>{config.pricesIncludeTax ? "include GST" : "exclude GST"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt style={{ color: "var(--text-muted)" }}>Home state</dt>
                  <dd className="tnum">
                    {org?.stateCode} · {org?.state}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt style={{ color: "var(--text-muted)" }}>Outside purchases</dt>
                  <dd>{config.passThroughTreatment === "PURE_AGENT" ? "Pure agent" : "Taxable"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt style={{ color: "var(--text-muted)" }}>Invoice series</dt>
                  <dd className="tnum">
                    {series ? `${series.prefix}/${series.financialYear}/${String(series.currentNumber).padStart(series.padWidth, "0")}` : "—"}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                These are stored as settings and read on every bill. Editing them from this screen arrives with the
                Settings module; today they are changed in the seed or directly in the settings table.
              </p>
            </div>
          </div>
        </section>

        <section className="card p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
            Still to come
          </p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            <li>Business profile & invoice letterhead</li>
            <li>Service catalogue editor</li>
            <li>Vehicle classes & model master</li>
            <li>User management and roles</li>
            <li>Consumable recipes per service</li>
            <li>Tax toggles & invoice numbering</li>
          </ul>
        </section>
      </div>
    </Page>
  );
}
