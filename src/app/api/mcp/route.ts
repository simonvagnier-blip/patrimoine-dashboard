import { NextRequest } from "next/server";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { findValidToken } from "@/lib/oauth";
import { db, schema } from "@/lib/db";
import { eq, and, sql } from "drizzle-orm";

/**
 * MCP Streamable HTTP endpoint.
 *
 * Twin of mcp-server/index.mjs (stdio) — exposes the same 12 tools, but over
 * HTTP/JSON-RPC so remote clients (claude.ai chat, mobile, anything that
 * doesn't run a local Node process) can plug in via Custom Connectors.
 *
 * Auth: Bearer token matching API_TOKEN env var, same as the sibling REST
 * routes (/api/mcp/snapshot, /api/mcp/positions, ...). This endpoint simply
 * proxies each tool call to the relevant REST route — single source of
 * truth for the business logic.
 *
 * IMPORTANT: If you add/rename a tool here, mirror the change in
 * mcp-server/index.mjs (TOOLS array + switch) so stdio + HTTP stay in sync.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOOLS = [
  {
    name: "get_snapshot",
    description:
      "Returns a full current snapshot of the user's patrimoine in EUR: total value, invested capital, global P&L with %, EUR/USD rate, and per-envelope breakdown (id, name, type, target, value, cost basis, P&L). Call this first when the user asks about their overall financial situation.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_positions",
    description:
      "Returns the detailed list of positions with ticker, ISIN, quantity, PRU (cost basis), current price, current value in EUR, P&L, daily change %, portfolio weight, scenario asset class, and envelope. Use envelope_id to scope to one envelope (e.g. 'pea', 'cto', 'binance'). Call this when reasoning about specific holdings, rebalancing, or tax-wrapping.",
    inputSchema: {
      type: "object",
      properties: {
        envelope_id: {
          type: "string",
          description:
            "Optional envelope filter: pea, per, av1, av2, cto, binance, livrets, etc.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_history",
    description:
      "Returns the series of real daily per-envelope valuation snapshots (captured by a nightly cron). Each point has date, total_eur, and by_envelope map. Use range to bound the window. History fills up over time — may be sparse at first. Call this to reason about recent performance or drawdowns.",
    inputSchema: {
      type: "object",
      properties: {
        range: {
          type: "string",
          enum: ["1w", "1mo", "3mo", "6mo", "1y", "all"],
          default: "all",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_allocation",
    description:
      "Returns portfolio allocation breakdowns: by asset class (scenario_key: etf_world, etf_emerging, etf_tech, actions_us, crypto, fe, livrets, etc.), by envelope type (pea, per, av, cto, crypto, livrets), and by currency. Each includes value_eur and pct. Use this to assess diversification and concentration risks.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_projections",
    description:
      "Runs the long-term Monte-Carlo-style projection using the user's scenario parameters (pessimist / moderate / optimist) and expected asset-class returns. Returns totals_by_year and invested_by_year arrays for each scenario, plus key horizons (1, 5, 10, 15, 20, 25, 30 years). Handles PEA monthly fill to target and PER annual contributions until retirement. Use this when the user asks 'will I reach X by age Y' or 'should I contribute more to the PER'.",
    inputSchema: {
      type: "object",
      properties: {
        horizon_years: {
          type: "number",
          description: "Projection horizon in years (1-60). Default 30.",
          minimum: 1,
          maximum: 60,
          default: 30,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_operations",
    description:
      "Returns the operations journal: chronological list of real-world actions (buy, sell, deposit, withdrawal, dividend, fee, interest, transfer) with date, amount, currency, quantity, unit_price, note. This is the ground truth for computing true TRI, realized P&L, and tax events. Filter by envelope_id, position_id, or date range (from/to as YYYY-MM-DD). Use this when the user asks about historical trades, dividends received, deposit cadence, or realized performance.",
    inputSchema: {
      type: "object",
      properties: {
        envelope_id: {
          type: "string",
          description:
            "Optional envelope filter (pea, per, cto, binance, etc.)",
        },
        position_id: {
          type: "number",
          description: "Optional position filter (integer id).",
        },
        from: { type: "string", description: "Start date inclusive (YYYY-MM-DD)." },
        to: { type: "string", description: "End date inclusive (YYYY-MM-DD)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_returns",
    description:
      "Returns the true annualized return (TRI / xirr) computed from the operations journal plus today's market value. Gives TRI per position, per envelope, and global. Includes net invested capital, cashflow count, first operation date, and a coverage flag (full/partial/none) indicating whether each position's operations reconcile with its current quantity. Use this whenever the user wants real performance — it's the honest metric (accounts for timing of deposits, withdrawals, dividends). Positions without enough operations return tri_annual=null with coverage='none'.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_alerts",
    description:
      "Returns all configured threshold alerts (price targets, P&L thresholds, position weights, envelope value bounds) evaluated against the current portfolio state. Each alert has: id, type, threshold, current_value, triggered (boolean), label (human-readable), scope_label (target name), unit, last_triggered_at. Use this to surface what the user should pay attention to — combine with get_snapshot to give context. Pass triggered_only=true to get only the alerts currently firing.",
    inputSchema: {
      type: "object",
      properties: {
        triggered_only: {
          type: "boolean",
          description: "If true, return only alerts currently firing.",
          default: false,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_tax_summary",
    description:
      "Returns the full French fiscal analysis (2026 rates, post-CSG hike): per-envelope unrealized gains and tax owed if liquidated today (PEA <5y vs >5y, AV <8y vs >8y with abattement, CTO/Crypto PFU 31.4%, PER specifics). Includes baseline IR for the user profile (income + parts), PEA contribution caps, PER deduction limit + tax savings if maxed, marriage impact estimate (if marriage_year set), and lists of warnings + opportunities (e.g. 'verser X € sur PER pour économiser Y €'). Use this when the user asks about tax optimization, plus-values, plafonds, or whether to pull money from an envelope.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_dividends",
    description:
      "Returns dividend tracking for the whole portfolio: per-position yield %, expected annual dividend in EUR (rate × quantity, FX-converted), payment frequency (1/2/4/12 per year), next ex-date predicted from history, and 12-month received history per share. Aggregates: total expected annual EUR + total received YTD (from operations journal type=dividend|interest) + upcoming detachments in next 30 days. Use this when the user asks about passive income, yield optimization, or dividend calendar.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "simulate_what_if",
    description:
      "Run a what-if simulation on the long-term portfolio projection. You can override per-envelope (a) extra monthly contribution in EUR (b) initial value boost in EUR (one-shot at t=0) (c) expected annual return per scenario (decimal, e.g. 0.06 = 6%). Returns baseline vs what-if trajectories for each scenario (P/M/O) plus delta at horizon and at key milestones (1, 5, 10, 15, 20, 25, 30 years). Use this for questions like 'and if I add 500€/month to the PEA' or 'and if I transfer 30k from livrets to CTO' or 'and if my CTO returns drop to 4%/year'. The user's envelope IDs include: pea, per, av1, av2, cto, binance, livrets — call get_snapshot first if unsure.",
    inputSchema: {
      type: "object",
      properties: {
        horizon_years: {
          type: "number",
          description: "Projection horizon (1-60). Default 30.",
          minimum: 1,
          maximum: 60,
        },
        envelope_extras: {
          type: "object",
          description:
            "Map of envelope_id → overrides. Keys: monthly_contrib (€), initial_boost (€), return_override ({p,m,o} as decimals).",
          additionalProperties: {
            type: "object",
            properties: {
              monthly_contrib: { type: "number" },
              initial_boost: { type: "number" },
              return_override: {
                type: "object",
                properties: {
                  p: { type: "number" },
                  m: { type: "number" },
                  o: { type: "number" },
                },
              },
            },
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_budget_summary",
    description:
      "Returns the income/expense budget analysis over the past N months (default 12): per-month aggregates (income, expense, savings, savings rate), 12-month averages (avg_income, avg_expense, avg_savings, avg_savings_rate), top expense categories with share, recurring vs one-off split, and an investment reconciliation that compares declared 'Investissement PEA/PER/AV' budget categories against real deposit operations on the patrimoine envelopes. Use this when the user asks about cashflow, savings capacity, where the money goes, or whether their declared investment plan matches reality.",
    inputSchema: {
      type: "object",
      properties: {
        months: {
          type: "number",
          description: "Number of months to analyze (1-60). Default 12.",
          minimum: 1,
          maximum: 60,
          default: 12,
        },
      },
      additionalProperties: false,
    },
  },

  // ─── WRITE TOOLS ──────────────────────────────────────────────────────
  // Annotations MCP (spec 2025-06-18) : permettent à claude.ai d'afficher
  // un prompt de confirmation utilisateur AVANT chaque appel mutant.
  //
  // - readOnlyHint: false       → tool modifie l'état
  // - destructiveHint: true     → suppression irréversible (warn UX renforcé)
  // - idempotentHint: true      → appelable plusieurs fois sans effet cumulé

  {
    name: "add_budget_entry",
    description:
      "Crée une nouvelle entrée dans le budget (revenu ou dépense manuelle). Utile pour ajouter une transaction non importée du CSV (ex: don familial, dépense en espèces, remboursement). type='income' pour entrée d'argent, 'expense' pour sortie. amount toujours en valeur absolue (positif). date au format YYYY-MM-DD. Catégorie libre (ex: 'Alimentation', 'Salaire', 'Cadeau / Aide familiale'). Demande confirmation avant d'appeler.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["income", "expense"] },
        category: { type: "string" },
        label: { type: "string", description: "Libellé/description courte (ex: 'Courses Monoprix')" },
        amount: { type: "number", description: "Montant en EUR, valeur absolue positive" },
        date: { type: "string", description: "YYYY-MM-DD" },
        recurring: { type: "boolean", description: "true si dépense/revenu récurrent (loyer, salaire)", default: false },
      },
      required: ["type", "category", "label", "amount", "date"],
      additionalProperties: false,
    },
    annotations: { title: "Ajouter une entrée budget", readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },

  {
    name: "update_budget_entry",
    description:
      "Met à jour une entrée budget existante (par exemple changer sa catégorie ou son label). Tous les champs sauf id sont optionnels. Utile pour re-catégoriser une transaction unique. Pour re-catégoriser EN MASSE toutes les entrées avec le même libellé, utiliser plutôt bulk_recategorize_label.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
        type: { type: "string", enum: ["income", "expense"] },
        category: { type: "string" },
        label: { type: "string" },
        amount: { type: "number" },
        date: { type: "string" },
        recurring: { type: "boolean" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { title: "Modifier une entrée budget", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },

  {
    name: "bulk_recategorize_label",
    description:
      "Re-catégorise EN MASSE toutes les entrées budget dont le libellé matche `label`. Optionnellement persiste une règle dans la table label_rules pour que les futurs imports CSV appliquent automatiquement la catégorie. matchType : 'exact' (default), 'starts_with', ou 'contains'. Renvoie le nombre d'entrées affectées.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Libellé à matcher (ex: 'PIKKOPAY')" },
        category: { type: "string", description: "Catégorie cible" },
        matchType: { type: "string", enum: ["exact", "contains", "starts_with"], default: "exact" },
        persist: { type: "boolean", description: "Si true, crée aussi une règle persistante dans label_rules", default: true },
      },
      required: ["label", "category"],
      additionalProperties: false,
    },
    annotations: { title: "Re-catégoriser en masse", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },

  {
    name: "delete_budget_entry",
    description:
      "Supprime DÉFINITIVEMENT une entrée du budget. À utiliser avec précaution : par exemple pour retirer une donation exceptionnelle qui ne devrait pas compter dans les revenus, ou un doublon. La suppression est irréversible.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { title: "Supprimer une entrée budget", readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },

  {
    name: "add_operation",
    description:
      "Ajoute une opération au journal d'opérations (achat/vente d'action, dépôt, retrait, dividende reçu, intérêt). Utile pour tenir le journal qui sert au calcul du TRI. Conventions de signe : deposit/dividend/interest/sell-proceeds = NÉGATIF (argent qui sort de la poche du client) ; withdrawal/buy-cost/fee = POSITIF. Pour buy/sell, fournir aussi quantity et unit_price.",
    inputSchema: {
      type: "object",
      properties: {
        envelope_id: { type: "string", description: "Ex: 'pea', 'cto', 'binance'" },
        position_id: { type: "number", description: "Optionnel, requis pour buy/sell/dividend liés à une position" },
        date: { type: "string", description: "YYYY-MM-DD" },
        type: { type: "string", enum: ["buy", "sell", "deposit", "withdrawal", "dividend", "fee", "interest", "transfer"] },
        amount: { type: "number", description: "Signé selon convention (cf description)" },
        quantity: { type: "number" },
        unit_price: { type: "number" },
        currency: { type: "string", default: "EUR" },
        note: { type: "string" },
      },
      required: ["envelope_id", "date", "type", "amount"],
      additionalProperties: false,
    },
    annotations: { title: "Ajouter une opération", readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },

  {
    name: "update_envelope",
    description:
      "Met à jour les paramètres d'une enveloppe existante : nom, target (objectif EUR), fill_end_year (année cible pour atteindre le target), annual_contrib (contribution annuelle pour PER). Tous les champs sauf id sont optionnels. Pour PEA, target = plafond de versements visé (typiquement 150000).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID de l'enveloppe (ex: 'pea')" },
        name: { type: "string" },
        color: { type: "string", description: "Hex color, ex: '#34d399'" },
        target: { type: "number" },
        fill_end_year: { type: "number" },
        annual_contrib: { type: "number" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { title: "Modifier une enveloppe", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },

  {
    name: "add_position",
    description:
      "Ajoute une position dans une enveloppe. Pour les ETF/actions cotés : fournir ticker, yahoo_ticker (ex: 'PE500.PA' ou 'COHR'), quantity, pru (prix de revient unitaire), scenario_key (cf classes d'actifs : sp, wd, em, nq, tech, energy, fg, fe, cash). Pour fonds euros / valeurs manuelles : fournir manual_value à la place de quantity/pru.",
    inputSchema: {
      type: "object",
      properties: {
        envelope_id: { type: "string" },
        ticker: { type: "string" },
        yahoo_ticker: { type: "string" },
        label: { type: "string", description: "Nom complet de la position" },
        isin: { type: "string" },
        quantity: { type: "number" },
        pru: { type: "number", description: "Prix de revient unitaire" },
        manual_value: { type: "number", description: "Pour fonds euros / valeurs sans cotation" },
        scenario_key: { type: "string", description: "sp|wd|em|nq|tech|energy|fg|fe|cash|crypto" },
        currency: { type: "string", default: "EUR" },
      },
      required: ["envelope_id", "ticker", "label", "scenario_key"],
      additionalProperties: false,
    },
    annotations: { title: "Ajouter une position", readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },

  {
    name: "update_position",
    description:
      "Met à jour une position existante : ajuster la quantité (après un nouvel achat hors journal), le PRU, la valeur manuelle (pour fonds euros), ou les métadonnées. Tous les champs sauf id sont optionnels.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
        ticker: { type: "string" },
        yahoo_ticker: { type: "string" },
        label: { type: "string" },
        quantity: { type: "number" },
        pru: { type: "number" },
        manual_value: { type: "number" },
        scenario_key: { type: "string" },
        currency: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { title: "Modifier une position", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },

  {
    name: "create_label_rule",
    description:
      "Crée une règle de catégorisation persistante. Les imports futurs de CSV Fortuneo l'appliqueront en priorité. Utile pour automatiser la catégorisation d'un libellé récurrent (ex: 'PIKKOPAY → Alimentation'). Si applyToExisting=true (par défaut), met aussi à jour les entrées existantes qui matchent.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        category: { type: "string" },
        matchType: { type: "string", enum: ["exact", "contains", "starts_with"], default: "exact" },
        applyToExisting: { type: "boolean", default: true },
      },
      required: ["pattern", "category"],
      additionalProperties: false,
    },
    annotations: { title: "Créer une règle de catégorisation", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
];

function getBaseUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "general-dashboard-rr5g.vercel.app";
  return `${proto}://${host}`;
}

async function apiGet(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  baseUrl: string,
  token: string,
): Promise<unknown> {
  const url = new URL(`${baseUrl}/api/mcp${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${path} → HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`GET ${path} returned non-JSON: ${body.slice(0, 200)}`);
  }
}

async function apiPost(
  path: string,
  body: unknown,
  baseUrl: string,
  token: string,
): Promise<unknown> {
  const res = await fetch(`${baseUrl}/api/mcp${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`POST ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`POST ${path} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  baseUrl: string,
  token: string,
): Promise<unknown> {
  switch (name) {
    case "get_snapshot":
      return apiGet("/snapshot", {}, baseUrl, token);
    case "get_positions":
      return apiGet(
        "/positions",
        { envelope_id: args.envelope_id as string | undefined },
        baseUrl,
        token,
      );
    case "get_history":
      return apiGet(
        "/history",
        { range: (args.range as string | undefined) ?? "all" },
        baseUrl,
        token,
      );
    case "get_allocation":
      return apiGet("/allocation", {}, baseUrl, token);
    case "get_projections":
      return apiGet(
        "/projections",
        { horizon_years: (args.horizon_years as number | undefined) ?? 30 },
        baseUrl,
        token,
      );
    case "get_operations":
      return apiGet(
        "/operations",
        {
          envelope_id: args.envelope_id as string | undefined,
          position_id: args.position_id as number | undefined,
          from: args.from as string | undefined,
          to: args.to as string | undefined,
        },
        baseUrl,
        token,
      );
    case "get_returns":
      return apiGet("/returns", {}, baseUrl, token);
    case "get_alerts":
      return apiGet(
        "/alerts",
        { triggered_only: args.triggered_only ? "true" : undefined },
        baseUrl,
        token,
      );
    case "get_tax_summary":
      return apiGet("/fiscal", {}, baseUrl, token);
    case "get_dividends":
      return apiGet("/dividends", {}, baseUrl, token);
    case "get_budget_summary":
      return apiGet(
        "/budget",
        { months: (args.months as number | undefined) ?? 12 },
        baseUrl,
        token,
      );
    case "simulate_what_if":
      return apiPost(
        "/what-if",
        {
          horizon_years: args.horizon_years,
          envelope_extras: args.envelope_extras,
        },
        baseUrl,
        token,
      );

    // ─── WRITE TOOLS (direct DB) ───────────────────────────────────────
    case "add_budget_entry":
    case "update_budget_entry":
    case "bulk_recategorize_label":
    case "delete_budget_entry":
    case "add_operation":
    case "update_envelope":
    case "add_position":
    case "update_position":
    case "create_label_rule":
      return dispatchWriteTool(name, args);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Tools mutants : écriture directe en base, pas de proxy HTTP. On préfère
 * Drizzle plutôt qu'un double-hop vers /api/budget POST etc. (ces endpoints
 * sont protégés par session cookie, pas exposés au token MCP).
 *
 * Format de retour : objet JSON avec `success: true` + un message court ou la
 * ligne créée/modifiée. claude.ai surface ce JSON tel quel à l'utilisateur.
 */
async function dispatchWriteTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const nowIso = new Date().toISOString();

  switch (name) {
    case "add_budget_entry": {
      const row = await db
        .insert(schema.budgetEntries)
        .values({
          type: String(args.type),
          category: String(args.category),
          label: String(args.label),
          amount: Number(args.amount),
          date: String(args.date),
          recurring: args.recurring ? 1 : 0,
          created_at: nowIso,
        })
        .returning()
        .get();
      return { success: true, message: "Entrée budget créée", entry: row };
    }

    case "update_budget_entry": {
      const id = Number(args.id);
      const updates: Record<string, unknown> = {};
      for (const k of ["type", "category", "label", "amount", "date"]) {
        if (args[k] !== undefined) updates[k] = args[k];
      }
      if (args.recurring !== undefined) updates.recurring = args.recurring ? 1 : 0;
      if (Object.keys(updates).length === 0) {
        return { success: false, message: "Aucun champ à modifier" };
      }
      const row = await db
        .update(schema.budgetEntries)
        .set(updates)
        .where(eq(schema.budgetEntries.id, id))
        .returning()
        .get();
      if (!row) return { success: false, message: `Entrée ${id} introuvable` };
      return { success: true, message: "Entrée budget mise à jour", entry: row };
    }

    case "bulk_recategorize_label": {
      const label = String(args.label);
      const category = String(args.category);
      const matchType = (args.matchType as string | undefined) ?? "exact";
      const persist = args.persist !== false; // default true
      const lower = label.toLowerCase();
      const likeExpr =
        matchType === "exact"
          ? lower
          : matchType === "starts_with"
            ? `${lower}%`
            : `%${lower}%`;
      const upd = await db
        .update(schema.budgetEntries)
        .set({ category })
        .where(sql`lower(${schema.budgetEntries.label}) LIKE ${likeExpr}`)
        .run();
      const affected = Number((upd as { rowsAffected?: number }).rowsAffected ?? 0);
      let ruleCreated = false;
      if (persist) {
        const existing = await db
          .select()
          .from(schema.labelRules)
          .where(
            and(
              eq(schema.labelRules.pattern, label),
              eq(schema.labelRules.match_type, matchType),
            ),
          )
          .get();
        if (existing) {
          await db
            .update(schema.labelRules)
            .set({ category })
            .where(eq(schema.labelRules.id, existing.id))
            .run();
        } else {
          await db
            .insert(schema.labelRules)
            .values({
              pattern: label,
              match_type: matchType,
              category,
              created_at: nowIso,
            })
            .run();
          ruleCreated = true;
        }
      }
      return {
        success: true,
        affected,
        rule_persisted: persist,
        rule_created: ruleCreated,
        message: `${affected} entrée(s) re-catégorisée(s)${persist ? ", règle persistée" : ""}`,
      };
    }

    case "delete_budget_entry": {
      const id = Number(args.id);
      const existing = await db
        .select()
        .from(schema.budgetEntries)
        .where(eq(schema.budgetEntries.id, id))
        .get();
      if (!existing) return { success: false, message: `Entrée ${id} introuvable` };
      await db.delete(schema.budgetEntries).where(eq(schema.budgetEntries.id, id)).run();
      return { success: true, message: `Entrée ${id} supprimée`, deleted: existing };
    }

    case "add_operation": {
      const row = await db
        .insert(schema.operations)
        .values({
          envelope_id: String(args.envelope_id),
          position_id: args.position_id !== undefined ? Number(args.position_id) : null,
          date: String(args.date),
          type: String(args.type),
          quantity: args.quantity !== undefined ? Number(args.quantity) : null,
          unit_price: args.unit_price !== undefined ? Number(args.unit_price) : null,
          amount: Number(args.amount),
          currency: String(args.currency ?? "EUR"),
          note: args.note ? String(args.note) : null,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .returning()
        .get();
      return { success: true, message: "Opération créée", operation: row };
    }

    case "update_envelope": {
      const id = String(args.id);
      const updates: Record<string, unknown> = {};
      for (const k of ["name", "color", "target", "fill_end_year", "annual_contrib"]) {
        if (args[k] !== undefined) updates[k] = args[k];
      }
      if (Object.keys(updates).length === 0) {
        return { success: false, message: "Aucun champ à modifier" };
      }
      const row = await db
        .update(schema.envelopes)
        .set(updates)
        .where(eq(schema.envelopes.id, id))
        .returning()
        .get();
      if (!row) return { success: false, message: `Enveloppe '${id}' introuvable` };
      return { success: true, message: "Enveloppe mise à jour", envelope: row };
    }

    case "add_position": {
      const row = await db
        .insert(schema.positions)
        .values({
          envelope_id: String(args.envelope_id),
          ticker: String(args.ticker),
          yahoo_ticker: args.yahoo_ticker ? String(args.yahoo_ticker) : null,
          label: String(args.label),
          isin: args.isin ? String(args.isin) : null,
          quantity: args.quantity !== undefined ? Number(args.quantity) : null,
          pru: args.pru !== undefined ? Number(args.pru) : null,
          manual_value: args.manual_value !== undefined ? Number(args.manual_value) : null,
          scenario_key: String(args.scenario_key),
          currency: String(args.currency ?? "EUR"),
          created_at: nowIso,
          updated_at: nowIso,
        })
        .returning()
        .get();
      return { success: true, message: "Position ajoutée", position: row };
    }

    case "update_position": {
      const id = Number(args.id);
      const updates: Record<string, unknown> = { updated_at: nowIso };
      for (const k of ["ticker", "yahoo_ticker", "label", "scenario_key", "currency"]) {
        if (args[k] !== undefined) updates[k] = args[k];
      }
      for (const k of ["quantity", "pru", "manual_value"]) {
        if (args[k] !== undefined) updates[k] = Number(args[k]);
      }
      const row = await db
        .update(schema.positions)
        .set(updates)
        .where(eq(schema.positions.id, id))
        .returning()
        .get();
      if (!row) return { success: false, message: `Position ${id} introuvable` };
      return { success: true, message: "Position mise à jour", position: row };
    }

    case "create_label_rule": {
      const pattern = String(args.pattern);
      const category = String(args.category);
      const matchType = (args.matchType as string | undefined) ?? "exact";
      const applyToExisting = args.applyToExisting !== false;
      const existing = await db
        .select()
        .from(schema.labelRules)
        .where(
          and(
            eq(schema.labelRules.pattern, pattern),
            eq(schema.labelRules.match_type, matchType),
          ),
        )
        .get();
      let ruleId: number;
      if (existing) {
        await db
          .update(schema.labelRules)
          .set({ category })
          .where(eq(schema.labelRules.id, existing.id))
          .run();
        ruleId = existing.id;
      } else {
        const row = await db
          .insert(schema.labelRules)
          .values({ pattern, match_type: matchType, category, created_at: nowIso })
          .returning()
          .get();
        ruleId = row.id;
      }
      let affected = 0;
      if (applyToExisting) {
        const lower = pattern.toLowerCase();
        const likeExpr =
          matchType === "exact"
            ? lower
            : matchType === "starts_with"
              ? `${lower}%`
              : `%${lower}%`;
        const upd = await db
          .update(schema.budgetEntries)
          .set({ category })
          .where(sql`lower(${schema.budgetEntries.label}) LIKE ${likeExpr}`)
          .run();
        affected = Number((upd as { rowsAffected?: number }).rowsAffected ?? 0);
      }
      return {
        success: true,
        rule_id: ruleId,
        affected_existing: affected,
        message: `Règle créée (${affected} entrée(s) existante(s) mise(s) à jour)`,
      };
    }

    default:
      throw new Error(`Unknown write tool: ${name}`);
  }
}

async function handleRequest(req: NextRequest): Promise<Response> {
  // Auth : 2 voies acceptées
  //   1. Bearer = API_TOKEN env var (ancien, pour stdio mcp-server / curl debug)
  //   2. Bearer = un access_token OAuth valide (nouveau, pour claude.ai)
  // Sur 401 : on renvoie WWW-Authenticate avec un pointeur vers le serveur
  // d'auth, comme requis par RFC 6750 + spec MCP.
  const baseUrlForAuth = getBaseUrl(req);
  const wwwAuth = `Bearer realm="MCP Patrimoine", as_uri="${baseUrlForAuth}/.well-known/oauth-authorization-server", resource_metadata="${baseUrlForAuth}/.well-known/oauth-protected-resource"`;

  const expected = process.env.API_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!bearer) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", "WWW-Authenticate": wwwAuth },
    });
  }

  // Voie 1 : static API_TOKEN
  let authorized = expected ? bearer === expected : false;
  // Voie 2 : access_token OAuth
  if (!authorized) {
    const tokenRow = await findValidToken(bearer);
    if (tokenRow) authorized = true;
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", "WWW-Authenticate": wwwAuth },
    });
  }

  // L'auth qui marche peut être OAuth, mais le proxy interne vers
  // /api/mcp/<sub> a toujours besoin de l'API_TOKEN. Sans, on ne peut pas
  // proxifier — c'est une erreur de config serveur.
  if (!expected) {
    return new Response(
      JSON.stringify({
        error: "Server misconfigured: API_TOKEN env var required for internal proxy",
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const internalToken: string = expected;

  const baseUrl = getBaseUrl(req);

  const server = new Server(
    { name: "patrimoine-mcp-http", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    try {
      const data = await dispatchTool(name, args, baseUrl, internalToken);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error calling ${name}: ${msg}` }],
        isError: true,
      };
    }
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: no session tracking. claude.ai's remote MCP works fine
    // without sessions — it opens a fresh POST per JSON-RPC call.
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  return transport.handleRequest(req);
}

export const GET = handleRequest;
export const POST = handleRequest;
export const DELETE = handleRequest;
