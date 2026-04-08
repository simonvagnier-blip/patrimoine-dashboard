"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Space, SPACES, NAV_ITEMS } from "@/lib/spaces";
import {
  Home, Wallet, Banknote, CheckSquare, Flame, Calendar, PenLine,
  Users, BarChart3, TrendingUp,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  home: Home, wallet: Wallet, banknote: Banknote, check: CheckSquare,
  flame: Flame, calendar: Calendar, pen: PenLine, users: Users,
  funnel: TrendingUp, chart: BarChart3,
};

interface SidebarProps {
  space: Space;
  onSpaceChange: (s: Space) => void;
}

export default function Sidebar({ space, onSpaceChange }: SidebarProps) {
  const pathname = usePathname();
  const config = SPACES[space];
  const items = NAV_ITEMS[space];

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-56 bg-[#0d1117] border-r border-gray-800 flex flex-col z-50 hidden md:flex">
      {/* F15: Color accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] transition-colors duration-300" style={{ backgroundColor: config.color }} />

      {/* Logo */}
      <div className="px-4 h-14 flex items-center border-b border-gray-800 ml-[3px]">
        <span className="text-white font-bold text-sm tracking-tight">Command Center</span>
      </div>

      {/* Space Switcher */}
      <div className="px-3 pt-3 pb-2 ml-[3px]">
        <div className="flex rounded-lg bg-[#161b22] p-0.5">
          {(["perso", "pro", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onSpaceChange(s)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                space === s ? "text-white" : "text-gray-500 hover:text-gray-300"
              }`}
              style={space === s ? { backgroundColor: SPACES[s].color + "15", color: SPACES[s].color, boxShadow: `0 0 0 1px ${SPACES[s].color}30` } : {}}
            >
              {SPACES[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto ml-[3px]">
        {items.map((item) => {
          const isActive = item.href === `/${space}`
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = ICON_MAP[item.icon] || Home;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-[#161b22] text-white"
                  : "text-gray-400 hover:text-gray-200 hover:bg-[#161b22]/50"
              }`}
            >
              <Icon
                size={18}
                className="shrink-0 transition-colors"
                style={isActive ? { color: config.color } : { color: "#6b7280" }}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Space indicator */}
      <div className="px-4 py-3 border-t border-gray-800 ml-[3px]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
          <span className="text-xs text-gray-500">{config.label}</span>
        </div>
      </div>
    </aside>
  );
}
