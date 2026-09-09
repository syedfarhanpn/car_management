/**
 * How to address a customer in a message.
 *
 * First-name-only reads warmly for a person and absurdly for a company:
 * "Hi Kochi," to Kochi Cabs Pvt Ltd. Company names are used whole, and
 * corporate suffixes are trimmed so it stays "Hi Kochi Cabs" rather than
 * "Hi Kochi Cabs Private Limited".
 */
const COMPANY_SUFFIXES =
  /\s+(pvt\.?|private|ltd\.?|limited|llp|inc\.?|corp\.?|co\.?|company|enterprises|traders|motors|group)\b/gi;

export function greetingName(name: string, type: "INDIVIDUAL" | "CORPORATE" | string): string {
  const clean = name.trim();
  if (!clean) return "there";

  if (type === "CORPORATE") {
    const trimmed = clean.replace(COMPANY_SUFFIXES, "").replace(/[,\s]+$/, "").trim();
    return trimmed || clean;
  }

  // Skip a leading honorific so "Mr Rahul Menon" greets as Rahul.
  const parts = clean.split(/\s+/).filter((p) => !/^(mr|mrs|ms|dr|shri|smt)\.?$/i.test(p));
  return parts[0] ?? clean;
}

/**
 * Absolute URL for a customer-facing link. WhatsApp needs a full URL — a
 * relative path renders as dead text — so when no public base is configured
 * the caller gets an empty string and can leave the link out entirely rather
 * than sending "View: " with nothing after it.
 */
export function publicUrl(path: string): string {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  if (!base) return "";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
