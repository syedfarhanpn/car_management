"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, verifyCredentials } from "@/lib/auth";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  // Deliberately does not say which of the two was wrong - that difference is
  // how someone enumerates valid accounts.
  if (!user) return { error: "Email or password is incorrect" };

  await createSession(user);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
