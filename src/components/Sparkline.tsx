/**
 * Mini-courbe SVG légère (pas de lib de chart) pour les cartes d'enveloppe.
 * Dessine la série normalisée min→max ; ligne plate si la série est constante.
 */
export default function Sparkline({
  data,
  width = 64,
  height = 26,
  stroke = "#34d399",
  strokeWidth = 1.8,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  className?: string;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const pad = strokeWidth; // évite que la ligne soit rognée aux extrêmes
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y =
        range === 0
          ? height / 2
          : pad + (1 - (v - min) / range) * (height - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
