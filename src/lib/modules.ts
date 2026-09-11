import type { SessionUser } from "./auth";

/**
 * Single source of truth for the sidebar AND the dashboard grid, so the two
 * can never disagree about what a role is allowed to see.
 *
 * `roles` is presentation only. Every module still enforces its own permission
 * check server-side — hiding a tile is a convenience, not a security boundary.
 */
export type ModuleGroup = "WORKSPACE" | "OPERATIONS" | "ANALYTICS" | "SYSTEM";

export type ModuleDef = {
  key: string;
  name: string;
  href: string;
  description: string;
  icon: string;
  accent: string;
  group: ModuleGroup;
  roles: SessionUser["role"][];
};

const ALL: SessionUser["role"][] = ["ADMIN", "MANAGER", "STAFF"];
const MGMT: SessionUser["role"][] = ["ADMIN", "MANAGER"];
const ADMIN_ONLY: SessionUser["role"][] = ["ADMIN"];

export const GROUP_ORDER: ModuleGroup[] = ["WORKSPACE", "OPERATIONS", "ANALYTICS", "SYSTEM"];

export const MODULES: ModuleDef[] = [
  {
    key: "job-cards",
    name: "Job Cards",
    href: "/job-cards",
    description: "Open a card from a 4-digit plate search, add services and parts",
    icon: "ClipboardList",
    accent: "var(--chart-1)",
    group: "WORKSPACE",
    roles: ALL,
  },
  {
    key: "clients",
    name: "Clients & Vehicles",
    href: "/clients",
    description: "One customer, many cars, full service history per vehicle",
    icon: "Car",
    accent: "#0891b2",
    group: "WORKSPACE",
    roles: ALL,
  },
  {
    key: "billing",
    name: "Billing & Invoices",
    href: "/billing",
    description: "Invoices, part payments, outstanding balances, send on WhatsApp",
    icon: "ReceiptIndianRupee",
    accent: "var(--chart-4)",
    group: "WORKSPACE",
    roles: ALL,
  },
  {
    key: "inventory",
    name: "Inventory",
    href: "/inventory",
    description: "Stocked parts, bulk consumables, recipes and stock takes",
    icon: "Boxes",
    accent: "var(--chart-2)",
    group: "OPERATIONS",
    roles: MGMT,
  },
  {
    key: "purchases",
    name: "Purchases",
    href: "/purchases",
    description: "Supplier bills, payables, and parts bought for a customer",
    icon: "ShoppingCart",
    accent: "var(--chart-3)",
    group: "OPERATIONS",
    roles: MGMT,
  },
  {
    key: "employees",
    name: "Employees",
    href: "/employees",
    description: "Staff records, attendance, and productivity per technician",
    icon: "UsersRound",
    accent: "#6366f1",
    group: "OPERATIONS",
    roles: MGMT,
  },
  {
    key: "whatsapp",
    name: "WhatsApp",
    href: "/whatsapp",
    description: "Service reminders, promotions, delivery log and templates",
    icon: "MessageCircle",
    accent: "#10b981",
    group: "OPERATIONS",
    roles: MGMT,
  },
  {
    key: "accounts",
    name: "Accounts",
    href: "/accounts",
    description: "Expenses, receivables, payables and the daily cash closing",
    icon: "Wallet",
    accent: "#f59e0b",
    group: "ANALYTICS",
    roles: MGMT,
  },
  {
    key: "revenue",
    name: "Revenue & Reports",
    href: "/revenue",
    description: "Sales, margins by service, consumption variance, ageing",
    icon: "TrendingUp",
    accent: "var(--chart-5)",
    group: "ANALYTICS",
    roles: MGMT,
  },
  {
    key: "settings",
    name: "Settings",
    href: "/settings",
    description: "Services, price matrix, tax, users, and invoice numbering",
    icon: "Settings",
    accent: "#71717a",
    group: "SYSTEM",
    roles: ADMIN_ONLY,
  },
];

export function modulesFor(role: SessionUser["role"]): ModuleDef[] {
  return MODULES.filter((m) => m.roles.includes(role));
}

export function groupedModulesFor(role: SessionUser["role"]) {
  const visible = modulesFor(role);
  return GROUP_ORDER.map((group) => ({
    group,
    items: visible.filter((m) => m.group === group),
  })).filter((g) => g.items.length > 0);
}
