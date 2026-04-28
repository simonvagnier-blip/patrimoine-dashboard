"use client";

/**
 * Small visual badge for the annualized TRI (xirr).
 *
 * Handles the three states returned by /api/returns:
 *   - tri_annual is a number → colored % with + sign
 *   - tri_annual is null AND cashflow_count === 0 → greyed "—" with tooltip
 *     prompting the user to register operations
 *   - tri_annual is null BUT cashflow_count > 0 (xirr failed to converge, rare
 *     with contradictory cashflows) → warning badge
 */
export function TriBadge({
  tri,
  cashflowCount,
  coverage,
  size = "sm",
}: {
  tri: number | null;
  cashflowCount: number;
  coverage?: "full" | "partial" | "none";
  size?: "xs" | "sm" | "md";
}) {
  const sizeClass =
    size === "xs" ? "text-[10px]" : size === "md" ? "text-sm" : "text-xs";

  if (tri === null) {
    if (cashflowCount === 0) {
      return (
        <span
          className={`${sizeClass} text-gray-600 font-[family-name:var(--font-jetbrains)]`}
          title="Enregistre tes versements et achats dans le journal d'opérations pour calculer le vrai TRI"
        >
          TRI —
        </span>
      );
    }
    return (
      <span
        className={`${sizeClass} text-amber-500 font-[family-name:var(--font-jetbrains)]`}
        title="Le TRI n'a pas pu être calculé (cashflows incohérents)"
      >
        TRI ?
      </span>
    );
  }

  const pct = tri * 100;
  const color =
    pct >= 0 ? "text-emerald-400" : "text-red-400";
  const coverageHint =
    coverage === "partial"
      ? " · ⚠"
      : coverage === "none"
        ? " · partiel"
        : "";

  return (
    <span
      className={`${sizeClass} ${color} font-[family-name:var(--font-jetbrains)]`}
      title={
        coverage === "partial"
          ? "Attention : les opérations enregistrées ne reconstituent pas exactement la quantité actuelle"
          : `TRI annualisé (xirr) basé sur ${cashflowCount} opération${cashflowCount > 1 ? "s" : ""}`
      }
    >
      TRI {pct >= 0 ? "+" : ""}
      {pct.toFixed(1)}%/an
      {coverageHint}
    </span>
  );
}
