import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { can, requireRole } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";
import { ExpenseManager } from "./expense-manager";

export default async function ExpensesPage() {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();

  const [expenses, categories] = await Promise.all([
    db
      .select({
        id: s.expenses.id,
        description: s.expenses.description,
        amountMinor: s.expenses.amountMinor,
        expenseDate: s.expenses.expenseDate,
        method: s.expenses.method,
        reference: s.expenses.reference,
        categoryId: s.expenses.categoryId,
        categoryName: s.expenseCategories.name,
        userName: s.users.name,
      })
      .from(s.expenses)
      .leftJoin(s.expenseCategories, eq(s.expenseCategories.id, s.expenses.categoryId))
      .leftJoin(s.users, eq(s.users.id, s.expenses.createdBy))
      .where(eq(s.expenses.orgId, user.orgId))
      .orderBy(desc(s.expenses.expenseDate), desc(s.expenses.createdAt))
      .limit(120),
    db
      .select()
      .from(s.expenseCategories)
      .where(eq(s.expenseCategories.orgId, user.orgId))
      .orderBy(asc(s.expenseCategories.name)),
  ]);

  return (
    <Page wide>
      <PageHeader title="Expenses" backHref="/accounts" backLabel="Accounts" />
      <ExpenseManager
        canDelete={can.voidInvoice(user)}
        categories={categories.map((c) => ({ id: c.id, name: c.name, isFixed: c.isFixed }))}
        expenses={expenses.map((e) => ({
          id: e.id,
          description: e.description,
          amountMinor: Number(e.amountMinor),
          expenseDate: e.expenseDate,
          method: e.method,
          reference: e.reference,
          categoryId: e.categoryId,
          categoryName: e.categoryName,
          userName: e.userName,
        }))}
      />
    </Page>
  );
}
