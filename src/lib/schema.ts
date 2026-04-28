import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const envelopes = sqliteTable("envelopes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  color: text("color").notNull(),
  target: integer("target"),
  fill_end_year: integer("fill_end_year"),
  annual_contrib: integer("annual_contrib"),
  sort_order: integer("sort_order").notNull().default(0),
});

export const positions = sqliteTable("positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  envelope_id: text("envelope_id")
    .notNull()
    .references(() => envelopes.id),
  ticker: text("ticker").notNull(),
  yahoo_ticker: text("yahoo_ticker"),
  label: text("label").notNull(),
  isin: text("isin"),
  quantity: real("quantity"),
  pru: real("pru"),
  manual_value: real("manual_value"),
  scenario_key: text("scenario_key").notNull(),
  currency: text("currency").notNull().default("EUR"),
  sort_order: integer("sort_order").notNull().default(0),
  created_at: text("created_at")
    .notNull()
    .default("CURRENT_TIMESTAMP"),
  updated_at: text("updated_at")
    .notNull()
    .default("CURRENT_TIMESTAMP"),
});

export const scenarioParams = sqliteTable("scenario_params", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scenario: text("scenario").notNull(),
  asset_class: text("asset_class").notNull(),
  annual_return: real("annual_return").notNull(),
});

export const userParams = sqliteTable("user_params", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// F1: Portfolio snapshots for history tracking
export const snapshots = sqliteTable("snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  total_value: real("total_value").notNull(),
  invested_total: real("invested_total"),
  details_json: text("details_json").notNull(),
  created_at: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Per-envelope daily snapshots for "real" history charts
export const envelopeSnapshots = sqliteTable(
  "envelope_snapshots",
  {
    envelope_id: text("envelope_id")
      .notNull()
      .references(() => envelopes.id),
    date: text("date").notNull(), // YYYY-MM-DD
    value_eur: real("value_eur").notNull(),
    created_at: text("created_at")
      .notNull()
      .default("CURRENT_TIMESTAMP"),
  },
  (t) => [primaryKey({ columns: [t.envelope_id, t.date] })]
);

/**
 * LOT 1 — Operations journal.
 *
 * One row per real-world action: buy, sell, deposit, withdrawal, dividend,
 * fee, interest, transfer. Used downstream to compute the true TRI (xirr),
 * track realized P&L for tax, and power the bank-import pipeline.
 *
 * Conventions for `amount` (EUR or native `currency`, investor-centric sign):
 *   - deposit / dividend received / interest / sell-proceeds → NEGATIVE
 *     (money going into the envelope is money leaving the investor's cash)
 *   - withdrawal / buy-cost / fee                           → POSITIVE
 *     (money going to the investor / leaving the envelope toward the market)
 *
 * For buy/sell, `quantity` and `unit_price` are set; `position_id` links the
 * row to a specific position. For deposits/withdrawals, only `amount` is set.
 */
/**
 * LOT 2 — Threshold alerts.
 *
 * One row per alert configuration. Alerts are evaluated on the fly against
 * the current portfolio state (no separate "triggered" persistence needed
 * for the MVP). `last_triggered_at` is bumped each time the evaluation says
 * the alert fires, so we can show "déjà déclenchée le X" in the UI and dedupe
 * future notifications.
 *
 * Alert types (`type` column):
 *   - 'price_above' / 'price_below'  → absolute price target (in position currency)
 *                                       requires position_id + threshold
 *   - 'pnl_pct_above' / 'pnl_pct_below' → P&L% from PRU on a position
 *                                       requires position_id + threshold (e.g. 20 = +20%)
 *   - 'weight_above'                  → position weight in total portfolio
 *                                       requires position_id + threshold (e.g. 5 = >5%)
 *   - 'envelope_value_above' / 'envelope_value_below' → envelope total in EUR
 *                                       requires envelope_id + threshold
 */
export const alerts = sqliteTable("alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  envelope_id: text("envelope_id").references(() => envelopes.id),
  position_id: integer("position_id"),
  type: text("type").notNull(),
  threshold: real("threshold").notNull(),
  note: text("note"),
  active: integer("active").notNull().default(1), // 0/1 boolean
  last_triggered_at: text("last_triggered_at"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const operations = sqliteTable("operations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  envelope_id: text("envelope_id")
    .notNull()
    .references(() => envelopes.id),
  position_id: integer("position_id"), // optional, nullable (deposit/withdrawal not tied to a position)
  date: text("date").notNull(), // YYYY-MM-DD
  type: text("type").notNull(), // 'buy' | 'sell' | 'deposit' | 'withdrawal' | 'dividend' | 'fee' | 'interest' | 'transfer'
  quantity: real("quantity"),
  unit_price: real("unit_price"),
  amount: real("amount").notNull(), // signed (see conventions above)
  currency: text("currency").notNull().default("EUR"),
  note: text("note"),
  // NB: on utilise $defaultFn plutôt que .default("CURRENT_TIMESTAMP") car
  // Drizzle insère sinon la string littérale. Côté DDL SQLite, la colonne
  // a bien DEFAULT CURRENT_TIMESTAMP pour robustesse si une insertion
  // bypass Drizzle.
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updated_at: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// =============================================
// COMMAND CENTER MODULES
// =============================================

// Tasks & Projects
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  space: text("space").notNull(), // 'pro' | 'perso'
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"), // 'todo' | 'in_progress' | 'done'
  priority: text("priority").notNull().default("medium"), // 'low' | 'medium' | 'high' | 'urgent'
  project_id: integer("project_id"),
  due_date: text("due_date"),
  completed_at: text("completed_at"),
  recurrence: text("recurrence"), // null | 'daily' | 'weekly' | 'monthly'
  position: integer("position").notNull().default(0),
  created_at: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updated_at: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  space: text("space").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#6b7280"),
  status: text("status").notNull().default("active"), // 'active' | 'archived'
  created_at: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Notes & Journal
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  space: text("space").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  type: text("type").notNull().default("note"), // 'note' | 'journal'
  pinned: integer("pinned").notNull().default(0),
  created_at: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updated_at: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Habits & Objectives
export const habits = sqliteTable("habits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  space: text("space").notNull(),
  name: text("name").notNull(),
  icon: text("icon"),
  color: text("color").notNull().default("#34d399"),
  frequency: text("frequency").notNull().default("daily"), // 'daily' | 'weekly'
  target: integer("target").notNull().default(1), // times per period
  active: integer("active").notNull().default(1),
  created_at: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const habitLogs = sqliteTable("habit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  habit_id: integer("habit_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  count: integer("count").notNull().default(1),
});

// CRM
export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  company: text("company"),
  email: text("email"),
  phone: text("phone"),
  role: text("role"),
  notes: text("notes"),
  last_contact: text("last_contact"),
  created_at: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const deals = sqliteTable("deals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contact_id: integer("contact_id"),
  title: text("title").notNull(),
  value: real("value"),
  stage: text("stage").notNull().default("lead"), // 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
  probability: integer("probability").notNull().default(10),
  expected_close: text("expected_close"),
  notes: text("notes"),
  created_at: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updated_at: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

// Budget
export const budgetEntries = sqliteTable("budget_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // 'income' | 'expense'
  category: text("category").notNull(),
  label: text("label").notNull(),
  amount: real("amount").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  recurring: integer("recurring").notNull().default(0),
  created_at: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

/**
 * Règles de catégorisation personnalisées : quand l'utilisateur re-catégorise
 * une ligne du budget, on peut créer une règle "tous les libellés matchant
 * X → catégorie Y" qui s'applique aux entrées existantes ET à tous les futurs
 * imports CSV (via scripts/import-fortuneo-csv.mjs qui lit cette table).
 *
 * `match_type`:
 *   - "exact"       : label === pattern (insensible à la casse)
 *   - "contains"    : label contient pattern (insensible à la casse)
 *   - "starts_with" : label commence par pattern (insensible à la casse)
 */
export const labelRules = sqliteTable("label_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pattern: text("pattern").notNull(),
  match_type: text("match_type").notNull().default("exact"), // 'exact' | 'contains' | 'starts_with'
  category: text("category").notNull(),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const budgetCategories = sqliteTable("budget_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'income' | 'expense'
  color: text("color").notNull().default("#6b7280"),
  budget_limit: real("budget_limit"), // monthly limit for expenses
  icon: text("icon"),
});

// Pro KPIs
export const kpiEntries = sqliteTable("kpi_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  metric: text("metric").notNull(), // 'revenue' | 'meetings' | 'calls' | 'proposals' | custom
  value: real("value").notNull(),
  target: real("target"),
  period: text("period").notNull(), // YYYY-MM
  created_at: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});
