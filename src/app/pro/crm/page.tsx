"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface Contact {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  notes: string | null;
  last_contact: string | null;
}

export default function CRMPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", role: "", notes: "" });

  const fetchContacts = useCallback(async () => {
    const res = await fetch("/api/contacts");
    if (res.ok) setContacts(await res.json());
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  function openNew() { setEditContact(null); setForm({ name: "", company: "", email: "", phone: "", role: "", notes: "" }); setDialogOpen(true); }
  function openEdit(c: Contact) {
    setEditContact(c);
    setForm({ name: c.name, company: c.company || "", email: c.email || "", phone: c.phone || "", role: c.role || "", notes: c.notes || "" });
    setDialogOpen(true);
  }

  async function saveContact() {
    const method = editContact ? "PUT" : "POST";
    const body = editContact ? { id: editContact.id, ...form } : form;
    await fetch("/api/contacts", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setDialogOpen(false);
    fetchContacts();
  }

  async function deleteContact(id: number) {
    await fetch(`/api/contacts?id=${id}`, { method: "DELETE" });
    fetchContacts();
  }

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q);
  });

  const inputCls = "bg-[#0d1220] border-gray-700 text-white";

  return (
    <main className="min-h-screen bg-[#0a0f1e] p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">CRM</h1>
          <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white">+ Contact</Button>
        </div>

        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un contact..."
          className="bg-[#0d1220] border-gray-700 text-white" />

        <div className="space-y-2">
          {filtered.map((c) => (
            <Card key={c.id} className="bg-[#0d1220] border-gray-800 hover:border-gray-700 transition-colors cursor-pointer"
              onClick={() => openEdit(c)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">{c.name}</p>
                  <div className="flex gap-3 text-xs text-gray-400 mt-1">
                    {c.company && <span>{c.company}</span>}
                    {c.role && <span>{c.role}</span>}
                    {c.email && <span>{c.email}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {c.last_contact && (
                    <span className="text-[10px] text-gray-500 font-[family-name:var(--font-jetbrains)]">
                      {new Date(c.last_contact).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); deleteContact(c.id); }}
                    className="text-gray-600 hover:text-red-400 text-xs">&#10005;</button>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && <p className="text-gray-500 text-sm text-center py-8">Aucun contact</p>}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-[#0d1220] border-gray-800 text-white max-w-md">
            <DialogHeader>
              <DialogTitle>{editContact ? "Modifier" : "Nouveau contact"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-gray-400 text-xs">Nom *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></div>
                <div><Label className="text-gray-400 text-xs">Entreprise</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-gray-400 text-xs">Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></div>
                <div><Label className="text-gray-400 text-xs">Téléphone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></div>
              </div>
              <div><Label className="text-gray-400 text-xs">Rôle</Label><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls} /></div>
              <div><Label className="text-gray-400 text-xs">Notes</Label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className={`w-full ${inputCls} rounded-lg p-2 text-sm`} /></div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-700 text-gray-300">Annuler</Button>
                <Button onClick={saveContact} className="bg-blue-600 hover:bg-blue-700 text-white">{editContact ? "Modifier" : "Créer"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
