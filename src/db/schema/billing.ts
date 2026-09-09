import { boolean, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, money, pk, qty, updatedAt } from "./_shared";
import { branches, organizations, users } from "./org";
import { clients, vehicles } from "./clients";
import { jobCards } from "./jobs";

/**
 * INVOICE NUMBERING
 *
 * Built properly from day one even though GST is currently off, because this
 * is the one piece that genuinely cannot be retrofitted. If the client turns
 * out to be (or later becomes) GST registered, the series must be sequential
 * and GAPLESS from the registration date. You cannot go back and invent
 * numbers for invoices already issued.
 *
 * Indian financial year runs April-March, so the series resets per FY:
 * "INV/25-26/0001".
 */
export const invoiceSeries = pgTable(
  "invoice_series",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    financialYear: text("financial_year").notNull(), // "25-26"
    /** Last number ISSUED. Allocation is transactional so numbers cannot collide. */
    currentNumber: integer("current_number").notNull().default(0),
    padWidth: integer("pad_width").notNull().default(4),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("invoice_series_uq").on(t.orgId, t.branchId, t.prefix, t.financialYear)],
);

export const invoiceStatus = pgEnum("invoice_status", [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
]);

export const invoices = pgTable(
  "invoices",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    seriesId: uuid("series_id").references(() => invoiceSeries.id),
    invoiceNumber: text("invoice_number").notNull(),
    status: invoiceStatus("status").notNull().default("DRAFT"),

    jobCardId: uuid("job_card_id").references(() => jobCards.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),

    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date"),

    /** Snapshotted billing identity - the customer may move or rename later. */
    billToName: text("bill_to_name").notNull(),
    billToPhone: text("bill_to_phone"),
    billToAddress: text("bill_to_address"),
    billToGstin: text("bill_to_gstin"),
    placeOfSupply: text("place_of_supply"),

    subtotalMinor: money("subtotal_minor").notNull().default(0),
    discountMinor: money("discount_minor").notNull().default(0),
    taxableMinor: money("taxable_minor").notNull().default(0),
    cgstMinor: money("cgst_minor").notNull().default(0),
    sgstMinor: money("sgst_minor").notNull().default(0),
    igstMinor: money("igst_minor").notNull().default(0),
    /** Pass-through parts. Shown on the bill, excluded from revenue reporting. */
    reimbursableMinor: money("reimbursable_minor").notNull().default(0),
    roundOffMinor: money("round_off_minor").notNull().default(0),
    totalMinor: money("total_minor").notNull().default(0),

    paidMinor: money("paid_minor").notNull().default(0),
    balanceMinor: money("balance_minor").notNull().default(0),

    /** False until the client's GST registration is confirmed. */
    isTaxInvoice: boolean("is_tax_invoice").notNull().default(false),

    notes: text("notes"),
    termsText: text("terms_text"),
    pdfUrl: text("pdf_url"),
    /** Public token for the WhatsApp "view your bill" link. */
    publicToken: text("public_token"),

    issuedAt: timestamp("issued_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledReason: text("cancelled_reason"),

    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("invoices_org_number_uq").on(t.orgId, t.invoiceNumber),
    index("invoices_client_idx").on(t.clientId, t.status),
    index("invoices_date_idx").on(t.orgId, t.invoiceDate),
  ],
);

/**
 * A full SNAPSHOT of what was billed, not a view over job card lines.
 * Once issued, an invoice must never change because someone edited a price
 * or renamed a service six months later. Reprinting an old bill has to
 * produce the original document, byte for byte.
 */
export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: pk(),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    description: text("description").notNull(),
    hsnSacCode: text("hsn_sac_code"),
    quantity: qty("quantity").notNull().default(1),
    unitPriceMinor: money("unit_price_minor").notNull().default(0),
    discountMinor: money("discount_minor").notNull().default(0),
    taxableMinor: money("taxable_minor").notNull().default(0),
    gstRate: integer("gst_rate").notNull().default(0),
    cgstMinor: money("cgst_minor").notNull().default(0),
    sgstMinor: money("sgst_minor").notNull().default(0),
    igstMinor: money("igst_minor").notNull().default(0),
    lineTotalMinor: money("line_total_minor").notNull().default(0),
    /** Renders under a separate "Purchased on your behalf" block on the bill. */
    isReimbursable: boolean("is_reimbursable").notNull().default(false),
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId)],
);

export const paymentMethod = pgEnum("payment_method", ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "CREDIT_NOTE"]);

export const payments = pgTable(
  "payments",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    receiptNumber: text("receipt_number"),
    amountMinor: money("amount_minor").notNull(),
    method: paymentMethod("method").notNull(),
    reference: text("reference"), // UPI txn id, cheque no, card last4
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    /** Unapplied advance sits here until allocated to an invoice. */
    unallocatedMinor: money("unallocated_minor").notNull().default(0),
    note: text("note"),
    receivedById: uuid("received_by_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("payments_client_idx").on(t.clientId), index("payments_date_idx").on(t.orgId, t.receivedAt)],
);

/**
 * Payments and invoices are many-to-many. A customer with three cars may
 * settle four invoices with one UPI transfer, or pay one invoice in three
 * instalments. Allocating through a join table is the only model that
 * survives both, and it is what makes the ageing report correct.
 */
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: pk(),
    paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
    amountMinor: money("amount_minor").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("payment_alloc_payment_idx").on(t.paymentId), index("payment_alloc_invoice_idx").on(t.invoiceId)],
);
