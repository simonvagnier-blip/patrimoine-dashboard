"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Space, SPACES, NAV_ITEMS } from "@/lib/spaces";
import {
  Home, Wallet, Banknote, CheckSquare, Flame, Calendar, PenLine,
  Users, BarChart3, TrendingUp, Menu, X,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  home: Home, wallet: Wallet, banknote: Banknote, check: CheckSquare,
  flame: Flame, calendar: Calendar, pen: PenLine, users: Users,
  funnel: TrendingUp, chart: BarChart3,
};

interface MobileNavProps {
  space: Space;
  onSpaceChange: (s: Space) => void;
}

export default function MobileNav({ space, onSpaceChange }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const config = SPACES[space];
  const items = NAV_ITEMS[space];

  return (
    <div className="md:hidden">
      {/* Top bar with F15 accent */}
      <div className="fixed top-0 left-0 right-0 h-12 bg-[#0d1117] border-b border-gray-800 flex items-center justify-between px-4 z-50">
        <div className="absolute top-0 left-0 right-0 h-[2px] transition-colors duration-300" style={{ backgroundColor: config.color }} />
        <button onClick={() => setOpen(!open)} className="text-white p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        <span className="text-white font-bold text-sm">Command Center</span>
        {/* F2: All 3 modes */}
        <div className="flex rounded-md bg-[#161b22] p-0.5">
          {(["perso", "pro", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { onSpaceChange(s); setOpen(false); }}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-all min-w-[36px] ${
                space === s ? "text-white" : "text-gray-500"
              }`}
              style={space === s ? { backgroundColor: SPACES[s].color + "15", color: SPACES[s].color } : {}}
            >
              {SPACES[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Overlay menu */}
      {open && (
        <div className="fixed inset-0 top-12 bg-[#080c14] z-40 p-4 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = ICON_MAP[item.icon] || Home;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-lg text-sm min-h-[48px] ${
                  isActive ? "bg-[#161b22] text-white" : "text-gray-400"
                }`}
              >
                <Icon
                  size={20}
                  className="shrink-0"
                  style={isActive ? { color: config.color } : { color: "#6b7280" }}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
