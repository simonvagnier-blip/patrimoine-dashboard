# Patrimoine MCP Server

Serveur MCP local qui expose ton dashboard patrimoine comme des outils utilisables par Claude (Desktop, Code, et toute app compatible MCP).

Une fois installé, tu peux demander à Claude :
- « quelle est ma situation patrimoniale actuelle ? »
- « analyse mon allocation et dis-moi si je suis trop concentré »
- « est-ce que j'atteindrai 500k€ à 55 ans avec la trajectoire actuelle ? »
- « quelles positions ont le plus performé ce mois-ci ? »
- « dois-je augmenter ma contribution au PER ? »

Claude appellera automatiquement les bons outils (`get_snapshot`, `get_positions`, `get_history`, `get_allocation`, `get_projections`) pour répondre.

---

## Outils exposés

| Outil | Rôle |
|---|---|
| `get_snapshot` | Vue d'ensemble : total, investi, P&L global, par enveloppe |
| `get_positions` | Positions détaillées (PRU, cours, P&L, poids) — filtrable par enveloppe |
| `get_history` | Historique quotidien (cron nocturne) — ranges 1w à 1y / all |
| `get_allocation` | Répartition par classe d'actif, type d'enveloppe, devise |
| `get_projections` | Simulation long terme 1–60 ans, 3 scénarios (P/M/O) |

---

## Prérequis

- Node.js ≥ 18 (`node --version`)
- Le token `PATRIMOINE_API_TOKEN` (il te sera fourni séparément — c'est la valeur de `API_TOKEN` sur Vercel).

---

## Installation

### 1. Installer le serveur localement

```bash
cd "~/Claudius 1er/PROJECTS/finance dashboard/patrimoine-dashboard/mcp-server"
npm install
```

C'est tout côté code. Reste à brancher le serveur sur ton client MCP.

---

### 2a. Claude Desktop (recommandé pour les conversations ad-hoc)

Ouvre le fichier de config de Claude Desktop :

**macOS :**
```bash
open -e ~/Library/Application\ Support/Claude/claude_desktop_config.json
```
(crée le fichier s'il n'existe pas)

Ajoute (ou fusionne) cette entrée :

```json
{
  "mcpServers": {
    "patrimoine": {
      "command": "node",
      "args": [
        "/Users/simonvagnier/Claudius 1er/PROJECTS/finance dashboard/patrimoine-dashboard/mcp-server/index.mjs"
      ],
      "env": {
        "PATRIMOINE_API_TOKEN": "COLLE_TON_TOKEN_ICI"
      }
    }
  }
}
```

> Remplace `COLLE_TON_TOKEN_ICI` par la valeur actuelle de `API_TOKEN` sur Vercel (tu peux la retrouver avec `vercel env pull` depuis le dossier du dashboard).

**Redémarre Claude Desktop complètement** (quitter via ⌘Q puis rouvrir). Le serveur apparaîtra dans la liste des MCP actifs (icône outils en bas de la zone de saisie). Si ça ne se voit pas, vérifie les logs :

```bash
tail -f ~/Library/Logs/Claude/mcp-server-patrimoine.log
```

---

### 2b. Claude Code (pour itérer sur ta stratégie en ligne de commande)

Depuis n'importe quel dossier :

```bash
claude mcp add patrimoine \
  --scope user \
  --env PATRIMOINE_API_TOKEN=COLLE_TON_TOKEN_ICI \
  -- node "/Users/simonvagnier/Claudius 1er/PROJECTS/finance dashboard/patrimoine-dashboard/mcp-server/index.mjs"
```

`--scope user` rend le serveur disponible dans *toutes* tes sessions Claude Code, pas seulement celle du projet courant.

Vérifie l'installation :

```bash
claude mcp list
# → patrimoine    connected
```

---

### 2c. (Optionnel) Passer l'URL d'une autre instance

Par défaut le serveur interroge `https://general-dashboard-rr5g.vercel.app`. Si tu veux pointer vers un dev local (`npm run dev` sur `:3000`), ajoute :

```
PATRIMOINE_API_URL=http://localhost:3000
```

---

## Premier prompt de test

Dans Claude Desktop ou Claude Code :

> Peux-tu me faire un diagnostic de mon patrimoine : total, allocation, P&L global, et flag les concentrations ou faiblesses structurelles ?

Claude devrait appeler `get_snapshot` puis `get_allocation`, et répondre avec une analyse.

Autre exemple plus poussé :

> Vu ma situation actuelle (snapshot + allocation + projections à 25 ans), propose-moi 3 optimisations concrètes classées par impact attendu. Pour chacune, estime le gain potentiel en €.

---

## Sécurité

- Le token est **read-only** côté API : aucun endpoint MCP ne fait de mutation.
- Il est stocké dans les variables d'env de ton client MCP (pas dans ce repo).
- Rotation : en cas de compromission, régénère via `vercel env rm API_TOKEN production && echo $NEW_TOKEN | vercel env add API_TOKEN production && vercel --prod`.

---

## Dépannage

**Le serveur n'apparaît pas dans Claude Desktop.**
Vérifie que Node est bien dans le PATH de Claude. Sur macOS il faut parfois utiliser le chemin complet : `/usr/local/bin/node` ou `/opt/homebrew/bin/node`. Récupère-le via `which node`.

**`Unauthorized` au premier appel.**
Le token dans `env` ne matche pas celui sur Vercel. Retire les espaces, retire les guillemets superflus, confirme avec `vercel env pull` puis copie-colle.

**Timeout.**
L'instance Vercel peut faire un cold-start de 2-5s sur le premier appel. Réessaye. Si ça persiste, vérifie que `https://general-dashboard-rr5g.vercel.app/api/mcp/snapshot` répond bien (avec le Bearer) via curl.
