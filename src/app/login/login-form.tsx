"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full mt-5" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="mt-7">
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className="input"
          placeholder="admin@demo.com"
          defaultValue="admin@demo.com"
        />
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          placeholder="••••••••"
          defaultValue="admin123"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="mt-4 rounded-lg px-3 py-2 text-[13px]"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
