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
  date: text("date").notNull(),
  total_value: real("total_value").notNull(),
  details_json: text("details_json").notNull(),
  created_at: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
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
