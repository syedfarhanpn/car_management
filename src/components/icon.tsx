import {
  Boxes,
  Car,
  ClipboardList,
  LayoutGrid,
  MessageCircle,
  ReceiptIndianRupee,
  Settings,
  ShoppingCart,
  TrendingUp,
  UsersRound,
  Wallet,
  type LucideProps,
} from "lucide-react";

/**
 * Module definitions live in a plain data file (lib/modules.ts) so they can be
 * imported by server code without pulling React in. This maps the icon name
 * back to a component at render time.
 */
const ICONS = {
  Boxes,
  Car,
  ClipboardList,
  LayoutGrid,
  MessageCircle,
  ReceiptIndianRupee,
  Settings,
  ShoppingCart,
  TrendingUp,
  UsersRound,
  Wallet,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = ICONS[name as IconName] ?? LayoutGrid;
  return <Cmp {...props} />;
}
