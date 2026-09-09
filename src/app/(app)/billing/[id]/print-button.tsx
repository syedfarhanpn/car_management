"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button className="btn btn-ghost" onClick={() => window.print()}>
      <Printer size={16} />
      Print / Save PDF
    </button>
  );
}
