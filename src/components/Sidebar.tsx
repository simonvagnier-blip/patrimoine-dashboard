"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Space, SPACES, NAV_ITEMS } from "@/lib/spaces";

const ICONS: Record<string, string> = {
  home: "H", wallet: "W", banknote: "$", check: "T",
  flame: "F", calendar: "C", pen: "N", users: "U",
  funnel: "P", chart: "K",
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
      {/* Logo */}
      <div className="px-4 h-14 flex items-center border-b border-gray-800">
        <span className="text-white font-bold text-sm tracking-tight">Command Center</span>
      </div>

      {/* Space Switcher */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex rounded-lg bg-[#161b22] p-0.5">
          {(["perso", "pro", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onSpaceChange(s)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                space === s
                  ? `bg-[#0d1117] text-white`
                  : "text-gray-500 hover:text-gray-300"
              }`}
              style={space === s ? { boxShadow: `0 0 0 1px ${SPACES[s].color}40` } : {}}
            >
              {SPACES[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {items.map((item) => {
          const isActive = item.href === `/${space}`
            ? pathname === item.href
            : pathname.startsWith(item.href);
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
              <span
                className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold"
                style={isActive ? { backgroundColor: config.color + "20", color: config.color } : { backgroundColor: "#1f2937", color: "#6b7280" }}
              >
                {ICONS[item.icon] || "?"}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Space indicator */}
      <div className="px-4 py-3 border-t border-gray-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
          <span className="text-xs text-gray-500">{config.label}</span>
        </div>
      </div>
    </aside>
  );
}
