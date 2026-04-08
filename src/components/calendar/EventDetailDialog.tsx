"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { CalendarEvent } from "./types";
import { SOURCE_COLORS } from "./types";
import { formatTime } from "./utils";

interface EventDetailDialogProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EventDetailDialog({ event, open, onOpenChange }: EventDetailDialogProps) {
  if (!event) return null;

  const colors = SOURCE_COLORS[event.source];
  const startDate = new Date(event.start);
  const endDate = new Date(event.end);
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationHours = Math.floor(durationMs / 3600000);
  const durationMins = Math.round((durationMs % 3600000) / 60000);
  const durationStr = durationHours > 0
    ? `${durationHours}h${durationMins > 0 ? durationMins.toString().padStart(2, "0") : ""}`
    : `${durationMins}min`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1117] border-gray-800 text-white max-w-md">
        {/* Color bar */}
        <div className={`h-1 w-full rounded-t-lg -mt-6 mb-2 ${colors.bg.replace("/20", "")}`} style={{ backgroundColor: colors.hex }} />
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="text-lg">{event.title}</DialogTitle>
            <Badge variant="outline" className="shrink-0 text-[10px] px-2" style={{ color: colors.hex, borderColor: colors.hex + "40" }}>
              {event.source === "pro" ? "Pro" : "Perso"}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date & Time */}
          <div className="space-y-1">
            <p className="text-sm text-gray-300">
              {startDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            {event.allDay ? (
              <p className="text-sm text-gray-400">Toute la journée</p>
            ) : (
              <p className="text-sm text-gray-400 font-[family-name:var(--font-jetbrains)]">
                {formatTime(event.start)} — {formatTime(event.end)}
                <span className="text-gray-500 ml-2">({durationStr})</span>
              </p>
            )}
          </div>

          {/* Location */}
          {event.location && (
            <>
              <Separator className="bg-gray-800" />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Lieu</p>
                <p className="text-sm text-gray-300">{event.location}</p>
              </div>
            </>
          )}

          {/* Description */}
          {event.description && (
            <>
              <Separator className="bg-gray-800" />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Description</p>
                <p className="text-sm text-gray-400 whitespace-pre-wrap line-clamp-6">{event.description}</p>
              </div>
            </>
          )}

          {/* External link */}
          {event.htmlLink && (
            <>
              <Separator className="bg-gray-800" />
              <a href={event.htmlLink} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:text-white w-full">
                  Ouvrir dans {event.source === "pro" ? "Google Calendar" : "Apple Calendar"}
                </Button>
              </a>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
