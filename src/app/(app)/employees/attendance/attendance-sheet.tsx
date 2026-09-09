"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { saveAttendance } from "../actions";

type Row = {
  id: string;
  name: string;
  designation: string | null;
  status: string | null;
  monthPresent: number;
  monthAbsent: number;
  monthLeave: number;
};

const OPTIONS = [
  { value: "PRESENT", label: "Present", tone: "var(--success)" },
  { value: "HALF_DAY", label: "Half day", tone: "var(--warning)" },
  { value: "ABSENT", label: "Absent", tone: "var(--danger)" },
  { value: "PAID_LEAVE", label: "Paid leave", tone: "var(--brand)" },
  { value: "UNPAID_LEAVE", label: "Unpaid leave", tone: "var(--text-muted)" },
  { value: "HOLIDAY", label: "Holiday", tone: "var(--text-subtle)" },
];

export function AttendanceSheet({ attendanceDate, rows }: { attendanceDate: string; rows: Row[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((r) => [r.id, r.status ?? ""])),
  );

  const markedCount = Object.values(statuses).filter(Boolean).length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await saveAttendance(fd);
          if (!res.ok) setMessage(res.error);
          else {
            setMessage(`Saved ${res.data.marked} record(s)`);
            router.refresh();
          }
        });
      }}
    >
      <input type="hidden" name="attendanceDate" value={attendanceDate} />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <label className="text-[13px]" style={{ color: "var(--text-muted)" }} htmlFor="date">
            Date
          </label>
          <input
            id="date"
            type="date"
            className="input tnum py-1.5 w-auto"
            value={attendanceDate}
            onChange={(e) => router.push(`/employees/attendance?date=${e.target.value}`)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost text-[12.5px] py-1.5"
            onClick={() => setStatuses(Object.fromEntries(rows.map((r) => [r.id, "PRESENT"])))}
          >
            Mark all present
          </button>
          <span className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
            {markedCount} of {rows.length}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-[150px]">
                <p className="text-[13.5px] font-medium">{r.name}</p>
                <p className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                  {r.designation ?? "—"} · {r.monthPresent} days this month
                  {r.monthAbsent > 0 && `, ${r.monthAbsent} absent`}
                  {r.monthLeave > 0 && `, ${r.monthLeave} leave`}
                </p>
              </div>

              <div className="flex flex-wrap gap-1">
                {OPTIONS.map((o) => {
                  const selected = statuses[r.id] === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setStatuses((s) => ({ ...s, [r.id]: selected ? "" : o.value }))}
                      className="rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors"
                      style={
                        selected
                          ? { background: o.tone, color: "#fff" }
                          : { border: "1px solid var(--border-strong)", color: "var(--text-muted)" }
                      }
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {statuses[r.id] && <input type="hidden" name={`status:${r.id}`} value={statuses[r.id]} />}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending || markedCount === 0}>
          {pending ? "Saving…" : `Save attendance (${markedCount})`}
        </button>
        {message && (
          <span role="status" className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: "var(--success)" }}>
            <Check size={15} />
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
