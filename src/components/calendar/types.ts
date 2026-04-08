export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  htmlLink: string | null;
  source: "pro" | "perso";
}

export type CalendarView = "day" | "week" | "month";
export type CalendarSource = "pro" | "perso";

export const SOURCE_COLORS = {
  pro: { bg: "bg-blue-500/20", border: "border-blue-500", text: "text-blue-400", dot: "bg-blue-500", hex: "#3b82f6" },
  perso: { bg: "bg-emerald-500/20", border: "border-emerald-500", text: "text-emerald-400", dot: "bg-emerald-500", hex: "#34d399" },
};
