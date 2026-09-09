import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui";
import { AttendanceSheet } from "./attendance-sheet";

function monthBounds(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10);
  return { from, to };
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const { date } = await searchParams;
  const attendanceDate = date ?? new Date().toISOString().slice(0, 10);
  const { from, to } = monthBounds(attendanceDate);

  const db = await getDb();
  const [employees, today, monthTotals] = await Promise.all([
    db
      .select()
      .from(s.employees)
      .where(and(eq(s.employees.orgId, user.orgId), eq(s.employees.isActive, true)))
      .orderBy(asc(s.employees.name)),
    db
      .select()
      .from(s.attendance)
      .where(and(eq(s.attendance.orgId, user.orgId), eq(s.attendance.attendanceDate, attendanceDate))),
    db
      .select({
        employeeId: s.attendance.employeeId,
        present: sql<number>`count(*) filter (where ${s.attendance.status} = 'PRESENT')::int`,
        half: sql<number>`count(*) filter (where ${s.attendance.status} = 'HALF_DAY')::int`,
        absent: sql<number>`count(*) filter (where ${s.attendance.status} = 'ABSENT')::int`,
        leave: sql<number>`count(*) filter (where ${s.attendance.status} in ('PAID_LEAVE','UNPAID_LEAVE'))::int`,
      })
      .from(s.attendance)
      .where(
        and(
          eq(s.attendance.orgId, user.orgId),
          sql`${s.attendance.attendanceDate} >= ${from}`,
          sql`${s.attendance.attendanceDate} < ${to}`,
        ),
      )
      .groupBy(s.attendance.employeeId),
  ]);

  const totals = new Map(monthTotals.map((t) => [t.employeeId, t]));

  return (
    <Page>
      <PageHeader
        title="Attendance"
        backHref="/employees"
        backLabel="Employees"
        subtitle="Mark the day. Saving again corrects a day rather than duplicating it."
      />
      <AttendanceSheet
        attendanceDate={attendanceDate}
        rows={employees.map((e) => {
          const t = totals.get(e.id);
          return {
            id: e.id,
            name: e.name,
            designation: e.designation,
            status: today.find((a) => a.employeeId === e.id)?.status ?? null,
            monthPresent: (t?.present ?? 0) + (t?.half ?? 0) * 0.5,
            monthAbsent: t?.absent ?? 0,
            monthLeave: t?.leave ?? 0,
          };
        })}
      />
    </Page>
  );
}
