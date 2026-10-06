import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect } from 'react';

interface Props {
  value: number;
  decimals?: number;
  className?: string;
  format?: (n: number) => string;
  duration?: number;
}

/** Número que "rueda" hasta su nuevo valor. Anima solo el texto, sin re-render de React. */
export function AnimatedNumber({ value, decimals = 0, className, format, duration = 0.9 }: Props) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) =>
    format ? format(v) : v.toLocaleString('es', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  );

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { duration, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [value, reduce, duration, mv]);

  return <motion.span className={className}>{text}</motion.span>;
}
