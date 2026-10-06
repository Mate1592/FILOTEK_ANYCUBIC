import { motion, useReducedMotion } from 'motion/react';
import { memo } from 'react';
import { fmtGRaw, type StockLevel } from '../../lib/roll';

interface CapacityBarProps {
  remaining: number;
  initial: number;
  percent: number;
  level: StockLevel;
  className?: string;
}

export const CapacityBar = memo(function CapacityBar({
  remaining,
  initial,
  percent,
  level,
  className = '',
}: CapacityBarProps) {
  const reduce = useReducedMotion();
  const used = Math.max(0, initial - remaining);

  const barColor =
    level === 'critical'
      ? 'var(--crit)'
      : level === 'low'
      ? 'var(--warn)'
      : level === 'empty'
      ? 'var(--text-faint)'
      : 'var(--accent)';

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      <div className="flex justify-between items-center text-[11px] font-mono text-muted">
        <span>Restante: {fmtGRaw(remaining)}g</span>
        <span>Usado: {fmtGRaw(used)}g</span>
      </div>
      <div className="h-1.5 w-full bg-surface-3 rounded-full overflow-hidden flex relative">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: barColor }}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
});
