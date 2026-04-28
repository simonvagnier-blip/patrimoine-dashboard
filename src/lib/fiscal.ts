import { db, schema } from "@/lib/db";
import { loadPortfolioState } from "@/lib/portfolio-state";
import {
  AV_ABATTEMENT_COUPLE,
  AV_ABATTEMENT_SINGLE,
  AV_DUREE_AVANTAGE,
  AV_PFL_RATE,
  AV_PFL_THRESHOLD,
  CRYPTO_ABATTEMENT_ANNUEL,
  computeIR,
  defaultParts,
  PEA_DUREE_FISCAL,
  PEA_RATE_AFTER_5Y,
  PEA_RATE_BEFORE_5Y,
  PEA_VERSEMENTS_PLAFOND,
  perDeductionLimit,
  perTaxSavings,
  PFU_GENERAL,
  PFU_IR_RATE,
  PFU_LIFE_INSURANCE,
  SOCIAL_RATE_GENERAL,
  SOCIAL_RATE_LIFE_INSURANCE,
  TAX_YEAR,
  type CivilStatus,
} from "@/lib/tax-rates-2026";

/**
 * LOT 3 — Moteur d'analyse fiscale.
 *
 * Calcule pour chaque enveloppe :
 *   - PV latente (current_value - cost_basis pour les positions cotées)
 *   - Imposition estimée si liquidation totale aujourd'hui (en tenant compte
 *     du régime fiscal de l'enveloppe + du profil de l'utilisateur : durée
 *     d'ouverture, situation matrimoniale)
 *
 * Calcule aussi des recommandations actionnables :
 *   - Plafond PER restant + économie IR estimée d'un versement complémentaire
 *   - Plafond PEA versé/restant
 *   - Warning sortie PEA <5 ans
 *   - Impact estimé du mariage planifié
 */

export interface FiscalProfile {
  current_age: number;
  retire_age: number;
  annual_income: number;
  civil_status: CivilStatus;
  num_parts: number;
  marriage_year: number | null;
  spouse_income: number;
  pea_open_year: number | null;
  pea_versements_cumules: number | null; // si saisi manuellement (sinon dérivé du journal d'op)
  per_versements_annee_courante: number;
  av_open_years: Record<string, number>; // envelope_id -> année d'ouverture
  av_versements_cumules: Record<string, number>; // envelope_id -> total versé
}

export const DEFAULT_PROFILE: FiscalProfile = {
  current_age: 32,
  retire_age: 64,
  annual_income: 120_000,
  civil_status: "single",
  num_parts: 1,
  marriage_year: null,
  spouse_income: 0,
  pea_open_year: null,
  pea_versements_cumules: null,
  per_versements_annee_courante: 0,
  av_open_years: {},
  av_versements_cumules: {},
};

export interface EnvelopeFiscal {
  envelope_id: string;
  envelope_name: string;
  envelope_type: string;
  current_value_eur: number;
  cost_basis_eur: number; // base imposable de calcul des PV
  unrealized_gain_eur: number; // PV latente
  // Estimation impôt + PS si liquidation totale TODAY
  liquidation_tax_eur: number;
  liquidation_breakdown: {
    ir_eur: number;
    ps_eur: number;
    rate_pct: number;
    note: string;
  };
}

export interface FiscalSummary {
  fetched_at: string;
  tax_year: number;
  profile: FiscalProfile;
  ir_baseline: { tax: number; marginal_rate: number };
  envelopes: EnvelopeFiscal[];
  totals: {
    current_value_eur: number;
    cost_basis_eur: number;
    unrealized_gain_eur: number;
    liquidation_tax_eur: number;
  };
  per: {
    deduction_limit_eur: number;
    used_eur: number;
    remaining_eur: number;
    tax_savings_if_max_eur: number;
    effective_savings_rate: number;
  };
  pea: {
    plafond_versements_eur: number;
    versements_cumules_eur: number | null;
    remaining_eur: number | null;
    open_year: number | null;
    years_open: number | null;
    fiscal_unlocked: boolean;
    note: string;
  };
  marriage_impact: {
    planned_year: number | null;
    current_ir: number;
    married_ir_estimate: number;
    annual_savings_eur: number;
    note: string;
  } | null;
  warnings: Array<{ severity: "warning" | "info" | "error"; title: string; detail: string }>;
  opportunities: Array<{ title: string; detail: string; eur_value: number }>;
}

function loadProfile(params: Record<string, string>, envelopes: { id: string; type: string }[]): FiscalProfile {
  const civil = (params.civilStatus as CivilStatus) || DEFAULT_PROFILE.civil_status;
  const parts = parseFloat(params.numParts || "") || defaultParts(civil);
  const av_open_years: Record<string, number> = {};
  const av_versements_cumules: Record<string, number> = {};
  for (const e of envelopes) {
    if (e.type === "av") {
      const yKey = `av_open_year_${e.id}`;
      const vKey = `av_versements_${e.id}`;
      if (params[yKey]) av_open_years[e.id] = parseInt(params[yKey]);
      if (params[vKey]) av_versements_cumules[e.id] = parseFloat(params[vKey]);
    }
  }
  return {
    current_age: parseInt(params.currentAge || "32"),
    retire_age: parseInt(params.retireAge || "64"),
    annual_income: parseFloat(params.annualIncome || "0") || DEFAULT_PROFILE.annual_income,
    civil_status: civil,
    num_parts: parts,
    marriage_year: params.marriageYear ? parseInt(params.marriageYear) : null,
    spouse_income: parseFloat(params.spouseIncome || "0"),
    pea_open_year: params.peaOpenYear ? parseInt(params.peaOpenYear) : null,
    pea_versements_cumules: params.peaVersements ? parseFloat(params.peaVersements) : null,
    per_versements_annee_courante: parseFloat(params.perVersementsCourants || "0"),
    av_open_years,
    av_versements_cumules,
  };
}

function envelopeFiscalFor(env: {
  id: string;
  name: string;
  type: string;
  total_value_eur: number;
  cost_basis_eur: number | null;
}, profile: FiscalProfile): EnvelopeFiscal {
  const cost = env.cost_basis_eur ?? env.total_value_eur;
  const gain = Math.max(0, env.total_value_eur - cost);

  let ir = 0;
  let ps = 0;
  let note = "";

  if (env.type === "livrets") {
    note = "Livrets réglementés : intérêts exonérés ou prélevés à la source.";
  } else if (env.type === "pea") {
    const yearsOpen = profile.pea_open_year
      ? Math.max(0, new Date().getFullYear() - profile.pea_open_year)
      : 0;
    const unlocked = yearsOpen >= PEA_DUREE_FISCAL;
    if (unlocked) {
      ps = gain * PEA_RATE_AFTER_5Y;
      note = `PEA >5 ans : exonération IR, PS ${(PEA_RATE_AFTER_5Y * 100).toFixed(1)}%.`;
    } else {
      ps = gain * SOCIAL_RATE_GENERAL;
      ir = gain * PFU_IR_RATE;
      note = `PEA <5 ans : PFU ${(PEA_RATE_BEFORE_5Y * 100).toFixed(1)}% + clôture forcée.`;
    }
  } else if (env.type === "av") {
    const openYear = profile.av_open_years[env.id];
    const yearsOpen = openYear ? Math.max(0, new Date().getFullYear() - openYear) : 0;
    const versements = profile.av_versements_cumules[env.id];
    const after8y = yearsOpen >= AV_DUREE_AVANTAGE;
    if (after8y) {
      const abattement =
        profile.civil_status === "single"
          ? AV_ABATTEMENT_SINGLE
          : AV_ABATTEMENT_COUPLE;
      const taxableGain = Math.max(0, gain - abattement);
      // Tranche IR : 7.5% pour la part jusqu'à 150k versés, 12.8% au-delà
      let irRate = AV_PFL_RATE;
      if (versements && versements > AV_PFL_THRESHOLD) {
        // Approximation : on prorate la PV taxable selon la part au-delà de 150k.
        const overShare = (versements - AV_PFL_THRESHOLD) / versements;
        irRate = AV_PFL_RATE * (1 - overShare) + PFU_IR_RATE * overShare;
      }
      ir = taxableGain * irRate;
      ps = gain * SOCIAL_RATE_LIFE_INSURANCE;
      note = `AV >8 ans : abattement ${abattement.toLocaleString("fr-FR")}€/an, IR ${(irRate * 100).toFixed(1)}% sur excédent + PS 17.2% sur tout.`;
    } else {
      ir = gain * PFU_IR_RATE;
      ps = gain * SOCIAL_RATE_LIFE_INSURANCE;
      note = `AV <8 ans : PFU ${(PFU_LIFE_INSURANCE * 100).toFixed(0)}% (PS 17.2% maintenu).`;
    }
  } else if (env.type === "per") {
    // PER en sortie : capital imposé à l'IR sur le revenu, PV imposée au PFU
    // Approximation simple : la totalité (capital + PV) imposable au TMI à la sortie.
    // On affiche juste la PS sur la PV pour le moment + un note.
    ps = gain * SOCIAL_RATE_LIFE_INSURANCE; // PS sur PV au PFU AV
    ir = 0; // calculé hors snapshot fiscal de liquidation
    note = "PER : capital imposable à la TMI en sortie, PV au PFU AV. Estimation simplifiée.";
  } else if (env.type === "crypto") {
    const taxableGain = Math.max(0, gain - CRYPTO_ABATTEMENT_ANNUEL);
    ir = taxableGain * PFU_IR_RATE;
    ps = taxableGain * SOCIAL_RATE_GENERAL;
    note = `Crypto : PFU 31.4% sur PV, abattement annuel 305€.`;
  } else if (env.type === "cto") {
    ir = gain * PFU_IR_RATE;
    ps = gain * SOCIAL_RATE_GENERAL;
    note = `CTO : PFU ${(PFU_GENERAL * 100).toFixed(1)}%.`;
  } else {
    note = "Régime fiscal non défini.";
  }

  return {
    envelope_id: env.id,
    envelope_name: env.name,
    envelope_type: env.type,
    current_value_eur: round2(env.total_value_eur),
    cost_basis_eur: round2(cost),
    unrealized_gain_eur: round2(gain),
    liquidation_tax_eur: round2(ir + ps),
    liquidation_breakdown: {
      ir_eur: round2(ir),
      ps_eur: round2(ps),
      rate_pct: gain > 0 ? round2(((ir + ps) / gain) * 100, 2) : 0,
      note,
    },
  };
}

export async function computeFiscalSummary(): Promise<FiscalSummary> {
  const [state, paramRows] = await Promise.all([
    loadPortfolioState(),
    db.select().from(schema.userParams).all(),
  ]);
  const params = Object.fromEntries(paramRows.map((p) => [p.key, p.value]));
  const profile = loadProfile(
    params,
    state.envelopes.map((e) => ({ id: e.id, type: e.type }))
  );

  const ir_baseline = computeIR(profile.annual_income + profile.spouse_income, profile.num_parts);

  const envFiscalArr = state.envelopes.map((e) =>
    envelopeFiscalFor(
      {
        id: e.id,
        name: e.name,
        type: e.type,
        total_value_eur: e.total_value_eur,
        cost_basis_eur: e.cost_basis_eur,
      },
      profile
    )
  );

  const totals = envFiscalArr.reduce(
    (acc, e) => {
      acc.current_value_eur += e.current_value_eur;
      acc.cost_basis_eur += e.cost_basis_eur;
      acc.unrealized_gain_eur += e.unrealized_gain_eur;
      acc.liquidation_tax_eur += e.liquidation_tax_eur;
      return acc;
    },
    {
      current_value_eur: 0,
      cost_basis_eur: 0,
      unrealized_gain_eur: 0,
      liquidation_tax_eur: 0,
    }
  );

  // PER
  const perLimit = perDeductionLimit(profile.annual_income);
  const perRemaining = Math.max(0, perLimit - profile.per_versements_annee_courante);
  const perSavings = perTaxSavings(perRemaining, profile.annual_income, profile.num_parts);

  // PEA
  const peaOpenYears =
    profile.pea_open_year !== null
      ? Math.max(0, new Date().getFullYear() - profile.pea_open_year)
      : null;
  const peaUnlocked = peaOpenYears !== null && peaOpenYears >= PEA_DUREE_FISCAL;
  const peaRemaining =
    profile.pea_versements_cumules !== null
      ? Math.max(0, PEA_VERSEMENTS_PLAFOND - profile.pea_versements_cumules)
      : null;

  // Mariage : recompute IR avec parts conjoint
  let marriage_impact: FiscalSummary["marriage_impact"] = null;
  if (profile.marriage_year && profile.civil_status === "single") {
    const marriedIr = computeIR(
      profile.annual_income + profile.spouse_income,
      profile.num_parts >= 2 ? profile.num_parts : 2
    );
    marriage_impact = {
      planned_year: profile.marriage_year,
      current_ir: round2(ir_baseline.tax),
      married_ir_estimate: round2(marriedIr.tax),
      annual_savings_eur: round2(ir_baseline.tax - marriedIr.tax),
      note: `Estimation à revenus inchangés (${profile.annual_income.toLocaleString("fr-FR")}€) + conjoint à ${profile.spouse_income.toLocaleString("fr-FR")}€/an. Quotient familial passe de 1 à 2 parts.`,
    };
  }

  // Warnings & opportunités
  const warnings: FiscalSummary["warnings"] = [];
  const opportunities: FiscalSummary["opportunities"] = [];

  if (profile.pea_open_year && !peaUnlocked) {
    warnings.push({
      severity: "warning",
      title: "PEA encore en période fiscale",
      detail: `Ouvert en ${profile.pea_open_year} (${peaOpenYears} an${peaOpenYears! > 1 ? "s" : ""}). Toute sortie avant ${profile.pea_open_year + PEA_DUREE_FISCAL} entraîne PFU 31.4% + clôture.`,
    });
  }
  if (peaRemaining !== null && peaRemaining < 10_000 && peaRemaining > 0) {
    warnings.push({
      severity: "info",
      title: "Plafond PEA bientôt atteint",
      detail: `Reste ${peaRemaining.toLocaleString("fr-FR")}€ versables sur le PEA (plafond 150k).`,
    });
  }
  if (perRemaining > 100) {
    opportunities.push({
      title: `Verser ${perRemaining.toLocaleString("fr-FR")}€ sur le PER`,
      detail: `Économie d'IR estimée ${perSavings.savings.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}€ (TMI ${(perSavings.effectiveRate * 100).toFixed(0)}%) avant le 31/12.`,
      eur_value: round2(perSavings.savings),
    });
  }
  if (marriage_impact && marriage_impact.annual_savings_eur > 1000) {
    opportunities.push({
      title: `Mariage prévu ${marriage_impact.planned_year}`,
      detail: `Économie d'IR annuelle estimée ${marriage_impact.annual_savings_eur.toLocaleString("fr-FR")}€ via le passage à 2 parts.`,
      eur_value: marriage_impact.annual_savings_eur,
    });
  }
  // AV proche de 8 ans
  for (const e of state.envelopes.filter((e) => e.type === "av")) {
    const oy = profile.av_open_years[e.id];
    if (oy) {
      const yo = new Date().getFullYear() - oy;
      if (yo >= 7 && yo < 8) {
        opportunities.push({
          title: `${e.name} : 8 ans dans ${8 - yo} an${8 - yo > 1 ? "s" : ""}`,
          detail: `Bientôt éligible à l'abattement annuel ${profile.civil_status === "single" ? "4 600" : "9 200"}€ sur les PV.`,
          eur_value: 0,
        });
      }
    }
  }

  return {
    fetched_at: state.fetched_at,
    tax_year: TAX_YEAR,
    profile,
    ir_baseline: { tax: round2(ir_baseline.tax), marginal_rate: ir_baseline.marginalRate },
    envelopes: envFiscalArr,
    totals: {
      current_value_eur: round2(totals.current_value_eur),
      cost_basis_eur: round2(totals.cost_basis_eur),
      unrealized_gain_eur: round2(totals.unrealized_gain_eur),
      liquidation_tax_eur: round2(totals.liquidation_tax_eur),
    },
    per: {
      deduction_limit_eur: perLimit,
      used_eur: profile.per_versements_annee_courante,
      remaining_eur: perRemaining,
      tax_savings_if_max_eur: round2(perSavings.savings),
      effective_savings_rate: round2(perSavings.effectiveRate, 4),
    },
    pea: {
      plafond_versements_eur: PEA_VERSEMENTS_PLAFOND,
      versements_cumules_eur: profile.pea_versements_cumules,
      remaining_eur: peaRemaining,
      open_year: profile.pea_open_year,
      years_open: peaOpenYears,
      fiscal_unlocked: peaUnlocked,
      note: peaUnlocked
        ? "PEA fiscalement avantageux : exonération IR, PS 18.6% sur PV uniquement."
        : profile.pea_open_year
          ? `Atteindra le seuil 5 ans en ${profile.pea_open_year + PEA_DUREE_FISCAL}.`
          : "Renseigne l'année d'ouverture du PEA pour activer l'analyse.",
    },
    marriage_impact,
    warnings,
    opportunities,
  };
}

function round2(n: number, d = 2): number {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}
