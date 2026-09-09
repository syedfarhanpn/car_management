/**
 * Indian plates get written a dozen ways for the same car:
 *   "KL 07 CH 4521", "KL-07-CH-4521", "kl07ch4521", "KL07 CH4521"
 *
 * Everything is matched on the normalised form so spacing and punctuation can
 * never cause a false "new customer" - which is how duplicate client records
 * and split service histories happen.
 */
export function normalizeRegistration(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * The counter search key. Staff are handed a key or shouted a number and type
 * four digits; they should not have to know the state or series code.
 *
 * Takes the LAST run of digits (the unique serial on an Indian plate) and
 * returns up to its final four. "KL07CH4521" -> "4521", "KL43C1001" -> "1001".
 */
export function registrationLast4(input: string): string {
  const normalized = normalizeRegistration(input);
  const trailingDigits = normalized.match(/(\d+)$/)?.[1] ?? "";
  return trailingDigits.slice(-4);
}

/** Display helper: "KL07CH4521" -> "KL 07 CH 4521". */
export function formatRegistration(input: string): string {
  const n = normalizeRegistration(input);
  const m = n.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/);
  if (!m) return input.toUpperCase();
  return [m[1], m[2], m[3], m[4]].filter(Boolean).join(" ");
}

/** True when the input looks like a plausible last-4 search rather than a full plate. */
export function isLast4Query(input: string): boolean {
  return /^\d{1,4}$/.test(input.trim());
}
