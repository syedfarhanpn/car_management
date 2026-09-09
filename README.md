# PitStop — Workshop Management

Job cards, billing, inventory and accounts for a car detailing / washing /
servicing business. Built single-client first, with a deliberate path to
multi-tenant SaaS.

**Phase 0 (complete): foundation.** Database schema, auth with roles, app shell
and the module dashboard. Module screens land in later phases.

---

## Running it

```bash
npm install
npm run db:seed
npm run dev
```

That is the whole setup. No Docker, no Postgres install.

| Account | Password | Sees |
|---|---|---|
| `admin@demo.com` | `admin123` | Everything: costs, margins, discounts, settings |
| `manager@demo.com` | `manager123` | Operations and reports, no org settings |
| `staff@demo.com` | `staff123` | Job cards and billing at list price only |

Useful commands:

```bash
npm run db:reset      # wipe the local database
npm run db:seed       # migrate + seed demo data
npm run db:generate   # generate a migration after editing the schema
npm run db:studio     # browse the data
npm run typecheck
```

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Database | PostgreSQL |
| ORM | Drizzle |
| Auth | Session cookie (jose JWT) + bcrypt, roles enforced server-side |
| Styling | Tailwind v4, CSS custom properties, light + dark |
| Validation | Zod |

### Two drivers, one schema

`.env.local` controls where data lives:

```bash
DB_DRIVER=pglite        # embedded Postgres in ./.pgdata — zero install (default)
DB_DRIVER=postgres      # real Postgres / Supabase, set DATABASE_URL
```

PGlite is genuine Postgres compiled to WASM, not a shim, so enums, constraints
and transactions behave identically. Moving to Supabase is two environment
variables, not a rewrite. Nothing in `src/` knows which driver is active.

---

## The decisions that shaped the schema

These came out of the requirements discussion and are binding unless revisited.

**Money is integer paise, everywhere.** `₹1,250.50` is stored as `125050`.
Floats are never used for money. `src/lib/money.ts` is the only place it becomes
a string a human reads.

**Inventory has three item types, not one.**

| Type | Example | Stock tracked | Attached to a job |
|---|---|---|---|
| `STOCKED_PART` | Brake pads, oil filter | Yes, in pieces | Picked on the job card |
| `BULK_CONSUMABLE` | Shampoo, wax, engine oil | Yes, in ml/g | Via service recipe |
| `PASS_THROUGH` | Part bought for one customer | **Never** | Cost only |

Nobody is going to log every squirt of shampoo. Bulk consumables are deducted
automatically by a **service recipe** ("Premium Wash / SUV = 180ml shampoo +
60ml wax") when the job closes, and reconciled by a periodic **stock take**.
The gap between what should have been used and what is physically on the shelf
is the variance report — the only way leakage ever surfaces.

Engine oil is modelled as a bulk consumable that *is* attributed per job, since
the vehicle model master knows a Fortuner takes 7.5L of 10W-40.

**Stock is derived, never stored.** There is deliberately no `quantity` column
on `inventory_items`. Current stock is `SUM(quantity_base)` over an append-only
`stock_ledger`. A running total tells you nothing when the month-end count
disagrees; the ledger tells you which movement was wrong, who entered it, and
against which job.

**Pass-through parts are a reimbursement, not revenue.** When the shop buys a
₹24,500 radiator for a customer, that money is neither income nor inventory —
it is the shop's own cash sitting on somebody else's car. It posts to a client
reimbursable and clears when the customer pays. Only the optional per-line
markup counts as revenue. The dashboard surfaces the outstanding total, because
this is the number most workshop software cannot show at all.

**Prices are a matrix, not a column.** A wash on a hatchback is not a wash on a
Fortuner. `service_prices` has nullable dimensions giving four override levels,
most specific winning: client + model → client + class → model → class.

**Vehicle ownership is a history table.** Cars get sold. Service history has to
follow the car while billing follows the current owner; a plain `client_id`
cannot express both.

**Invoice numbering is built properly even though GST is off.** If the client
turns out to be registered, the series must be gapless and sequential from the
registration date — that is the one thing that cannot be retrofitted. The tax
engine exists and is gated by a single setting (`tax.enabled`).

**Discounts are admin-only**, enforced server-side on every mutation. A hidden
button is not a control.

**Tenancy.** Ships single-client. Every business table already carries `org_id`
(and `branch_id` where relevant) pointing at one seeded row — invisible today,
zero runtime cost. The SaaS migration becomes "enable RLS and add signup"
rather than backfilling a tenant key across 30 tables while a paying client
depends on the system.

---

## Layout

```
src/
  db/
    schema/          # 30 tables across 12 domain files
    index.ts         # driver switch (pglite | postgres)
    migrate.ts       # applies ./drizzle/*.sql
    seed.ts          # demo org, catalogue, clients, jobs, invoices
  lib/
    auth.ts          # sessions + the `can` capability map
    money.ts         # paise formatting, GST split, round-off
    vehicle.ts       # plate normalisation and last-4 search
    modules.ts       # module registry (dashboard + sidebar share it)
    queries/
  app/
    login/
    (app)/           # authenticated shell
      dashboard/
      job-cards/ clients/ billing/ inventory/ purchases/
      accounts/ revenue/ employees/ whatsapp/ settings/
```

---

## Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Schema, auth, roles, app shell, module dashboard | **Done** |
| 1 | Clients, vehicles, last-4 search, price matrix editor | Next |
| 2 | Job cards: create, assign, services, parts, photos | |
| 3 | Billing, invoices, payments, receivables — **go-live** | |
| 4 | Inventory, purchases, pass-through, stock takes | |
| 5 | Accounts, expenses, revenue reports | |
| 6 | Employees and attendance | |
| 7 | WhatsApp reminders and campaigns | |
| 8 | SaaS: tenant onboarding, plans, super-admin | |

Phase 3 is the real milestone — that is when the shop stops using its notebook.

---

## Open items

- **GST registration status** unconfirmed. Tax is off; confirm before Phase 3.
- **WhatsApp API contract** from the client's team: auth, whether templates are
  required, PDF attachment support, delivery webhooks, rate limits, phone
  format. Adapter interface is ready; it drops in as one file.
- **Real price list** — the seeded catalogue is realistic placeholder data and
  is plain data to replace.
