"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Petit kebab menu (3 dots verticaux) avec dropdown au clic.
 * Auto-ferme au clic extérieur ou Escape.
 *
 * Usage :
 *   <KebabMenu items={[
 *     { label: "Modifier", onClick: () => ... },
 *     { label: "Supprimer", onClick: () => ..., destructive: true },
 *   ]} />
 */

export interface KebabMenuItem {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  icon?: string;
}

export default function KebabMenu({
  items,
  align = "right",
}: {
  items: KebabMenuItem[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`p-1.5 rounded-md text-gray-500 hover:text-gray-200 hover:bg-gray-800/60 transition-colors ${
          open ? "text-gray-200 bg-gray-800/60" : ""
        }`}
        title="Actions"
        aria-label="Actions"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <div
          className={`absolute z-30 mt-1 min-w-[140px] bg-[#161b22] border border-gray-700 rounded-md shadow-xl py-1 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onClick();
              }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                item.destructive
                  ? "text-red-400 hover:bg-red-900/30 hover:text-red-300"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {item.icon && <span className="text-sm leading-none w-4 text-center">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
