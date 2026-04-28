#!/usr/bin/env node
/**
 * Seed "starter" pour les NOUVEAUX UTILISATEURS du dashboard.
 *
 * Pose uniquement :
 *   - 6 enveloppes types par défaut (PEA, PER, AV1, AV2, CTO, Livrets) — à
 *     renommer/personnaliser ensuite via /perso/patrimoine
 *   - Les paramètres scénarios (rendements pessimist / modéré / optimiste par
 *     classe d'actif) — modifiables via /perso/patrimoine/projections
 *   - 2 paramètres utilisateur de base (currentAge, retireAge)
 *
 * NE pose PAS de positions — l'utilisateur les ajoute lui-même via l'UI
 * (page de détail enveloppe → bouton "+").
 *
 * Diff vs src/lib/seed.ts : ce fichier est volontairement "vierge" pour qu'un
 * nouvel utilisateur ait un point de départ propre, sans hériter des positions
 * d'un autre. Le seed.ts à la racine est la version personnelle de Simon (à
 * NE PAS exécuter sur ta DB sauf si tu veux écraser).
 *
 * Usage :
 *   node scripts/seed-empty.mjs
 *
 * Pré-requis : TURSO_DATABASE_URL + TURSO_AUTH_TOKEN dans .env.local
 *              (la table doit déjà exister — lancer `npx drizzle-kit migrate`
 *              avant la première fois).
 */

import { createClient } from "@libsql/client";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env.production.local", override: false });

if (!process.env.TURSO_DATABASE_URL) {
  console.error("ERR: TURSO_DATABASE_URL manquante dans .env.local");
  process.exit(1);
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const now = new Date().toISOString();

// --- 1. Wipe (nouveau setup uniquement) ---
console.log("🧹 Nettoyage des tables (au cas où) …");
await client.executeMultiple(`
  DELETE FROM snapshots;
  DELETE FROM positions;
  DELETE FROM scenario_params;
  DELETE FROM user_params;
  DELETE FROM envelopes;
`);

// --- 2. Enveloppes par défaut ---
// 6 enveloppes de base couvrant les cas standards FR. À RENOMMER / SUPPRIMER /
// AJOUTER via l'UI une fois lancé.
console.log("📦 Insertion des enveloppes par défaut …");
const envelopes = [
  { id: "pea", name: "PEA", type: "pea", color: "#34d399", target: 150000, fill_end_year: 2030, annual_contrib: null },
  { id: "per", name: "PER", type: "per", color: "#a78bfa", target: null, fill_end_year: null, annual_contrib: 5000 },
  { id: "av1", name: "Assurance Vie 1", type: "av", color: "#f59e0b", target: null, fill_end_year: null, annual_contrib: null },
  { id: "av2", name: "Assurance Vie 2", type: "av", color: "#f472b6", target: null, fill_end_year: null, annual_contrib: null },
  { id: "cto", name: "Compte-titres", type: "cto", color: "#38bdf8", target: null, fill_end_year: null, annual_contrib: null },
  { id: "livrets", name: "Livrets d'épargne", type: "livrets", color: "#22d3ee", target: null, fill_end_year: null, annual_contrib: null },
];
for (const e of envelopes) {
  await client.execute({
    sql: "INSERT INTO envelopes (id, name, type, color, target, fill_end_year, annual_contrib, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
    args: [e.id, e.name, e.type, e.color, e.target, e.fill_end_year, e.annual_contrib],
  });
}

// --- 3. Paramètres scénarios (rendements attendus par classe d'actif) ---
console.log("📈 Insertion des paramètres scénarios …");
const scenarios = [
  // Pessimiste
  { scenario: "p", asset_class: "sp", annual_return: 5 },
  { scenario: "p", asset_class: "wd", annual_return: 4 },
  { scenario: "p", asset_class: "em", annual_return: 3 },
  { scenario: "p", asset_class: "nq", annual_return: 5 },
  { scenario: "p", asset_class: "tech", annual_return: 4 },
  { scenario: "p", asset_class: "energy", annual_return: 3 },
  { scenario: "p", asset_class: "fg", annual_return: 1.2 },
  { scenario: "p", asset_class: "fe", annual_return: 2 },
  { scenario: "p", asset_class: "cash", annual_return: 0 },
  // Modéré
  { scenario: "m", asset_class: "sp", annual_return: 8 },
  { scenario: "m", asset_class: "wd", annual_return: 7 },
  { scenario: "m", asset_class: "em", annual_return: 6 },
  { scenario: "m", asset_class: "nq", annual_return: 9 },
  { scenario: "m", asset_class: "tech", annual_return: 8 },
  { scenario: "m", asset_class: "energy", annual_return: 5 },
  { scenario: "m", asset_class: "fg", annual_return: 1.2 },
  { scenario: "m", asset_class: "fe", annual_return: 2.5 },
  { scenario: "m", asset_class: "cash", annual_return: 0 },
  // Optimiste
  { scenario: "o", asset_class: "sp", annual_return: 11 },
  { scenario: "o", asset_class: "wd", annual_return: 10 },
  { scenario: "o", asset_class: "em", annual_return: 9 },
  { scenario: "o", asset_class: "nq", annual_return: 13 },
  { scenario: "o", asset_class: "tech", annual_return: 14 },
  { scenario: "o", asset_class: "energy", annual_return: 7 },
  { scenario: "o", asset_class: "fg", annual_return: 1.2 },
  { scenario: "o", asset_class: "fe", annual_return: 3 },
  { scenario: "o", asset_class: "cash", annual_return: 0 },
];
for (const s of scenarios) {
  await client.execute({
    sql: "INSERT INTO scenario_params (scenario, asset_class, annual_return) VALUES (?, ?, ?)",
    args: [s.scenario, s.asset_class, s.annual_return],
  });
}

// --- 4. Paramètres utilisateur de base ---
console.log("👤 Insertion des paramètres utilisateur …");
const userParams = [
  { key: "currentAge", value: "30" },
  { key: "retireAge", value: "64" },
];
for (const p of userParams) {
  await client.execute({
    sql: "INSERT INTO user_params (key, value) VALUES (?, ?)",
    args: [p.key, p.value],
  });
}

console.log("\n✅ Seed terminé. Tu peux maintenant :");
console.log("   1. Lancer `npm run dev` pour démarrer en local");
console.log("   2. Te connecter avec ton DASHBOARD_PASSWORD");
console.log("   3. Aller sur /perso/patrimoine pour personnaliser tes enveloppes");
console.log("   4. Ajouter tes positions via le bouton '+' sur chaque enveloppe");
console.log(`   5. Ajuster ton âge (currentAge=${userParams[0].value}, retireAge=${userParams[1].value}) via /perso/patrimoine/projections`);
