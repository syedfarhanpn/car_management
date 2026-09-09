import type { SessionUser } from "./auth";

/**
 * Single source of truth for the module grid AND the sidebar, so the two can
 * never disagree about what a role is allowed to see.
 *
 * `roles` is presentation only. Every module still enforces its own permission
 * check server-side - hiding a tile is a convenience, not a security boundary.
 */
export type ModuleDef = {
  key: string;
  name: string;
  href: string;
  description: string;
  icon: string;
  accent: string;
  roles: SessionUser["role"][];
  phase: number;
};

const ALL: SessionUser["role"][] = ["ADMIN", "MANAGER", "STAFF"];
const MGMT: SessionUser["role"][] = ["ADMIN", "MANAGER"];
const ADMIN_ONLY: SessionUser["role"][] = ["ADMIN"];

export const MODULES: ModuleDef[] = [
  {
    key: "job-cards",
    name: "Job Cards",
    href: "/job-cards",
    description: "Open a card from a 4-digit plate search, add services and parts",
    icon: "ClipboardList",
    accent: "#2049e0",
    roles: ALL,
    phase: 2,
  },
  {
    key: "clients",
    name: "Clients & Vehicles",
    href: "/clients",
    description: "One customer, many cars, full service history per vehicle",
    icon: "Car",
    accent: "#0891b2",
    roles: ALL,
    phase: 1,
  },
  {
    key: "billing",
    name: "Billing & Invoices",
    href: "/billing",
    description: "Invoices, part payments, outstanding balances, send on WhatsApp",
    icon: "ReceiptIndianRupee",
    accent: "#0f7b4f",
    roles: ALL,
    phase: 3,
  },
  {
    key: "inventory",
    name: "Inventory",
    href: "/inventory",
    description: "Stocked parts, bulk consumables, recipes and stock takes",
    icon: "Boxes",
    accent: "#7c3aed",
    roles: MGMT,
    phase: 4,
  },
  {
    key: "purchases",
    name: "Purchases",
    href: "/purchases",
    description: "Supplier bills, payables, and parts bought for a customer",
    icon: "ShoppingCart",
    accent: "#c2410c",
    roles: MGMT,
    phase: 4,
  },
  {
    key: "accounts",
    name: "Accounts",
    href: "/accounts",
    description: "Expenses, receivables, payables and the daily cash closing",
    icon: "Wallet",
    accent: "#b45309",
    roles: MGMT,
    phase: 5,
  },
  {
    key: "revenue",
    name: "Revenue & Reports",
    href: "/revenue",
    description: "Sales, margins by service, consumption variance, ageing",
    icon: "TrendingUp",
    accent: "#be123c",
    roles: MGMT,
    phase: 5,
  },
  {
    key: "employees",
    name: "Employees",
    href: "/employees",
    description: "Staff records, attendance, and productivity per technician",
    icon: "UsersRound",
    accent: "#4338ca",
    roles: MGMT,
    phase: 6,
  },
  {
    key: "whatsapp",
    name: "WhatsApp",
    href: "/whatsapp",
    description: "Service reminders, promotions, delivery log and templates",
    icon: "MessageCircle",
    accent: "#059669",
    roles: MGMT,
    phase: 7,
  },
  {
    key: "settings",
    name: "Settings",
    href: "/settings",
    description: "Services, price matrix, tax, users, and invoice numbering",
    icon: "Settings",
    accent: "#475569",
    roles: ADMIN_ONLY,
    phase: 1,
  },
];

export function modulesFor(role: SessionUser["role"]): ModuleDef[] {
  return MODULES.filter((m) => m.roles.includes(role));
}
