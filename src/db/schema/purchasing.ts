import { boolean, date, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { archivedAt, createdAt, money, pk, qty, updatedAt } from "./_shared";
import { branches, organizations, users } from "./org";
import { inventoryItems } from "./inventory";
import { jobCards } from "./jobs";
import { clients } from "./clients";

export const suppliers = pgTable(
  "suppliers",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    gstin: text("gstin"),
    addressLine1: text("address_line1"),
    city: text("city"),
    state: text("state"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(0),
    openingBalanceMinor: money("opening_balance_minor").notNull().default(0),
    notes: text("notes"),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("suppliers_org_name_idx").on(t.orgId, t.name)],
);

export const purchaseStatus = pgEnum("purchase_status", ["DRAFT", "RECEIVED", "CANCELLED"]);
export const purchasePaymentStatus = pgEnum("purchase_payment_status", ["UNPAID", "PARTIAL", "PAID"]);

/**
 * A purchase is either STOCK (goes into inventory, becomes an asset of the
 * business) or PASS-THROUGH (bought for one named customer).
 *
 * isPassThrough = true means:
 *   - no stock ledger movement is written
 *   - the cost is NOT a business expense; it is a receivable from the customer
 *   - jobCardId / forClientId must be set, so the money is always traceable
 *     to whoever owes it
 *
 * This is what stops 40,000 rupees of fronted gearbox money from showing up as
 * either inventory the shop owns or expense the shop absorbed. It is neither.
 */
export const purchases = pgTable(
  "purchases",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    supplierNameText: text("supplier_name_text"), // casual / one-off vendor
    billNumber: text("bill_number"),
    billDate: date("bill_date").notNull(),
    status: purchaseStatus("status").notNull().default("DRAFT"),
    paymentStatus: purchasePaymentStatus("payment_status").notNull().default("UNPAID"),

    isPassThrough: boolean("is_pass_through").notNull().default(false),
    jobCardId: uuid("job_card_id").references(() => jobCards.id),
    forClientId: uuid("for_client_id").references(() => clients.id),

    subtotalMinor: money("subtotal_minor").notNull().default(0),
    taxMinor: money("tax_minor").notNull().default(0),
    totalMinor: money("total_minor").notNull().default(0),
    paidMinor: money("paid_minor").notNull().default(0),

    billPhotoUrl: text("bill_photo_url"),
    notes: text("notes"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("purchases_org_date_idx").on(t.orgId, t.billDate),
    index("purchases_supplier_idx").on(t.supplierId),
    index("purchases_jobcard_idx").on(t.jobCardId),
  ],
);

export const purchaseLines = pgTable(
  "purchase_lines",
  {
    id: pk(),
    purchaseId: uuid("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
    /** Null for pass-through parts, which are deliberately not catalogued. */
    itemId: uuid("item_id").references(() => inventoryItems.id),
    description: text("description").notNull(),
    /** In PURCHASE units (e.g. 2 cans); converted to base units on posting. */
    quantity: qty("quantity").notNull().default(1),
    unitCostMinor: money("unit_cost_minor").notNull().default(0),
    gstRate: integer("gst_rate").notNull().default(0),
    taxMinor: money("tax_minor").notNull().default(0),
    lineTotalMinor: money("line_total_minor").notNull().default(0),
    affectsInventory: boolean("affects_inventory").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("purchase_lines_purchase_idx").on(t.purchaseId)],
);

export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
    purchaseId: uuid("purchase_id").references(() => purchases.id),
    amountMinor: money("amount_minor").notNull(),
    method: text("method").notNull().default("CASH"),
    reference: text("reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("supplier_payments_supplier_idx").on(t.supplierId)],
);
