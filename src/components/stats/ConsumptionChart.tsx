import React, { useMemo, useState } from 'react';
import { area, line, curveMonotoneX } from 'd3-shape';
import type { UsageEntry } from '../../shared/types';
import { fmtDate, fmtG } from '../../lib/roll';

interface ConsumptionChartProps {
  usage: UsageEntry[];
  height?: number;
}

export function ConsumptionChart({ usage, height = 220 }: ConsumptionChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Group usage by date (YYYY-MM-DD)
  const chartData = useMemo(() => {
    if (usage.length === 0) return [];
    const map = new Map<string, number>();
    usage.forEach((u) => {
      const d = u.at.slice(0, 10);
      map.set(d, (map.get(d) || 0) + u.grams);
    });

    const entries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    // Take the last 14 active days or fill gaps
    return entries.slice(-14).map(([date, grams]) => ({ date, grams }));
  }, [usage]);

  const width = 640;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };

  const { points, maxGrams, pathArea, pathLine } = useMemo(() => {
    if (chartData.length < 2) {
      return { points: [], maxGrams: 0, pathArea: '', pathLine: '' };
    }
    const maxG = Math.max(...chartData.map((d) => d.grams), 50);
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const pts = chartData.map((d, i) => {
      const x = padding.left + (i / (chartData.length - 1)) * innerW;
      const y = padding.top + innerH - (d.grams / maxG) * innerH;
      return { x, y, ...d };
    });

    const areaGen = area<(typeof pts)[0]>()
      .x((d) => d.x)
      .y0(height - padding.bottom)
      .y1((d) => d.y)
      .curve(curveMonotoneX);

    const lineGen = line<(typeof pts)[0]>()
      .x((d) => d.x)
      .y((d) => d.y)
      .curve(curveMonotoneX);

    return {
      points: pts,
      maxGrams: maxG,
      pathArea: areaGen(pts) || '',
      pathLine: lineGen(pts) || '',
    };
  }, [chartData, height, width, padding]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-xs text-faint">
        Sin impresiones registradas en el tiempo.
      </div>
    );
  }

  const activePoint = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div className="relative w-full rounded-2xl border border-line bg-surface-1 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-muted uppercase tracking-wider">
          Consumo de filamento en el tiempo
        </span>
        {activePoint ? (
          <span className="text-xs font-mono text-accent-text font-bold">
            {fmtDate(activePoint.date)}: {fmtG(activePoint.grams)}
          </span>
        ) : (
          <span className="text-xs font-mono text-faint">
            Últimos registros
          </span>
        )}
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto max-h-[220px] overflow-visible"
        >
          <defs>
            <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.0} />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            stroke="var(--line-strong)"
            strokeWidth={1}
          />

          {/* Area & Line */}
          {pathArea && <path d={pathArea} fill="url(#area-grad)" />}
          {pathLine && (
            <path
              d={pathLine}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          )}

          {/* Points */}
          {points.map((p, i) => (
            <g key={i} className="cursor-pointer">
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredIdx === i ? 6 : 3.5}
                fill={hoveredIdx === i ? 'var(--accent-strong)' : 'var(--accent)'}
                stroke="var(--elevated)"
                strokeWidth={2}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
