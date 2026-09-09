import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { Boxes, Building2, Car, ChevronRight, IndianRupee, ListTree, Percent, Users, Wrench } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { getTaxConfig } from "@/lib/settings";
import { Badge, Page, PageHeader } from "@/components/ui";

export default async function SettingsPage() {
  const user = await requireRole(["ADMIN"]);
  const db = await getDb();

  const [org, config, counts] = await Promise.all([
    db.select().from(s.organizations).where(eq(s.organizations.id, user.orgId)).limit(1).then((r) => r[0]),
    getTaxConfig(user.orgId),
    db
      .select({
        services: sql<number>`(select count(*)::int from ${s.services} where ${s.services.orgId} = ${user.orgId} and ${s.services.isActive} = true)`,
        classes: sql<number>`(select count(*)::int from ${s.vehicleClasses} where ${s.vehicleClasses.orgId} = ${user.orgId} and ${s.vehicleClasses.archivedAt} is null)`,
        models: sql<number>`(select count(*)::int from ${s.vehicleModels} where ${s.vehicleModels.orgId} = ${user.orgId} and ${s.vehicleModels.archivedAt} is null)`,
        recipes: sql<number>`(select count(*)::int from ${s.serviceRecipes} where ${s.serviceRecipes.orgId} = ${user.orgId})`,
        users: sql<number>`(select count(*)::int from ${s.users} where ${s.users.orgId} = ${user.orgId} and ${s.users.isActive} = true)`,
      })
      .from(s.organizations)
      .where(eq(s.organizations.id, user.orgId))
      .limit(1)
      .then((r) => r[0]),
  ]);

  const cards = [
    {
      href: "/settings/business",
      icon: Building2,
      title: "Business profile",
      body: "Name, address and GSTIN — the letterhead on every invoice",
      meta: org?.gstin ?? "No GSTIN set",
      accent: "#0891b2",
    },
    {
      href: "/settings/tax",
      icon: Percent,
      title: "Tax",
      body: config.pricesIncludeTax ? "Listed prices include GST" : "GST added on top of listed prices",
      meta: config.enabled ? "GST on" : "GST off",
      accent: "#0f7b4f",
    },
    {
      href: "/settings/services",
      icon: Wrench,
      title: "Service catalogue",
      body: "What the shop sells, and which categories need an estimate first",
      meta: `${counts?.services ?? 0} active`,
      accent: "#2049e0",
    },
    {
      href: "/settings/pricing",
      icon: IndianRupee,
      title: "Price matrix",
      body: "Every service priced per vehicle class",
      meta: `${(counts?.services ?? 0) * (counts?.classes ?? 0)} cells`,
      accent: "#7c3aed",
    },
    {
      href: "/settings/vehicle-classes",
      icon: ListTree,
      title: "Vehicle classes",
      body: "Size bands that drive pricing",
      meta: `${counts?.classes ?? 0} classes`,
      accent: "#c2410c",
    },
    {
      href: "/settings/models",
      icon: Car,
      title: "Vehicle models",
      body: "Oil grade, capacity and filter numbers per model",
      meta: `${counts?.models ?? 0} models`,
      accent: "#be123c",
    },
    {
      href: "/settings/recipes",
      icon: Boxes,
      title: "Consumable recipes",
      body: "What each service burns, deducted automatically on completion",
      meta: `${counts?.recipes ?? 0} lines`,
      accent: "#b45309",
    },
    {
      href: "/settings/users",
      icon: Users,
      title: "Users",
      body: "Who can sign in and what they can see",
      meta: `${counts?.users ?? 0} active`,
      accent: "#4338ca",
    },
  ];

  return (
    <Page wide>
      <PageHeader
        title="Settings"
        subtitle={
          <span className="flex items-center gap-2">
            {org?.name}
            <Badge tone={config.enabled ? "success" : "neutral"}>{config.enabled ? "GST on" : "GST off"}</Badge>
          </span>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card p-4 flex items-start gap-3.5 transition-shadow hover:shadow-[var(--shadow-md)]"
          >
            <div
              className="grid place-items-center w-10 h-10 rounded-lg shrink-0"
              style={{ background: `color-mix(in srgb, ${c.accent} 12%, transparent)`, color: c.accent }}
            >
              <c.icon size={19} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">{c.title}</p>
              <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--text-muted)" }}>
                {c.body}
              </p>
              <p className="mt-1.5 text-[11.5px] tnum" style={{ color: "var(--text-subtle)" }}>
                {c.meta}
              </p>
            </div>
            <ChevronRight size={17} style={{ color: "var(--text-subtle)" }} className="shrink-0" />
          </Link>
        ))}
      </div>
    </Page>
  );
}
