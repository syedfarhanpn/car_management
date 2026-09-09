"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Megaphone, Pencil, Plus, Send, X } from "lucide-react";
import { Badge, Field, type Tone } from "@/components/ui";
import { formatPhone } from "@/lib/phone";
import { saveTemplate, sendServiceReminders, setTemplateActive } from "./actions";

type Template = {
  id: string;
  key: string;
  name: string;
  body: string;
  variables: string[];
  providerTemplateId: string | null;
  isActive: boolean;
};

type Message = {
  id: string;
  toPhone: string;
  body: string;
  status: string;
  templateKey: string | null;
  errorMessage: string | null;
  clientName: string | null;
  at: string;
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  QUEUED: { label: "Queued", tone: "neutral" },
  SENT: { label: "Sent", tone: "brand" },
  DELIVERED: { label: "Delivered", tone: "success" },
  READ: { label: "Read", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export function WhatsAppConsole({
  providerName,
  requiresTemplates,
  optInCount,
  stats,
  templates,
  messages,
}: {
  providerName: string;
  requiresTemplates: boolean;
  optInCount: number;
  stats: { total: number; sent: number; failed: number };
  templates: Template[];
  messages: Message[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<"log" | "templates" | "campaign">("log");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) {
    setMessage(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setMessage({ tone: "err", text: res.error ?? "Something went wrong" });
      else {
        done?.();
        router.refresh();
      }
    });
  }

  return (
    <div>
      {providerName === "console" && (
        <div
          className="card p-4 mb-4 flex items-start gap-3"
          style={{ borderColor: "var(--warning)", background: "var(--warning-soft)" }}
        >
          <AlertTriangle size={18} style={{ color: "var(--warning)" }} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-[13.5px] font-semibold" style={{ color: "var(--warning)" }}>
              Demo mode — nothing is actually sent
            </p>
            {/* Deliberate: a half-configured gateway messaging real customers
                during a demo is far worse than not sending at all. */}
            <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              Messages are written to the log and printed in the server terminal. Point{" "}
              <span className="tnum">WHATSAPP_PROVIDER=custom</span> at your team&apos;s gateway to send for real.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
        {[
          { label: "Messages logged", value: stats.total },
          { label: "Sent", value: stats.sent },
          { label: "Failed", value: stats.failed, tone: stats.failed > 0 ? "var(--danger)" : undefined },
          { label: "Opted in", value: optInCount },
        ].map((t) => (
          <div key={t.label} className="card p-4">
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              {t.label}
            </p>
            <p className="mt-1 text-[22px] font-semibold tnum leading-none" style={{ color: t.tone }}>
              {t.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {(
          [
            ["log", "Message log"],
            ["templates", "Templates"],
            ["campaign", "Service reminders"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium"
            style={
              tab === key
                ? { background: "var(--brand)", color: "var(--brand-fg)" }
                : { background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <p
          role="status"
          className="mb-3 rounded-lg px-3.5 py-2.5 text-[13px]"
          style={{
            background: message.tone === "ok" ? "var(--success-soft)" : "var(--danger-soft)",
            color: message.tone === "ok" ? "var(--success)" : "var(--danger)",
          }}
        >
          {message.text}
        </p>
      )}

      {/* ------------------------------------------------------------- log */}
      {tab === "log" && (
        <div className="card overflow-hidden">
          {messages.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[13.5px] font-medium">No messages yet</p>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                Send an invoice or a &ldquo;car is ready&rdquo; note from a job card.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                    <th className="text-left font-medium px-4 py-2.5">To</th>
                    <th className="text-left font-medium px-3 py-2.5">Message</th>
                    <th className="text-left font-medium px-3 py-2.5">Template</th>
                    <th className="text-left font-medium px-3 py-2.5">Status</th>
                    <th className="text-left font-medium px-3 py-2.5">When</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((m) => {
                    const st = STATUS[m.status] ?? STATUS.QUEUED;
                    return (
                      <tr key={m.id} className="border-t">
                        <td className="px-4 py-2.5">
                          <span className="font-medium">{m.clientName ?? "—"}</span>
                          <div className="text-[11.5px] tnum" style={{ color: "var(--text-subtle)" }}>
                            {formatPhone(m.toPhone)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 max-w-[380px]">
                          <p className="truncate" style={{ color: "var(--text-muted)" }} title={m.body}>
                            {m.body}
                          </p>
                          {m.errorMessage && (
                            <p className="text-[11.5px]" style={{ color: "var(--danger)" }}>
                              {m.errorMessage}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-[11.5px] tnum" style={{ color: "var(--text-subtle)" }}>
                          {m.templateKey ?? "free-form"}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-[12px] whitespace-nowrap" style={{ color: "var(--text-subtle)" }}>
                          {new Date(m.at).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------- templates */}
      {tab === "templates" && (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            {requiresTemplates ? (
              <p className="text-[12.5px]" style={{ color: "var(--warning)" }}>
                This provider only sends pre-registered templates — set the provider template id on each.
              </p>
            ) : (
              <p className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                Edit the wording without a deploy. Use {"{{placeholders}}"} for the parts that change.
              </p>
            )}
            <button className="btn btn-primary text-[12.5px] py-1.5" onClick={() => setEditing("new")}>
              <Plus size={14} />
              New template
            </button>
          </div>

          {editing === "new" && (
            <TemplateForm
              pending={pending}
              onCancel={() => setEditing(null)}
              onSubmit={(fd) => run(() => saveTemplate(null, fd), () => setEditing(null))}
            />
          )}

          <div className="space-y-2">
            {templates.map((t) =>
              editing === t.id ? (
                <TemplateForm
                  key={t.id}
                  initial={t}
                  pending={pending}
                  onCancel={() => setEditing(null)}
                  onSubmit={(fd) => run(() => saveTemplate(t.id, fd), () => setEditing(null))}
                />
              ) : (
                <div key={t.id} className="card p-4" style={{ opacity: t.isActive ? 1 : 0.55 }}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold">
                        {t.name}
                        <span className="ml-2 text-[11.5px] tnum font-normal" style={{ color: "var(--text-subtle)" }}>
                          {t.key}
                        </span>
                      </p>
                      <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                        {t.body}
                      </p>
                      {t.variables.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {t.variables.map((v) => (
                            <Badge key={v}>{v}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      <button
                        aria-label={`Edit ${t.name}`}
                        className="grid place-items-center w-8 h-8 rounded"
                        style={{ color: "var(--text-subtle)" }}
                        onClick={() => setEditing(t.id)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="text-[12px] font-medium px-2"
                        style={{ color: t.isActive ? "var(--danger)" : "var(--success)" }}
                        disabled={pending}
                        onClick={() => run(() => setTemplateActive(t.id, !t.isActive))}
                      >
                        {t.isActive ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- campaign */}
      {tab === "campaign" && (
        <div className="card p-5 max-w-xl">
          <h2 className="text-[14px] font-semibold flex items-center gap-2">
            <Megaphone size={16} />
            Service-due reminders
          </h2>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Messages customers whose last visit was longer ago than the window below. One message per vehicle, and
            anyone opted out is skipped.
          </p>

          <form
            className="mt-4 flex flex-wrap gap-3 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const months = Number(fd.get("months") ?? 6);
              const limit = Number(fd.get("limit") ?? 25);
              setMessage(null);
              start(async () => {
                const res = await sendServiceReminders(months, limit);
                if (!res.ok) setMessage({ tone: "err", text: res.error });
                else {
                  setMessage({
                    tone: "ok",
                    text:
                      res.data.sent === 0
                        ? "Nobody is due — no messages sent"
                        : `Sent ${res.data.sent}${res.data.failed ? `, ${res.data.failed} failed` : ""}`,
                  });
                  router.refresh();
                }
              });
            }}
          >
            <div className="w-32">
              <Field label="Not seen for">
                <select name="months" className="input" defaultValue="6">
                  <option value="3">3 months</option>
                  <option value="6">6 months</option>
                  <option value="12">12 months</option>
                </select>
              </Field>
            </div>
            <div className="w-32">
              <Field label="Max messages" hint="Keeps a blast small">
                <input name="limit" className="input tnum" inputMode="numeric" defaultValue="25" />
              </Field>
            </div>
            <button type="submit" className="btn btn-primary mb-0.5" disabled={pending}>
              <Send size={15} />
              {pending ? "Sending…" : "Send reminders"}
            </button>
          </form>

          {/* Rate and reputation matter: a number that gets reported enough
              gets restricted, and no amount of retrying fixes that. */}
          <p className="mt-4 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
            Keep batches small and infrequent. WhatsApp scores a sending number on how recipients react, and a number
            that collects blocks gets its limits cut — which no retry logic can undo.
          </p>
        </div>
      )}
    </div>
  );
}

function TemplateForm({
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: Template;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initial?.body ?? "");
  const detected = [...new Set([...body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]))];

  return (
    <form
      className="card p-4 mb-2"
      style={{ borderColor: "var(--brand)" }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required>
          <input name="name" className="input" required autoFocus defaultValue={initial?.name} placeholder="Vehicle ready" />
        </Field>
        <Field label="Key" required hint="Referenced in code — e.g. JOB_READY">
          <input
            name="key"
            className="input tnum uppercase"
            required
            defaultValue={initial?.key}
            placeholder="JOB_READY"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Message" required>
            <textarea
              name="body"
              className="input"
              rows={3}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {{client_name}}, your {{vehicle}} is ready for pickup."
            />
          </Field>
          {detected.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1 items-center">
              <span className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                Placeholders:
              </span>
              {detected.map((v) => (
                <Badge key={v} tone="brand">
                  {v}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Field label="Provider template id" hint="Only if your gateway pre-registers templates">
          <input
            name="providerTemplateId"
            className="input tnum"
            defaultValue={initial?.providerTemplateId ?? ""}
          />
        </Field>
        <Field label="Language">
          <input name="language" className="input" defaultValue="en" />
        </Field>
      </div>

      <div className="flex gap-2 mt-3">
        <button type="submit" className="btn btn-primary text-[13px] py-1.5" disabled={pending}>
          {pending ? "Saving…" : "Save template"}
        </button>
        <button type="button" className="btn btn-ghost text-[13px] py-1.5" onClick={onCancel}>
          <X size={14} />
          Cancel
        </button>
      </div>
    </form>
  );
}
