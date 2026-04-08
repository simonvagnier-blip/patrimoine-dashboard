import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const envelopes = sqliteTable("envelopes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  color: text("color").notNull(),
  target: integer("target"),
  fill_end_year: integer("fill_end_year"),
  annual_contrib: integer("annual_contrib"),
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
  date: text("date").notNull(), // YYYY-MM-DD
  total_value: real("total_value").notNull(),
  details_json: text("details_json").notNull(), // JSON { envelopeId: value }
  created_at: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});
