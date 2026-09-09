import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Dashboard",
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-5">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 mb-2.5 text-[12.5px] font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft size={14} />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[21px] font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <div className="mt-0.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </div>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Page({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`px-4 sm:px-6 lg:px-8 py-6 mx-auto ${wide ? "max-w-[1400px]" : "max-w-[1100px]"}`}>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-[14px] font-medium">{title}</p>
      {description && (
        <p className="mt-1 text-[12.5px] max-w-md mx-auto" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span style={{ color: "var(--danger)" }}> *</span>}
        {!required && (
          <span className="font-normal" style={{ color: "var(--text-subtle)" }}>
            {" "}
            optional
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

const TONES = {
  neutral: { bg: "var(--surface-2)", fg: "var(--text-muted)" },
  brand: { bg: "var(--brand-soft)", fg: "var(--brand)" },
  success: { bg: "var(--success-soft)", fg: "var(--success)" },
  warning: { bg: "var(--warning-soft)", fg: "var(--warning)" },
  danger: { bg: "var(--danger-soft)", fg: "var(--danger)" },
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <span className="badge" style={{ background: t.bg, color: t.fg }}>
      {children}
    </span>
  );
}

export const JOB_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  ESTIMATE_SENT: { label: "Estimate sent", tone: "warning" },
  ESTIMATE_APPROVED: { label: "Approved", tone: "brand" },
  ESTIMATE_REJECTED: { label: "Rejected", tone: "danger" },
  IN_PROGRESS: { label: "In progress", tone: "brand" },
  COMPLETED: { label: "Ready", tone: "success" },
  INVOICED: { label: "Invoiced", tone: "success" },
  DELIVERED: { label: "Delivered", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  ISSUED: { label: "Unpaid", tone: "warning" },
  PARTIALLY_PAID: { label: "Part paid", tone: "warning" },
  PAID: { label: "Paid", tone: "success" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">{children}</table>
      </div>
    </div>
  );
}

export function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={`font-medium px-4 py-2.5 text-${align} whitespace-nowrap`}
      style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  muted = false,
  strong = false,
  nowrap = false,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  muted?: boolean;
  strong?: boolean;
  nowrap?: boolean;
}) {
  return (
    <td
      className={`px-4 py-2.5 text-${align} ${strong ? "font-medium" : ""} ${nowrap ? "whitespace-nowrap" : ""}`}
      style={muted ? { color: "var(--text-muted)" } : undefined}
    >
      {children}
    </td>
  );
}
