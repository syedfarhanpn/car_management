import Link from "next/link";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { CalendarCheck } from "lucide-react";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { can, requireRole } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { Page, PageHeader } from "@/components/ui";
import { EmployeeManager } from "./employee-manager";

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default async function EmployeesPage() {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();
  const mStart = monthStart();

  const [employees, users, productivity] = await Promise.all([
    db.select().from(s.employees).where(eq(s.employees.orgId, user.orgId)).orderBy(asc(s.employees.name)),
    db.select().from(s.users).where(and(eq(s.users.orgId, user.orgId), eq(s.users.isActive, true))).orderBy(asc(s.users.name)),
    /**
     * Jobs worked this month per technician. This is why job card lines carry
     * technicianId even though commission is off — the attribution was free to
     * store, and turning it into a productivity figure later needed no
     * historical rework.
     */
    db
      .select({
        technicianId: s.jobCardLines.technicianId,
        jobs: sql<number>`count(distinct ${s.jobCardLines.jobCardId})::int`,
        revenue: sql<string>`coalesce(sum(${s.jobCardLines.lineTotalMinor} - ${s.jobCardLines.discountMinor}), 0)`,
      })
      .from(s.jobCardLines)
      .innerJoin(s.jobCards, eq(s.jobCards.id, s.jobCardLines.jobCardId))
      .where(
        and(
          eq(s.jobCardLines.orgId, user.orgId),
          eq(s.jobCardLines.lineType, "SERVICE"),
          gte(s.jobCards.createdAt, mStart),
          sql`${s.jobCards.status} in ('COMPLETED','INVOICED','DELIVERED')`,
        ),
      )
      .groupBy(s.jobCardLines.technicianId),
  ]);

  const byUser = new Map(productivity.map((p) => [p.technicianId, p]));
  const payroll = employees.filter((e) => e.isActive).reduce((a, e) => a + Number(e.monthlySalaryMinor), 0);

  return (
    <Page wide>
      <PageHeader
        title="Employees"
        backHref="/dashboard"
        subtitle={`${employees.filter((e) => e.isActive).length} active${
          can.viewCosts(user) ? ` · ${formatINR(payroll)} monthly payroll` : ""
        }`}
        actions={
          <Link href="/employees/attendance" className="btn btn-primary">
            <CalendarCheck size={16} />
            Attendance
          </Link>
        }
      />
      <EmployeeManager
        canSeeSalary={can.viewCosts(user)}
        users={users.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
        employees={employees.map((e) => {
          const prod = e.userId ? byUser.get(e.userId) : undefined;
          return {
            id: e.id,
            name: e.name,
            employeeCode: e.employeeCode,
            phone: e.phone,
            designation: e.designation,
            joiningDate: e.joiningDate,
            monthlySalaryMinor: Number(e.monthlySalaryMinor),
            userId: e.userId,
            idProofType: e.idProofType,
            idProofNumber: e.idProofNumber,
            emergencyContact: e.emergencyContact,
            address: e.address,
            isActive: e.isActive,
            jobsThisMonth: prod?.jobs ?? 0,
            revenueThisMonth: Number(prod?.revenue ?? 0),
          };
        })}
      />
    </Page>
  );
}
