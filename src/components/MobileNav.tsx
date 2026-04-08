"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Space, SPACES, NAV_ITEMS } from "@/lib/spaces";

const ICONS: Record<string, string> = {
  home: "H", wallet: "W", banknote: "$", check: "T",
  flame: "F", calendar: "C", pen: "N", users: "U",
  funnel: "P", chart: "K",
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
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 h-12 bg-[#0d1117] border-b border-gray-800 flex items-center justify-between px-4 z-50">
        <button onClick={() => setOpen(!open)} className="text-white text-lg">
          {open ? "\u2715" : "\u2630"}
        </button>
        <span className="text-white font-bold text-sm">Command Center</span>
        <div className="flex rounded-md bg-[#161b22] p-0.5">
          {(["perso", "pro"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onSpaceChange(s)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded transition-all ${
                space === s ? "bg-[#0d1117] text-white" : "text-gray-500"
              }`}
            >
              {SPACES[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Overlay menu */}
      {open && (
        <div className="fixed inset-0 top-12 bg-[#080c14] z-40 p-4 space-y-1">
          {items.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${
                  isActive ? "bg-[#161b22] text-white" : "text-gray-400"
                }`}
              >
                <span
                  className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
                  style={isActive ? { backgroundColor: config.color + "20", color: config.color } : { backgroundColor: "#1f2937", color: "#6b7280" }}
                >
                  {ICONS[item.icon] || "?"}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
