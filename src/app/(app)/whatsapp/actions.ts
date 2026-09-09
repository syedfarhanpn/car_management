"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole, requireUser } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { formatRegistration } from "@/lib/vehicle";
import { sendMessage } from "@/lib/services/whatsapp";
import { greetingName, publicUrl } from "@/lib/naming";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: string): ActionResult<never> => ({ ok: false, error });

const templateSchema = z.object({
  key: z.string().trim().min(2, "Enter a key"),
  name: z.string().trim().min(2, "Enter a name"),
  body: z.string().trim().min(5, "Write the message"),
  providerTemplateId: z.string().trim().optional(),
  language: z.string().trim().optional(),
});

export async function saveTemplate(id: string | null, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const parsed = templateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const db = await getDb();
  // Keep the declared variable list in step with the body automatically —
  // a hand-maintained list drifts and then a placeholder renders as blank.
  const variables = [...parsed.data.body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]);

  const values = {
    key: parsed.data.key.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
    name: parsed.data.name,
    body: parsed.data.body,
    variables: [...new Set(variables)],
    providerTemplateId: parsed.data.providerTemplateId || null,
    language: parsed.data.language || "en",
  };

  if (id) {
    await db
      .update(s.messageTemplates)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(s.messageTemplates.id, id), eq(s.messageTemplates.orgId, user.orgId)));
  } else {
    await db.insert(s.messageTemplates).values({ orgId: user.orgId, ...values });
  }

  revalidatePath("/whatsapp");
  return ok(undefined);
}

export async function setTemplateActive(id: string, isActive: boolean): Promise<ActionResult> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();
  await db
    .update(s.messageTemplates)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(s.messageTemplates.id, id), eq(s.messageTemplates.orgId, user.orgId)));
  revalidatePath("/whatsapp");
  return ok(undefined);
}

/** Send the invoice to the customer. Available from the invoice screen. */
export async function sendInvoiceMessage(invoiceId: string): Promise<ActionResult<{ to: string }>> {
  const user = await requireUser();
  const db = await getDb();

  const [invoice] = await db
    .select()
    .from(s.invoices)
    .where(and(eq(s.invoices.id, invoiceId), eq(s.invoices.orgId, user.orgId)))
    .limit(1);
  if (!invoice) return fail("Invoice not found");
  if (!invoice.billToPhone) return fail("This customer has no phone number on record");

  const [client] = await db.select().from(s.clients).where(eq(s.clients.id, invoice.clientId)).limit(1);
  if (client && !client.whatsappOptIn) return fail(`${client.name} has opted out of WhatsApp messages`);

  const vehicle = invoice.vehicleId
    ? await db.select().from(s.vehicles).where(eq(s.vehicles.id, invoice.vehicleId)).limit(1).then((r) => r[0])
    : undefined;

  /**
   * Mint a share token if this invoice does not have one.
   *
   * Invoices raised before the public view existed — and anything imported
   * from the shop's old system — would otherwise be permanently unshareable,
   * and the customer would get a message ending in a dangling "View:".
   */
  let publicToken = invoice.publicToken;
  if (!publicToken) {
    publicToken = [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await db.update(s.invoices).set({ publicToken }).where(eq(s.invoices.id, invoiceId));
  }

  const result = await sendMessage({
    orgId: user.orgId,
    clientId: invoice.clientId,
    vehicleId: invoice.vehicleId,
    toPhone: invoice.billToPhone,
    templateKey: "INVOICE_SENT",
    variables: {
      client_name: greetingName(invoice.billToName, client?.type ?? "INDIVIDUAL"),
      invoice_number: invoice.invoiceNumber,
      vehicle: vehicle ? formatRegistration(vehicle.registrationNumber) : "your vehicle",
      amount: formatINR(Number(invoice.totalMinor)),
      link: publicUrl(`/i/${publicToken}`),
    },
    referenceType: "invoice",
    referenceId: invoiceId,
    userId: user.id,
  });

  revalidatePath("/whatsapp");
  revalidatePath(`/billing/${invoiceId}`);
  return result.ok ? ok({ to: invoice.billToPhone }) : fail(result.error ?? "Could not send");
}

/** "Your car is ready" — sent from a completed job card. */
export async function sendJobReadyMessage(jobCardId: string): Promise<ActionResult<{ to: string }>> {
  const user = await requireUser();
  const db = await getDb();

  const [job] = await db
    .select()
    .from(s.jobCards)
    .where(and(eq(s.jobCards.id, jobCardId), eq(s.jobCards.orgId, user.orgId)))
    .limit(1);
  if (!job) return fail("Job card not found");

  const [client, vehicle] = await Promise.all([
    db.select().from(s.clients).where(eq(s.clients.id, job.clientId)).limit(1).then((r) => r[0]),
    db.select().from(s.vehicles).where(eq(s.vehicles.id, job.vehicleId)).limit(1).then((r) => r[0]),
  ]);

  if (!client?.phone) return fail("This customer has no phone number on record");
  if (!client.whatsappOptIn) return fail(`${client.name} has opted out of WhatsApp messages`);

  const result = await sendMessage({
    orgId: user.orgId,
    clientId: job.clientId,
    vehicleId: job.vehicleId,
    toPhone: client.phone,
    templateKey: "JOB_READY",
    variables: {
      client_name: greetingName(client.name, client.type),
      vehicle: vehicle ? formatRegistration(vehicle.registrationNumber) : "your vehicle",
      amount: formatINR(Number(job.totalMinor)),
    },
    referenceType: "job_card",
    referenceId: jobCardId,
    userId: user.id,
  });

  revalidatePath("/whatsapp");
  revalidatePath(`/job-cards/${jobCardId}`);
  return result.ok ? ok({ to: client.phone }) : fail(result.error ?? "Could not send");
}

/** Payment chase on an overdue invoice. */
export async function sendPaymentReminder(invoiceId: string): Promise<ActionResult<{ to: string }>> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();

  const [invoice] = await db
    .select()
    .from(s.invoices)
    .where(and(eq(s.invoices.id, invoiceId), eq(s.invoices.orgId, user.orgId)))
    .limit(1);
  if (!invoice) return fail("Invoice not found");
  if (Number(invoice.balanceMinor) <= 0) return fail("This invoice is already settled");
  if (!invoice.billToPhone) return fail("No phone number on record");

  const [client] = await db.select().from(s.clients).where(eq(s.clients.id, invoice.clientId)).limit(1);
  if (client && !client.whatsappOptIn) return fail(`${client.name} has opted out of WhatsApp messages`);

  const result = await sendMessage({
    orgId: user.orgId,
    clientId: invoice.clientId,
    toPhone: invoice.billToPhone,
    templateKey: "PAYMENT_REMINDER",
    variables: {
      client_name: greetingName(invoice.billToName, client?.type ?? "INDIVIDUAL"),
      amount: formatINR(Number(invoice.balanceMinor)),
      invoice_number: invoice.invoiceNumber,
    },
    referenceType: "invoice",
    referenceId: invoiceId,
    userId: user.id,
  });

  revalidatePath("/whatsapp");
  return result.ok ? ok({ to: invoice.billToPhone }) : fail(result.error ?? "Could not send");
}

/**
 * Service-due reminders.
 *
 * Sends to customers whose last visit was more than `months` ago. This is the
 * feature that turns the message log from a cost into the thing that brings
 * cars back — but it is also the one that gets a number reported as spam, so
 * it sends one message per customer and skips anyone opted out.
 */
export async function sendServiceReminders(months: number, limit: number): Promise<ActionResult<{ sent: number; failed: number }>> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const candidates = await db
    .select({
      clientId: s.clients.id,
      name: s.clients.name,
      type: s.clients.type,
      phone: s.clients.phone,
      optIn: s.clients.whatsappOptIn,
      vehicleId: s.vehicles.id,
      registration: s.vehicles.registrationNumber,
      lastVisit: s.jobCards.createdAt,
    })
    .from(s.jobCards)
    .innerJoin(s.clients, eq(s.clients.id, s.jobCards.clientId))
    .innerJoin(s.vehicles, eq(s.vehicles.id, s.jobCards.vehicleId))
    .where(eq(s.jobCards.orgId, user.orgId));

  // Keep only each vehicle's most recent visit, then filter by age.
  const latest = new Map<string, (typeof candidates)[number]>();
  for (const row of candidates) {
    const seen = latest.get(row.vehicleId);
    if (!seen || row.lastVisit > seen.lastVisit) latest.set(row.vehicleId, row);
  }

  const due = [...latest.values()]
    .filter((r) => r.optIn && r.phone && r.lastVisit < cutoff)
    .slice(0, limit);

  let sent = 0;
  let failed = 0;
  for (const row of due) {
    const result = await sendMessage({
      orgId: user.orgId,
      clientId: row.clientId,
      vehicleId: row.vehicleId,
      toPhone: row.phone,
      templateKey: "SERVICE_DUE",
      variables: {
        client_name: greetingName(row.name, row.type),
        vehicle: formatRegistration(row.registration),
        service: "a service",
        last_date: row.lastVisit.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
        link: "",
      },
      referenceType: "campaign",
      userId: user.id,
    });
    if (result.ok) sent += 1;
    else failed += 1;
  }

  revalidatePath("/whatsapp");
  return ok({ sent, failed });
}

export async function setClientOptIn(clientId: string, optIn: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const db = await getDb();
  await db
    .update(s.clients)
    .set({ whatsappOptIn: optIn, updatedAt: new Date() })
    .where(and(eq(s.clients.id, clientId), eq(s.clients.orgId, user.orgId)));
  revalidatePath(`/clients/${clientId}`);
  return ok(undefined);
}
