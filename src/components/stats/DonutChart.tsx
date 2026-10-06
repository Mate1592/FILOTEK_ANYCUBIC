import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useMemo } from 'react';
import { pie, arc, type PieArcDatum } from 'd3-shape';
import { AnimatedNumber } from '../spool/AnimatedNumber';
import { fmtG, fmtGRaw } from '../../lib/roll';

export interface DonutSegment {
  id: string;
  label: string;
  value: number; // gramos
  color: string;
}

interface DonutChartProps {
  data: DonutSegment[];
  size?: number;
  innerRadiusRatio?: number;
  title: string;
  unit?: string;
}

export function DonutChart({
  data,
  size = 260,
  innerRadiusRatio = 0.62,
  title,
  unit = 'g',
}: DonutChartProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const total = useMemo(() => data.reduce((acc, d) => acc + d.value, 0), [data]);

  const outerRadius = size / 2 - 12;
  const innerRadius = outerRadius * innerRadiusRatio;

  const pieGen = useMemo(() => {
    return pie<DonutSegment>()
      .value((d) => d.value)
      .sort(null)
      .padAngle(0.02);
  }, []);

  const arcGen = useMemo(() => {
    return arc<PieArcDatum<DonutSegment>>()
      .innerRadius(innerRadius)
      .outerRadius((d) => (hoveredId === d.data.id ? outerRadius + 8 : outerRadius))
      .cornerRadius(4);
  }, [innerRadius, outerRadius, hoveredId]);

  const arcs = useMemo(() => (total > 0 ? pieGen(data) : []), [data, total, pieGen]);

  const activeSegment = useMemo(
    () => data.find((d) => d.id === hoveredId) ?? null,
    [data, hoveredId],
  );

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-faint">
        Sin datos para mostrar en este gráfico.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`translate(${size / 2}, ${size / 2})`}>
            {arcs.map((a) => {
              const pathStr = arcGen(a) || '';
              const isHovered = hoveredId === a.data.id;
              return (
                <path
                  key={a.data.id}
                  d={pathStr}
                  fill={a.data.color}
                  opacity={hoveredId && !isHovered ? 0.45 : 1}
                  className="transition-all duration-200 cursor-pointer outline-none"
                  onMouseEnter={() => setHoveredId(a.data.id)}
                  onMouseLeave={() => setHoveredId(null)}
                />
              );
            })}
          </g>
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4 text-center">
          {activeSegment ? (
            <motion.div
              key={activeSegment.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
            >
              <span className="text-[11px] font-mono text-muted uppercase tracking-wider block truncate max-w-[120px]">
                {activeSegment.label}
              </span>
              <span className="font-mono text-lg font-bold text-text tabular block">
                {fmtG(activeSegment.value)}
              </span>
              <span className="text-[10px] text-faint font-mono">
                {Math.round((activeSegment.value / total) * 100)}% del total
              </span>
            </motion.div>
          ) : (
            <div>
              <span className="text-[11px] font-mono text-muted uppercase tracking-wider block">
                {title}
              </span>
              <span className="font-mono text-xl font-bold text-text tabular block">
                <AnimatedNumber value={total} format={fmtG} />
              </span>
              <span className="text-[10px] text-faint font-mono">
                {data.length} categorías
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Legend list below */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mt-3 max-w-sm text-xs">
        {data.slice(0, 6).map((item) => {
          const isHovered = hoveredId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-colors ${
                isHovered ? 'bg-surface-2 text-text font-bold' : 'text-muted hover:text-text'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate max-w-[90px]">{item.label}</span>
              <span className="font-mono text-[10px] text-faint">
                {Math.round((item.value / total) * 100)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
