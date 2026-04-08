"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/projections", label: "Projections" },
];

export default function Navbar() {
  const pathname = usePathname();

  // Don't show on login
  if (pathname === "/login") return null;

  return (
    <nav className="bg-[#0d1117] border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-white font-bold text-sm tracking-tight"
            >
              Patrimoine
            </Link>
            <div className="flex gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/" || pathname.startsWith("/envelope")
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                      isActive
                        ? "bg-[#161b22] text-white"
                        : "text-gray-400 hover:text-gray-200 hover:bg-[#161b22]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
