import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { archivedAt, createdAt, pk, updatedAt } from "./_shared";

/**
 * TENANCY NOTE
 * The product ships single-client, exactly as scoped. But every business table
 * carries org_id (and branch_id where it matters) pointing at a single seeded
 * row. This is invisible today and costs nothing at runtime.
 *
 * When this becomes a SaaS, the migration is:
 *   1. enable Postgres RLS with a policy on org_id
 *   2. add tenant signup
 * ...instead of backfilling a tenant key across 40 tables while a paying
 * client depends on the system. That refactor is the expensive one.
 */
export const organizations = pgTable("organizations", {
  id: pk(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  gstin: text("gstin"),
  phone: text("phone"),
  email: text("email"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  stateCode: text("state_code"), // GST place-of-supply code, e.g. "32" for Kerala
  pincode: text("pincode"),
  logoUrl: text("logo_url"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const branches = pgTable("branches", {
  id: pk(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  phone: text("phone"),
  addressLine1: text("address_line1"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  isDefault: boolean("is_default").notNull().default(false),
  archivedAt: archivedAt(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * ADMIN  - owner. Full access incl. costs, margins, discounts, settings.
 * MANAGER- everything operational, but not org settings or user management.
 * STAFF  - job cards, clients, vehicles, billing at LIST PRICE ONLY.
 *          Cannot see purchase cost or margin. Cannot discount. (Locked
 *          decision: discounts are admin-only.)
 */
export const userRole = pgEnum("user_role", ["ADMIN", "MANAGER", "STAFF"]);

export const users = pgTable(
  "users",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    branchId: uuid("branch_id").references(() => branches.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("STAFF"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_org_email_uq").on(t.orgId, t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/**
 * Every price change, discount, bill edit, void and stock adjustment lands
 * here. This is what turns "the numbers look wrong" into "here is exactly
 * who changed what, when". Non-negotiable in a system handling cash.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    userId: uuid("user_id").references(() => users.id),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    note: text("note"),
    ipAddress: text("ip_address"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_org_time_idx").on(t.orgId, t.createdAt)],
);

/** Namespaced key/value settings so new toggles never need a migration. */
export const settings = pgTable(
  "settings",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("settings_org_key_uq").on(t.orgId, t.key)],
);
