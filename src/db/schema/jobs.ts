import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, money, pk, qty, updatedAt } from "./_shared";
import { branches, organizations, users } from "./org";
import { clients, vehicles } from "./clients";
import { services, vehicleClasses } from "./catalog";
import { inventoryItems } from "./inventory";

/**
 * ESTIMATE vs JOB is a flag, not a separate table: an approved estimate
 * becomes the job card, keeping one continuous record and one number the
 * customer can refer to. Repairs start as ESTIMATE (category.requiresEstimate),
 * wash and detailing start as JOB.
 */
export const jobCardKind = pgEnum("job_card_kind", ["ESTIMATE", "JOB"]);

export const jobCardStatus = pgEnum("job_card_status", [
  "DRAFT",
  "ESTIMATE_SENT",
  "ESTIMATE_APPROVED",
  "ESTIMATE_REJECTED",
  "IN_PROGRESS",
  "COMPLETED",
  "INVOICED",
  "DELIVERED",
  "CANCELLED",
]);

export const jobCards = pgTable(
  "job_cards",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    jobNumber: text("job_number").notNull(),
    kind: jobCardKind("kind").notNull().default("JOB"),
    status: jobCardStatus("status").notNull().default("DRAFT"),

    clientId: uuid("client_id").notNull().references(() => clients.id),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
    /** Snapshotted so recipe/price resolution stays stable if the car is reclassified later. */
    vehicleClassId: uuid("vehicle_class_id").references(() => vehicleClasses.id),

    /** Captured every visit - this is what powers service-due reminders later. */
    odometerKm: integer("odometer_km"),
    fuelLevel: text("fuel_level"),

    customerComplaint: text("customer_complaint"),
    technicianNotes: text("technician_notes"),
    internalNotes: text("internal_notes"),

    assignedToId: uuid("assigned_to_id").references(() => users.id),

    subtotalMinor: money("subtotal_minor").notNull().default(0),
    discountMinor: money("discount_minor").notNull().default(0),
    taxMinor: money("tax_minor").notNull().default(0),
    /** Pass-through parts, tracked separately: reimbursement, not revenue. */
    reimbursableMinor: money("reimbursable_minor").notNull().default(0),
    totalMinor: money("total_minor").notNull().default(0),

    promisedAt: timestamp("promised_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    /** Set when the recipe deduction has run, so closing twice cannot double-deduct. */
    stockPostedAt: timestamp("stock_posted_at", { withTimezone: true }),

    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("job_cards_org_number_uq").on(t.orgId, t.jobNumber),
    index("job_cards_vehicle_idx").on(t.vehicleId),
    index("job_cards_client_idx").on(t.clientId),
    index("job_cards_status_idx").on(t.orgId, t.status),
  ],
);

/**
 * SERVICE       priced from the matrix; deducts its consumable recipe on close.
 * PART          a stocked part; deducts inventory on close.
 * PASS_THROUGH  bought from outside for THIS customer. Never touches stock,
 *               never counts as revenue. See below.
 * LABOUR / MISC free-text lines.
 */
export const jobLineType = pgEnum("job_line_type", ["SERVICE", "PART", "PASS_THROUGH", "LABOUR", "MISC"]);

export const jobCardLines = pgTable(
  "job_card_lines",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    jobCardId: uuid("job_card_id").notNull().references(() => jobCards.id, { onDelete: "cascade" }),
    lineType: jobLineType("line_type").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),

    serviceId: uuid("service_id").references(() => services.id),
    itemId: uuid("item_id").references(() => inventoryItems.id),
    /** Snapshot of the name at the time of sale - renaming a service later must not rewrite history. */
    description: text("description").notNull(),

    quantity: qty("quantity").notNull().default(1),
    unitPriceMinor: money("unit_price_minor").notNull().default(0),
    lineTotalMinor: money("line_total_minor").notNull().default(0),

    /** Admin-only. Staff cannot set these - discounts are admin-only by decision. */
    discountMinor: money("discount_minor").notNull().default(0),
    discountedById: uuid("discounted_by_id").references(() => users.id),

    gstRate: integer("gst_rate").notNull().default(0),
    taxMinor: money("tax_minor").notNull().default(0),

    /**
     * PASS-THROUGH ACCOUNTING
     * costMinor    what the shop actually paid the outside supplier.
     * markupMinor  optional handling margin. The client confirmed this varies
     *              per part, so it is per-line rather than a global setting.
     *
     * Billed to customer = costMinor + markupMinor.
     * On the P&L: costMinor is a REIMBURSEMENT (an asset the shop is owed,
     * cleared when the customer pays), and only markupMinor is revenue.
     * That way fronting ₹40,000 for a gearbox does not appear as ₹40,000 of
     * income, and the "money we have fronted" report stays truthful.
     */
    costMinor: money("cost_minor").notNull().default(0),
    markupMinor: money("markup_minor").notNull().default(0),
    supplierName: text("supplier_name"),
    supplierBillRef: text("supplier_bill_ref"),
    supplierBillPhotoUrl: text("supplier_bill_photo_url"),

    /** Hard switches, denormalised so reports never have to re-derive intent. */
    affectsInventory: boolean("affects_inventory").notNull().default(true),
    affectsRevenue: boolean("affects_revenue").notNull().default(true),

    technicianId: uuid("technician_id").references(() => users.id),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("job_card_lines_job_idx").on(t.jobCardId), index("job_card_lines_type_idx").on(t.lineType)],
);

export const photoPhase = pgEnum("photo_phase", ["BEFORE", "AFTER", "DAMAGE", "PART", "OTHER"]);

/**
 * Before/after photos. For a detailing business this is three things at once:
 * upsell evidence, protection against "that scratch wasn't there", and free
 * marketing content that already exists at the moment of work.
 */
export const jobCardPhotos = pgTable(
  "job_card_photos",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    jobCardId: uuid("job_card_id").notNull().references(() => jobCards.id, { onDelete: "cascade" }),
    phase: photoPhase("phase").notNull().default("BEFORE"),
    url: text("url").notNull(),
    caption: text("caption"),
    uploadedById: uuid("uploaded_by_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("job_card_photos_job_idx").on(t.jobCardId)],
);

export const jobCardStatusHistory = pgTable(
  "job_card_status_history",
  {
    id: pk(),
    jobCardId: uuid("job_card_id").notNull().references(() => jobCards.id, { onDelete: "cascade" }),
    fromStatus: jobCardStatus("from_status"),
    toStatus: jobCardStatus("to_status").notNull(),
    changedById: uuid("changed_by_id").references(() => users.id),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("job_status_history_job_idx").on(t.jobCardId)],
);
