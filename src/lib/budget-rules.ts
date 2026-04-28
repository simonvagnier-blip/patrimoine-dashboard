/**
 * Règles de catégorisation partagées entre :
 *   - Le script d'import Fortuneo (scripts/import-fortuneo-csv.mjs)
 *   - Le script de nettoyage one-shot (scripts/cleanup-budget.mjs)
 *   - La logique runtime (future : re-catégorisation en ligne dans l'UI)
 *
 * Principe : on matche sur des patterns robustes (vendor dans "Détail 1" de
 * Fortuneo ou type d'opération) pour produire une catégorie propre dans un
 * référentiel unifié. En cas d'ambigu, fallback "À catégoriser" — l'utilisateur
 * peut affiner via l'UI.
 */

export type BudgetType = "income" | "expense";

/**
 * Taxonomie unifiée. L'ordre reflète l'affichage recommandé dans l'UI.
 */
export const CATEGORIES = {
  income: [
    "Salaire",
    "Freelance / Entreprise",
    "Remboursement",
    "Cadeau / Aide familiale",
    "Intérêts / Dividendes",
    "Autre revenu",
  ],
  // Les catégories "marchent" vraiment comme des dépenses de consommation
  expense: [
    "Logement",
    "Alimentation",
    "Restaurants / Sorties",
    "Transport",
    "Loisirs",
    "Abonnements",
    "Santé",
    "Shopping",
    "Frais bancaires",
    "Impôts / Taxes",
    "Cadeaux offerts",
    "Autre dépense",
  ],
  // Catégories spéciales : NE SONT PAS de la consommation.
  // computeBudgetSummary les traite à part : les "Investissement *" comptent
  // comme épargne, les "Transfert interne" sont ignorés entièrement.
  savings: ["Investissement PEA", "Investissement PER", "Investissement AV", "Épargne livrets"],
  transfer: ["Transfert interne"],
} as const;

/**
 * Renvoie true si la catégorie ne doit PAS être comptée comme "dépense de
 * consommation" (elle est soit de l'épargne, soit un transfert interne).
 */
export function isSavingsOrTransfer(category: string): boolean {
  const lc = category.toLowerCase();
  if (lc.startsWith("investissement")) return true;
  if (lc.startsWith("épargne ") || lc.startsWith("epargne ")) return true;
  if (lc === "transfert interne") return true;
  return false;
}

/**
 * Renvoie true si la catégorie est un transfert interne à exclure
 * complètement du calcul de budget (ni revenu, ni dépense).
 */
export function isInternalTransfer(category: string): boolean {
  return category.toLowerCase() === "transfert interne";
}

/**
 * Renvoie true si la catégorie est de l'investissement (à compter comme
 * épargne plutôt que comme dépense).
 */
export function isInvestmentCategory(category: string): boolean {
  const lc = category.toLowerCase();
  return lc.startsWith("investissement") || lc.startsWith("épargne ") || lc.startsWith("epargne ");
}

/**
 * Entrée brute depuis un CSV Fortuneo, pour que la règle ait accès à tous
 * les signaux (type d'op, catégorie Fortuneo, détails vendor, montant).
 */
export interface RawRow {
  opType: string; // "VIREMENT SEPA EMIS", "CARTE", ...
  fortuneoCategory: string; // catégorie d'origine Fortuneo (peut être "A catégoriser")
  fortuneoSubCategory: string;
  detail1: string; // vendor / libellé principal
  amount: number; // signé, tel que dans le CSV
}

/**
 * Patterns de vendors pour les dépenses. L'ordre importe : le premier match gagne.
 * Chaque pattern est une regex case-insensitive appliquée à `detail1`.
 */
const VENDOR_RULES: Array<{ pattern: RegExp; category: string }> = [
  // Logement
  { pattern: /\bGIC PATRIMOINE\b/i, category: "Logement" },

  // Alimentation — grandes surfaces + petits formats
  { pattern: /\b(MONOPRIX|CARREFOUR|AUCHAN|LECLERC|INTERMARCHE|ITM|FRANPRIX|CASINO|LIDL|ALDI|G\s?20|SIMPLY|SUPER\s?U|MARKS?\s?&?\s?SPENCER|NATURALIA|BIOCOOP|PICARD|GRAND FRAIS)\b/i, category: "Alimentation" },
  { pattern: /\b(BOULANGERIE|FOURNIL|ARTISAN|BOUCHERIE|POISSONNERIE|PRIMEUR|MARCHE|EPICERIE)\b/i, category: "Alimentation" },

  // Restaurants / Sorties (UBER EATS : tolère "UBER * EATS", "UBER*EATS", etc.)
  { pattern: /\b(DELIVEROO|UBER\s*\*?\s*EATS|UBEREATS|FRICHTI|JUST EAT|TOO GOOD TO GO|GLOVO)\b/i, category: "Restaurants / Sorties" },
  { pattern: /\b(STARBUCKS|COLUMBUS|MCDO|MCDONALD|BURGER|KFC|SUBWAY|DOMINO|PIZZA|BRASSERIE|RESTAURANT|CAFE|SANDWICH|SALADE)\b/i, category: "Restaurants / Sorties" },

  // Transport (UBER hors UBER EATS)
  { pattern: /\b(SNCF|OUIGO|TRAINLINE|RATP|VELIB|BLABLACAR|FLIXBUS|LIME|DOTT|FREE2MOVE)\b/i, category: "Transport" },
  { pattern: /\bUBER\b(?!\s*\*?\s*EATS)/i, category: "Transport" },
  { pattern: /\b(AUTOROUTE|PEAGE|TOTAL|SHELL|BP|ESSO|AVIA|ELAN|STATION)\b/i, category: "Transport" },

  // Abonnements
  { pattern: /\b(NETFLIX|SPOTIFY|DEEZER|DISNEY|APPLE\.COM|APPLE MUSIC|ICLOUD|GOOGLE\s?(ONE|STORAGE|PLAY)|MICROSOFT|CANAL\+|MOLOTOV|HBO|PRIME VIDEO|AMAZON PRIME)\b/i, category: "Abonnements" },
  { pattern: /\b(ORANGE|SFR|FREE MOBILE|FREE TELECOM|BOUYGUES|FREE SAS|SOSH|RED BY SFR)\b/i, category: "Abonnements" },
  { pattern: /\b(OPENAI|ANTHROPIC|CHATGPT|CLAUDE|GITHUB|CURSOR|LINEAR|NOTION|FIGMA|VERCEL)\b/i, category: "Abonnements" },

  // Santé
  { pattern: /\b(PHARMACIE|DOCTOLIB|MEDECIN|DENTISTE|LABO|OPTIC|MUTUELLE|HARMONIE|MSA)\b/i, category: "Santé" },

  // Shopping
  { pattern: /\b(AMAZON|AMZN|FNAC|DARTY|BOULANGER|LEROY MERLIN|CASTORAMA|IKEA|ZARA|H&M|UNIQLO|NIKE|ADIDAS|DECATHLON|SEPHORA|YVES ROCHER|SHEIN|VINTED|LEBONCOIN)\b/i, category: "Shopping" },

  // Loisirs
  { pattern: /\b(CINEMA|UGC|GAUMONT|MK2|PATHE|THEATRE|CONCERT|FESTIVAL|MUSEE|BASIC FIT|ONAIR|FITNESS PARK|PSG|STADE|TICKET)\b/i, category: "Loisirs" },

  // Frais bancaires / Assurances
  { pattern: /\b(FORTUNEO|BREDA|BNP|SOCIETE GENERALE|LCL|CREDIT AGRICOLE|HSBC|BOURSORAMA|N26|REVOLUT.*(FRAIS|COTIS)|GENERALI|AXA|MAIF|MATMUT|MACIF)\b/i, category: "Frais bancaires" },
];

/**
 * Catégorise une ligne brute Fortuneo. Retourne la catégorie unifiée.
 *
 * Logique :
 *   1. Self-transfers (pattern nom/prénom utilisateur) → "Transfert interne"
 *   2. Virements vers compte Fortuneo Bourse → "Investissement" (PEA par défaut)
 *   3. Patterns vendor (VENDOR_RULES) — priorité vendor > catégorie Fortuneo
 *   4. Fallback sur la catégorie Fortuneo mappée
 *   5. Fallback final : "À catégoriser"
 *
 * `userName` : le nom/prénom de l'utilisateur pour détecter les self-transfers
 * (défaut "SIMON VAGNIER" pour ce projet, mais laissé paramétrable).
 */
export function categorize(row: RawRow, userName = "SIMON VAGNIER"): string {
  const d1 = row.detail1?.toUpperCase() ?? "";
  const opType = row.opType?.toUpperCase() ?? "";

  // 1. Self-transfers explicites (nom de l'utilisateur dans le libellé)
  // Couvre "SIMON VAGNIER", "VAGNIER SIMON", "SIMON ALEXANDRE VAGNIER",
  // et cartes/comptes annexes "SIMON REVOLUT", "SIMON N26", etc.
  const userTokens = userName.toUpperCase().split(/\s+/);
  const hasAllTokens = userTokens.every((t) => d1.includes(t));
  const hasRevolutOrN26 = /SIMON\s+(REVOLUT|N26|LYDIA)/i.test(d1);
  if (hasAllTokens && !d1.includes("FORTUNEO")) return "Transfert interne";
  if (hasRevolutOrN26) return "Transfert interne";

  // 2. Virements vers son compte Fortuneo Bourse (PEA/PER/AV)
  // Signal typique : "SIMON VAGNIER FORTUNEO" ou mention explicite Fortuneo
  // Bourse / FORTUNEO SA. Par défaut on taggue "Investissement PEA" — c'est
  // de toute façon exclu du calcul des dépenses, et l'utilisateur peut
  // affiner via l'UI.
  if (hasAllTokens && d1.includes("FORTUNEO")) return "Investissement PEA";
  if (/\bFORTUNEO\s*(BOURSE|PEA|PER|SA)\b/i.test(d1)) return "Investissement PEA";

  // 3. Patterns vendor (priorité sur la catégorie Fortuneo qui est souvent imprécise)
  for (const rule of VENDOR_RULES) {
    if (rule.pattern.test(d1)) return rule.category;
  }

  // 4. Mapping des catégories Fortuneo connues
  const fc = row.fortuneoCategory?.trim() ?? "";
  if (fc && fc !== "A catégoriser") {
    const mapped = FORTUNEO_CAT_MAP[fc];
    if (mapped) return mapped;
    return fc; // garde tel quel si on ne connaît pas
  }

  // 5. Fallback sur le type d'opération pour donner un bucket approximatif
  if (/VIREMENT.*RECU/i.test(opType)) return "Autre revenu";
  if (/VIREMENT.*EMIS|PRELEVEMENT/i.test(opType)) return "Autre dépense";
  if (/COTISATION/i.test(opType)) return "Frais bancaires";
  if (/CARTE/i.test(opType)) return "Autre dépense";
  if (/ESPECE/i.test(opType)) return "Autre dépense";
  if (/CHEQUE/i.test(opType)) return row.amount > 0 ? "Autre revenu" : "Autre dépense";
  if (/INTERETS/i.test(opType)) return "Intérêts / Dividendes";
  if (/ADHESION/i.test(opType)) return "Frais bancaires";

  return "À catégoriser";
}

/**
 * Mapping des catégories Fortuneo natives vers notre taxonomie unifiée.
 */
const FORTUNEO_CAT_MAP: Record<string, string> = {
  "Alimentation": "Alimentation",
  "Loisirs": "Loisirs",
  "Transport": "Transport",
  "Santé": "Santé",
  "Abonnements": "Abonnements",
  "Shopping": "Shopping",
  "Restaurants": "Restaurants / Sorties",
  "Banque / Assurance": "Frais bancaires",
  "Banque/Assurance": "Frais bancaires",
  "Autres Dépenses": "Autre dépense",
  "Autres": "Autre dépense",
  "Autres Revenus": "Autre revenu",
  "Salaires": "Salaire",
  "Impôts": "Impôts / Taxes",
  "Impôts et taxes": "Impôts / Taxes",
};

/**
 * Détermine le type (income/expense) à partir du montant signé.
 * Les transferts internes gardent leur sens natif (un transfert peut être
 * entrant ou sortant), l'UI les traitera à part.
 */
export function inferType(amount: number): BudgetType {
  return amount >= 0 ? "income" : "expense";
}
