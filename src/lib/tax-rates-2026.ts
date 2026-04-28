/**
 * Constantes fiscales France 2026.
 *
 * Source LFSS 2026 + barème IR 2026 :
 *   - Hausse CSG +1.4 pt → PS sur revenus mobiliers passe de 17.2% à 18.6%
 *   - PFU général : 12.8% IR + 18.6% PS = 31.4% (vs 30% avant 2026)
 *   - Exception : Assurance-vie garde 17.2% PS (PFU AV reste 30%)
 *   - PASS 2026 : 48 060 €
 *   - Barème IR 2026 (revenus 2025) inchangé : 0/11/30/41/45%
 *
 * Ces constantes sont volontairement isolées dans leur propre fichier pour
 * faciliter la mise à jour annuelle (ou en cas de PLF rectificative).
 */

export const TAX_YEAR = 2026;

// === Prélèvements sociaux ===
export const SOCIAL_RATE_GENERAL = 0.186; // 18.6% : PEA, CTO, crypto, PER...
export const SOCIAL_RATE_LIFE_INSURANCE = 0.172; // 17.2% : AV (régime spécial maintenu)

// === Impôt sur le revenu : prélèvement forfaitaire ===
export const PFU_IR_RATE = 0.128; // 12.8% : composante IR du PFU

// PFU complet selon le support
export const PFU_GENERAL = PFU_IR_RATE + SOCIAL_RATE_GENERAL; // 31.4%
export const PFU_LIFE_INSURANCE = PFU_IR_RATE + SOCIAL_RATE_LIFE_INSURANCE; // 30%

// === Barème IR 2026 (revenus 2025) — par part de quotient familial ===
export interface TaxBracket {
  upTo: number; // borne haute, Infinity pour la dernière
  rate: number;
}
export const IR_BRACKETS_2026: TaxBracket[] = [
  { upTo: 11_600, rate: 0 },
  { upTo: 29_579, rate: 0.11 },
  { upTo: 84_577, rate: 0.30 },
  { upTo: 181_917, rate: 0.41 },
  { upTo: Infinity, rate: 0.45 },
];

// === Plan Épargne en Actions ===
export const PEA_VERSEMENTS_PLAFOND = 150_000; // plafond versements PEA
export const PEA_PME_PLAFOND = 75_000;
export const PEA_DUREE_FISCAL = 5; // années avant exonération IR

// Avant 5 ans : plus-value taxée au PFU + clôture forcée
// Après 5 ans : exonération IR, PS uniquement (taux général)
export const PEA_RATE_BEFORE_5Y = PFU_GENERAL;
export const PEA_RATE_AFTER_5Y = SOCIAL_RATE_GENERAL;

// === Assurance-vie ===
export const AV_DUREE_AVANTAGE = 8; // années avant abattement annuel
export const AV_ABATTEMENT_SINGLE = 4_600;
export const AV_ABATTEMENT_COUPLE = 9_200;
export const AV_PFL_RATE = 0.075; // 7.5% IR sur tranche jusqu'à 150k versés (après 8 ans)
export const AV_PFL_THRESHOLD = 150_000; // versements cumulés au-delà desquels la fraction passe à 12.8%
// Avant 8 ans : PFU AV (30%)
// Après 8 ans, hors abattement, jusqu'à 150k versés : 7.5% IR + 17.2% PS = 24.7%
// Après 8 ans, hors abattement, au-delà de 150k versés : 12.8% IR + 17.2% PS = 30%

// === Crypto-actifs ===
export const CRYPTO_ABATTEMENT_ANNUEL = 305; // PV cumulées <305€/an exonérées
// Sinon PFU général 31.4% (idem CTO)

// === PASS & Plan Épargne Retraite ===
export const PASS_2026 = 48_060;
export const PER_PLANCHER = Math.round(0.10 * PASS_2026); // 4 806 € (en réalité 10% du PASS N-1)
export const PER_PLAFOND_REVENU_RATE = 0.10; // 10% des revenus pro N-1
export const PER_PLAFOND_MAX = 8 * PASS_2026; // 8 PASS = 384 480 €

// === Quotient familial (parts) ===
export type CivilStatus = "single" | "married" | "civil_union";
export function defaultParts(status: CivilStatus, dependents = 0): number {
  const base = status === "single" ? 1 : 2;
  return base + dependents * 0.5;
}

// === Helpers ===

/**
 * Calcule l'IR brut selon le barème pour un revenu net imposable et un nombre
 * de parts. Renvoie {tax, marginalRate}. Le calcul se fait sur le quotient
 * (revenu / parts), puis multiplié par parts.
 */
export function computeIR(
  taxableIncome: number,
  parts: number = 1,
  brackets = IR_BRACKETS_2026
): { tax: number; marginalRate: number } {
  if (taxableIncome <= 0 || parts <= 0) return { tax: 0, marginalRate: 0 };
  const perPart = taxableIncome / parts;
  let perPartTax = 0;
  let marginalRate = 0;
  let lastUpTo = 0;
  for (const b of brackets) {
    if (perPart > lastUpTo) {
      const slice = Math.min(perPart, b.upTo) - lastUpTo;
      perPartTax += slice * b.rate;
      marginalRate = b.rate;
      lastUpTo = b.upTo;
      if (perPart <= b.upTo) break;
    }
  }
  return { tax: perPartTax * parts, marginalRate };
}

/**
 * Plafond PER déductible pour un salarié : 10% des revenus pro N-1, plancher
 * 10% du PASS N, plafond 8 fois le PASS N.
 */
export function perDeductionLimit(annualIncome: number): number {
  const tenPercent = annualIncome * PER_PLAFOND_REVENU_RATE;
  return Math.min(PER_PLAFOND_MAX, Math.max(PER_PLANCHER, tenPercent));
}

/**
 * Économie d'IR estimée pour un versement PER. Approximation : on suppose que
 * le versement réduit le revenu imposable au TMI courant (sans descendre de
 * tranche). Pour un calcul exact, il faudrait recomputer l'IR avant/après.
 */
export function perTaxSavings(
  versement: number,
  annualIncome: number,
  parts = 1
): { savings: number; effectiveRate: number } {
  const before = computeIR(annualIncome, parts);
  const after = computeIR(Math.max(0, annualIncome - versement), parts);
  const savings = before.tax - after.tax;
  return {
    savings,
    effectiveRate: versement > 0 ? savings / versement : 0,
  };
}
