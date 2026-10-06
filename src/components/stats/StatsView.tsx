import React, { useMemo } from 'react';
import {
  Package,
  Scale,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Flame,
  Award,
  Hourglass,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { fmtG, fmtMoney, fmtMoney4, costPerGram } from '../../lib/roll';
import { DonutChart, type DonutSegment } from './DonutChart';
import { TreemapChart } from './TreemapChart';
import { ConsumptionChart } from './ConsumptionChart';
import { AnimatedNumber } from '../spool/AnimatedNumber';

const MATERIAL_COLORS: Record<string, string> = {
  PLA: '#38bdf8',
  'PLA+': '#0284c7',
  PETG: '#10b981',
  ABS: '#f59e0b',
  ASA: '#ec4899',
  TPU: '#84cc16',
  Nylon: '#8b5cf6',
  PC: '#f43f5e',
  HIPS: '#64748b',
  PVA: '#a855f7',
  'PLA-CF': '#334155',
  Otro: '#94a3b8',
};

const BRAND_PALETTE = [
  '#b9ec4a',
  '#38bdf8',
  '#f59e0b',
  '#a855f7',
  '#f43f5e',
  '#10b981',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#e2e8f0',
];

export function StatsView() {
  const rolls = useStore((s) => s.rolls);
  const usage = useStore((s) => s.usage);
  const settings = useStore((s) => s.settings);

  // Key stats
  const totalRolls = rolls.length;
  const totalGrams = useMemo(() => rolls.reduce((acc, r) => acc + r.remainingWeight, 0), [rolls]);
  const totalValue = useMemo(() => {
    return rolls.reduce((acc, r) => {
      const frac = r.initialWeight > 0 ? r.remainingWeight / r.initialWeight : 0;
      return acc + r.price * frac;
    }, 0);
  }, [rolls]);

  const avgCostPerGram = useMemo(() => {
    let sumCost = 0;
    let count = 0;
    rolls.forEach((r) => {
      if (r.initialWeight > 0 && r.price > 0) {
        sumCost += costPerGram(r);
        count++;
      }
    });
    return count > 0 ? sumCost / count : 0;
  }, [rolls]);

  // Donut data: By Material
  const materialData: DonutSegment[] = useMemo(() => {
    const map = new Map<string, number>();
    rolls.forEach((r) => {
      map.set(r.material, (map.get(r.material) || 0) + r.remainingWeight);
    });
    return Array.from(map.entries())
      .map(([mat, grams]) => ({
        id: mat,
        label: mat,
        value: grams,
        color: MATERIAL_COLORS[mat] || '#94a3b8',
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [rolls]);

  // Donut data: By Brand
  const brandData: DonutSegment[] = useMemo(() => {
    const map = new Map<string, number>();
    rolls.forEach((r) => {
      map.set(r.brand, (map.get(r.brand) || 0) + r.remainingWeight);
    });
    return Array.from(map.entries())
      .map(([brand, grams], idx) => ({
        id: brand,
        label: brand,
        value: grams,
        color: BRAND_PALETTE[idx % BRAND_PALETTE.length],
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [rolls]);

  // Most used rolls
  const mostUsed = useMemo(() => {
    const map = new Map<string, number>();
    usage.forEach((u) => {
      map.set(u.rollId, (map.get(u.rollId) || 0) + u.grams);
    });
    return Array.from(map.entries())
      .map(([rollId, grams]) => ({
        roll: rolls.find((r) => r.id === rollId),
        grams,
      }))
      .filter((x): x is { roll: (typeof rolls)[0]; grams: number } => Boolean(x.roll))
      .sort((a, b) => b.grams - a.grams)
      .slice(0, 5);
  }, [rolls, usage]);

  // Projections: Estimated prints left / days left based on 30-day usage rate
  const projections = useMemo(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;
    const recentUsageByRoll = new Map<string, number>();

    usage.forEach((u) => {
      const t = new Date(u.at).getTime();
      if (t >= thirtyDaysAgo) {
        recentUsageByRoll.set(u.rollId, (recentUsageByRoll.get(u.rollId) || 0) + u.grams);
      }
    });

    return rolls
      .filter((r) => r.remainingWeight > 0)
      .map((r) => {
        const gramsMonth = recentUsageByRoll.get(r.id) || 0;
        const dailyRate = gramsMonth / 30; // g/día
        const daysLeft = dailyRate > 0 ? Math.round(r.remainingWeight / dailyRate) : null;
        return {
          roll: r,
          dailyRate,
          daysLeft,
        };
      })
      .filter((p) => p.daysLeft !== null && p.daysLeft < 60)
      .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999))
      .slice(0, 5);
  }, [rolls, usage]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 workbench-bg">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-surface-1 border border-line shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-surface-2 border border-line flex items-center justify-center text-accent-text">
            <Package size={20} />
          </div>
          <div>
            <span className="text-[11px] font-mono text-muted uppercase tracking-wider block">
              Bobinas en taller
            </span>
            <div className="text-xl font-mono font-bold text-text tabular">
              <AnimatedNumber value={totalRolls} />
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-1 border border-line shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-surface-2 border border-line flex items-center justify-center text-ok">
            <Scale size={20} />
          </div>
          <div>
            <span className="text-[11px] font-mono text-muted uppercase tracking-wider block">
              Filamento disponible
            </span>
            <div className="text-xl font-mono font-bold text-text tabular">
              <AnimatedNumber value={totalGrams} format={fmtG} />
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-1 border border-line shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-surface-2 border border-line flex items-center justify-center text-warn">
            <DollarSign size={20} />
          </div>
          <div>
            <span className="text-[11px] font-mono text-muted uppercase tracking-wider block">
              Valor del inventario
            </span>
            <div className="text-xl font-mono font-bold text-text tabular">
              <AnimatedNumber
                value={totalValue}
                format={(v) => fmtMoney(v, settings.currency)}
              />
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-1 border border-line shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-surface-2 border border-line flex items-center justify-center text-faint">
            <TrendingUp size={20} />
          </div>
          <div>
            <span className="text-[11px] font-mono text-muted uppercase tracking-wider block">
              Costo medio / gramo
            </span>
            <div className="text-xl font-mono font-bold text-text tabular">
              {fmtMoney4(avgCostPerGram, settings.currency)}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Global Donut Disk Charts (Material & Brand) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs flex flex-col items-center">
          <h3 className="font-display font-bold text-base text-text mb-2 self-start">
            Distribución por Material
          </h3>
          <DonutChart data={materialData} title="Por Material" />
        </div>

        <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs flex flex-col items-center">
          <h3 className="font-display font-bold text-base text-text mb-2 self-start">
            Distribución por Marca
          </h3>
          <DonutChart data={brandData} title="Por Marca" />
        </div>
      </div>

      {/* Treemap (Material -> Brand -> Roll) */}
      <TreemapChart rolls={rolls} />

      {/* Consumption over time chart */}
      <ConsumptionChart usage={usage} />

      {/* Rankings & Projections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Most used rolls */}
        <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Award size={18} className="text-accent-text" />
            <h3 className="font-display font-bold text-base text-text">
              Rollos con más impresiones
            </h3>
          </div>

          {mostUsed.length === 0 ? (
            <p className="text-xs text-faint py-4">Aún no hay registros de consumo.</p>
          ) : (
            <div className="space-y-2">
              {mostUsed.map(({ roll, grams }, i) => (
                <div
                  key={roll.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-surface-2/60 border border-line text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-md bg-surface-1 border border-line flex items-center justify-center font-mono font-bold text-[10px] text-muted">
                      #{i + 1}
                    </span>
                    <span
                      className="w-3 h-3 rounded-full border border-line"
                      style={{ backgroundColor: roll.colorHex }}
                    />
                    <div>
                      <span className="font-medium text-text block truncate max-w-[150px]">
                        {roll.colorName}
                      </span>
                      <span className="text-[10px] text-faint">
                        {roll.brand} · {roll.material}
                      </span>
                    </div>
                  </div>

                  <span className="font-mono font-bold text-accent-text tabular">
                    {fmtG(grams)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Projections */}
        <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Hourglass size={18} className="text-warn" />
            <h3 className="font-display font-bold text-base text-text">
              Proyección de agotamiento
            </h3>
          </div>

          {projections.length === 0 ? (
            <p className="text-xs text-faint py-4">
              Ningún rollo está próximo a agotarse según el ritmo de uso de los últimos 30 días.
            </p>
          ) : (
            <div className="space-y-2">
              {projections.map(({ roll, daysLeft, dailyRate }) => (
                <div
                  key={roll.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-surface-2/60 border border-line text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3 h-3 rounded-full border border-line"
                      style={{ backgroundColor: roll.colorHex }}
                    />
                    <div>
                      <span className="font-medium text-text block truncate max-w-[150px]">
                        {roll.colorName}
                      </span>
                      <span className="text-[10px] text-faint">
                        Quedan {fmtG(roll.remainingWeight)} (~{dailyRate.toFixed(1)} g/día)
                      </span>
                    </div>
                  </div>

                  <span
                    className={`font-mono font-bold px-2 py-0.5 rounded-md ${
                      (daysLeft ?? 99) <= 7
                        ? 'bg-crit-soft text-crit-text'
                        : 'bg-warn-soft text-warn-text'
                    }`}
                  >
                    ~{daysLeft} días
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
