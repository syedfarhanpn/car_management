import { bigint, numeric, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * MONEY IS ALWAYS STORED AS AN INTEGER IN MINOR UNITS (paise).
 * ₹1,250.50 -> 125050. Never use floats for money: 0.1 + 0.2 !== 0.3 and
 * rounding drift in invoice totals destroys client trust faster than bugs.
 * Format for display only, at the edge, via lib/money.ts.
 */
export const money = (name: string) => bigint(name, { mode: "number" });

/**
 * Quantities use fixed-point numeric, not float, for the same reason.
 * Bulk consumables are stored in their BASE unit (ml / g), never in
 * purchase units, so a 5L can and a 500ml bottle are directly comparable.
 */
export const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "number" });

export const pk = () => uuid("id").primaryKey().defaultRandom();

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`);

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`);

/** Soft-delete marker. We almost never hard-delete financial records. */
export const archivedAt = () => timestamp("archived_at", { withTimezone: true });
