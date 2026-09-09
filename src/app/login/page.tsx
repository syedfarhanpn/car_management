import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/dashboard");

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel — hidden on phones, where staff just need the form. */}
      <div
        className="hidden lg:flex flex-col justify-between p-12"
        style={{ background: "linear-gradient(150deg, #1a3bb8 0%, #2049e0 55%, #101a3d 100%)", color: "#fff" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="grid place-items-center w-9 h-9 rounded-lg" style={{ background: "rgba(255,255,255,.16)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 17h14M6.5 17V9.5L8 6h8l1.5 3.5V17" />
              <circle cx="8" cy="17" r="1.6" />
              <circle cx="16" cy="17" r="1.6" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight">PitStop</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Every car, every job, every rupee — in one place.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "rgba(255,255,255,.72)" }}>
            Job cards from a four-digit plate search. Consumables that cost themselves out. Parts bought for a
            customer that never pollute your stock or your revenue.
          </p>
        </div>

        <p className="text-xs" style={{ color: "rgba(255,255,255,.5)" }}>
          Phases 0–3 · Job cards, billing & GST
        </p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="grid place-items-center w-9 h-9 rounded-lg" style={{ background: "var(--brand)", color: "var(--brand-fg)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 17h14M6.5 17V9.5L8 6h8l1.5 3.5V17" />
                <circle cx="8" cy="17" r="1.6" />
                <circle cx="16" cy="17" r="1.6" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight">PitStop</span>
          </div>

          <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            Prestige Auto Care · Vyttila (Main)
          </p>

          <LoginForm />

          <div className="mt-8 rounded-lg border p-3.5" style={{ background: "var(--surface-2)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
              Demo accounts
            </p>
            <dl className="mt-2 space-y-1 text-[12.5px] tnum" style={{ color: "var(--text-muted)" }}>
              <div className="flex justify-between gap-3">
                <dt>admin@demo.com</dt>
                <dd>admin123</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>manager@demo.com</dt>
                <dd>manager123</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>staff@demo.com</dt>
                <dd>staff123</dd>
              </div>
            </dl>
            <p className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: "var(--text-subtle)" }}>
              Sign in as staff to see the same screens with costs, margins and discounts removed.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
