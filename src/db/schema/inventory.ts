import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { archivedAt, createdAt, money, pk, qty, updatedAt } from "./_shared";
import { branches, organizations, users } from "./org";

/**
 * The central modelling decision for this business.
 *
 * STOCKED_PART     brake pads, oil filter, wiper blade.
 *                  Counted in pieces, picked onto a specific job card,
 *                  deducted when that job completes.
 *
 * BULK_CONSUMABLE  shampoo, wax, polish, degreaser, engine oil.
 *                  Measured in ml/g. Nobody is going to log every squirt of
 *                  shampoo, so these are deducted by SERVICE RECIPE (see
 *                  pricing.ts) and reconciled by periodic stock take. The
 *                  gap between the two is the variance report, which is the
 *                  only way leakage ever shows up.
 *
 * PASS_THROUGH     a part bought from outside for one specific customer.
 *                  NEVER stocked, never valued, never in a stock ledger.
 *                  See purchasing.ts for the accounting treatment.
 */
export const itemType = pgEnum("item_type", ["STOCKED_PART", "BULK_CONSUMABLE", "PASS_THROUGH"]);

/** Base units are the smallest sensible unit so a 5L can and a 500ml bottle compare directly. */
export const baseUnit = pgEnum("base_unit", ["PIECE", "ML", "GRAM"]);

export const itemCategories = pgTable(
  "item_categories",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("item_categories_org_name_uq").on(t.orgId, t.name)],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    categoryId: uuid("category_id").references(() => itemCategories.id),
    name: text("name").notNull(),
    sku: text("sku"),
    type: itemType("type").notNull(),
    baseUnit: baseUnit("base_unit").notNull(),

    // How it is BOUGHT vs how it is CONSUMED.
    // A 5L can of shampoo: purchaseUnitName="Can", baseUnitsPerPurchaseUnit=5000.
    purchaseUnitName: text("purchase_unit_name").notNull().default("Piece"),
    baseUnitsPerPurchaseUnit: qty("base_units_per_purchase_unit").notNull().default(1),

    hsnCode: text("hsn_code"),
    gstRate: integer("gst_rate").notNull().default(18),

    // Moving average cost, in minor units PER BASE UNIT. Recalculated on every
    // purchase. Staff never see this - it is the margin input.
    avgCostMinor: money("avg_cost_minor").notNull().default(0),
    salePriceMinor: money("sale_price_minor").notNull().default(0),

    reorderLevelBase: qty("reorder_level_base").notNull().default(0),
    trackStock: boolean("track_stock").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("inventory_items_org_type_idx").on(t.orgId, t.type),
    index("inventory_items_org_name_idx").on(t.orgId, t.name),
  ],
);

export const stockMovementType = pgEnum("stock_movement_type", [
  "OPENING",
  "PURCHASE",
  "CONSUMPTION",
  "ADJUSTMENT",
  "RETURN_TO_SUPPLIER",
  "CUSTOMER_RETURN",
  "STOCK_TAKE",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "WASTAGE",
]);

/**
 * APPEND-ONLY. There is deliberately no `quantity` column on inventoryItems.
 * Current stock is SUM(quantity_base) over this table.
 *
 * A mutable quantity column is faster to read and impossible to audit: when
 * the month-end count disagrees with the system - and it will - a running
 * total tells you nothing, whereas this tells you exactly which movement was
 * wrong, who entered it, and against which job or purchase.
 *
 * quantityBase is SIGNED: purchases positive, consumption negative.
 */
export const stockLedger = pgTable(
  "stock_ledger",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    itemId: uuid("item_id").notNull().references(() => inventoryItems.id),
    movementType: stockMovementType("movement_type").notNull(),
    quantityBase: qty("quantity_base").notNull(),
    unitCostMinor: money("unit_cost_minor").notNull().default(0),
    // Polymorphic link back to whatever caused this movement.
    referenceType: text("reference_type"), // 'purchase' | 'job_card' | 'stock_take' | 'manual'
    referenceId: uuid("reference_id"),
    note: text("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("stock_ledger_item_idx").on(t.itemId, t.occurredAt),
    index("stock_ledger_ref_idx").on(t.referenceType, t.referenceId),
    index("stock_ledger_org_branch_idx").on(t.orgId, t.branchId, t.occurredAt),
  ],
);

export const stockTakeStatus = pgEnum("stock_take_status", ["DRAFT", "COMPLETED", "CANCELLED"]);

/**
 * The reconciliation half of the consumables model. Recipes say what SHOULD
 * have been used; this says what is actually on the shelf. Variance between
 * them is the report the owner actually cares about.
 */
export const stockTakes = pgTable("stock_takes", {
  id: pk(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  reference: text("reference").notNull(),
  status: stockTakeStatus("status").notNull().default("DRAFT"),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const stockTakeLines = pgTable(
  "stock_take_lines",
  {
    id: pk(),
    stockTakeId: uuid("stock_take_id").notNull().references(() => stockTakes.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references(() => inventoryItems.id),
    systemQtyBase: qty("system_qty_base").notNull(),
    countedQtyBase: qty("counted_qty_base").notNull(),
    varianceBase: qty("variance_base").notNull(),
    varianceValueMinor: money("variance_value_minor").notNull().default(0),
    reason: text("reason"),
  },
  (t) => [index("stock_take_lines_take_idx").on(t.stockTakeId)],
);
