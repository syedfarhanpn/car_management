import { splitGst } from "./money";

/**
 * GST ENGINE
 *
 * Two things decide how a line is taxed:
 *
 * 1. INCLUSIVE vs EXCLUSIVE pricing (`tax.pricesIncludeTax`).
 *    A detailing shop advertises "Full Wash Rs.500" and the customer pays 500.
 *    So the default is INCLUSIVE: 500 is back-calculated into 423.73 taxable
 *    plus 76.27 GST. Switching to exclusive makes 500 the taxable value and
 *    adds tax on top. Getting this backwards silently changes every price on
 *    the wall, which is why it is an explicit setting rather than an assumption.
 *
 * 2. INTRA-STATE vs INTER-STATE (place of supply vs the shop's own state).
 *    Local work is CGST + SGST at half the rate each; out-of-state is one IGST
 *    line. For a workshop this is nearly always intra-state, but a corporate
 *    client registered in another state is not unusual.
 */

export type TaxConfig = {
  enabled: boolean;
  pricesIncludeTax: boolean;
  /** Reimbursements excluded from taxable value under the pure-agent rule. */
  passThroughTreatment: "PURE_AGENT" | "TAXABLE";
  homeStateCode: string;
};

export const DEFAULT_TAX_CONFIG: TaxConfig = {
  enabled: true,
  pricesIncludeTax: true,
  passThroughTreatment: "PURE_AGENT",
  homeStateCode: "32",
};

export type TaxedLine = {
  /** What the customer sees against this line. */
  grossMinor: number;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  taxMinor: number;
  gstRate: number;
};

/**
 * Back-calculate tax out of a tax-inclusive amount.
 * gross = taxable * (1 + rate/100)  =>  taxable = round(gross * 100 / (100 + rate))
 * Tax is then gross - taxable, so the two ALWAYS sum back to the advertised
 * price exactly. Computing tax independently and adding is what produces
 * invoices that are one paise out.
 */
function taxableFromInclusive(grossMinor: number, ratePercent: number): number {
  if (ratePercent <= 0) return grossMinor;
  return Math.round((grossMinor * 100) / (100 + ratePercent));
}

export function computeLineTax({
  amountMinor,
  gstRate,
  config,
  interState,
  exempt = false,
}: {
  /** The line total AFTER discount. */
  amountMinor: number;
  gstRate: number;
  config: TaxConfig;
  interState: boolean;
  /** Pure-agent reimbursements sit outside the taxable value entirely. */
  exempt?: boolean;
}): TaxedLine {
  if (!config.enabled || exempt || gstRate <= 0) {
    return {
      grossMinor: amountMinor,
      taxableMinor: amountMinor,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 0,
      taxMinor: 0,
      gstRate: exempt ? 0 : gstRate,
    };
  }

  if (config.pricesIncludeTax) {
    const taxable = taxableFromInclusive(amountMinor, gstRate);
    // Derive tax as the remainder rather than recomputing it, so taxable + tax
    // reconciles to the advertised price to the paise. The CGST/SGST halves
    // then split that exact remainder, odd paise going to CGST.
    const tax = amountMinor - taxable;
    const igst = interState ? tax : 0;
    const sgst = interState ? 0 : Math.floor(tax / 2);
    const cgst = interState ? 0 : tax - sgst;
    return {
      grossMinor: amountMinor,
      taxableMinor: taxable,
      cgstMinor: cgst,
      sgstMinor: sgst,
      igstMinor: igst,
      taxMinor: tax,
      gstRate,
    };
  }

  const split = splitGst(amountMinor, gstRate, interState);
  return {
    grossMinor: amountMinor + split.total,
    taxableMinor: amountMinor,
    cgstMinor: split.cgst,
    sgstMinor: split.sgst,
    igstMinor: split.igst,
    taxMinor: split.total,
    gstRate,
  };
}

/** Is the place of supply outside the shop's own state? */
export function isInterState(placeOfSupplyCode: string | null | undefined, config: TaxConfig): boolean {
  if (!placeOfSupplyCode) return false;
  return placeOfSupplyCode.split("-")[0] !== config.homeStateCode;
}

export type InvoiceTotals = {
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  taxMinor: number;
  reimbursableMinor: number;
  roundOffMinor: number;
  totalMinor: number;
};

/** Per-rate rows for the GST summary block that a tax invoice must carry. */
export type TaxSummaryRow = {
  gstRate: number;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
};

export function summariseByRate(lines: TaxedLine[]): TaxSummaryRow[] {
  const map = new Map<number, TaxSummaryRow>();
  for (const l of lines) {
    if (l.taxMinor === 0 && l.gstRate === 0) continue;
    const row = map.get(l.gstRate) ?? {
      gstRate: l.gstRate,
      taxableMinor: 0,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 0,
    };
    row.taxableMinor += l.taxableMinor;
    row.cgstMinor += l.cgstMinor;
    row.sgstMinor += l.sgstMinor;
    row.igstMinor += l.igstMinor;
    map.set(l.gstRate, row);
  }
  return [...map.values()].sort((a, b) => a.gstRate - b.gstRate);
}
