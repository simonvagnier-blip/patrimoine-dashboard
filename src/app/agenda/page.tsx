import CalendarShell from "@/components/calendar/CalendarShell";

export default function MergedAgenda() {
  return <CalendarShell sources={["pro", "perso"]} space="all" />;
}
