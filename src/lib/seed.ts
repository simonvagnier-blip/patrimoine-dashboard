import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./data/patrimoine.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

async function seed() {
  // Run migrations
  await migrate(db, { migrationsFolder: "./drizzle" });

  const now = new Date().toISOString();

  // --- Clear existing data ---
  await db.delete(schema.snapshots).run();
  await db.delete(schema.positions).run();
  await db.delete(schema.scenarioParams).run();
  await db.delete(schema.userParams).run();
  await db.delete(schema.envelopes).run();

  // --- Envelopes ---
  await db.insert(schema.envelopes).values([
    { id: "pea", name: "PEA Fortuneo", type: "pea", color: "#34d399", target: 150000, fill_end_year: 2027, annual_contrib: null },
    { id: "per", name: "PER Fortuneo", type: "per", color: "#a78bfa", target: null, fill_end_year: null, annual_contrib: 10000 },
    { id: "av1", name: "AV Lucya Cardif", type: "av", color: "#f59e0b", target: null, fill_end_year: null, annual_contrib: null },
    { id: "av2", name: "AV Spirit", type: "av", color: "#f472b6", target: null, fill_end_year: null, annual_contrib: null },
    { id: "cto", name: "CTO Interactive Brokers", type: "cto", color: "#38bdf8", target: null, fill_end_year: null, annual_contrib: null },
    { id: "livrets", name: "Livrets d'épargne", type: "livrets", color: "#22d3ee", target: null, fill_end_year: null, annual_contrib: null },
  ]).run();

  // --- Positions ---
  await db.insert(schema.positions).values([
    // PEA
    { envelope_id: "pea", ticker: "PE500", yahoo_ticker: "PE500.PA", label: "Amundi PEA S&P 500 Screened UCITS ETF", isin: "FR0011871128", quantity: 293, pru: 48.496, manual_value: null, scenario_key: "sp", currency: "EUR", created_at: now, updated_at: now },
    { envelope_id: "pea", ticker: "PAEEM", yahoo_ticker: "PAEEM.PA", label: "Amundi PEA Emergent ESG Transition UCITS ETF", isin: "LU1681045370", quantity: 289, pru: 30.784, manual_value: null, scenario_key: "em", currency: "EUR", created_at: now, updated_at: now },
    { envelope_id: "pea", ticker: "DCAM", yahoo_ticker: "DCAM.PA", label: "Amundi PEA Monde MSCI World UCITS ETF", isin: "LU1681043599", quantity: 1591, pru: 5.474, manual_value: null, scenario_key: "wd", currency: "EUR", created_at: now, updated_at: now },
    { envelope_id: "pea", ticker: "PUST", yahoo_ticker: "PUST.PA", label: "Amundi PEA Nasdaq-100 UCITS ETF", isin: "LU1681038672", quantity: 35, pru: 83.822, manual_value: null, scenario_key: "nq", currency: "EUR", created_at: now, updated_at: now },
    // PER
    { envelope_id: "per", ticker: "CW8", yahoo_ticker: "WLD.PA", label: "Amundi MSCI World Swap II UCITS", isin: "FR0010315770", quantity: 42.9989, pru: 370.02, manual_value: null, scenario_key: "wd", currency: "EUR", created_at: now, updated_at: now },
    { envelope_id: "per", ticker: "PANX", yahoo_ticker: "UST.PA", label: "Amundi Core Nasdaq-100 Swap", isin: "LU1829221024", quantity: 73.7234, pru: 86.57, manual_value: null, scenario_key: "nq", currency: "EUR", created_at: now, updated_at: now },
    { envelope_id: "per", ticker: "AEEM", yahoo_ticker: "LEM.PA", label: "Amundi MSCI Emer Mark III UC ETF", isin: "FR0010429068", quantity: 362.7606, pru: 14.70, manual_value: null, scenario_key: "em", currency: "EUR", created_at: now, updated_at: now },
    // AV Lucya
    { envelope_id: "av1", ticker: "CW8", yahoo_ticker: "CW8.PA", label: "Amundi IS MSCI World Swap ETF", isin: "LU1681043599", quantity: 4.5305, pru: 617.69, manual_value: null, scenario_key: "wd", currency: "EUR", created_at: now, updated_at: now },
    { envelope_id: "av1", ticker: "FG Bonus", yahoo_ticker: null, label: "FG Bonus +1,20% 2026-2027", isin: "FGNI176", quantity: null, pru: null, manual_value: 5200, scenario_key: "fg", currency: "EUR", created_at: now, updated_at: now },
    // AV Spirit
    { envelope_id: "av2", ticker: "Fonds €", yahoo_ticker: null, label: "Fonds Euros Spirit", isin: null, quantity: null, pru: null, manual_value: 2500, scenario_key: "fe", currency: "EUR", created_at: now, updated_at: now },
    // CTO
    { envelope_id: "cto", ticker: "COHR", yahoo_ticker: "COHR", label: "Coherent Corp", isin: null, quantity: 10, pru: 268.3, manual_value: null, scenario_key: "tech", currency: "USD", created_at: now, updated_at: now },
    { envelope_id: "cto", ticker: "FN", yahoo_ticker: "FN", label: "Fabrinet", isin: null, quantity: 2, pru: 541.0, manual_value: null, scenario_key: "tech", currency: "USD", created_at: now, updated_at: now },
    { envelope_id: "cto", ticker: "CVX", yahoo_ticker: "CVX", label: "Chevron", isin: null, quantity: 3, pru: 189.0, manual_value: null, scenario_key: "energy", currency: "USD", created_at: now, updated_at: now },
    { envelope_id: "cto", ticker: "AAOI", yahoo_ticker: "AAOI", label: "Applied Optoelectronics", isin: null, quantity: 3, pru: 104.67, manual_value: null, scenario_key: "tech", currency: "USD", created_at: now, updated_at: now },
    { envelope_id: "cto", ticker: "AXTI", yahoo_ticker: "AXTI", label: "AXT Inc", isin: null, quantity: 6, pru: 45.33, manual_value: null, scenario_key: "tech", currency: "USD", created_at: now, updated_at: now },
    { envelope_id: "cto", ticker: "SHOP", yahoo_ticker: "SHOP", label: "Shopify", isin: null, quantity: 1, pru: 123.0, manual_value: null, scenario_key: "tech", currency: "USD", created_at: now, updated_at: now },
    { envelope_id: "cto", ticker: "EUR", yahoo_ticker: null, label: "Espèces", isin: null, quantity: null, pru: null, manual_value: 671, scenario_key: "cash", currency: "EUR", created_at: now, updated_at: now },
    // Livrets
    { envelope_id: "livrets", ticker: "Livrets", yahoo_ticker: null, label: "Épargne (tous livrets confondus)", isin: null, quantity: null, pru: null, manual_value: 65000, scenario_key: "cash", currency: "EUR", created_at: now, updated_at: now },
  ]).run();

  // --- Scenario Params ---
  const scenarios = [
    { scenario: "p", asset_class: "sp", annual_return: 5 },
    { scenario: "p", asset_class: "wd", annual_return: 4 },
    { scenario: "p", asset_class: "em", annual_return: 3 },
    { scenario: "p", asset_class: "nq", annual_return: 5 },
    { scenario: "p", asset_class: "tech", annual_return: 4 },
    { scenario: "p", asset_class: "energy", annual_return: 3 },
    { scenario: "p", asset_class: "fg", annual_return: 1.2 },
    { scenario: "p", asset_class: "fe", annual_return: 2 },
    { scenario: "p", asset_class: "cash", annual_return: 0 },
    { scenario: "m", asset_class: "sp", annual_return: 8 },
    { scenario: "m", asset_class: "wd", annual_return: 7 },
    { scenario: "m", asset_class: "em", annual_return: 6 },
    { scenario: "m", asset_class: "nq", annual_return: 9 },
    { scenario: "m", asset_class: "tech", annual_return: 8 },
    { scenario: "m", asset_class: "energy", annual_return: 5 },
    { scenario: "m", asset_class: "fg", annual_return: 1.2 },
    { scenario: "m", asset_class: "fe", annual_return: 2.5 },
    { scenario: "m", asset_class: "cash", annual_return: 0 },
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

  await db.insert(schema.scenarioParams).values(scenarios).run();

  // --- User Params ---
  await db.insert(schema.userParams).values([
    { key: "currentAge", value: "32" },
    { key: "retireAge", value: "64" },
  ]).run();

  console.log("✅ Database seeded successfully!");
}

seed().catch(console.error);
