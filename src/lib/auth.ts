import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";

const COOKIE_NAME = "pitstop_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // a workshop shift, not a month

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(value);
}

export type SessionUser = {
  id: string;
  orgId: string;
  branchId: string | null;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "STAFF";
};

/**
 * Capability checks live here rather than being scattered as `role === "ADMIN"`
 * across the UI, so a policy change is one edit and every screen agrees.
 *
 * canDiscount is deliberately ADMIN-only: the locked decision is that staff
 * bill at list price. This is enforced server-side on every mutation, not just
 * hidden in the interface - a hidden button is not a control.
 */
export const can = {
  viewCosts: (u: SessionUser) => u.role === "ADMIN" || u.role === "MANAGER",
  viewMargins: (u: SessionUser) => u.role === "ADMIN",
  discount: (u: SessionUser) => u.role === "ADMIN",
  voidInvoice: (u: SessionUser) => u.role === "ADMIN",
  manageUsers: (u: SessionUser) => u.role === "ADMIN",
  manageSettings: (u: SessionUser) => u.role === "ADMIN",
  manageInventory: (u: SessionUser) => u.role === "ADMIN" || u.role === "MANAGER",
  viewReports: (u: SessionUser) => u.role === "ADMIN" || u.role === "MANAGER",
  adjustStock: (u: SessionUser) => u.role === "ADMIN" || u.role === "MANAGER",
};

export async function verifyCredentials(email: string, password: string): Promise<SessionUser | null> {
  const db = await getDb();
  const [user] = await db
    .select()
    .from(s.users)
    .where(and(eq(s.users.email, email.toLowerCase().trim()), eq(s.users.isActive, true)))
    .limit(1);

  if (!user) {
    // Hash anyway so a missing account and a wrong password take the same
    // time. Otherwise the response time tells an attacker which emails exist.
    bcrypt.compareSync(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu");
    return null;
  }
  if (!bcrypt.compareSync(password, user.passwordHash)) return null;

  await db.update(s.users).set({ lastLoginAt: new Date() }).where(eq(s.users.id, user.id));

  return {
    id: user.id,
    orgId: user.orgId,
    branchId: user.branchId,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let payload: Record<string, unknown>;
  try {
    ({ payload } = (await jwtVerify(token, secret())) as { payload: Record<string, unknown> });
  } catch {
    return null;
  }

  /**
   * A valid signature is not enough. The token is self-contained and lives for
   * 12 hours, so it can outlive the thing it points at:
   *
   *   - the account was deactivated (someone left, or was sacked) and must
   *     lose access NOW, not whenever their token happens to expire
   *   - the role was changed and the token still carries the old one
   *   - the database was rebuilt underneath it, leaving the token pointing at
   *     an org id that no longer exists — which silently scopes every query to
   *     zero rows and looks like data loss rather than a stale login
   *
   * One indexed primary-key lookup per request is a fair price for a session
   * that reflects reality. Role and org are re-read from the row, never
   * trusted from the token.
   */
  const db = await getDb();
  const [user] = await db
    .select()
    .from(s.users)
    .where(and(eq(s.users.id, payload.id as string), eq(s.users.isActive, true)))
    .limit(1);

  if (!user) return null;

  return {
    id: user.id,
    orgId: user.orgId,
    branchId: user.branchId,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

/** Use at the top of every protected page and server action. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(roles: SessionUser["role"][]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard?denied=1");
  return user;
}
