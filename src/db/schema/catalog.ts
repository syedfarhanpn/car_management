import { boolean, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { archivedAt, createdAt, pk, updatedAt } from "./_shared";
import { organizations } from "./org";

/**
 * A table, not an enum, because size bands are business policy and differ by
 * shop (some split "Compact SUV" from "SUV", some add "Luxury" or "Commercial").
 * The whole price matrix hangs off this, so it must be editable without a
 * migration.
 */
export const vehicleClasses = pgTable(
  "vehicle_classes",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("vehicle_classes_org_name_uq").on(t.orgId, t.name)],
);

/**
 * requiresEstimate drives the locked decision: repairs and parts work need a
 * customer-approved estimate first; wash and detailing go straight to a job
 * card because the price is fixed and known at the counter.
 */
export const serviceCategories = pgTable(
  "service_categories",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    requiresEstimate: boolean("requires_estimate").notNull().default(false),
    colorHex: text("color_hex"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("service_categories_org_name_uq").on(t.orgId, t.name)],
);

export const services = pgTable(
  "services",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    categoryId: uuid("category_id").notNull().references(() => serviceCategories.id),
    name: text("name").notNull(),
    code: text("code"),
    description: text("description"),
    // GST is OFF until the client's registration is confirmed, but the fields
    // exist now so switching it on is a settings change, not a migration.
    sacCode: text("sac_code").default("998714"), // maintenance & repair of motor vehicles
    gstRate: integer("gst_rate").notNull().default(18), // whole percent
    estimatedMinutes: integer("estimated_minutes"),
    isActive: boolean("is_active").notNull().default(true),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("services_org_cat_idx").on(t.orgId, t.categoryId), index("services_org_name_idx").on(t.orgId, t.name)],
);
