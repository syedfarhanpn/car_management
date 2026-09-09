import { boolean, date, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { archivedAt, createdAt, money, pk, updatedAt } from "./_shared";
import { organizations, users } from "./org";
import { vehicleClasses } from "./catalog";

export const clientType = pgEnum("client_type", ["INDIVIDUAL", "CORPORATE"]);

export const clients = pgTable(
  "clients",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    altPhone: text("alt_phone"),
    email: text("email"), // optional by design - front desk should not be blocked on it
    type: clientType("type").notNull().default("INDIVIDUAL"),
    gstin: text("gstin"),
    addressLine1: text("address_line1"),
    city: text("city"),
    state: text("state"),
    pincode: text("pincode"),

    // Credit control. Cars DO leave unpaid here, so receivables are first-class.
    creditLimitMinor: money("credit_limit_minor").notNull().default(0),
    creditDays: integer("credit_days").notNull().default(0),

    whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(true),
    notes: text("notes"),
    archivedAt: archivedAt(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("clients_org_phone_uq").on(t.orgId, t.phone),
    index("clients_org_name_idx").on(t.orgId, t.name),
  ],
);

/**
 * Vehicle model master. Pre-loading oil grade + capacity here is what lets a
 * job card auto-fill "3.2L of 5W-30" instead of the technician guessing, and
 * it is what makes engine oil costable per job rather than a black hole.
 */
export const vehicleModels = pgTable(
  "vehicle_models",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    make: text("make").notNull(),
    model: text("model").notNull(),
    variant: text("variant"),
    vehicleClassId: uuid("vehicle_class_id").notNull().references(() => vehicleClasses.id),
    fuelType: text("fuel_type"), // PETROL | DIESEL | CNG | EV | HYBRID
    engineOilGrade: text("engine_oil_grade"), // e.g. 5W-30
    engineOilCapacityMl: integer("engine_oil_capacity_ml"),
    oilFilterPartNo: text("oil_filter_part_no"),
    airFilterPartNo: text("air_filter_part_no"),
    cabinFilterPartNo: text("cabin_filter_part_no"),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("vehicle_models_org_idx").on(t.orgId, t.make, t.model)],
);

/**
 * regNormalized  - "KL-07 AB 1234" stored as "KL07AB1234". All matching runs
 *                  on this, so spacing and dashes never cause a miss.
 * regLast4       - indexed separately: this is THE primary search path at the
 *                  counter. Staff type 4 digits, we return candidates.
 *
 * currentClientId is a maintained denormalisation for fast search. The source
 * of truth for who owns the car is vehicleOwnerships below.
 */
export const vehicles = pgTable(
  "vehicles",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    registrationNumber: text("registration_number").notNull(),
    regNormalized: text("reg_normalized").notNull(),
    regLast4: text("reg_last4").notNull(),
    modelId: uuid("model_id").references(() => vehicleModels.id),
    // Free-text fallback so staff are never blocked by a missing master entry.
    makeText: text("make_text"),
    modelText: text("model_text"),
    vehicleClassId: uuid("vehicle_class_id").references(() => vehicleClasses.id),
    color: text("color"),
    manufactureYear: integer("manufacture_year"),
    vin: text("vin"),
    currentClientId: uuid("current_client_id").references(() => clients.id),
    lastOdometerKm: integer("last_odometer_km"),
    notes: text("notes"),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("vehicles_org_reg_uq").on(t.orgId, t.regNormalized),
    index("vehicles_last4_idx").on(t.orgId, t.regLast4),
    index("vehicles_client_idx").on(t.currentClientId),
  ],
);

/**
 * Ownership is a history table, not a foreign key, because cars get sold.
 * Service history must follow the CAR (the next owner benefits from knowing
 * the timing belt was done) while billing must follow the CURRENT OWNER.
 * A plain vehicles.client_id cannot express both.
 */
export const vehicleOwnerships = pgTable(
  "vehicle_ownerships",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date"), // null = current owner
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("vehicle_ownership_vehicle_idx").on(t.vehicleId), index("vehicle_ownership_client_idx").on(t.clientId)],
);
