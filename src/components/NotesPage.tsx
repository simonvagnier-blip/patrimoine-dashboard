"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SPACES } from "@/lib/spaces";

interface Note {
  id: number;
  space: string;
  title: string;
  content: string;
  type: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

export default function NotesPage({ space }: { space: "pro" | "perso" }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const config = SPACES[space];
  const bgColor = space === "pro" ? "bg-[#0a0f1e]" : "bg-[#080c14]";
  const cardBg = space === "pro" ? "bg-[#0d1220]" : "bg-[#0d1117]";

  const fetchNotes = useCallback(async () => {
    const res = await fetch(`/api/notes?space=${space}`);
    if (res.ok) setNotes(await res.json());
  }, [space]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  function selectNote(note: Note) {
    setSelected(note);
    setTitle(note.title);
    setContent(note.content);
  }

  async function saveNote() {
    setSaving(true);
    if (selected) {
      await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, title, content }),
      });
    } else {
      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ space, title: title || "Sans titre", content, type: "note" }),
      });
    }
    setSaving(false);
    fetchNotes();
  }

  function newNote() {
    setSelected(null);
    setTitle("");
    setContent("");
  }

  async function deleteNote(id: number) {
    await fetch(`/api/notes?id=${id}`, { method: "DELETE" });
    if (selected?.id === id) newNote();
    fetchNotes();
  }

  const sortedNotes = [...notes].sort((a, b) => b.pinned - a.pinned || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return (
    <main className={`min-h-screen ${bgColor} p-4 md:p-8`}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Notes</h1>
          <Button onClick={newNote} style={{ backgroundColor: config.color }} className="text-white hover:opacity-90">
            + Nouvelle note
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Note list */}
          <div className="space-y-2">
            {sortedNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => selectNote(note)}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  selected?.id === note.id ? `${cardBg} ring-1` : `${cardBg} hover:bg-[#161b22]`
                }`}
                style={selected?.id === note.id ? { borderColor: config.color + "40" } : {}}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white font-medium truncate">{note.title}</p>
                  {note.pinned ? <span className="text-xs">&#128204;</span> : null}
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{note.content || "Vide"}</p>
                <p className="text-[10px] text-gray-600 mt-1">
                  {new Date(note.updated_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
            ))}
            {notes.length === 0 && <p className="text-gray-500 text-sm text-center py-8">Aucune note</p>}
          </div>

          {/* Editor */}
          <div className="md:col-span-2">
            <Card className={`${cardBg} border-gray-800`}>
              <CardContent className="pt-4 space-y-4">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Titre de la note"
                  className={`${cardBg} border-gray-700 text-white text-lg font-medium`}
                />
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Écris ici..."
                  rows={16}
                  className={`w-full ${cardBg} border border-gray-700 rounded-lg p-3 text-sm text-gray-300 resize-none focus:outline-none focus:border-gray-600`}
                />
                <div className="flex justify-between">
                  {selected && (
                    <Button variant="ghost" size="sm" onClick={() => deleteNote(selected.id)}
                      className="text-red-400 hover:text-red-300 text-xs">
                      Supprimer
                    </Button>
                  )}
                  <div className="ml-auto">
                    <Button onClick={saveNote} disabled={saving} style={{ backgroundColor: config.color }} className="text-white hover:opacity-90">
                      {saving ? "..." : selected ? "Sauvegarder" : "Créer"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
