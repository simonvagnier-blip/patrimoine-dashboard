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

/**
 * Barre d'onglets mobile fixée en bas (zone du pouce) : les 4 destinations
 * principales de l'espace courant. Complète le menu hamburger (MobileNav)
 * qui garde la liste complète. Desktop : cachée (sidebar).
 */
export default function MobileTabBar({ space }: { space: Space }) {
  const pathname = usePathname();
  const config = SPACES[space];
  const items = NAV_ITEMS[space].slice(0, 4);

  function isActive(href: string): boolean {
    // Les racines d'espace ("/perso", "/pro", "/") ne matchent qu'en exact,
    // sinon elles seraient actives sur toutes les sous-pages.
    if (href === "/" || href === "/perso" || href === "/pro") {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  return (
    <nav
      aria-label="Navigation principale"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0d1117]/95 backdrop-blur border-t border-gray-800 flex justify-around pb-[env(safe-area-inset-bottom)]"
    >
      {items.map((item) => {
        const active = isActive(item.href);
        const Icon = ICON_MAP[item.icon] || Home;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[52px] py-1.5 text-[10px] font-medium"
            style={{ color: active ? config.color : "#9ca3af" }}
          >
            <Icon size={21} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
