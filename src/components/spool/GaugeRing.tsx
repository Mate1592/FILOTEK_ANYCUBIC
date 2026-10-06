import { motion, useReducedMotion, useSpring } from 'motion/react';
import { memo, useEffect } from 'react';
import { clamp, type StockLevel } from '../../lib/roll';
import { spring } from '../../lib/motion';

interface GaugeRingProps {
  /** 0 a 100 */
  percent: number;
  level: StockLevel;
  size?: number;
  strokeWidth?: number;
  className?: string;
  showTrack?: boolean;
}

export const GaugeRing = memo(function GaugeRing({
  percent,
  level,
  size = 56,
  strokeWidth = 5,
  className = '',
  showTrack = true,
}: GaugeRingProps) {
  const reduce = useReducedMotion();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safePct = clamp(percent, 0, 100);

  // Offset del stroke-dashoffset: 0% = circumference, 100% = 0
  const targetOffset = circumference - (safePct / 100) * circumference;

  const animatedOffset = useSpring(circumference, spring.fill);

  useEffect(() => {
    if (reduce) {
      animatedOffset.jump(targetOffset);
    } else {
      animatedOffset.set(targetOffset);
    }
  }, [targetOffset, reduce, animatedOffset]);

  const strokeColor =
    level === 'critical'
      ? 'var(--crit)'
      : level === 'low'
      ? 'var(--warn)'
      : level === 'empty'
      ? 'var(--text-faint)'
      : 'var(--accent)';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`rotate-[-90deg] ${className}`}
      aria-hidden="true"
    >
      {showTrack && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth={strokeWidth}
          opacity={0.3}
        />
      )}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        style={{ strokeDashoffset: animatedOffset }}
        strokeLinecap="round"
      />
    </svg>
  );
});
