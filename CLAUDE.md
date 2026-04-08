@AGENTS.md

# Command Center — Patrimoine Dashboard

## Projet
Hub personnel & professionnel pour Simon. Web app Next.js 16 déployée sur Vercel.
- **URL prod** : https://general-dashboard-rr5g.vercel.app
- **Repo GitHub** : https://github.com/simonvagnier-blip/patrimoine-dashboard
- **Projet Vercel** : `patrimoine-dashboard-rr5g` (attention : un doublon `patrimoine-dashboard` existe, ne pas l'utiliser)
- **Déploiement** : `vercel --prod` depuis ce dossier (le dossier est linké au bon projet via `.vercel/project.json`)

## Stack
- Next.js 16 (App Router, Turbopack)
- Tailwind CSS + shadcn/ui
- Drizzle ORM + Turso (SQLite)
- Recharts (graphiques)
- yahoo-finance2 (cours boursiers)
- googleapis (Google Calendar OAuth2)
- tsdav (Apple Calendar CalDAV)

## Structure des fichiers

```
src/
├── app/
│   ├── page.tsx                    # Accueil espace "Tout" (vue unifiée)
│   ├── layout.tsx                  # Layout racine (fonts, AppShell)
│   ├── login/                      # Page de login (mot de passe simple)
│   ├── agenda/                     # Agenda unifié (all)
│   ├── review/                     # Weekly review
│   ├── perso/
│   │   ├── page.tsx                # Accueil espace perso (tâches détaillées, habitudes, events)
│   │   ├── patrimoine/
│   │   │   ├── page.tsx            # Dashboard patrimoine (DashboardClient)
│   │   │   ├── envelope/[id]/      # Détail enveloppe (EnvelopeDetailClient)
│   │   │   └── projections/        # Projections long terme
│   │   ├── tasks/                  # Tâches perso
│   │   ├── habits/                 # Habitudes perso
│   │   ├── budget/                 # Budget
│   │   ├── agenda/                 # Agenda perso (Apple Calendar)
│   │   └── notes/                  # Notes perso
│   ├── pro/
│   │   ├── page.tsx                # Accueil espace pro (tâches détaillées, pipeline, events)
│   │   ├── crm/                    # CRM contacts
│   │   ├── pipeline/               # Pipeline deals
│   │   ├── kpis/                   # KPIs
│   │   ├── tasks/                  # Tâches pro
│   │   ├── agenda/                 # Agenda pro (Google Calendar)
│   │   └── notes/                  # Notes pro
│   ├── envelope/[id]/              # REDIRECT vers /perso/patrimoine/envelope/[id]
│   ├── projections/                # Projections (espace "Tout")
│   └── api/
│       ├── auth/                   # Login/session
│       ├── google/                 # OAuth Google (redirige vers Google)
│       ├── google/callback/        # Callback OAuth
│       ├── google/events/          # Fetch Google Calendar events
│       ├── apple-calendar/         # Fetch Apple Calendar events
│       ├── quotes/                 # Cours boursiers (yahoo-finance2, cache 15min)
│       ├── envelopes/              # CRUD enveloppes
│       ├── positions/              # CRUD positions
│       ├── scenarios/              # Paramètres scénarios
│       ├── params/                 # Paramètres utilisateur
│       ├── snapshots/              # Historique patrimoine
│       ├── tasks/                  # CRUD tâches
│       ├── habits/                 # CRUD habitudes
│       ├── habit-logs/             # Logs habitudes
│       ├── contacts/               # CRUD contacts CRM
│       ├── deals/                  # CRUD deals pipeline
│       ├── kpis/                   # CRUD KPIs
│       ├── notes/                  # CRUD notes
│       ├── budget/                 # Budget
│       ├── budget-categories/      # Catégories budget
│       └── debug-env/              # Debug variables d'env
├── components/
│   ├── AppShell.tsx                # Shell avec sidebar + animations
│   ├── Sidebar.tsx                 # Sidebar desktop (space switcher)
│   ├── MobileNav.tsx               # Navigation mobile
│   ├── DashboardClient.tsx         # Dashboard patrimoine (cartes, donut, tableau)
│   ├── AllocationDonut.tsx         # Donut répartition actifs
│   ├── PositionTable.tsx           # Tableau positions
│   ├── PositionDialog.tsx          # Dialog ajout/edit position
│   ├── ExportPDF.tsx               # Export PDF
│   ├── calendar/                   # Composants calendrier (CalendarShell, vues Day/Week/Month)
│   └── ui/                         # shadcn/ui components
├── lib/
│   ├── db.ts                       # Client Drizzle + Turso
│   ├── schema.ts                   # Schéma Drizzle (toutes les tables)
│   ├── seed.ts                     # Seed données initiales
│   ├── quotes.ts                   # Logique cours boursiers
│   ├── simulation.ts               # Moteur de projection
│   ├── google-calendar.ts          # OAuth2 + fetch events Google
│   ├── apple-calendar.ts           # CalDAV Apple Calendar
│   ├── spaces.ts                   # Config espaces (pro/perso/all) + nav items
│   ├── types.ts                    # Types partagés
│   └── utils.ts                    # Utilitaires (cn, etc.)
└── proxy.ts                        # Middleware auth (session cookie)
```

## Architecture des espaces
L'app a 3 espaces avec un switcher dans la sidebar :
- **Perso** (vert emerald) : patrimoine, budget, habitudes, tâches perso, agenda Apple
- **Pro** (bleu) : CRM, pipeline, KPIs, tâches pro, agenda Google
- **Tout** (violet) : vue unifiée

La détection d'espace se fait par le pathname (`/pro/*`, `/perso/*`, sinon `all`).

## Patrimoine
5 enveloppes : PEA Fortuneo, PER Fortuneo, AV Lucya Cardif, AV Spirit, CTO Interactive Brokers + Livrets d'épargne.
- Cours via yahoo-finance2 (ETF en .PA, actions US directes)
- Conversion USD/EUR pour le CTO
- Fonds euros/garantis : valeur manuelle

## Variables d'environnement (Vercel)
- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` : base de données
- `DASHBOARD_PASSWORD` : mot de passe login
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` : OAuth Google Calendar
- `APPLE_CALDAV_URL` / `APPLE_CALDAV_USERNAME` / `APPLE_CALDAV_PASSWORD` : Apple Calendar

## Commandes
```bash
npm run dev          # Dev local
npm run build        # Build
vercel --prod        # Deploy sur Vercel (projet rr5g)
```

## Points d'attention
- Le dossier local est linké au projet Vercel `patrimoine-dashboard-rr5g` (pas `patrimoine-dashboard`)
- `/envelope/[id]` redirige vers `/perso/patrimoine/envelope/[id]` (pas de duplication)
- Le proxy.ts gère l'auth : les routes `/api/google*`, `/api/auth`, `/login` sont exclues
- Les specs détaillées du patrimoine sont dans `SPECS.md` à la racine du repo parent
