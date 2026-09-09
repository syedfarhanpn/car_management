import { date, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, money, pk, qty, updatedAt } from "./_shared";
import { organizations } from "./org";
import { services, vehicleClasses } from "./catalog";
import { clients, vehicleModels } from "./clients";
import { inventoryItems } from "./inventory";

/**
 * THE PRICE MATRIX.
 *
 * "Services have a fixed price per car" really means price varies by vehicle
 * size - a wash on a hatchback is not a wash on a Fortuner. A single price
 * column on `services` cannot express that.
 *
 * Nullable dimensions give one table four levels of override. Resolution is
 * MOST SPECIFIC WINS:
 *
 *   specificity 4  clientId + modelId   this fleet, this exact car
 *   specificity 3  clientId + classId   this corporate client's rate card
 *   specificity 2  modelId              a model that is genuinely harder to do
 *   specificity 1  classId              the standard published rate  <- the common case
 *
 * effectiveFrom/To keep price history, so reprinting last year's invoice
 * shows last year's price rather than today's.
 */
export const servicePrices = pgTable(
  "service_prices",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    vehicleClassId: uuid("vehicle_class_id").references(() => vehicleClasses.id),
    vehicleModelId: uuid("vehicle_model_id").references(() => vehicleModels.id),
    clientId: uuid("client_id").references(() => clients.id),
    /** Denormalised so resolution is a plain ORDER BY, not a CASE expression. */
    specificity: integer("specificity").notNull().default(1),
    priceMinor: money("price_minor").notNull(),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("service_prices_lookup_idx").on(t.orgId, t.serviceId, t.vehicleClassId),
    index("service_prices_client_idx").on(t.clientId),
  ],
);

/**
 * SERVICE RECIPE (bill of materials for consumables).
 *
 * "Premium Wash / SUV = 180ml shampoo + 60ml wax + 40ml tyre dressing."
 *
 * This is what makes bulk consumables costable with ZERO extra work from
 * staff: closing the job deducts the recipe automatically. It gives two
 * things nothing else does - a true gross margin per service, and a
 * theoretical consumption figure to check the physical stock count against.
 *
 * A null vehicleClassId means the recipe applies to every class.
 */
export const serviceRecipes = pgTable(
  "service_recipes",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    vehicleClassId: uuid("vehicle_class_id").references(() => vehicleClasses.id),
    itemId: uuid("item_id").notNull().references(() => inventoryItems.id),
    /** In the item's BASE unit (ml / g / piece). */
    quantityBase: qty("quantity_base").notNull(),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("service_recipes_lookup_idx").on(t.orgId, t.serviceId, t.vehicleClassId)],
);
