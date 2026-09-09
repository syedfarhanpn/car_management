# PitStop — Workshop Management

Job cards, GST billing, inventory and accounts for a car detailing / servicing workshop.

## Running it

```bash
npm install
npm run db:seed   # first time only
npm run dev
```

`npm run dev` starts two things: the database (PGlite behind a Postgres socket)
and the Next.js app. Open http://localhost:3000.

| Login | Password | Sees |
|---|---|---|
| admin@demo.com | admin123 | Everything — costs, margins, discounts, settings |
| manager@demo.com | manager123 | Operations and reports, not settings or users |
| staff@demo.com | staff123 | Job cards and billing at list price only |

## The database

Local development runs **PGlite as a socket server** (`scripts/db-server.mjs`),
so the app talks to it with `node-postgres` over the normal Postgres wire
protocol — exactly as it will talk to Supabase. There is no dev-only data path.

PGlite embedded in-process was tried first and does not survive Next.js dev,
which runs server code across several workers that each try to open the same
single-writer database.

Moving to Supabase is one line:

```
DATABASE_URL=postgres://...supabase.co:5432/postgres
```

Useful commands:

```bash
npm run db:seed      # migrate + demo data
npm run db:reset     # drop the schema (works while the server is running)
npm run db:generate  # new migration from schema changes
npm run db:studio    # browse the data
```

## How the money works

- **Everything is integer paise.** No floats touch a monetary value.
- **Prices include GST by default.** The shop advertises "Full Wash ₹500" and
  the customer pays ₹500; the taxable value is back-calculated so
  `taxable + tax` reconciles to the advertised price to the paise. Switch it in
  Settings → Tax.
- **Revenue means the taxable value.** GST is collected for the government and
  reimbursed parts are the customer's money passing through — neither is income.
- **Invoice numbers are gapless per financial year** (April–March) and allocated
  inside the same transaction that writes the invoice. Cancelling keeps the
  number.

## Parts bought for a customer

The case the whole pass-through model exists for: the shop fronts ₹24,500 for a
radiator on someone's Fortuner.

- never enters stock, never valued as inventory
- the **cost** is a receivable, not revenue; only the **markup** is income
- the dashboard shows how much of the shop's own cash is currently sitting in
  customer parts — recovered when their invoice is paid, not when the supplier
  is paid

## Stock

Three item types, because a workshop genuinely has three:

| Type | Example | Counted how | Deducted when |
|---|---|---|---|
| Stocked part | Brake pads, oil filter | Pieces | Picked onto a job card |
| Bulk consumable | Shampoo, wax, engine oil | ml / g | By service recipe, on job completion |
| Pass-through | A part bought for one customer | Never | Never — it is not stock |

**Stock on hand is derived**, summed from an append-only ledger. There is no
mutable quantity column, so when a physical count disagrees with the system you
can see exactly which movement caused it and who entered it.

Recipes are what make consumables costable without anyone logging a drop of
shampoo — and the gap between what recipes expected and what the ledger shows is
the consumption variance report.

## WhatsApp

Everything sits behind `NotificationProvider` in
`src/lib/services/whatsapp.ts`. The demo uses a console adapter that logs
instead of sending, so the flow can be exercised without messaging real
customers.

To connect the client's gateway, set `WHATSAPP_PROVIDER=custom` plus
`WHATSAPP_API_URL` / `WHATSAPP_API_KEY`, and adjust the request shape in
`CustomHttpProvider` — one class, deliberately.

Set `WHATSAPP_REQUIRES_TEMPLATES=true` if the gateway only accepts
pre-registered templates.

## Multi-tenancy

Ships single-client, as scoped. Every business table already carries `org_id`
pointing at one seeded organisation. It costs nothing today and means the SaaS
step is "enable row-level security and add signup" rather than backfilling a
tenant key across 40 tables while a paying client depends on the system.

## Still open

- The client's real GSTIN (currently a placeholder in Settings → Business)
- Whether their accountant agrees with the pure-agent treatment of parts bought
  on a customer's behalf
- Their WhatsApp gateway's actual contract
- Before/after job photos, and multi-branch
