export type Space = "pro" | "perso" | "all";

export interface SpaceConfig {
  id: Space;
  label: string;
  color: string;
  accent: string;
  bg: string;
}

export const SPACES: Record<Space, SpaceConfig> = {
  perso: {
    id: "perso",
    label: "Perso",
    color: "#34d399",
    accent: "emerald",
    bg: "#080c14",
  },
  pro: {
    id: "pro",
    label: "Pro",
    color: "#3b82f6",
    accent: "blue",
    bg: "#0a0f1e",
  },
  all: {
    id: "all",
    label: "Tout",
    color: "#a78bfa",
    accent: "violet",
    bg: "#080c14",
  },
};

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const NAV_ITEMS: Record<Space, NavItem[]> = {
  perso: [
    { href: "/perso", label: "Accueil", icon: "home" },
    { href: "/perso/patrimoine", label: "Patrimoine", icon: "wallet" },
    { href: "/perso/budget", label: "Budget", icon: "banknote" },
    { href: "/perso/tasks", label: "Tâches", icon: "check" },
    { href: "/perso/habits", label: "Habitudes", icon: "flame" },
    { href: "/perso/agenda", label: "Agenda", icon: "calendar" },
    { href: "/perso/notes", label: "Notes", icon: "pen" },
  ],
  pro: [
    { href: "/pro", label: "Accueil", icon: "home" },
    { href: "/pro/crm", label: "CRM", icon: "users" },
    { href: "/pro/pipeline", label: "Pipeline", icon: "funnel" },
    { href: "/pro/kpis", label: "KPIs", icon: "chart" },
    { href: "/pro/tasks", label: "Tâches", icon: "check" },
    { href: "/pro/agenda", label: "Agenda", icon: "calendar" },
    { href: "/pro/notes", label: "Notes", icon: "pen" },
  ],
  all: [
    { href: "/", label: "Accueil", icon: "home" },
    { href: "/perso/patrimoine", label: "Patrimoine", icon: "wallet" },
    { href: "/pro/crm", label: "CRM", icon: "users" },
    { href: "/perso/budget", label: "Budget", icon: "banknote" },
    { href: "/pro/pipeline", label: "Pipeline", icon: "funnel" },
    { href: "/perso/habits", label: "Habitudes", icon: "flame" },
    { href: "/pro/kpis", label: "KPIs", icon: "chart" },
  ],
};
