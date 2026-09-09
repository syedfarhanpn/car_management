/**
 * Money is stored and computed as integer PAISE everywhere in this system.
 * These helpers are the only place it turns into something a human reads.
 *
 * Never do arithmetic on the formatted string, and never store the float.
 */

/** 125050 -> "1,250.50" (Indian digit grouping: 1,25,050 style for lakhs). */
export function formatAmount(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  const grouped = rupees.toLocaleString("en-IN");
  return `${negative ? "-" : ""}${grouped}.${String(paise).padStart(2, "0")}`;
}

/** 125050 -> "₹1,250.50" */
export function formatINR(minor: number): string {
  return `₹${formatAmount(minor)}`;
}

/** Compact form for dashboard tiles: 4523000 -> "₹45.2K", 1520000000 -> "₹1.52Cr" */
export function formatCompactINR(minor: number): string {
  const rupees = minor / 100;
  const abs = Math.abs(rupees);
  if (abs >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `₹${(rupees / 1_000).toFixed(1)}K`;
  return `₹${rupees.toFixed(0)}`;
}

/** "1250.50" | 1250.5 -> 125050. Rounds at the boundary, never truncates. */
export function toMinor(rupees: string | number): number {
  const n = typeof rupees === "string" ? Number(rupees.replace(/[^0-9.-]/g, "")) : rupees;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function toRupees(minor: number): number {
  return minor / 100;
}

/**
 * GST split. Intra-state (the overwhelming majority for a local workshop) is
 * CGST + SGST at half the rate each; inter-state is a single IGST line.
 *
 * The odd paise from an odd rate is given to CGST so cgst + sgst always equals
 * the total tax exactly. Splitting by rounding each half independently is how
 * invoices end up one paise out.
 */
export function splitGst(taxableMinor: number, ratePercent: number, interState: boolean) {
  const total = Math.round((taxableMinor * ratePercent) / 100);
  if (interState) return { cgst: 0, sgst: 0, igst: total, total };
  const sgst = Math.floor(total / 2);
  return { cgst: total - sgst, sgst, igst: 0, total };
}

/** Round the invoice total to the nearest rupee, returning the adjustment. */
export function roundOff(totalMinor: number) {
  const rounded = Math.round(totalMinor / 100) * 100;
  return { rounded, adjustment: rounded - totalMinor };
}
