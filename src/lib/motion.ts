import type { Transition } from 'motion/react';

/**
 * Tokens de movimiento. Todas las animaciones de la app salen de aquí para
 * que el "carácter" del movimiento sea coherente.
 */
export const ease = {
  outSoft: [0.22, 1, 0.36, 1] as const,
  inOutSoft: [0.65, 0, 0.35, 1] as const,
  snap: [0.3, 1.4, 0.5, 1] as const,
};

export const dur = {
  instant: 0.08,
  fast: 0.16,
  base: 0.26,
  slow: 0.42,
  gauge: 1.1,
};

export const spring = {
  /** Hover de la bobina: elástico pero contenido. */
  lift: { type: 'spring', stiffness: 360, damping: 22, mass: 0.7 } satisfies Transition,
  /** Layout (reordenar, shared element). Sin rebote apreciable. */
  layout: { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } satisfies Transition,
  /** Paneles y modales. */
  panel: { type: 'spring', stiffness: 300, damping: 32 } satisfies Transition,
  /** Micro-interacciones: botones, toggles. */
  press: { type: 'spring', stiffness: 600, damping: 30 } satisfies Transition,
  /** Relleno de la bobina y contadores. */
  fill: { type: 'spring', stiffness: 70, damping: 20, mass: 1 } satisfies Transition,
  /** Inclinación 3D siguiendo el cursor. */
  tilt: { stiffness: 260, damping: 20, mass: 0.5 },
};

export const fade: Transition = { duration: dur.base, ease: ease.outSoft };

export const stagger = (i: number, base = 0.035, max = 0.6) => Math.min(i * base, max);
