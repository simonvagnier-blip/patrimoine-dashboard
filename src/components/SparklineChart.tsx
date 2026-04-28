"use client";

import { useEffect, useState } from "react";

interface ChartPoint {
  date: string;
  close: number;
}

export default function SparklineChart({
  ticker,
  width = 64,
  height = 24,
}: {
  ticker: string;
  width?: number;
  height?: number;
}) {
  const [points, setPoints] = useState<ChartPoint[]>([]);

  useEffect(() => {
    if (!ticker) return;
    fetch(`/api/chart?ticker=${encodeURIComponent(ticker)}&range=1mo`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ChartPoint[]) => setPoints(data))
      .catch(() => {});
  }, [ticker]);

  if (points.length < 2) return null;

  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const isUp = closes[closes.length - 1] >= closes[0];
  const color = isUp ? "#34d399" : "#f87171";

  // Build SVG polyline points
  const svgPoints = closes
    .map((v, i) => {
      const x = (i / (closes.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={svgPoints}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
