"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  htmlLink: string | null;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
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

export default function ProAgenda() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(7); // days

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const timeMin = now.toISOString();
      const end = new Date();
      end.setDate(end.getDate() + range);
      const timeMax = end.toISOString();

      const res = await fetch(`/api/google/events?timeMin=${timeMin}&timeMax=${timeMax}`);
      if (res.status === 401) {
        setConnected(false);
        setEvents([]);
      } else if (res.ok) {
        const data = await res.json();
        setConnected(true);
        setEvents(data.events || []);
      }
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  async function connectGoogle() {
    const res = await fetch("/api/google");
    if (res.ok) {
      const { url } = await res.json();
      window.location.href = url;
    }
  }

  const grouped = groupByDate(events);
  const dateKeys = Object.keys(grouped).sort();

  return (
    <main className="min-h-screen bg-[#0a0f1e] p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Agenda Pro</h1>
          <div className="flex gap-2">
            {[7, 14, 30].map((d) => (
              <Button key={d} variant={range === d ? "default" : "outline"} size="sm"
                onClick={() => setRange(d)}
                className={range === d ? "bg-blue-600 text-white" : "border-gray-700 text-gray-400"}>
                {d}j
              </Button>
            ))}
          </div>
        </div>

        {/* Not connected */}
        {connected === false && !loading && (
          <Card className="bg-[#0d1220] border-gray-800">
            <CardContent className="py-12 text-center space-y-4">
              <div className="text-4xl">&#128197;</div>
              <p className="text-gray-400">Connecte ton Google Calendar pour voir tes événements</p>
              <Button onClick={connectGoogle} className="bg-blue-600 hover:bg-blue-700 text-white">
                Connecter Google Calendar
              </Button>
              <p className="text-xs text-gray-600">
                Nécessite les variables GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET
              </p>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-[#0d1220] rounded-lg" />
            ))}
          </div>
        )}

        {/* Events by date */}
        {connected && !loading && (
          <>
            {dateKeys.length === 0 && (
              <Card className="bg-[#0d1220] border-gray-800">
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
                  <h3 className={`text-sm font-medium ${isToday ? "text-blue-400" : "text-gray-400"}`}>
                    {isToday && <Badge className="bg-blue-600 text-white text-[10px] mr-2">Aujourd&apos;hui</Badge>}
                    {formatDate(dateKey + "T12:00:00")}
                  </h3>
                  {dayEvents.map((event) => (
                    <Card key={event.id} className="bg-[#0d1220] border-gray-800 hover:border-gray-700 transition-colors">
                      <CardContent className="p-3 flex items-center gap-4">
                        <div className="w-1 h-10 rounded-full bg-blue-500 shrink-0" />
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
                        {event.htmlLink && (
                          <a href={event.htmlLink} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-gray-600 hover:text-blue-400 shrink-0">
                            Ouvrir
                          </a>
                        )}
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
