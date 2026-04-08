"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function groupByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const groups: Record<string, CalendarEvent[]> = {};
  for (const e of events) {
    const dateKey = e.start.split("T")[0];
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(e);
  }
  return groups;
}

export default function PersoAgenda() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(7);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/apple-calendar?days=${range}`);
      if (res.status === 400) {
        setConfigured(false);
      } else if (res.ok) {
        const data = await res.json();
        setConfigured(true);
        setEvents(data.events || []);
      } else {
        setConfigured(false);
      }
    } catch {
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const grouped = groupByDate(events);
  const dateKeys = Object.keys(grouped).sort();

  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Agenda Perso</h1>
          <div className="flex gap-2">
            {[7, 14, 30].map((d) => (
              <Button key={d} variant={range === d ? "default" : "outline"} size="sm"
                onClick={() => setRange(d)}
                className={range === d ? "bg-emerald-600 text-white" : "border-gray-700 text-gray-400"}>
                {d}j
              </Button>
            ))}
          </div>
        </div>

        {/* Not configured */}
        {configured === false && !loading && (
          <Card className="bg-[#0d1117] border-gray-800">
            <CardContent className="py-12 text-center space-y-4">
              <div className="text-4xl">&#127822;</div>
              <p className="text-gray-400">Apple Calendar (CalDAV)</p>
              <div className="text-left max-w-sm mx-auto text-xs text-gray-500 space-y-2">
                <p>Pour connecter ton calendrier Apple, ajoute ces variables d&apos;environnement :</p>
                <div className="bg-[#161b22] rounded-lg p-3 font-[family-name:var(--font-jetbrains)] space-y-1">
                  <p>APPLE_CALDAV_URL=https://caldav.icloud.com</p>
                  <p>APPLE_CALDAV_USERNAME=ton@icloud.com</p>
                  <p>APPLE_CALDAV_PASSWORD=xxxx-xxxx-xxxx-xxxx</p>
                </div>
                <p className="text-gray-600">
                  Le mot de passe est un &quot;mot de passe d&apos;application&quot; à générer sur
                  appleid.apple.com &gt; Sécurité &gt; Mots de passe pour les apps.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-[#0d1117] rounded-lg" />
            ))}
          </div>
        )}

        {/* Events */}
        {configured && !loading && (
          <>
            {dateKeys.length === 0 && (
              <Card className="bg-[#0d1117] border-gray-800">
                <CardContent className="py-8 text-center">
                  <p className="text-gray-400">Aucun événement dans les {range} prochains jours</p>
                </CardContent>
              </Card>
            )}

            {dateKeys.map((dateKey) => {
              const dayEvents = grouped[dateKey];
              const isToday = dateKey === new Date().toISOString().split("T")[0];
              return (
                <div key={dateKey} className="space-y-2">
                  <h3 className={`text-sm font-medium ${isToday ? "text-emerald-400" : "text-gray-400"}`}>
                    {isToday && <Badge className="bg-emerald-600 text-white text-[10px] mr-2">Aujourd&apos;hui</Badge>}
                    {formatDate(dateKey)}
                  </h3>
                  {dayEvents.map((event) => (
                    <Card key={event.id} className="bg-[#0d1117] border-gray-800">
                      <CardContent className="p-3 flex items-center gap-4">
                        <div className="w-1 h-10 rounded-full bg-emerald-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium truncate">{event.title}</p>
                          <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                            {event.allDay ? (
                              <span>Toute la journée</span>
                            ) : (
                              <span className="font-[family-name:var(--font-jetbrains)]">
                                {formatTime(event.start)} — {formatTime(event.end)}
                              </span>
                            )}
                            {event.location && <span className="truncate">{event.location}</span>}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
            })}
          </>
        )}
      </div>
    </main>
  );
}
