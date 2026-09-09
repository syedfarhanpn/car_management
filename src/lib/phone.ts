/**
 * Indian mobile numbers arrive as "9847012345", "+91 98470 12345",
 * "0919847012345", "91-9847012345". All of those are one customer.
 *
 * Stored canonically as E.164 (+919847012345) so the unique index on
 * (org, phone) actually prevents duplicate client records, and so WhatsApp
 * gets a number it will accept without per-call cleanup.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("091")) return `+${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return input.startsWith("+") ? `+${digits}` : digits ? `+${digits}` : "";
}

export function isValidIndianMobile(input: string): boolean {
  const n = normalizePhone(input);
  // Indian mobiles are 10 digits starting 6-9.
  return /^\+91[6-9]\d{9}$/.test(n);
}

/** "+919847012345" -> "98470 12345" for display. */
export function formatPhone(input: string): string {
  const n = normalizePhone(input);
  const m = n.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `${m[1]} ${m[2]}` : input;
}

/** WhatsApp wants digits with country code and no plus. */
export function toWhatsAppNumber(input: string): string {
  return normalizePhone(input).replace(/\D/g, "");
}
