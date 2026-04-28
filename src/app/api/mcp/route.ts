import { NextRequest } from "next/server";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

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
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleRequest(req: NextRequest): Promise<Response> {
  const expected = process.env.API_TOKEN;
  if (!expected) {
    return new Response(
      JSON.stringify({ error: "API_TOKEN not configured on server" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

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
      const data = await dispatchTool(name, args, baseUrl, expected);
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
