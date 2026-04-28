#!/usr/bin/env node
/**
 * Import des exports Fortuneo (Dépense CB + Relevé de compte) vers la table
 * `budget_entries`, avec catégorisation unifiée et dedup.
 *
 * Sources :
 *   - ~/Downloads/Depense CB .csv        → achats CB individuels
 *                                           + (quirk Fortuneo) agrégats mensuels
 *                                           "DEBIT MENSUEL CARTE BLEUE" avec
 *                                           montant POSITIF (contrepartie
 *                                           comptable) — à filtrer.
 *   - ~/Downloads/Relevé de compte.csv   → tous les autres flux (virements,
 *                                           prélèvements, chèques, cotisations…)
 *                                           + les mêmes agrégats CB avec montant
 *                                           NÉGATIF — à filtrer.
 *
 * Dedup stratégie : on filtre "DEBIT MENSUEL CARTE BLEUE" **des deux fichiers**
 * pour ne garder que les achats CB granulaires (source de vérité).
 *
 * Catégorisation : règles alignées sur src/lib/budget-rules.ts (dupliquées ici
 * car le script tourne en .mjs sans bundler). Si tu modifies l'une, modifie
 * l'autre.
 *
 * Usage :
 *   node scripts/import-fortuneo-csv.mjs            # insère
 *   node scripts/import-fortuneo-csv.mjs --dry-run  # preview, pas d'insert
 *   node scripts/import-fortuneo-csv.mjs --wipe     # DELETE * avant insert
 */

import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env.production.local", override: false });

const DRY_RUN = process.argv.includes("--dry-run");
const WIPE = process.argv.includes("--wipe");
const CB_FILE = "/Users/simonvagnier/Downloads/Depense CB .csv";
const RELEVE_FILE = "/Users/simonvagnier/Downloads/Relevé de compte.csv";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

function parseCsv(path) {
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headers = lines[0].split(";").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(";");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    return row;
  });
}

function toIsoDate(ddmmyyyy) {
  const [d, m, y] = ddmmyyyy.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseAmountFr(s) {
  const cleaned = s.replace(/\s/g, "").replace(",", ".");
  return parseFloat(cleaned);
}

function buildLabel(row) {
  const cmt = row["Commentaire"]?.trim();
  const d1 = row["Détail 1"]?.trim().replace(/\s+LE \d{2}\/\d{2}\/\d{2}.*$/i, "");
  const typ = row["Type de l'opération"]?.trim();
  const raw = cmt || d1 || typ || "Opération";
  return raw.replace(/\s{2,}/g, " ").trim().slice(0, 80);
}

// ─────────────────────────────────────────────────────────────────────────
//  Règles de catégorisation (alignées sur src/lib/budget-rules.ts).
// ─────────────────────────────────────────────────────────────────────────

const USER_NAME = "SIMON VAGNIER";

const VENDOR_RULES = [
  // Logement
  { pattern: /\bGIC PATRIMOINE\b/i, category: "Logement" },

  // Alimentation
  { pattern: /\b(MONOPRIX|CARREFOUR|AUCHAN|LECLERC|INTERMARCHE|ITM|FRANPRIX|CASINO|LIDL|ALDI|G\s?20|SIMPLY|NATURALIA|BIOCOOP|PICARD|GRAND FRAIS)\b/i, category: "Alimentation" },
  { pattern: /\b(BOULANGERIE|FOURNIL|BOUCHERIE|POISSONNERIE|PRIMEUR|EPICERIE)\b/i, category: "Alimentation" },

  // Restaurants / Sorties (UBER EATS : tolère "UBER * EATS", "UBER*EATS")
  { pattern: /\b(DELIVEROO|UBER\s*\*?\s*EATS|UBEREATS|FRICHTI|JUST EAT|TOO GOOD TO GO|GLOVO)\b/i, category: "Restaurants / Sorties" },
  { pattern: /\b(STARBUCKS|COLUMBUS|MCDO|MCDONALD|BURGER|KFC|SUBWAY|DOMINO|PIZZA|BRASSERIE|RESTAURANT|CAFE)\b/i, category: "Restaurants / Sorties" },

  // Transport (UBER hors UBER EATS)
  { pattern: /\b(SNCF|OUIGO|TRAINLINE|RATP|VELIB|BLABLACAR|FLIXBUS|LIME|DOTT|FREE2MOVE)\b/i, category: "Transport" },
  { pattern: /\bUBER\b(?!\s*\*?\s*EATS)/i, category: "Transport" },
  { pattern: /\b(AUTOROUTE|PEAGE|TOTAL|SHELL|BP|ESSO|AVIA|ELAN|STATION)\b/i, category: "Transport" },

  // Abonnements
  { pattern: /\b(NETFLIX|SPOTIFY|DEEZER|DISNEY|APPLE\.COM|APPLE MUSIC|ICLOUD|GOOGLE\s?(ONE|STORAGE|PLAY)|MICROSOFT|CANAL\+|MOLOTOV|HBO|PRIME VIDEO|AMAZON PRIME)\b/i, category: "Abonnements" },
  { pattern: /\b(ORANGE|SFR|FREE MOBILE|FREE TELECOM|BOUYGUES|FREE SAS|SOSH|RED BY SFR)\b/i, category: "Abonnements" },
  { pattern: /\b(OPENAI|ANTHROPIC|CHATGPT|CLAUDE|GITHUB|CURSOR|LINEAR|NOTION|FIGMA|VERCEL)\b/i, category: "Abonnements" },

  // Santé
  { pattern: /\b(PHARMACIE|DOCTOLIB|MEDECIN|DENTISTE|LABO|OPTIC|MUTUELLE|HARMONIE|MSA)\b/i, category: "Santé" },

  // Shopping
  { pattern: /\b(AMAZON|AMZN|FNAC|DARTY|BOULANGER|LEROY MERLIN|CASTORAMA|IKEA|ZARA|H&M|UNIQLO|NIKE|ADIDAS|DECATHLON|SEPHORA|YVES ROCHER|SHEIN|VINTED|LEBONCOIN)\b/i, category: "Shopping" },

  // Loisirs
  { pattern: /\b(CINEMA|UGC|GAUMONT|MK2|PATHE|THEATRE|CONCERT|FESTIVAL|MUSEE|BASIC FIT|ONAIR|FITNESS PARK|PSG|STADE)\b/i, category: "Loisirs" },

  // Frais bancaires / Assurances
  { pattern: /\b(BREDA|BNP|SOCIETE GENERALE|LCL|CREDIT AGRICOLE|HSBC|BOURSORAMA|N26|GENERALI|AXA|MAIF|MATMUT|MACIF)\b/i, category: "Frais bancaires" },
];

const FORTUNEO_CAT_MAP = {
  "Alimentation": "Alimentation",
  "Loisirs": "Loisirs",
  "Transport": "Transport",
  "Santé": "Santé",
  "Abonnements": "Abonnements",
  "Shopping": "Shopping",
  "Restaurants": "Restaurants / Sorties",
  "Banque / Assurance": "Frais bancaires",
  "Banque/Assurance": "Frais bancaires",
  "Autres Dépenses": "Autre dépense",
  "Autres": "Autre dépense",
  "Autres Revenus": "Autre revenu",
  "Salaires": "Salaire",
  "Impôts": "Impôts / Taxes",
  "Impôts et taxes": "Impôts / Taxes",
};

// Règles de catégorisation persistées par l'utilisateur (chargées au démarrage).
// Remplies depuis la table label_rules avant le parsing. Format :
//   { pattern, match_type: 'exact'|'contains'|'starts_with', category }
// Appliquées en PRIORITÉ 0 (avant tout le reste).
let USER_RULES = [];

function applyUserRules(label) {
  const l = (label || "").toLowerCase();
  for (const r of USER_RULES) {
    const p = r.pattern.toLowerCase();
    if (r.match_type === "exact" && l === p) return r.category;
    if (r.match_type === "starts_with" && l.startsWith(p)) return r.category;
    if (r.match_type === "contains" && l.includes(p)) return r.category;
  }
  return null;
}

function categorize(row) {
  const d1 = (row["Détail 1"] || "").toUpperCase();
  const opType = (row["Type de l'opération"] || "").toUpperCase();
  const fc = row["Catégorie"]?.trim() || "";
  const amt = parseAmountFr(row["Montant"] || "0");

  // 0. Règle utilisateur (label_rules) : priorité absolue, match sur le label
  //    construit (buildLabel) avant d'appliquer les autres règles.
  const label = buildLabel(row);
  const userMatch = applyUserRules(label);
  if (userMatch) return userMatch;

  // 1. Self-transfers (nom utilisateur détecté dans Détail 1)
  const userTokens = USER_NAME.split(/\s+/);
  const hasAllTokens = userTokens.every((t) => d1.includes(t));
  const hasRevolutOrN26 = /SIMON\s+(REVOLUT|N26|LYDIA)/.test(d1);
  if (hasAllTokens && !d1.includes("FORTUNEO")) return "Transfert interne";
  if (hasRevolutOrN26) return "Transfert interne";

  // 2. Virements vers compte Fortuneo Bourse = investissement
  if (hasAllTokens && d1.includes("FORTUNEO")) return "Investissement PEA";
  if (/\bFORTUNEO\s*(BOURSE|PEA|PER|SA)\b/.test(d1)) return "Investissement PEA";

  // 3. Vendors
  for (const rule of VENDOR_RULES) {
    if (rule.pattern.test(d1)) return rule.category;
  }

  // 4. Catégorie Fortuneo native
  if (fc && fc !== "A catégoriser") {
    return FORTUNEO_CAT_MAP[fc] || fc;
  }

  // 5. Fallback sur le type d'opération
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

function normalize(row, source) {
  const date = row["Date de l'opération"];
  const rawAmt = row["Montant"];
  if (!date || !rawAmt) return null;
  const amount = parseAmountFr(rawAmt);
  if (isNaN(amount) || amount === 0) return null;
  return {
    source,
    date: toIsoDate(date),
    type: amount >= 0 ? "income" : "expense",
    amount: Math.abs(amount),
    category: categorize(row),
    label: buildLabel(row),
    opType: row["Type de l'opération"]?.trim() ?? "",
  };
}

console.log("=== Chargement des règles utilisateur ===");
try {
  const rules = await client.execute("SELECT pattern, match_type, category FROM label_rules");
  USER_RULES = rules.rows.map((r) => ({
    pattern: r.pattern,
    match_type: r.match_type,
    category: r.category,
  }));
  console.log(`  ${USER_RULES.length} règle(s) label_rules chargée(s)`);
} catch {
  console.log("  (table label_rules absente, on skip)");
}

console.log("\n=== Parsing ===");
const cbAll = parseCsv(CB_FILE).map((r) => normalize(r, "cb")).filter(Boolean);
const releveAll = parseCsv(RELEVE_FILE).map((r) => normalize(r, "releve")).filter(Boolean);

// DEDUP : DEBIT MENSUEL CARTE BLEUE apparaît dans les DEUX fichiers (relevé en
// négatif comme sortie, CB en positif comme contrepartie). On le filtre des DEUX.
const DUP_TYPES = new Set(["DEBIT MENSUEL CARTE BLEUE"]);
const cbRows = cbAll.filter((r) => !DUP_TYPES.has(r.opType));
const releveRows = releveAll.filter((r) => !DUP_TYPES.has(r.opType));

console.log(`CB total     : ${cbAll.length} → filtré ${cbRows.length} (skipped ${cbAll.length - cbRows.length})`);
console.log(`Relevé total : ${releveAll.length} → filtré ${releveRows.length} (skipped ${releveAll.length - releveRows.length})`);
console.log(`TOTAL        : ${cbRows.length + releveRows.length} transactions à insérer`);

const all = [...cbRows, ...releveRows].sort((a, b) => a.date.localeCompare(b.date));

// Breakdown par année
const byYear = {};
for (const r of all) {
  const y = r.date.slice(0, 4);
  byYear[y] = byYear[y] || { n: 0, inc: 0, exp: 0, transfer: 0, invest: 0 };
  byYear[y].n++;
  if (r.category === "Transfert interne") byYear[y].transfer += r.amount;
  else if (r.category.startsWith("Investissement")) byYear[y].invest += r.amount;
  else if (r.type === "income") byYear[y].inc += r.amount;
  else byYear[y].exp += r.amount;
}
console.log("\n=== Breakdown par année (hors transferts internes) ===");
for (const [y, s] of Object.entries(byYear)) {
  const net = s.inc - s.exp;
  console.log(`  ${y}: ${s.n} ops | revenu ${s.inc.toFixed(0).padStart(8)} € | dépense ${s.exp.toFixed(0).padStart(8)} € | épargne-auto ${s.invest.toFixed(0).padStart(6)} € | transferts ${s.transfer.toFixed(0).padStart(6)} € | net ${net >= 0 ? "+" : ""}${net.toFixed(0)} €`);
}

// Répartition par catégorie
console.log("\n=== Répartition par catégorie (top 15) ===");
const byCat = {};
for (const r of all) {
  byCat[r.category] = byCat[r.category] || { n: 0, sum: 0 };
  byCat[r.category].n++;
  byCat[r.category].sum += r.amount;
}
for (const [cat, s] of Object.entries(byCat).sort((a, b) => b[1].sum - a[1].sum).slice(0, 15)) {
  console.log(`  ${cat.padEnd(28)} ${s.n.toString().padStart(4)} ops   ${s.sum.toFixed(0).padStart(8)} €`);
}

if (DRY_RUN) {
  console.log("\n--dry-run: aucune modification en DB.");
  process.exit(0);
}

// WIPE si demandé
if (WIPE) {
  console.log("\n=== WIPE ===");
  const existing = await client.execute("SELECT COUNT(*) as n FROM budget_entries");
  console.log(`  Suppression de ${existing.rows[0].n} entrées existantes...`);
  await client.execute("DELETE FROM budget_entries");
  console.log("  ✓ Table vidée.");
}

console.log("\n=== Insertion en base ===");
const nowIso = new Date().toISOString();
const BATCH = 100;
let inserted = 0;
for (let i = 0; i < all.length; i += BATCH) {
  const chunk = all.slice(i, i + BATCH);
  const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, 0, ?)").join(", ");
  const values = [];
  for (const r of chunk) {
    values.push(r.type, r.category, r.label, r.amount, r.date, nowIso);
  }
  const sql = `INSERT INTO budget_entries (type, category, label, amount, date, recurring, created_at) VALUES ${placeholders}`;
  await client.execute({ sql, args: values });
  inserted += chunk.length;
  process.stdout.write(`\r  Inserted ${inserted}/${all.length}...`);
}
console.log(`\n✓ ${inserted} lignes insérées.`);
