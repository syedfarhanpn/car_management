import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { toWhatsAppNumber } from "@/lib/phone";

/**
 * WHATSAPP PROVIDER BOUNDARY
 *
 * Everything the app knows about sending a message is this interface. The
 * client's own API sits behind it, and so does the console stub used in the
 * demo — swapping one for the other is a config change, not a refactor.
 *
 * This matters more than it looks: WhatsApp integrations get replaced. A shop
 * starts on one BSP, outgrows it, or the team rewrites their gateway. Anything
 * that reaches for `fetch` in a page handler makes that a rewrite instead of a
 * one-file change.
 */
export type SendRequest = {
  to: string;
  body: string;
  /** Provider-side template id, when the provider requires pre-registration. */
  templateKey?: string | null;
  variables?: Record<string, string>;
  mediaUrl?: string | null;
};

export type SendResult =
  | { ok: true; providerMessageId: string | null; costMinor?: number }
  | { ok: false; errorCode: string; errorMessage: string };

export interface NotificationProvider {
  readonly name: string;
  /** True when the provider only accepts pre-registered templates. */
  readonly requiresTemplates: boolean;
  send(request: SendRequest): Promise<SendResult>;
}

/**
 * Demo provider. Logs instead of sending, so the whole flow — template
 * rendering, the message log, delivery status — can be exercised without a
 * live WhatsApp number and without messaging real customers by accident.
 */
class ConsoleProvider implements NotificationProvider {
  readonly name = "console";
  readonly requiresTemplates = false;

  async send(request: SendRequest): Promise<SendResult> {
    console.log(`\n[whatsapp:console] -> ${request.to}\n${request.body}\n`);
    return { ok: true, providerMessageId: `console-${Date.now()}` };
  }
}

/**
 * Adapter for the client's own WhatsApp gateway.
 *
 * The request shape below is a placeholder until their docs land — auth
 * method, field names and the template/free-form split all need confirming.
 * It is deliberately kept to one small class so that confirmation is a
 * ten-minute edit rather than a hunt through the codebase.
 */
class CustomHttpProvider implements NotificationProvider {
  readonly name = "custom";
  readonly requiresTemplates = process.env.WHATSAPP_REQUIRES_TEMPLATES === "true";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async send(request: SendRequest): Promise<SendResult> {
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          to: toWhatsAppNumber(request.to),
          type: request.mediaUrl ? "document" : "text",
          text: request.body,
          template: request.templateKey ?? undefined,
          variables: request.variables ?? undefined,
          media_url: request.mediaUrl ?? undefined,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        return {
          ok: false,
          errorCode: String(response.status),
          errorMessage: text.slice(0, 400) || response.statusText,
        };
      }

      const data = (await response.json().catch(() => ({}))) as { id?: string; message_id?: string };
      return { ok: true, providerMessageId: data.id ?? data.message_id ?? null };
    } catch (error) {
      // A gateway being down must never take a page down with it.
      return {
        ok: false,
        errorCode: "NETWORK",
        errorMessage: error instanceof Error ? error.message : "Request failed",
      };
    }
  }
}

export function getProvider(): NotificationProvider {
  const configured = process.env.WHATSAPP_PROVIDER ?? "console";
  if (configured === "custom") {
    const url = process.env.WHATSAPP_API_URL;
    const key = process.env.WHATSAPP_API_KEY;
    if (url && key) return new CustomHttpProvider(url, key);
    console.warn("[whatsapp] WHATSAPP_PROVIDER=custom but URL/key missing — falling back to console");
  }
  return new ConsoleProvider();
}

/** Replace {{placeholders}} with values; unknown ones become an empty string. */
export function renderTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => variables[key] ?? "");
}

export type QueueInput = {
  orgId: string;
  clientId?: string | null;
  vehicleId?: string | null;
  toPhone: string;
  templateKey?: string | null;
  variables?: Record<string, string>;
  body?: string;
  mediaUrl?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  userId?: string | null;
};

/**
 * Render, log, send, then record the outcome.
 *
 * The row is written BEFORE the send so a message can never vanish because the
 * provider hung or the process died mid-flight. "The customer says they never
 * got the bill" then has an answer instead of a shrug.
 */
export async function sendMessage(input: QueueInput): Promise<{ ok: boolean; messageId: string; error?: string }> {
  const db = await getDb();
  const provider = getProvider();

  let body = input.body ?? "";
  let providerTemplateId: string | null = null;

  if (input.templateKey) {
    const [template] = await db
      .select()
      .from(s.messageTemplates)
      .where(
        and(
          eq(s.messageTemplates.orgId, input.orgId),
          eq(s.messageTemplates.key, input.templateKey),
          eq(s.messageTemplates.isActive, true),
        ),
      )
      .limit(1);

    if (!template) return { ok: false, messageId: "", error: `No active template for ${input.templateKey}` };
    body = renderTemplate(template.body, input.variables ?? {});
    providerTemplateId = template.providerTemplateId;
  }

  if (!body.trim()) return { ok: false, messageId: "", error: "Message body is empty" };

  const [row] = await db
    .insert(s.messages)
    .values({
      orgId: input.orgId,
      clientId: input.clientId ?? null,
      vehicleId: input.vehicleId ?? null,
      templateKey: input.templateKey ?? null,
      toPhone: input.toPhone,
      body,
      mediaUrl: input.mediaUrl ?? null,
      status: "QUEUED",
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      createdById: input.userId ?? null,
    })
    .returning();

  const result = await provider.send({
    to: input.toPhone,
    body,
    templateKey: providerTemplateId ?? input.templateKey ?? null,
    variables: input.variables,
    mediaUrl: input.mediaUrl,
  });

  if (result.ok) {
    await db
      .update(s.messages)
      .set({
        status: "SENT",
        providerMessageId: result.providerMessageId,
        costMinor: result.costMinor ?? 0,
        sentAt: new Date(),
        attempts: 1,
        updatedAt: new Date(),
      })
      .where(eq(s.messages.id, row.id));
    return { ok: true, messageId: row.id };
  }

  await db
    .update(s.messages)
    .set({
      status: "FAILED",
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      attempts: 1,
      updatedAt: new Date(),
    })
    .where(eq(s.messages.id, row.id));

  return { ok: false, messageId: row.id, error: result.errorMessage };
}
