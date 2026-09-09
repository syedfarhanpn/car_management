import { boolean, date, index, pgEnum, pgTable, text, time, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { archivedAt, createdAt, money, pk, updatedAt } from "./_shared";
import { branches, organizations, users } from "./org";

/**
 * Employees are separate from users: not every employee gets a login (a washer
 * may never touch the system but still needs attendance and payroll), and not
 * every user is an employee (the owner, an external accountant).
 *
 * Commission is fixed-salary-only per the locked decision, so there is no
 * incentive engine here. Job card lines still carry technicianId, which costs
 * nothing to store and is what makes a productivity report - or commission
 * later - possible without redoing historical job data.
 */
export const employees = pgTable(
  "employees",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    branchId: uuid("branch_id").references(() => branches.id),
    userId: uuid("user_id").references(() => users.id),
    employeeCode: text("employee_code"),
    name: text("name").notNull(),
    phone: text("phone"),
    designation: text("designation"),
    joiningDate: date("joining_date"),
    monthlySalaryMinor: money("monthly_salary_minor").notNull().default(0),
    idProofType: text("id_proof_type"),
    idProofNumber: text("id_proof_number"),
    emergencyContact: text("emergency_contact"),
    address: text("address"),
    isActive: boolean("is_active").notNull().default(true),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("employees_org_idx").on(t.orgId, t.isActive)],
);

export const attendanceStatus = pgEnum("attendance_status", [
  "PRESENT",
  "ABSENT",
  "HALF_DAY",
  "PAID_LEAVE",
  "UNPAID_LEAVE",
  "HOLIDAY",
]);

export const attendance = pgTable(
  "attendance",
  {
    id: pk(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    attendanceDate: date("attendance_date").notNull(),
    status: attendanceStatus("status").notNull().default("PRESENT"),
    checkIn: time("check_in"),
    checkOut: time("check_out"),
    note: text("note"),
    markedById: uuid("marked_by_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("attendance_employee_date_uq").on(t.employeeId, t.attendanceDate)],
);
