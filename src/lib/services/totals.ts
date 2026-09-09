import { computeLineTax, summariseByRate, type TaxConfig, type TaxedLine, type TaxSummaryRow } from "@/lib/tax";
import { roundOff } from "@/lib/money";

/**
 * ONE totals engine, used by both the job card and the invoice it becomes.
 * If these were computed separately they would drift, and the customer would
 * be quoted one number and billed another.
 */

export type TotalsLine = {
  lineType: "SERVICE" | "PART" | "PASS_THROUGH" | "LABOUR" | "MISC";
  description: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  discountMinor: number;
  gstRate: number;
  /** Pass-through only. */
  costMinor: number;
  markupMinor: number;
};

export type ComputedLine = TotalsLine & {
  tax: TaxedLine;
  /** What appears in the amount column for this line. */
  displayMinor: number;
  isReimbursable: boolean;
};

export type Totals = {
  lines: ComputedLine[];
  /** Revenue before tax and before reimbursements. */
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  taxMinor: number;
  /** Parts bought for the customer. Recovered, not earned. */
  reimbursableMinor: number;
  roundOffMinor: number;
  totalMinor: number;
  taxSummary: TaxSummaryRow[];
};

export function computeTotals({
  lines,
  config,
  interState,
  applyRoundOff = true,
}: {
  lines: TotalsLine[];
  config: TaxConfig;
  interState: boolean;
  applyRoundOff?: boolean;
}): Totals {
  const computed: ComputedLine[] = [];

  for (const line of lines) {
    if (line.lineType === "PASS_THROUGH") {
      /**
       * A pass-through line is two different things in one row.
       *
       *   costMinor    the shop's money, fronted. Under the pure-agent rule it
       *                sits outside the taxable value entirely — the shop is
       *                acting as the customer's agent, not selling them a part.
       *   markupMinor  the shop's handling fee. That IS a supply, so it is
       *                taxed at the service rate.
       *
       * Treating the whole line as revenue would inflate turnover (and the GST
       * liability) by the full part cost, which for a ₹24,500 radiator is not
       * a rounding error.
       */
      const taxable = config.passThroughTreatment === "TAXABLE";

      const costTax = computeLineTax({
        amountMinor: line.costMinor,
        gstRate: taxable ? line.gstRate : 0,
        config,
        interState,
        exempt: !taxable,
      });

      const markupTax = computeLineTax({
        amountMinor: line.markupMinor,
        gstRate: line.gstRate || 18,
        config,
        interState,
      });

      computed.push({
        ...line,
        isReimbursable: true,
        displayMinor: costTax.grossMinor + markupTax.grossMinor,
        tax: {
          grossMinor: costTax.grossMinor + markupTax.grossMinor,
          taxableMinor: (taxable ? costTax.taxableMinor : 0) + markupTax.taxableMinor,
          cgstMinor: costTax.cgstMinor + markupTax.cgstMinor,
          sgstMinor: costTax.sgstMinor + markupTax.sgstMinor,
          igstMinor: costTax.igstMinor + markupTax.igstMinor,
          taxMinor: costTax.taxMinor + markupTax.taxMinor,
          gstRate: line.gstRate || 18,
        },
      });
      continue;
    }

    const net = line.lineTotalMinor - line.discountMinor;
    const tax = computeLineTax({ amountMinor: net, gstRate: line.gstRate, config, interState });
    computed.push({ ...line, isReimbursable: false, displayMinor: tax.grossMinor, tax });
  }

  let subtotal = 0;
  let discount = 0;
  let taxable = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let tax = 0;
  let reimbursable = 0;

  for (const c of computed) {
    discount += c.discountMinor;
    cgst += c.tax.cgstMinor;
    sgst += c.tax.sgstMinor;
    igst += c.tax.igstMinor;
    tax += c.tax.taxMinor;
    taxable += c.tax.taxableMinor;

    if (c.isReimbursable) {
      reimbursable += c.costMinor;
      subtotal += c.markupMinor;
    } else {
      subtotal += c.tax.taxableMinor;
    }
  }

  // The customer pays the sum of the amounts printed against each line.
  // Deriving the total any other way invites a mismatch between the column
  // the customer adds up and the figure at the bottom of the bill.
  const grossTotal = computed.reduce((acc, c) => acc + c.displayMinor, 0);
  const { rounded, adjustment } = applyRoundOff ? roundOff(grossTotal) : { rounded: grossTotal, adjustment: 0 };

  return {
    lines: computed,
    subtotalMinor: subtotal,
    discountMinor: discount,
    taxableMinor: taxable,
    cgstMinor: cgst,
    sgstMinor: sgst,
    igstMinor: igst,
    taxMinor: tax,
    reimbursableMinor: reimbursable,
    roundOffMinor: adjustment,
    totalMinor: rounded,
    taxSummary: summariseByRate(computed.map((c) => c.tax)),
  };
}
