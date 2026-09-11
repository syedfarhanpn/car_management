import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local", override: true });

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "./index";
import * as s from "./schema";
import { runMigrations } from "./migrate";
import { financialYear } from "@/lib/services/numbering";

/**
 * Prepare a REAL database for a real shop.
 *
 * The demo seed is not appropriate here: it invents customers, vehicles and
 * job history that would then need deleting by hand. This creates only what
 * the app genuinely cannot start without — an organisation, a branch, one
 * admin login, the size bands that pricing hangs off, an invoice series and
 * the message templates — and nothing else.
 *
 *   npm run db:bootstrap -- --name "Prestige Auto Care" \
 *                           --email owner@shop.in \
 *                           --password "a-real-password"
 *
 * Safe to re-run: it will not create a second organisation.
 */
function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(`--${flag}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const name = arg("name") ?? process.env.BOOTSTRAP_ORG_NAME;
  const email = (arg("email") ?? process.env.BOOTSTRAP_ADMIN_EMAIL)?.toLowerCase();
  const password = arg("password") ?? process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    console.error(
      "Missing details.\n\n" +
        '  npm run db:bootstrap -- --name "Shop Name" --email owner@shop.in --password "secret"\n',
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Choose a password of at least 8 characters.");
    process.exit(1);
  }

  console.log("Applying migrations...");
  await runMigrations();

  const db = await getDb();

  const existing = await db.select().from(s.organizations).limit(1);
  if (existing.length > 0) {
    console.log(`Already set up for "${existing[0].name}" — nothing to do.`);
    process.exit(0);
  }

  const [org] = await db.insert(s.organizations).values({ name, legalName: name }).returning();

  const [branch] = await db
    .insert(s.branches)
    .values({ orgId: org.id, name: "Main", code: "MAIN", isDefault: true })
    .returning();

  await db.insert(s.users).values({
    orgId: org.id,
    branchId: branch.id,
    name: "Owner",
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    role: "ADMIN",
  });

  // GST stays OFF until a GSTIN is entered — the tax screen refuses to enable
  // it without one, so starting it off is the only consistent default.
  await db.insert(s.settings).values([
    { orgId: org.id, key: "tax.enabled", value: false },
    { orgId: org.id, key: "tax.defaultRate", value: 18 },
    { orgId: org.id, key: "tax.pricesIncludeTax", value: true },
    { orgId: org.id, key: "tax.passThroughTreatment", value: "PURE_AGENT" },
    { orgId: org.id, key: "billing.staffMaxDiscountPercent", value: 0 },
    { orgId: org.id, key: "billing.roundOffEnabled", value: true },
    { orgId: org.id, key: "inventory.autoDeductRecipes", value: true },
    { orgId: org.id, key: "inventory.lowStockAlerts", value: true },
  ]);

  // Without at least one class nothing can be priced, so the app would be
  // unusable on first login. These are editable in Settings.
  await db.insert(s.vehicleClasses).values(
    ["Hatchback", "Sedan", "Compact SUV", "SUV", "Luxury"].map((n, i) => ({
      orgId: org.id,
      name: n,
      sortOrder: i + 1,
    })),
  );

  await db.insert(s.serviceCategories).values([
    { orgId: org.id, name: "Washing & Cleaning", requiresEstimate: false, sortOrder: 1 },
    { orgId: org.id, name: "Detailing", requiresEstimate: false, sortOrder: 2 },
    { orgId: org.id, name: "Periodic Service", requiresEstimate: false, sortOrder: 3 },
    { orgId: org.id, name: "Repairs", requiresEstimate: true, sortOrder: 4 },
  ]);

  await db.insert(s.expenseCategories).values([
    { orgId: org.id, name: "Rent", isFixed: true },
    { orgId: org.id, name: "Salaries", isFixed: true },
    { orgId: org.id, name: "Electricity & Water", isFixed: false },
    { orgId: org.id, name: "Consumables Purchase", isFixed: false },
    { orgId: org.id, name: "Miscellaneous", isFixed: false },
  ]);

  await db.insert(s.invoiceSeries).values({
    orgId: org.id,
    branchId: branch.id,
    name: "Default",
    prefix: "INV",
    financialYear: financialYear(),
    currentNumber: 0,
    padWidth: 4,
    isActive: true,
  });

  await db.insert(s.messageTemplates).values([
    {
      orgId: org.id,
      key: "JOB_READY",
      name: "Vehicle Ready for Pickup",
      body: "Hi {{client_name}}, your {{vehicle}} is ready for pickup. Total: {{amount}}. Thank you!",
      variables: ["client_name", "vehicle", "amount"],
    },
    {
      orgId: org.id,
      key: "INVOICE_SENT",
      name: "Invoice",
      body: "Hi {{client_name}}, here is your invoice {{invoice_number}} for {{vehicle}}. Amount: {{amount}}. View: {{link}}",
      variables: ["client_name", "invoice_number", "vehicle", "amount", "link"],
    },
    {
      orgId: org.id,
      key: "ESTIMATE_APPROVAL",
      name: "Estimate Approval",
      body: "Hi {{client_name}}, estimate for {{vehicle}} is {{amount}}. Reply YES to approve and we will begin work.",
      variables: ["client_name", "vehicle", "amount"],
    },
    {
      orgId: org.id,
      key: "SERVICE_DUE",
      name: "Service Due Reminder",
      body: "Hi {{client_name}}, your {{vehicle}} is due for {{service}}. Last done {{last_date}}. Book a slot: {{link}}",
      variables: ["client_name", "vehicle", "service", "last_date", "link"],
    },
    {
      orgId: org.id,
      key: "PAYMENT_REMINDER",
      name: "Payment Reminder",
      body: "Hi {{client_name}}, a balance of {{amount}} is pending against invoice {{invoice_number}}. Kindly settle at your convenience.",
      variables: ["client_name", "amount", "invoice_number"],
    },
  ]);

  console.log(`
Ready.

  Organisation : ${name}
  Sign in as   : ${email}

Next, in the app:
  1. Settings -> Business — add the address and GSTIN
  2. Settings -> Tax — switch GST on once the GSTIN is saved
  3. Settings -> Services, then Prices — load the real price list
  4. Settings -> Users — add the staff
`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
