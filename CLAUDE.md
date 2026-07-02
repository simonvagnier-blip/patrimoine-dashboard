@AGENTS.md

# Command Center — Patrimoine Dashboard

## Projet
Hub personnel & professionnel pour Simon. Web app Next.js 16 déployée sur Vercel.
- **URL prod** : https://general-dashboard-rr5g.vercel.app
- **Repo GitHub** : https://github.com/simonvagnier-blip/patrimoine-dashboard (public, fork-friendly)
- **Projet Vercel** : `patrimoine-dashboard-rr5g` (un doublon `patrimoine-dashboard` existe, ne pas l'utiliser)
- **Déploiement** : `vercel --prod` depuis ce dossier (le dossier est linké au bon projet via `.vercel/project.json`)
- **SETUP.md** à la racine : guide d'installation pour un nouvel utilisateur (clone + configure son propre Turso/Vercel)

## Stack
- Next.js 16 (App Router, Turbopack), TypeScript
- Tailwind CSS + shadcn/ui + base-ui/react
- Drizzle ORM + Turso (SQLite hébergé) — `lib/db.ts`, `lib/schema.ts`
- Recharts pour les graphiques
- `yahoo-finance2` pour les cours actions/ETF + EUR/USD
- `open.er-api.com` (gratuit, sans clé) pour MGA/EUR avec fallback Yahoo (EURMGA=X)
- googleapis (Google Calendar OAuth2) + tsdav (Apple Calendar CalDAV)
- @modelcontextprotocol/sdk pour exposer le serveur MCP (stdio + HTTP)

## Patrimoine actuel de Simon (juin 2026)
8 enveloppes : PEA Fortuneo, PER Fortuneo, AV Lucya Cardif, AV Spirit, CTO Interactive Brokers, Livrets d'épargne, Binance, **Business Madagascar**.

### Spécificités Madagascar
- Devise native : **MGA** (ariary), conversion EUR via open.er-api → fallback Yahoo → fallback hardcodé 4800
- 3 positions :
  - `HAR-S26` (Semences haricots) — capital MGA, scenario_key `business`, 50/50 avec belle-mère, sortie sept 2026 +50%
  - `TEX-LOAN` (Prêt textile à une dame) — capital MGA, scenario_key `business`, 10%/mois 50% de part, jusqu'à ≥déc 2026
  - `CASH-MGA` (cagnotte) — scenario_key dédié `cash_mga` (distinct de cash global, surfacé en cyan dans le donut)
- Cron mensuel `/api/cron/business-income` (21 du mois 06h UTC) crédite automatiquement `CASH-MGA` de 3 465 000 MGA + log opération `interest`. Idempotent (skip si déjà payé ce mois-ci).
- Carte spéciale "Bénéfices attendus" sur la page détail Madagascar (`components/BusinessProjectionCard.tsx`) — projette les revenus mensuels sur 12 mois, règles hardcodées par ticker

## Architecture MCP / OAuth

### Serveurs MCP
- **stdio** (`mcp-server/index.mjs`) : pour Claude Desktop / Cowork / Code, utilise `PATRIMOINE_API_TOKEN` env var
- **HTTP** (`src/app/api/mcp/route.ts`) : Streamable HTTP transport pour claude.ai, accepte 2 modes d'auth :
  - Bearer = `API_TOKEN` env var (idem stdio)
  - Bearer = access token OAuth émis par notre serveur (pour claude.ai)
- **21 tools exposés** : 12 read (`get_snapshot`, `get_positions`, `get_history`, `get_allocation`, `get_projections`, `get_operations`, `get_returns`, `get_alerts`, `get_tax_summary`, `get_dividends`, `simulate_what_if`, `get_budget_summary`) + 9 write (`add_budget_entry`, `update_budget_entry`, `bulk_recategorize_label`, `delete_budget_entry` [destructive], `add_operation`, `update_envelope`, `add_position`, `update_position`, `create_label_rule`)

### Serveur OAuth 2.1 maison
- Tables : `oauth_clients`, `oauth_codes`, `oauth_tokens` (cf `lib/schema.ts`)
- Routes :
  - `/.well-known/oauth-authorization-server` + `/.well-known/oauth-protected-resource` (discovery)
  - `POST /api/oauth/register` (Dynamic Client Registration RFC 7591)
  - `GET/POST /api/oauth/authorize` (form login + génération code)
  - `POST /api/oauth/token` (échange code → access_token, PKCE S256 obligatoire)
- Tokens valides 30 jours. La page de consentement (`lib/oauth.ts:renderConsentPage`) demande le `DASHBOARD_PASSWORD`.

## Logique financière clé

### Conversion devise (`lib/currency.ts`)
- Helper `manualValueToEur(value, currency, {eurUsd, mgaEurRate})` partagé client + serveur
- EUR direct, USD via `eurUsd`, MGA via `mgaEurRate`
- Stocké en **devise native** dans `positions.manual_value`, converti à l'affichage uniquement
- `QuotesResult` inclut maintenant `mgaEurRate` (alimenté par open.er-api.com avec fallback Yahoo)

### Performance marché pure (1J/7J/30J)
**Formule unifiée partout** (cards d'enveloppe + StatsBar globale) :
```
perf_eur = value_now − value_then − contributions_externes_dans_la_fenêtre
pct = perf_eur / value_then × 100
```
- **Contributions** = somme |amount| des opérations `buy` + `deposit` − `sell` − `withdrawal` dans la fenêtre
- **Dividendes/intérêts** = comptés comme perf (non soustraits)
- **Ajustements manual_value** (ex: Cash MGA encaissement intérêts) = comptés comme perf
- **Livrets** : exclus (le tracking des cashflows n'est pas fiable, l'utilisateur édite manual_value sans logger d'op)
- StatsBar agrège = somme des perfEur des enveloppes, % sur la base des valeurs `then` cumulées
- Source de l'historique des valeurs par enveloppe : `snapshots.details_json` (JSON `{envelope_id: value_eur}`)

### Plus-value réalisée (PV réalisée)
- `lib/returns.ts` : `realized_pnl_eur` par scope (global/enveloppe/position) = ops `interest` + `dividend` encaissées **+ plus-values de CESSION** (rejeu chronologique buy/sell, coût moyen pondéré frais inclus — C8, 02/07/2026 ; ventes non couvertes par des achats journalisés ignorées). Conversion EUR au taux du jour. Convention : `interest`/`dividend` stockés en **négatif** = argent revenu à l'investisseur, donc gain = `-amount`.
- Indépendant de la valeur actuelle : compte les gains encaissés **même dépensés** (ex: intérêts Madagascar ramenés en espèces et dépensés → op `interest` enregistrée, CASH-MGA **non** crédité).
- Affiché : header global (`DashboardClient`), cartes d'enveloppe (si ≠ 0), page détail enveloppe.
- Garde-fou TRI global : si `|tri_annual| > 1.0` (100%/an) au scope **global**, on le neutralise (`null` → badge "TRI n/c") car c'est un artefact xirr (journal d'ops incomplet). Les TRI **enveloppe** ne sont pas plafonnés (un deal business peut faire 10%/mois).

### Snapshots
Deux tables, **synchronisées à chaque POST `/api/snapshots`** :
- `snapshots` : global daily (total_value, invested_total, details_json)
- `envelope_snapshots` : per-envelope daily (alimenté par cron nocturne `/api/cron/snapshot-envelopes` ET par chaque POST snapshots pour éviter les désynchros)

Graph projections : utilise `liveHistory` qui override le point "today" avec la valeur live (`totalValue` / `investedCapital`) pour ne pas dépendre de la fraîcheur du snapshot. Le composant `ProjectionChart` skip les mois d'historique qui rounding au même âge que `currentAge` pour éviter les doublons sur l'axe X.

### Simulation / projections
- `lib/simulation.ts` : moteur de projection 3 scénarios (pessimiste/modéré/optimiste)
- `SimulationInput.envelopes[]` accepte `initial_invested_eur` (cost basis + manual_value, sans PV latentes) — utilisé pour la série `invested[]` qui démarre du capital réellement investi (pas de la valeur marché). Évite le saut artificiel J0→J1.
- PEA fill rate : `monthsLeft` aligné sur `FillTargetWidget` (compte depuis le mois courant, pas (fill_end_year − currentYear) × 12 qui sous-comptait).
- PEA cap : utilise `versements_cumules_eur` (depuis `userParams.peaVersements`, fallback cost_basis_eur). Le plafond légal 150k€ porte sur les **versements**, pas la valeur de marché.
- `lib/what-if.ts` : moteur what-if (apports mensuels additionnels, boost initial, override de rendement)
- `perContrib` côté serveur : fallback sur `envelopes.annual_contrib` du PER si `userParams.perContrib` ≤ 0 (avant ce fix, les baselines server-side sous-estimaient de ~1M€ à 30 ans)

## Budget

### Catégorisation (`lib/budget-rules.ts`)
- Taxonomie unifiée : income / expense / savings / transfer
- Helpers `isInternalTransfer(category)`, `isInvestmentCategory(category)`
- Détection self-transfers (Simon ↔ ses propres comptes), virements vers Fortuneo Bourse (= Investissement PEA), patterns vendeurs (Alimentation, Restaurants, Transport, etc.)

### Règles de catégorisation persistées (table `label_rules`)
- Quand l'utilisateur re-catégorise un libellé dans l'UI budget, popup "Appliquer à N transactions similaires + persister la règle"
- Endpoint `/api/budget/rules` (CRUD + bulk-recategorize)
- Appliquées en **priorité 0** au prochain import CSV Fortuneo

### Import CSV Fortuneo (`scripts/import-fortuneo-csv.mjs`)
- Parse `~/Downloads/Depense CB .csv` + `~/Downloads/Relevé de compte.csv`
- Filtre **DES DEUX fichiers** les "DEBIT MENSUEL CARTE BLEUE" (sinon double-comptage)
- Charge les `label_rules` depuis la DB en début d'exécution → priorité 0
- Détection self-transfers via `USER_NAME = "SIMON VAGNIER"` dans Détail 1
- `--dry-run` pour preview, `--wipe` pour DELETE * avant insert

### `computeBudgetSummary` (`lib/budget.ts`)
- Exclut `Transfert interne` (ni revenu ni dépense, tracé séparément)
- Reclasse `Investissement *` comme épargne (gonfle `invested_eur`, pas `expense_eur`)
- Nouveaux champs `MonthlyAggregate.invested_eur` et `.transfer_internal_eur`
- Top catégories exclut transferts internes et investissements

### UI `/perso/budget`
- Filtres : plage dates, bucket (Dépense/Revenu/Épargne-invest/Transfert), catégorie multi, recherche texte
- Tableau paginé 50
- Édition inline de catégorie avec popup "appliquer à N transactions similaires"
- Toggle "Cumul par vendeur" qui groupe par libellé exact

## Structure des fichiers

```
src/
├── app/
│   ├── page.tsx                    # Accueil "Tout" (utilise loadPortfolioState)
│   ├── layout.tsx                  # Layout racine
│   ├── login/                      # Login mot de passe simple
│   ├── perso/
│   │   ├── page.tsx
│   │   ├── patrimoine/
│   │   │   ├── page.tsx            # DashboardClient (cards + donut + tableau)
│   │   │   ├── envelope/[id]/      # Détail enveloppe + BusinessProjectionCard si type=business
│   │   │   ├── projections/        # ProjectionsClient (live history override)
│   │   │   ├── what-if/            # Simulations
│   │   │   └── fiscal/             # Profil fiscal (peaVersements, mariage_year, etc.)
│   │   ├── budget/                 # UI budget refondue (filtres + inline edit)
│   │   ├── tasks/, habits/, agenda/, notes/
│   ├── pro/                        # CRM, pipeline, KPIs, tâches, agenda
│   ├── envelope/[id]/              # Redirect vers /perso/patrimoine/envelope/[id]
│   ├── projections/                # Projections espace "Tout"
│   ├── .well-known/                # OAuth discovery endpoints
│   └── api/
│       ├── mcp/                    # /api/mcp (HTTP) + sub-routes REST (snapshot, positions, ...)
│       ├── oauth/                  # register, authorize, token
│       ├── budget/                 # CRUD + rules + summary
│       ├── operations/, envelopes/, positions/, snapshots/, params/
│       ├── envelope-chart/         # Chart per-envelope (simulated + real mode)
│       └── cron/
│           ├── snapshot-envelopes/  # Nightly 22h UTC
│           └── business-income/     # Monthly 21st 06h UTC (Madagascar interest auto)
├── components/
│   ├── DashboardClient.tsx         # ~750 lignes, deltas perf marché pure
│   ├── StatsBar.tsx                # Pills compactes 1J/7J/30J + dividendes + épargne + sparkline
│   ├── BusinessProjectionCard.tsx  # Carte projection bénéfices Madagascar
│   ├── ProjectionChart.tsx         # Skip months rounding to currentAge
│   ├── FillTargetWidget.tsx        # Progression PEA basée sur versements (pas valeur)
│   └── ui/                         # shadcn/ui
├── lib/
│   ├── db.ts, schema.ts            # Drizzle + Turso
│   ├── portfolio-state.ts          # loadPortfolioState (source de vérité serveur, expose deposits_eur + initial_invested_eur)
│   ├── currency.ts                 # manualValueToEur helper
│   ├── quotes.ts                   # Yahoo + open.er-api MGA/EUR
│   ├── budget.ts, budget-rules.ts  # Budget logic + catégorisation
│   ├── simulation.ts, what-if.ts   # Moteur projection + what-if
│   ├── oauth.ts                    # Helpers OAuth (PKCE, renderConsentPage, etc.)
│   └── envelope-snapshots.ts       # ensureTodaySnapshotForEnvelope, snapshotAllEnvelopes
├── scripts/
│   ├── import-fortuneo-csv.mjs     # Import CSV avec catégorisation + label_rules
│   └── seed-empty.mjs              # Seed neutre (6 enveloppes par défaut, pas de positions perso)
└── proxy.ts                        # Middleware auth (whitelist /api/mcp, /api/oauth, /.well-known/*)
```

## Architecture des espaces
3 espaces avec switcher dans la sidebar :
- **Perso** (vert emerald) : patrimoine, budget, habitudes, tâches, agenda Apple
- **Pro** (bleu) : CRM, pipeline, KPIs, tâches, agenda Google
- **Tout** (violet) : vue unifiée

La détection d'espace se fait par le pathname (`/pro/*`, `/perso/*`, sinon `all`).

## Variables d'environnement (Vercel)
- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` : base de données
- `DASHBOARD_PASSWORD` : mot de passe login (aussi utilisé pour la page de consentement OAuth)
- `API_TOKEN` : Bearer pour le MCP serveur (généré une fois, copié dans la config Claude Desktop)
- `CRON_SECRET` : pour valider les calls Vercel Cron
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` : OAuth Google Calendar
- `APPLE_CALDAV_URL` / `APPLE_CALDAV_USERNAME` / `APPLE_CALDAV_PASSWORD` : Apple Calendar

## Commandes
```bash
npm run dev                       # Dev local (port 3000)
npm run build                     # Build prod
npm run db:migrate                # Drizzle migrate
npm run db:seed:empty             # Seed vierge (pour nouveaux users via SETUP.md)
vercel --prod                     # Deploy
node scripts/import-fortuneo-csv.mjs --dry-run   # Preview import budget
node scripts/import-fortuneo-csv.mjs --wipe      # Wipe + reimport
```

## Points d'attention récurrents
- Le dossier local est linké au projet Vercel `patrimoine-dashboard-rr5g` (pas `patrimoine-dashboard`)
- `/envelope/[id]` redirige vers `/perso/patrimoine/envelope/[id]` (pas de duplication)
- `proxy.ts` exclut `/api/mcp`, `/api/oauth`, `/.well-known/*` du check de session (auth via leur propre Bearer)
- Les **snapshots globaux** sont upsertés à chaque load du dashboard (POST /api/snapshots), pas seulement par le cron. Le cron sert juste pour les jours où l'utilisateur ne se connecte pas. Désormais le POST upsert aussi `envelope_snapshots` pour la cohérence avec le graph détaillé.
- La carte d'enveloppe sur le dashboard affiche 1J/7J/30J en **perf marché pure** (delta − contributions). Livrets exclu (`—`).
- Quand on ajoute un nouveau type d'enveloppe (ex: business Madagascar), penser à : (a) `scenario_params` pour les 3 scénarios, (b) `SCENARIO_LABELS` + `SCENARIO_COLORS` dans `AllocationDonut`, (c) `PositionDialog SCENARIO_OPTIONS_MANUAL`, (d) éventuellement le `detectMode` de `PositionDialog`.
- Tools MCP write : claude.ai demande confirmation avant chaque appel mutant (annotations `readOnlyHint: false` / `destructiveHint: true`). Suppression d'enveloppes/positions volontairement **non** exposée — passe par l'UI.
- Cron Madagascar : si Simon prête plus à la dame ou que les modalités changent, modifier `monthly_mga` dans `src/app/api/cron/business-income/route.ts`. Pour ajouter d'autres deals : nouvelle entrée dans le tableau `RULES`.

## SPECS.md
Les specs détaillées du patrimoine sont dans `SPECS.md` à la racine du repo parent (`~/Claudius 1er/PROJECTS/finance dashboard/SPECS.md`).

## Fonctionnalités nuit du 01→02/07/2026 (C3-C6)

### TWR & benchmark (C4)
- `lib/twr.ts` : TWR chaîné journalier (GIPS, début-de-journée), flux = buy/deposit − sell/withdrawal. `lib/benchmark-data.ts` : ETF UCITS EUR capitalisants (IWDA.AS, SXR8.DE, SXRV.DE, EMIM.AS, BTC-EUR), cache 1 h.
- `GET /api/envelope-benchmark?envelope_id&days&index` — refuse livrets/business (flux non journalisés → TWR mensonger).
- `BenchmarkPanel` (page enveloppe) + `MonthlyHeatmap` (dashboard, **exclut livrets+business** : leurs éditions manual_value seraient lues comme perf — vérifié +80 k€ livrets 01/07).

### Import IBKR (C5)
- `lib/ibkr-flex-parse.ts` (pur) + `lib/ibkr-flex.ts` (sync DB). Idempotence : `operations.external_id` (UNIQUE). PRU frais inclus recalculé, quantité maj, positions créées auto (scenario_key `tech` par défaut).
- Env : `IBKR_FLEX_TOKEN` + `IBKR_FLEX_QUERY_ID` (token 1 an, renouvellement manuel — erreur 1012 = expiré). Cron nocturne en piggyback sur snapshot-envelopes (hobby = 2 crons max). Sync manuel : `POST /api/ibkr/sync` ; état : `GET /api/ibkr/status` ; UI `IbkrPanel` (page CTO).
- Dépôts/retraits IBKR volontairement NON journalisés (convention TRI). Position soldée → warning (renommage -SOLD manuel).
- user_params : `ibkrSyncLog`, `ibkrReconciliation`, `ibkrDividendAccruals`.

### PWA + push (C3)
- `app/manifest.ts` (standalone obligatoire pour push iOS), icônes générées par `scripts/generate-icons.mjs` (PNG pur Node), `public/sw.js` (données stale-while-revalidate, navigations network-first, push).
- **SW enregistré en PRODUCTION uniquement** (`PwaSetup`) : en dev les chunks Turbopack tournent → HTML caché + chunks morts = hydratation tuée.
- Web Push : env `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, table `push_subscriptions`, routes `/api/push/subscribe` (GET clé/POST/DELETE) + `/api/push/test`. Digest quotidien dans le cron : variation en % SANS montants (transit APNs).
- Assets PWA en liste blanche dans proxy.ts.

### Thèses (C6)
- `positions.tags` (TEXT JSON array). UI : champ dans PositionDialog (virgules), `ThesesPanel` sur la page enveloppe. Seed : photonique/consumption layer/énergie sur le CTO.
- TODO : exposer tags dans loadPortfolioState/MCP get_positions (additif).

### Backup DB
`node scripts/backup-db.mjs` → dump SQL complet dans `../backups/` (hors repo, testé restaurable).

### Frais, change & import CSV in-app (C7)
- `lib/fees.ts` + `/api/fees` + `FeesPanel` (dashboard) : frais de gestion (ops `fee`) + commissions incluses dans buy/sell (commission = |amount|−|qty×prix| pour buy, inverse pour sell), par enveloppe et par an, converti EUR via `lastKnownQuotes`.
- `CurrencyExposurePanel` (dashboard) : répartition EUR/USD/MGA + sensibilité ±5 % (calcul exact depuis les valeurs converties, pas d'historique FX). **Décomposition backward capital/dividendes/change NON faite** : nécessite le FX historique par lot d'achat → limite de données assumée (ne pas fabriquer un chiffre faux).
- `lib/fortuneo-import.ts` (pur, testé) + `/api/budget/import` (mode preview/insert/wipe) + `BudgetImportPanel` (page budget) : import in-app des 2 CSV Fortuneo. Applique `label_rules` (priorité 0) + règles vendeurs + dedup DEBIT MENSUEL. **Le CLI `scripts/import-fortuneo-csv.mjs` garde sa copie des règles** (tourne en .mjs sans bundler) — garder les deux alignés.

## Roadmap C0→C7 : TERMINÉE (02/07/2026)
Reste optionnel : import CSV du compte-titres PEA/CTO Fortuneo (≠ budget) vers le journal d'opérations — non fait, demanderait un vrai échantillon CSV titres.
