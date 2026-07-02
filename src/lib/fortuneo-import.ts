/**
 * Import CSV Fortuneo — logique PURE (parsing + catégorisation + dedup),
 * partagée par l'API upload in-app (C7). Portée de scripts/import-fortuneo-csv.mjs
 * (qui garde sa propre copie car il tourne en .mjs sans bundler — si tu modifies
 * les règles ici, reporte dans le script CLI).
 *
 * Deux fichiers Fortuneo :
 *   - « Dépense CB » : achats CB granulaires (source de vérité)
 *   - « Relevé de compte » : virements, prélèvements, etc.
 * Les lignes « DEBIT MENSUEL CARTE BLEUE » apparaissent dans les deux (agrégat
 * comptable) → filtrées des deux pour ne pas double-compter.
 */

export interface BudgetRow {
  source: "cb" | "releve";
  date: string; // YYYY-MM-DD
  type: "income" | "expense";
  amount: number; // positif
  category: string;
  label: string;
  opType: string;
}

export interface UserRule {
  pattern: string;
  match_type: "exact" | "contains" | "starts_with";
  category: string;
}

const USER_NAME = "SIMON VAGNIER";

const VENDOR_RULES: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /\bGIC PATRIMOINE\b/i, category: "Logement" },
  { pattern: /\b(MONOPRIX|CARREFOUR|AUCHAN|LECLERC|INTERMARCHE|ITM|FRANPRIX|CASINO|LIDL|ALDI|G\s?20|SIMPLY|NATURALIA|BIOCOOP|PICARD|GRAND FRAIS)\b/i, category: "Alimentation" },
  { pattern: /\b(BOULANGERIE|FOURNIL|BOUCHERIE|POISSONNERIE|PRIMEUR|EPICERIE)\b/i, category: "Alimentation" },
  { pattern: /\b(DELIVEROO|UBER\s*\*?\s*EATS|UBEREATS|FRICHTI|JUST EAT|TOO GOOD TO GO|GLOVO)\b/i, category: "Restaurants / Sorties" },
  { pattern: /\b(STARBUCKS|COLUMBUS|MCDO|MCDONALD|BURGER|KFC|SUBWAY|DOMINO|PIZZA|BRASSERIE|RESTAURANT|CAFE)\b/i, category: "Restaurants / Sorties" },
  { pattern: /\b(SNCF|OUIGO|TRAINLINE|RATP|VELIB|BLABLACAR|FLIXBUS|LIME|DOTT|FREE2MOVE)\b/i, category: "Transport" },
  { pattern: /\bUBER\b(?!\s*\*?\s*EATS)/i, category: "Transport" },
  { pattern: /\b(AUTOROUTE|PEAGE|TOTAL|SHELL|BP|ESSO|AVIA|ELAN|STATION)\b/i, category: "Transport" },
  { pattern: /\b(NETFLIX|SPOTIFY|DEEZER|DISNEY|APPLE\.COM|APPLE MUSIC|ICLOUD|GOOGLE\s?(ONE|STORAGE|PLAY)|MICROSOFT|CANAL\+|MOLOTOV|HBO|PRIME VIDEO|AMAZON PRIME)\b/i, category: "Abonnements" },
  { pattern: /\b(ORANGE|SFR|FREE MOBILE|FREE TELECOM|BOUYGUES|FREE SAS|SOSH|RED BY SFR)\b/i, category: "Abonnements" },
  { pattern: /\b(OPENAI|ANTHROPIC|CHATGPT|CLAUDE|GITHUB|CURSOR|LINEAR|NOTION|FIGMA|VERCEL)\b/i, category: "Abonnements" },
  { pattern: /\b(PHARMACIE|DOCTOLIB|MEDECIN|DENTISTE|LABO|OPTIC|MUTUELLE|HARMONIE|MSA)\b/i, category: "Santé" },
  { pattern: /\b(AMAZON|AMZN|FNAC|DARTY|BOULANGER|LEROY MERLIN|CASTORAMA|IKEA|ZARA|H&M|UNIQLO|NIKE|ADIDAS|DECATHLON|SEPHORA|YVES ROCHER|SHEIN|VINTED|LEBONCOIN)\b/i, category: "Shopping" },
  { pattern: /\b(CINEMA|UGC|GAUMONT|MK2|PATHE|THEATRE|CONCERT|FESTIVAL|MUSEE|BASIC FIT|ONAIR|FITNESS PARK|PSG|STADE)\b/i, category: "Loisirs" },
  { pattern: /\b(BREDA|BNP|SOCIETE GENERALE|LCL|CREDIT AGRICOLE|HSBC|BOURSORAMA|N26|GENERALI|AXA|MAIF|MATMUT|MACIF)\b/i, category: "Frais bancaires" },
];

const FORTUNEO_CAT_MAP: Record<string, string> = {
  Alimentation: "Alimentation", Loisirs: "Loisirs", Transport: "Transport", Santé: "Santé",
  Abonnements: "Abonnements", Shopping: "Shopping", Restaurants: "Restaurants / Sorties",
  "Banque / Assurance": "Frais bancaires", "Banque/Assurance": "Frais bancaires",
  "Autres Dépenses": "Autre dépense", Autres: "Autre dépense", "Autres Revenus": "Autre revenu",
  Salaires: "Salaire", Impôts: "Impôts / Taxes", "Impôts et taxes": "Impôts / Taxes",
};

function parseCsv(raw: string): Record<string, string>[] {
  const text = raw.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(";").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(";");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
    return row;
  });
}

function toIsoDate(ddmmyyyy: string): string | null {
  const parts = ddmmyyyy.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseAmountFr(s: string): number {
  return parseFloat(s.replace(/\s/g, "").replace(",", "."));
}

function buildLabel(row: Record<string, string>): string {
  const cmt = row["Commentaire"]?.trim();
  const d1 = row["Détail 1"]?.trim().replace(/\s+LE \d{2}\/\d{2}\/\d{2}.*$/i, "");
  const typ = row["Type de l'opération"]?.trim();
  const raw = cmt || d1 || typ || "Opération";
  return raw.replace(/\s{2,}/g, " ").trim().slice(0, 80);
}

function applyUserRules(label: string, rules: UserRule[]): string | null {
  const l = (label || "").toLowerCase();
  for (const r of rules) {
    const p = r.pattern.toLowerCase();
    if (r.match_type === "exact" && l === p) return r.category;
    if (r.match_type === "starts_with" && l.startsWith(p)) return r.category;
    if (r.match_type === "contains" && l.includes(p)) return r.category;
  }
  return null;
}

function categorize(row: Record<string, string>, userRules: UserRule[]): string {
  const d1 = (row["Détail 1"] || "").toUpperCase();
  const opType = (row["Type de l'opération"] || "").toUpperCase();
  const fc = row["Catégorie"]?.trim() || "";
  const amt = parseAmountFr(row["Montant"] || "0");

  const userMatch = applyUserRules(buildLabel(row), userRules);
  if (userMatch) return userMatch;

  const userTokens = USER_NAME.split(/\s+/);
  const hasAllTokens = userTokens.every((t) => d1.includes(t));
  if (/SIMON\s+(REVOLUT|N26|LYDIA)/.test(d1)) return "Transfert interne";
  if (hasAllTokens && !d1.includes("FORTUNEO")) return "Transfert interne";
  if (hasAllTokens && d1.includes("FORTUNEO")) return "Investissement PEA";
  if (/\bFORTUNEO\s*(BOURSE|PEA|PER|SA)\b/.test(d1)) return "Investissement PEA";

  for (const rule of VENDOR_RULES) if (rule.pattern.test(d1)) return rule.category;
  if (fc && fc !== "A catégoriser") return FORTUNEO_CAT_MAP[fc] || fc;

  if (/VIREMENT.*RECU/.test(opType)) return "Autre revenu";
  if (/VIREMENT.*EMIS|PRELEVEMENT/.test(opType)) return "Autre dépense";
  if (/COTISATION/.test(opType)) return "Frais bancaires";
  if (/CARTE/.test(opType)) return "Autre dépense";
  if (/ESPECE/.test(opType)) return "Autre dépense";
  if (/CHEQUE/.test(opType)) return amt > 0 ? "Autre revenu" : "Autre dépense";
  if (/INTERETS/.test(opType)) return "Intérêts / Dividendes";
  if (/ADHESION/.test(opType)) return "Frais bancaires";
  return "À catégoriser";
}

function normalize(row: Record<string, string>, source: "cb" | "releve", userRules: UserRule[]): BudgetRow | null {
  const date = row["Date de l'opération"];
  const rawAmt = row["Montant"];
  if (!date || !rawAmt) return null;
  const iso = toIsoDate(date);
  if (!iso) return null;
  const amount = parseAmountFr(rawAmt);
  if (isNaN(amount) || amount === 0) return null;
  return {
    source, date: iso,
    type: amount >= 0 ? "income" : "expense",
    amount: Math.abs(amount),
    category: categorize(row, userRules),
    label: buildLabel(row),
    opType: row["Type de l'opération"]?.trim() ?? "",
  };
}

const DUP_TYPES = new Set(["DEBIT MENSUEL CARTE BLEUE"]);

export interface ParsedImport {
  rows: BudgetRow[];
  cb_total: number;
  releve_total: number;
  skipped_dup: number;
  by_category: Array<{ category: string; n: number; sum: number }>;
  by_year: Record<string, { n: number; inc: number; exp: number }>;
}

/** Parse et catégorise les deux CSV (l'un ou l'autre peut être vide). Pur. */
export function parseFortuneoCsvs(cbCsv: string, releveCsv: string, userRules: UserRule[] = []): ParsedImport {
  const cbAll = parseCsv(cbCsv).map((r) => normalize(r, "cb", userRules)).filter((r): r is BudgetRow => !!r);
  const releveAll = parseCsv(releveCsv).map((r) => normalize(r, "releve", userRules)).filter((r): r is BudgetRow => !!r);
  const cb = cbAll.filter((r) => !DUP_TYPES.has(r.opType));
  const releve = releveAll.filter((r) => !DUP_TYPES.has(r.opType));
  const rows = [...cb, ...releve].sort((a, b) => a.date.localeCompare(b.date));

  const byCat = new Map<string, { n: number; sum: number }>();
  const byYear: Record<string, { n: number; inc: number; exp: number }> = {};
  for (const r of rows) {
    const c = byCat.get(r.category) ?? { n: 0, sum: 0 };
    c.n++; c.sum += r.amount; byCat.set(r.category, c);
    const y = r.date.slice(0, 4);
    byYear[y] = byYear[y] ?? { n: 0, inc: 0, exp: 0 };
    byYear[y].n++;
    if (r.type === "income") byYear[y].inc += r.amount; else byYear[y].exp += r.amount;
  }

  return {
    rows,
    cb_total: cbAll.length,
    releve_total: releveAll.length,
    skipped_dup: (cbAll.length - cb.length) + (releveAll.length - releve.length),
    by_category: [...byCat.entries()]
      .map(([category, s]) => ({ category, n: s.n, sum: Math.round(s.sum) }))
      .sort((a, b) => b.sum - a.sum),
    by_year: byYear,
  };
}
