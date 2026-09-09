import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, money, pk, updatedAt } from "./_shared";
import { organizations, users } from "./org";
import { clients, vehicles } from "./clients";

/**
 * Templates live in the database, not in code, so the shop can reword a
 * reminder without a deploy. providerTemplateId holds the id assigned by the
 * WhatsApp provider when the integration requires pre-registered templates
 * (Meta Cloud API / BSP). It stays null for free-form providers.
 */
export const messageTemplates = pgTable(
  "message_templates",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    key: text("key").notNull(), // INVOICE_SENT, SERVICE_DUE, JOB_READY, ESTIMATE_APPROVAL
    name: text("name").notNull(),
    channel: text("channel").notNull().default("WHATSAPP"),
    language: text("language").notNull().default("en"),
    body: text("body").notNull(),
    /** Declared placeholders, e.g. ["client_name","vehicle","amount"]. */
    variables: jsonb("variables").$type<string[]>().default([]),
    providerTemplateId: text("provider_template_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("message_templates_org_key_uq").on(t.orgId, t.key, t.language)],
);

export const messageStatus = pgEnum("message_status", [
  "QUEUED",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
  "CANCELLED",
]);

/**
 * Every outbound message is logged with its provider id, status and failure
 * reason. Two reasons this is not optional:
 *
 *   1. "The customer says he never got the bill" has to be answerable with
 *      evidence rather than a shrug.
 *   2. When this becomes a SaaS, per-tenant message volume is what you meter
 *      and bill on. Reconstructing it later is impossible.
 */
export const messages = pgTable(
  "messages",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    clientId: uuid("client_id").references(() => clients.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    templateKey: text("template_key"),
    channel: text("channel").notNull().default("WHATSAPP"),
    toPhone: text("to_phone").notNull(),
    body: text("body").notNull(),
    mediaUrl: text("media_url"),
    status: messageStatus("status").notNull().default("QUEUED"),
    providerMessageId: text("provider_message_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    attempts: integer("attempts").notNull().default(0),
    costMinor: money("cost_minor").notNull().default(0),
    /** Polymorphic link: 'invoice' | 'job_card' | 'campaign'. */
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("messages_org_status_idx").on(t.orgId, t.status),
    index("messages_client_idx").on(t.clientId),
    index("messages_ref_idx").on(t.referenceType, t.referenceId),
  ],
);
