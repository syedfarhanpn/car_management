"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { toMinor } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: string): ActionResult<never> => ({ ok: false, error });

const employeeSchema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  employeeCode: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  designation: z.string().trim().optional(),
  joiningDate: z.string().trim().optional(),
  monthlySalary: z.string().trim().optional(),
  userId: z.string().optional(),
  idProofType: z.string().trim().optional(),
  idProofNumber: z.string().trim().optional(),
  emergencyContact: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

/**
 * Employees are separate from login users on purpose: a washer needs
 * attendance and payroll but may never touch the system, and the owner has a
 * login without being on the payroll. userId links the two when both apply.
 */
export async function saveEmployee(id: string | null, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const parsed = employeeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const db = await getDb();
  const values = {
    name: parsed.data.name,
    employeeCode: parsed.data.employeeCode || null,
    phone: parsed.data.phone ? normalizePhone(parsed.data.phone) : null,
    designation: parsed.data.designation || null,
    joiningDate: parsed.data.joiningDate || null,
    monthlySalaryMinor: parsed.data.monthlySalary ? toMinor(parsed.data.monthlySalary) : 0,
    userId: parsed.data.userId || null,
    idProofType: parsed.data.idProofType || null,
    idProofNumber: parsed.data.idProofNumber || null,
    emergencyContact: parsed.data.emergencyContact || null,
    address: parsed.data.address || null,
  };

  if (id) {
    await db
      .update(s.employees)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(s.employees.id, id), eq(s.employees.orgId, user.orgId)));
  } else {
    await db.insert(s.employees).values({ orgId: user.orgId, branchId: user.branchId, ...values });
  }

  revalidatePath("/employees");
  return ok(undefined);
}

export async function setEmployeeActive(id: string, isActive: boolean): Promise<ActionResult> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();
  await db
    .update(s.employees)
    .set({ isActive, archivedAt: isActive ? null : new Date(), updatedAt: new Date() })
    .where(and(eq(s.employees.id, id), eq(s.employees.orgId, user.orgId)));
  revalidatePath("/employees");
  return ok(undefined);
}

/**
 * Attendance is saved a whole day at a time. The unique index on
 * (employee, date) means re-saving a day corrects it rather than duplicating,
 * so a supervisor can fix a mistake without needing a delete flow.
 */
export async function saveAttendance(formData: FormData): Promise<ActionResult<{ marked: number }>> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const db = await getDb();

  const date = String(formData.get("attendanceDate") ?? new Date().toISOString().slice(0, 10));
  const employees = await db
    .select()
    .from(s.employees)
    .where(and(eq(s.employees.orgId, user.orgId), eq(s.employees.isActive, true)));

  const existing = await db
    .select()
    .from(s.attendance)
    .where(and(eq(s.attendance.orgId, user.orgId), eq(s.attendance.attendanceDate, date)));

  let marked = 0;
  for (const emp of employees) {
    const raw = formData.get(`status:${emp.id}`);
    if (!raw) continue;
    const status = String(raw) as (typeof s.attendanceStatus.enumValues)[number];
    if (!s.attendanceStatus.enumValues.includes(status)) continue;

    const prior = existing.find((e) => e.employeeId === emp.id);
    if (prior) {
      await db
        .update(s.attendance)
        .set({ status, markedById: user.id, updatedAt: new Date() })
        .where(eq(s.attendance.id, prior.id));
    } else {
      await db.insert(s.attendance).values({
        orgId: user.orgId,
        employeeId: emp.id,
        attendanceDate: date,
        status,
        markedById: user.id,
      });
    }
    marked += 1;
  }

  revalidatePath("/employees/attendance");
  return ok({ marked });
}
