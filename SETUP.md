# Installer ton instance personnelle du dashboard

Guide pour mettre en place ta propre version du Command Center / Patrimoine
Dashboard sur ta machine et ton infrastructure.

> **Important** : ce repo est public mais les **données sont privées** — chaque
> utilisateur a sa propre base Turso, son propre Vercel, ses propres tokens.
> Tu ne verras pas les données du repo d'origine, et personne ne verra les
> tiennes.

---

## ⚡ Mode "Claude Code fait tout"

Si tu as **Claude Code** installé, tu peux laisser un agent faire ~80 % de
l'install à ta place. Lance-le dans un dossier vide et **colle exactement** ce
prompt :

```
Installe pour moi le dashboard Patrimoine depuis
https://github.com/simonvagnier-blip/patrimoine-dashboard.

Suis le SETUP.md du repo. Tu peux exécuter toutes les commandes shell, écrire
le .env.local, lancer les migrations, faire le seed vide, builder, et tester
localement avec `npm run dev`. Tu déploieras aussi sur Vercel quand tout sera
prêt en local.

À chaque fois que tu as besoin d'une décision personnelle ou d'une action
manuelle (login Turso, login Vercel, choix d'un mot de passe, OAuth Google,
OAuth Apple), STOPPE et demande-moi clairement quoi faire avec une consigne
copiable.

Progression :
1. Vérifier les pré-requis (Node 20+, git, turso CLI, vercel CLI). Installer
   ce qui manque via brew si je suis sur Mac.
2. Cloner le repo dans le dossier courant et faire `npm install`.
3. Me demander de me logger sur Turso (`turso auth login`) et de te donner
   le nom que je veux pour ma DB (par défaut: `patrimoine`).
4. Créer la DB, récupérer URL + token.
5. Me demander un mot de passe pour DASHBOARD_PASSWORD et générer un
   API_TOKEN aléatoire (openssl rand -hex 32).
6. Écrire le .env.local complet (sans Google/Apple par défaut, je
   compléterai plus tard).
7. Lancer `npm run db:migrate` puis `npm run db:seed:empty`.
8. Builder en local (`npm run build`) pour vérifier qu'il n'y a pas
   d'erreur, puis lancer `npm run dev` et m'inviter à tester sur
   localhost:3000.
9. Quand je confirme que ça marche en local, me demander de me logger
   sur Vercel (`vercel login`) puis faire le `vercel` initial + ajouter
   les env vars de prod, puis `vercel --prod`.
10. Me proposer de configurer le MCP côté Claude Code (`claude mcp add`)
    avec mon API_TOKEN et l'URL Vercel obtenue.

À la fin, fais-moi un récap clair : URL de mon dashboard, mot de passe,
URL Turso, et les prochaines étapes (ajouter mes enveloppes/positions
via l'UI, importer mon budget si je suis chez Fortuneo, brancher
calendar plus tard).
```

⚠️ **À garder en main pour intervenir** : ton mot de passe Turso/Vercel
(login one-shot dans le navigateur), un mot de passe pour ton dashboard,
et 5 min d'attention pour les "demande-moi" du flow.

Si tu n'as pas Claude Code ou préfères faire toi-même, le guide manuel
ci-dessous reste valide.

---

## 1. Pré-requis

| Outil | Pourquoi | Comment l'avoir |
|---|---|---|
| **Node.js 20+** | Runtime JS | https://nodejs.org/ ou via `brew install node` |
| **Git** | Cloner le repo | https://git-scm.com/ |
| **Compte GitHub** | Cloner / forker | https://github.com/signup |
| **Compte Turso** | Base de données SQLite cloud (free tier généreux) | https://turso.tech/ |
| **Compte Vercel** | Hébergement (free tier) | https://vercel.com/signup |
| **Vercel CLI** | Déploiement | `npm i -g vercel` |
| **Claude Code** | (Optionnel) Pour brancher le MCP côté agent | https://claude.ai/code |

Optionnel selon ce que tu veux brancher :
- **Compte Google Cloud** : si tu veux le Google Calendar dans /pro/agenda
- **Mot de passe app Apple** : si tu veux Apple Calendar dans /perso/agenda

---

## 2. Cloner le repo

```bash
# Choisis un dossier où mettre le projet
cd ~/Documents
git clone https://github.com/simonvagnier-blip/patrimoine-dashboard.git
cd patrimoine-dashboard
npm install
```

> Si tu veux pousser tes propres modifications, **fork** le repo sur GitHub
> avant de cloner, et clone ton fork (`git clone https://github.com/<TOI>/patrimoine-dashboard.git`).

---

## 3. Créer ta base Turso

Turso = SQLite hébergé. Free tier = 500 DBs / 9 GB / 1 milliard reads.
Largement suffisant pour un usage perso.

```bash
# Installer la CLI Turso
curl -sSfL https://get.tur.so/install.sh | bash

# Se connecter (ouvre le navigateur)
turso auth signup    # ou `turso auth login` si déjà inscrite

# Créer la DB (choisis le nom que tu veux)
turso db create patrimoine

# Récupérer l'URL
turso db show patrimoine --url
# → libsql://patrimoine-<ton-username>.turso.io

# Générer un token d'accès
turso db tokens create patrimoine
# → eyJhbGc...
```

Garde l'URL et le token sous la main, on en a besoin à l'étape suivante.

---

## 4. Configurer les variables d'environnement

Crée un fichier `.env.local` à la racine du projet :

```bash
# .env.local

# === Base de données ===
TURSO_DATABASE_URL=libsql://patrimoine-<ton-username>.turso.io
TURSO_AUTH_TOKEN=<le token créé à l'étape 3>

# === Auth (mot de passe pour entrer dans l'app) ===
DASHBOARD_PASSWORD=<choisis un mot de passe robuste>

# === MCP Bearer (pour que Claude puisse lire ton dashboard) ===
# Génère 64 caractères aléatoires :
#   openssl rand -hex 32
API_TOKEN=<un long string hex>

# === Optionnel : Google Calendar (espace /pro/agenda) ===
# Va sur https://console.cloud.google.com/apis/credentials
# Crée un OAuth client web, autorise l'URI de redirection :
#   http://localhost:3000/api/google/callback   (dev)
#   https://<ton-vercel-url>/api/google/callback (prod)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback

# === Optionnel : Apple Calendar (espace /perso/agenda) ===
# https://appleid.apple.com → Sécurité → Mot de passe spécifique pour app
APPLE_CALDAV_URL=https://caldav.icloud.com
APPLE_CALDAV_USERNAME=<ton email Apple>
APPLE_CALDAV_PASSWORD=<le password spécifique app>
```

**Important** : `.env.local` est dans le `.gitignore`, ne le commit jamais.

---

## 5. Initialiser la base

```bash
# 1. Appliquer les migrations (crée toutes les tables)
npm run db:migrate

# 2. Insérer le seed "vide" (6 enveloppes par défaut + scénarios + paramètres)
#    Ce script ne pose AUCUNE position — c'est volontaire, tu les ajoutes ensuite.
npm run db:seed:empty
```

Tu devrais voir :
```
🧹 Nettoyage des tables (au cas où) …
📦 Insertion des enveloppes par défaut …
📈 Insertion des paramètres scénarios …
👤 Insertion des paramètres utilisateur …
✅ Seed terminé.
```

---

## 6. Lancer en local

```bash
npm run dev
```

→ Ouvre http://localhost:3000, login avec le `DASHBOARD_PASSWORD` choisi.

Première chose à faire :
1. **`/perso/patrimoine`** → renommer/supprimer les enveloppes par défaut, ajouter les tiennes
2. Pour chaque enveloppe, cliquer dessus puis bouton **"+"** pour ajouter tes positions (ticker Yahoo, quantité, prix de revient unitaire)
3. **`/perso/patrimoine/projections`** → ajuster ton âge actuel et l'âge cible de retraite
4. **`/perso/patrimoine/fiscal`** → renseigner les versements PEA cumulés, années d'ouverture des AV, etc.

---

## 7. Importer un budget (optionnel, Fortuneo uniquement)

Si tu es **chez Fortuneo**, tu peux importer 2 ans d'historique d'un coup :

1. Sur ton espace Fortuneo, exporter en CSV :
   - "Dépenses CB" → enregistrer dans `~/Downloads/Depense CB .csv`
   - "Relevé de compte" → enregistrer dans `~/Downloads/Relevé de compte.csv`
2. Adapter les chemins en haut de `scripts/import-fortuneo-csv.mjs` si nécessaire
3. **Modifier** `USER_NAME` dans le script (ligne ~52) pour mettre **ton nom**
   au lieu de `"SIMON VAGNIER"` (sert à détecter les self-transfers)
4. Lancer :
   ```bash
   node scripts/import-fortuneo-csv.mjs --dry-run    # preview
   node scripts/import-fortuneo-csv.mjs --wipe       # wipe et re-import
   ```

Si tu utilises une **autre banque**, il faut adapter le parsing CSV. Le code
est dans `scripts/import-fortuneo-csv.mjs` — n'hésite pas à demander à Claude
de te générer une variante (`scripts/import-bnp-csv.mjs` etc.).

---

## 8. Déployer sur Vercel

```bash
# Lier le projet à un nouveau projet Vercel
vercel

# Suis les prompts :
#   "Set up and deploy?" → Yes
#   "Which scope?" → ton compte perso
#   "Link to existing project?" → No
#   "What's your project's name?" → patrimoine-(ton-prénom)
#   "In which directory…?" → ./

# Ajouter les env vars de prod (une par une)
vercel env add TURSO_DATABASE_URL production
vercel env add TURSO_AUTH_TOKEN production
vercel env add DASHBOARD_PASSWORD production
vercel env add API_TOKEN production
# (et celles de Google/Apple si tu en as renseigné)

# Premier déploiement de production
vercel --prod
```

→ Tu obtiens une URL type `https://patrimoine-xyz.vercel.app`. Garde-la.

---

## 9. Brancher le MCP côté Claude (optionnel mais top)

Le MCP permet à Claude (Desktop, Cowork, claude.ai chat) de lire ton dashboard
en lecture seule pour t'aider à analyser ton patrimoine.

### A. Pour Claude Desktop / Cowork (stdio)

Édite `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac)
ou `%APPDATA%\Claude\claude_desktop_config.json` (Windows) :

```json
{
  "mcpServers": {
    "patrimoine": {
      "command": "node",
      "args": ["/chemin/absolu/vers/patrimoine-dashboard/mcp-server/index.mjs"],
      "env": {
        "PATRIMOINE_API_URL": "https://patrimoine-xyz.vercel.app",
        "PATRIMOINE_API_TOKEN": "<le même API_TOKEN qu'à l'étape 4>"
      }
    }
  }
}
```

Quitte complètement Claude Desktop (⌘Q) et rouvre-le. Le serveur `patrimoine`
devrait apparaître avec 12 outils (`get_snapshot`, `get_positions`, etc.).

### B. Pour claude.ai (web, mobile)

Va dans **Settings → Integrations → Add custom connector** :
- **Name** : `Patrimoine`
- **URL** : `https://patrimoine-xyz.vercel.app/api/mcp`
- **Auth** : `Bearer token` → ton `API_TOKEN`

### C. Pour Claude Code (CLI)

```bash
claude mcp add patrimoine \
  node /chemin/vers/patrimoine-dashboard/mcp-server/index.mjs \
  --env PATRIMOINE_API_URL=https://patrimoine-xyz.vercel.app \
  --env PATRIMOINE_API_TOKEN=<ton API_TOKEN>
```

Puis dans une convo :
> *Analyse mon patrimoine. Quels sont mes risques de concentration ?*

---

## 10. Maintenance

- **Mettre à jour depuis l'amont** :
  ```bash
  git pull origin main
  npm install
  npm run db:migrate    # si nouvelles migrations
  vercel --prod         # redéployer
  ```
- **Backup** : Turso fait du backup auto, mais tu peux dump localement avec
  `turso db shell patrimoine .dump > backup.sql`

---

## Troubleshooting rapide

| Problème | Piste |
|---|---|
| `URL_INVALID: 'undefined'` au seed | `.env.local` mal lu → vérifier qu'il est à la racine |
| Login impossible en prod | `DASHBOARD_PASSWORD` pas ajouté dans `vercel env` |
| Cours manquants | C'est Yahoo Finance gratuit (15min de retard, parfois en panne 1-2h) |
| MCP Claude ne voit rien | `vercel env` n'a pas `API_TOKEN` ou Bearer mal configuré côté Claude |
| `next dev` plante | `rm -rf .next node_modules && npm install` |

---

Bon dashboard 💚
