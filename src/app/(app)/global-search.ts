"use server";

import { requireUser } from "@/lib/auth";
import { searchClients, searchVehicles } from "@/lib/services/search";
import { formatRegistration } from "@/lib/vehicle";
import { formatPhone } from "@/lib/phone";

export type SearchHit = {
  kind: "vehicle" | "client";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

/**
 * One search box over the things staff actually look for: a car, or a person.
 *
 * Vehicles come first because the counter workflow starts with a number plate
 * far more often than a name — the same reason the job card screen leads with
 * the last four digits.
 */
export async function globalSearch(query: string): Promise<SearchHit[]> {
  const user = await requireUser();
  const q = query.trim();
  if (q.length < 2) return [];

  const [vehicles, clients] = await Promise.all([
    searchVehicles(user.orgId, q, 6),
    searchClients(user.orgId, q, 5),
  ]);

  const hits: SearchHit[] = vehicles.map((v) => ({
    kind: "vehicle" as const,
    id: v.vehicleId,
    title: formatRegistration(v.registration),
    subtitle: [v.make && v.model ? `${v.make} ${v.model}` : null, v.clientName]
      .filter(Boolean)
      .join(" · "),
    // Straight to a new job card: finding a car is nearly always the first
    // step of booking it in, so skip the intermediate screen.
    href: `/job-cards/new?vehicle=${v.vehicleId}`,
  }));

  for (const c of clients) {
    // A client already surfaced through one of their vehicles is not worth
    // repeating as a separate row.
    if (vehicles.some((v) => v.clientId === c.id)) continue;
    hits.push({
      kind: "client",
      id: c.id,
      title: c.name,
      subtitle: `${formatPhone(c.phone)} · ${c.vehicleCount} vehicle${c.vehicleCount === 1 ? "" : "s"}`,
      href: `/clients/${c.id}`,
    });
  }

  return hits;
}
