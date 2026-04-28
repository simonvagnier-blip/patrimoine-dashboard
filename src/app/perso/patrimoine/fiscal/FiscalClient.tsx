"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FiscalSummary } from "@/lib/fiscal";

function eur(v: number, d = 0): string {
  return v.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: d,
  });
}

export default function FiscalClient({
  initialSummary,
  envelopes,
}: {
  initialSummary: FiscalSummary;
  envelopes: { id: string; name: string; type: string }[];
}) {
  const [summary, setSummary] = useState<FiscalSummary>(initialSummary);
  const [profileOpen, setProfileOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Profil considéré "par défaut" si AUCUNE des info clés n'a été renseignée :
  // ni année d'ouverture PEA, ni année d'ouverture AV, ni versements PER.
  // Ces valeurs sont nécessaires pour des calculs réalistes ; tant qu'elles
  // sont vides, on signale à l'utilisateur que les chiffres sont indicatifs.
  const profileIsDefault =
    summary.profile.pea_open_year === null &&
    Object.keys(summary.profile.av_open_years).length === 0 &&
    summary.profile.per_versements_annee_courante === 0;

  // Édition profil (binding direct sur les clés user_params)
  const p = summary.profile;
  const [form, setForm] = useState({
    annualIncome: p.annual_income.toString(),
    civilStatus: p.civil_status,
    numParts: p.num_parts.toString(),
    spouseIncome: p.spouse_income.toString(),
    marriageYear: p.marriage_year?.toString() ?? "",
    peaOpenYear: p.pea_open_year?.toString() ?? "",
    peaVersements: p.pea_versements_cumules?.toString() ?? "",
    perVersementsCourants: p.per_versements_annee_courante.toString(),
  });
  const avEnvelopes = envelopes.filter((e) => e.type === "av");
  const [avForm, setAvForm] = useState<Record<string, { openYear: string; versements: string }>>(
    () => {
      const o: Record<string, { openYear: string; versements: string }> = {};
      for (const e of avEnvelopes) {
        o[e.id] = {
          openYear: (p.av_open_years[e.id] ?? "").toString(),
          versements: (p.av_versements_cumules[e.id] ?? "").toString(),
        };
      }
      return o;
    }
  );

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        annualIncome: form.annualIncome,
        civilStatus: form.civilStatus,
        numParts: form.numParts,
        spouseIncome: form.spouseIncome,
        marriageYear: form.marriageYear,
        peaOpenYear: form.peaOpenYear,
        peaVersements: form.peaVersements,
        perVersementsCourants: form.perVersementsCourants,
      };
      for (const [id, v] of Object.entries(avForm)) {
        payload[`av_open_year_${id}`] = v.openYear;
        payload[`av_versements_${id}`] = v.versements;
      }
      await fetch("/api/params", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // Refresh summary
      const res = await fetch("/api/fiscal");
      if (res.ok) setSummary(await res.json());
      setProfileOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const envelopeTypeColor: Record<string, string> = {
    pea: "#34d399",
    per: "#a78bfa",
    av: "#f59e0b",
    cto: "#38bdf8",
    crypto: "#f97316",
    livrets: "#22d3ee",
    other: "#6b7280",
  };

  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/perso/patrimoine"
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            Patrimoine
          </Link>
          <span className="text-gray-600">/</span>
          <span className="text-gray-300">Analyse fiscale</span>
        </nav>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Analyse fiscale <span className="text-gray-500 text-base">{summary.tax_year}</span>
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Basé sur le barème IR 2026, PFU 31.4% (hausse CSG +1.4pt), AV 17.2% PS maintenu.
            </p>
          </div>
          {/* Bouton "Hypothèses" : visible et clairement libellé, sans
              révéler les valeurs personnelles. Un point ambre signale que le
              profil n'est pas configuré (toutes les hypothèses sont par défaut). */}
          <Button
            variant="outline"
            onClick={() => setProfileOpen(true)}
            className="border-gray-700 text-gray-300 hover:bg-[#161b22] hover:text-white relative pr-9"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Hypothèses fiscales
            {profileIsDefault && (
              <span
                className="absolute top-1.5 right-2.5 w-2 h-2 rounded-full bg-amber-400"
                title="Profil non personnalisé — calculs basés sur valeurs par défaut"
              />
            )}
          </Button>
        </div>

        {/* Bandeau pédagogique si profil pas encore configuré */}
        {profileIsDefault && (
          <div className="bg-amber-900/10 border border-amber-700/30 rounded-md px-3 py-2 text-xs text-amber-200/90 flex items-center gap-2">
            <span>⚠</span>
            <span>
              Tes calculs utilisent des valeurs par défaut. Renseigne ton profil
              (revenu, situation, ouverture PEA, AV) via le bouton{" "}
              <button
                onClick={() => setProfileOpen(true)}
                className="underline hover:text-amber-100"
              >
                Hypothèses fiscales
              </button>{" "}
              pour des estimations personnalisées.
            </span>
          </div>
        )}

        {/* Totaux */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BigMetric
            label="Valeur totale"
            value={eur(summary.totals.current_value_eur)}
            sub={`Investi : ${eur(summary.totals.cost_basis_eur)}`}
          />
          <BigMetric
            label="Plus-value latente"
            value={eur(summary.totals.unrealized_gain_eur)}
            sub={`${summary.totals.cost_basis_eur > 0 ? ((summary.totals.unrealized_gain_eur / summary.totals.cost_basis_eur) * 100).toFixed(2) + "%" : "—"}`}
            color="emerald"
          />
          <BigMetric
            label="Impôt si liquidation totale"
            value={eur(summary.totals.liquidation_tax_eur)}
            sub={
              summary.totals.unrealized_gain_eur > 0
                ? `Taux global ${((summary.totals.liquidation_tax_eur / summary.totals.unrealized_gain_eur) * 100).toFixed(1)}%`
                : "—"
            }
            color="amber"
          />
        </div>

        {/* Détail par enveloppe */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Détail par enveloppe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.envelopes.map((e) => (
              <div
                key={e.envelope_id}
                className="bg-[#161b22] rounded-lg p-3 flex items-start gap-3"
              >
                <span
                  className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: envelopeTypeColor[e.envelope_type] ?? "#6b7280" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <span className="text-sm text-white font-medium">
                      {e.envelope_name}
                      <span className="text-[10px] text-gray-500 uppercase ml-2">
                        {e.envelope_type}
                      </span>
                    </span>
                    <span className="text-xs text-gray-400 font-[family-name:var(--font-jetbrains)]">
                      {eur(e.current_value_eur)}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-4 mt-1 flex-wrap text-xs">
                    <span className="text-gray-500 font-[family-name:var(--font-jetbrains)]">
                      PV latente :{" "}
                      <span className={e.unrealized_gain_eur >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {e.unrealized_gain_eur >= 0 ? "+" : ""}
                        {eur(e.unrealized_gain_eur)}
                      </span>
                    </span>
                    <span className="text-gray-500 font-[family-name:var(--font-jetbrains)]">
                      Impôt liquidation :{" "}
                      <span className="text-amber-400">{eur(e.liquidation_tax_eur)}</span>
                      {e.liquidation_breakdown.rate_pct > 0 && (
                        <span className="text-gray-600">
                          {" "}
                          ({e.liquidation_breakdown.rate_pct.toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1.5">
                    {e.liquidation_breakdown.note}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* PEA & PER sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-[#0d1117] border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-base">Plan Épargne en Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <KV
                label="Plafond versements"
                value={eur(summary.pea.plafond_versements_eur)}
              />
              <KV
                label="Versements cumulés"
                value={
                  summary.pea.versements_cumules_eur !== null
                    ? eur(summary.pea.versements_cumules_eur)
                    : "—"
                }
              />
              <KV
                label="Reste versable"
                value={
                  summary.pea.remaining_eur !== null
                    ? eur(summary.pea.remaining_eur)
                    : "—"
                }
              />
              <KV
                label="Années d'ouverture"
                value={
                  summary.pea.years_open !== null
                    ? `${summary.pea.years_open} an${summary.pea.years_open > 1 ? "s" : ""}`
                    : "—"
                }
                highlight={summary.pea.fiscal_unlocked ? "emerald" : undefined}
              />
              <p className="text-xs text-gray-500 pt-1 border-t border-gray-800">
                {summary.pea.note}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#0d1117] border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-base">Plan Épargne Retraite</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <KV label="Plafond déductible 2026" value={eur(summary.per.deduction_limit_eur)} />
              <KV label="Versé cette année" value={eur(summary.per.used_eur)} />
              <KV
                label="Plafond restant"
                value={eur(summary.per.remaining_eur)}
                highlight={summary.per.remaining_eur > 0 ? "emerald" : undefined}
              />
              <KV
                label="Économie IR si saturé"
                value={eur(summary.per.tax_savings_if_max_eur)}
                highlight="emerald"
              />
              <p className="text-xs text-gray-500 pt-1 border-t border-gray-800">
                Taux effectif {(summary.per.effective_savings_rate * 100).toFixed(0)}% (= TMI).
                Plafonds non-utilisés reportables sur 3 ans.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Opportunités */}
        {summary.opportunities.length > 0 && (
          <Card className="bg-[#0d1117] border-emerald-700/40">
            <CardHeader>
              <CardTitle className="text-white text-base">
                ✨ Opportunités ({summary.opportunities.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {summary.opportunities.map((o, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 bg-emerald-900/10 border border-emerald-700/30 rounded-md p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-emerald-300 font-medium">{o.title}</p>
                    <p className="text-xs text-emerald-100/70 mt-0.5">{o.detail}</p>
                  </div>
                  {o.eur_value > 0 && (
                    <span className="text-sm text-emerald-400 font-[family-name:var(--font-jetbrains)] flex-shrink-0">
                      +{eur(o.eur_value)}
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Warnings */}
        {summary.warnings.length > 0 && (
          <Card className="bg-[#0d1117] border-amber-700/40">
            <CardHeader>
              <CardTitle className="text-white text-base">
                ⚠ Points d&apos;attention ({summary.warnings.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {summary.warnings.map((w, i) => (
                <div
                  key={i}
                  className={`rounded-md p-3 border ${
                    w.severity === "error"
                      ? "bg-red-900/10 border-red-700/40"
                      : w.severity === "warning"
                        ? "bg-amber-900/10 border-amber-700/30"
                        : "bg-gray-900/40 border-gray-800"
                  }`}
                >
                  <p
                    className={`text-sm font-medium ${
                      w.severity === "error"
                        ? "text-red-300"
                        : w.severity === "warning"
                          ? "text-amber-300"
                          : "text-gray-300"
                    }`}
                  >
                    {w.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{w.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-gray-600 pt-4 text-center">
          Estimations fondées sur les barèmes 2026 — ne remplace pas un conseil fiscal personnalisé.
        </p>
      </div>

      {/* Profile edit dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="bg-[#0d1117] border-gray-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Profil fiscal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Revenu annuel (€)</Label>
                <Input
                  type="number"
                  value={form.annualIncome}
                  onChange={(e) => setForm({ ...form, annualIncome: e.target.value })}
                  className="bg-[#161b22] border-gray-800"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Revenu conjoint (€)</Label>
                <Input
                  type="number"
                  value={form.spouseIncome}
                  onChange={(e) => setForm({ ...form, spouseIncome: e.target.value })}
                  className="bg-[#161b22] border-gray-800"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Situation</Label>
                <Select
                  value={form.civilStatus}
                  onValueChange={(v) => v && setForm({ ...form, civilStatus: v as typeof form.civilStatus })}
                >
                  <SelectTrigger className="bg-[#161b22] border-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#161b22] border-gray-800 text-white">
                    <SelectItem value="single">Célibataire</SelectItem>
                    <SelectItem value="married">Marié·e</SelectItem>
                    <SelectItem value="civil_union">PACS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Parts fiscales</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={form.numParts}
                  onChange={(e) => setForm({ ...form, numParts: e.target.value })}
                  className="bg-[#161b22] border-gray-800"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Mariage prévu en (année)</Label>
              <Input
                type="number"
                placeholder="ex: 2027"
                value={form.marriageYear}
                onChange={(e) => setForm({ ...form, marriageYear: e.target.value })}
                className="bg-[#161b22] border-gray-800"
              />
            </div>

            <div className="border-t border-gray-800 pt-3 space-y-3">
              <p className="text-xs uppercase text-gray-500">PEA</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Année d&apos;ouverture</Label>
                  <Input
                    type="number"
                    value={form.peaOpenYear}
                    onChange={(e) => setForm({ ...form, peaOpenYear: e.target.value })}
                    className="bg-[#161b22] border-gray-800"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Versements cumulés (€)</Label>
                  <Input
                    type="number"
                    value={form.peaVersements}
                    onChange={(e) => setForm({ ...form, peaVersements: e.target.value })}
                    className="bg-[#161b22] border-gray-800"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-800 pt-3 space-y-3">
              <p className="text-xs uppercase text-gray-500">PER</p>
              <div className="space-y-1.5">
                <Label>Versé cette année (€)</Label>
                <Input
                  type="number"
                  value={form.perVersementsCourants}
                  onChange={(e) => setForm({ ...form, perVersementsCourants: e.target.value })}
                  className="bg-[#161b22] border-gray-800"
                />
              </div>
            </div>

            {avEnvelopes.length > 0 && (
              <div className="border-t border-gray-800 pt-3 space-y-3">
                <p className="text-xs uppercase text-gray-500">Assurance-vie</p>
                {avEnvelopes.map((e) => (
                  <div key={e.id} className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{e.name} — ouverture</Label>
                      <Input
                        type="number"
                        placeholder="année"
                        value={avForm[e.id]?.openYear ?? ""}
                        onChange={(ev) =>
                          setAvForm({
                            ...avForm,
                            [e.id]: { ...avForm[e.id], openYear: ev.target.value },
                          })
                        }
                        className="bg-[#161b22] border-gray-800"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Versements cumulés (€)</Label>
                      <Input
                        type="number"
                        value={avForm[e.id]?.versements ?? ""}
                        onChange={(ev) =>
                          setAvForm({
                            ...avForm,
                            [e.id]: { ...avForm[e.id], versements: ev.target.value },
                          })
                        }
                        className="bg-[#161b22] border-gray-800"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-800">
            <Button
              variant="outline"
              onClick={() => setProfileOpen(false)}
              disabled={saving}
              className="border-gray-700 text-gray-300"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? "..." : "Enregistrer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function BigMetric({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: "emerald" | "amber" | "red";
}) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
  };
  return (
    <Card className="bg-[#0d1117] border-gray-800">
      <CardContent className="pt-5">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{label}</p>
        <p
          className={`text-2xl font-bold font-[family-name:var(--font-jetbrains)] ${
            color ? colorMap[color] : "text-white"
          }`}
        >
          {value}
        </p>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function KV({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "emerald" | "amber" | "red";
}) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
  };
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span
        className={`text-sm font-[family-name:var(--font-jetbrains)] ${
          highlight ? colorMap[highlight] : "text-gray-200"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
