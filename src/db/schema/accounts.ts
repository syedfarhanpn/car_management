import { boolean, date, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, money, pk, updatedAt } from "./_shared";
import { branches, organizations, users } from "./org";

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    /** Fixed (rent, salaries) vs variable (consumables, electricity). */
    isFixed: boolean("is_fixed").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("expense_categories_org_name_uq").on(t.orgId, t.name)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    categoryId: uuid("category_id").references(() => expenseCategories.id),
    description: text("description").notNull(),
    amountMinor: money("amount_minor").notNull(),
    expenseDate: date("expense_date").notNull(),
    method: text("method").notNull().default("CASH"),
    reference: text("reference"),
    receiptUrl: text("receipt_url"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("expenses_org_date_idx").on(t.orgId, t.expenseDate)],
);

export const closingStatus = pgEnum("closing_status", ["OPEN", "CLOSED"]);

/**
 * Daily cash closing: expected cash (derived from payments recorded) against
 * cash actually counted in the drawer, every day, signed off by a named person.
 *
 * Cheapest control in the whole system. It surfaces a discrepancy within 24
 * hours, while it is still attributable to a shift and a person, instead of at
 * year end when it is neither.
 */
export const dailyClosings = pgTable(
  "daily_closings",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    businessDate: date("business_date").notNull(),
    status: closingStatus("status").notNull().default("OPEN"),
    openingCashMinor: money("opening_cash_minor").notNull().default(0),
    cashSalesMinor: money("cash_sales_minor").notNull().default(0),
    upiSalesMinor: money("upi_sales_minor").notNull().default(0),
    cardSalesMinor: money("card_sales_minor").notNull().default(0),
    otherSalesMinor: money("other_sales_minor").notNull().default(0),
    cashExpensesMinor: money("cash_expenses_minor").notNull().default(0),
    expectedCashMinor: money("expected_cash_minor").notNull().default(0),
    countedCashMinor: money("counted_cash_minor").notNull().default(0),
    varianceMinor: money("variance_minor").notNull().default(0),
    note: text("note"),
    closedById: uuid("closed_by_id").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("daily_closings_uq").on(t.orgId, t.branchId, t.businessDate)],
);
