import { motion, useReducedMotion, useSpring } from 'motion/react';
import { memo, useEffect, useId, useMemo } from 'react';
import type { Finish } from '../../shared/types';
import { luminance, seeded, shade, type StockLevel } from '../../lib/roll';
import { spring } from '../../lib/motion';

/* Geometría (viewBox 200×200, centro 100,100) */
const C = 100;
const R_FLANGE = 96; // borde exterior del disco lateral
const R_MAX = 88; // radio del filamento con el rollo lleno (rozando el borde)
const R_CORE = 35; // núcleo de cartón
const R_HUB = 19; // buje de plástico
const R_HOLE = 12; // agujero central

/** Radio del filamento según la fracción restante. El peso es proporcional al ÁREA del anillo,
 *  así que r = √(rc² + f·(R² − rc²)): a la mitad se ve un anillo medio, con 5 % una capa fina. */
export function fillRadius(fraction: number) {
  const f = Math.min(1, Math.max(0, fraction));
  if (f <= 0) return R_CORE;
  const r = Math.sqrt(R_CORE ** 2 + f * (R_MAX ** 2 - R_CORE ** 2));
  return Math.max(r, R_CORE + 1.6); // capa mínima visible si queda algo
}

// --- Geometría constante, generada una sola vez -------------------------
const circlePath = (r: number) => `M${C - r},${C}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0`;

/** Líneas de bobinado: un único <path> con decenas de circunferencias (1 nodo DOM). */
const WINDING = (() => {
  let d = '';
  for (let r = R_MAX - 1.2; r > 8; r -= 2.1) d += circlePath(r);
  return d;
})();

const sector = (r1: number, r2: number, a0: number, a1: number) => {
  const p = (r: number, a: number) => `${C + r * Math.cos(a)},${C + r * Math.sin(a)}`;
  return `M${p(r1, a0)}L${p(r2, a0)}A${r2},${r2} 0 0,1 ${p(r2, a1)}L${p(r1, a1)}A${r1},${r1} 0 0,0 ${p(r1, a0)}Z`;
};

/** Rejilla hexagonal (panal / honeycomb) para el disco lateral en SVG */
const HONEYCOMB_SVG = (() => {
  let d = '';
  const hexRadius = 7.8;
  const holeRadius = 7.1; // Paredes delgadas para máxima transparencia y visibilidad del filamento
  const dx = Math.sqrt(3) * hexRadius;
  const dy = 1.5 * hexRadius;
  const rIn = R_HUB + 2; // Buje fino pegado al centro
  const rOut = R_MAX - 1.5; // Borde exterior fino

  const maxRow = Math.ceil(R_MAX / dy);
  const maxCol = Math.ceil(R_MAX / dx) + 1;

  for (let row = -maxRow; row <= maxRow; row++) {
    const cy = C + row * dy;
    const xOffset = Math.abs(row) % 2 === 1 ? dx / 2 : 0;

    for (let col = -maxCol; col <= maxCol; col++) {
      const cx = C + col * dx + xOffset;
      const dist = Math.hypot(cx - C, cy - C);
      if (dist > rOut + hexRadius || dist < rIn - hexRadius) continue;

      let allInside = true;
      const pts: [number, number][] = [];
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3 + Math.PI / 6;
        const px = cx + holeRadius * Math.cos(a);
        const py = cy + holeRadius * Math.sin(a);
        const pDist = Math.hypot(px - C, py - C);
        if (pDist < rIn || pDist > rOut) {
          allInside = false;
          break;
        }
        pts.push([px, py]);
      }

      if (allInside && pts.length === 6) {
        d += `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
        for (let k = 1; k < 6; k++) {
          d += `L${pts[k][0].toFixed(1)},${pts[k][1].toFixed(1)}`;
        }
        d += 'Z';
      }
    }
  }
  return d;
})();

const RIDGES = [R_CORE + 5, 56, 72, R_MAX - 2].map(circlePath).join('');

/** Brillo seda: "pajarita" de luz perpendicular a la fuente. */
const wedge = (spread: number, angle: number) => {
  const a0 = angle - spread;
  const a1 = angle + spread;
  const r = R_MAX + 2;
  const p = (a: number) => `${C + r * Math.cos(a)},${C + r * Math.sin(a)}`;
  return `M${C},${C}L${p(a0)}A${r},${r} 0 0,1 ${p(a1)}Z`;
};
const SILK_LAYERS = [0.42, 0.26, 0.12].map((s) => wedge(s, -Math.PI * 0.72) + wedge(s, Math.PI * 0.28));

function glitterPaths(seedKey: string) {
  const rnd = seeded(seedKey);
  let bright = '';
  let dim = '';
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 12 + Math.sqrt(rnd()) * (R_MAX - 14);
    const x = C + r * Math.cos(a);
    const y = C + r * Math.sin(a);
    const s = 0.5 + rnd() * 0.9;
    const dot = `M${x - s},${y}a${s},${s} 0 1,0 ${s * 2},0a${s},${s} 0 1,0 ${-s * 2},0`;
    if (rnd() > 0.55) bright += dot;
    else dim += dot;
  }
  return { bright, dim };
}

export interface SpoolProps {
  color: string;
  finish: Finish;
  /** 0..1 */
  fraction: number;
  level: StockLevel;
  /** Gira levemente el carrete (hover). */
  spin?: boolean;
  /** Anima el llenado desde vacío al montar. */
  fillOnMount?: boolean;
  className?: string;
  title?: string;
  seedKey?: string;
}

export const Spool = memo(function Spool({
  color,
  finish,
  fraction,
  level,
  spin = false,
  fillOnMount = true,
  className,
  title,
  seedKey = color,
}: SpoolProps) {
  const reduce = useReducedMotion();
  const raw = useId();
  const id = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  const target = fillRadius(fraction) / R_MAX;
  const empty = level === 'empty';

  // escala del disco de filamento (transform → barato)
  const scale = useSpring(fillOnMount && !reduce ? R_CORE / R_MAX : target, spring.fill);
  useEffect(() => {
    if (reduce) scale.jump(target);
    else scale.set(target);
  }, [target, reduce, scale]);

  const rot = useSpring(0, { stiffness: 80, damping: 18 });
  useEffect(() => {
    rot.set(spin && !reduce ? 38 : 0);
  }, [spin, reduce, rot]);

  const light = luminance(color) > 0.55;
  const pal = useMemo(
    () => ({
      deep: shade(color, light ? -0.32 : -0.45),
      mid: shade(color, -0.12),
      base: color,
      hi: shade(color, light ? 0.35 : 0.28),
      edge: shade(color, light ? -0.18 : 0.35),
      line: shade(color, light ? -0.35 : -0.5),
    }),
    [color, light],
  );
  const glitter = useMemo(() => (finish === 'glitter' ? glitterPaths(seedKey) : null), [finish, seedKey]);

  const translucent = finish === 'translucent';
  const filamentOpacity = translucent ? 0.8 : 1;
  const warnColor = level === 'critical' ? 'var(--crit)' : 'var(--warn)';

  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label={title} style={{ overflow: 'visible' }}>
      {title && <title>{title}</title>}
      <defs>
        <radialGradient id={`${id}-plastic`} cx="38%" cy="32%" r="80%">
          <stop offset="0%" stopColor="var(--spool-plastic-hi)" />
          <stop offset="70%" stopColor="var(--spool-plastic)" />
          <stop offset="100%" stopColor="var(--spool-plastic)" />
        </radialGradient>
        <radialGradient id={`${id}-fil`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={pal.deep} />
          <stop offset="55%" stopColor={pal.mid} />
          <stop offset="82%" stopColor={pal.base} />
          <stop offset="94%" stopColor={pal.hi} />
          <stop offset="100%" stopColor={pal.deep} />
        </radialGradient>
        <linearGradient id={`${id}-shade`} x1="15%" y1="10%" x2="85%" y2="95%">
          <stop offset="0%" stopColor="#fff" stopOpacity={finish === 'matte' ? 0.1 : 0.22} />
          <stop offset="45%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity={light ? 0.18 : 0.32} />
        </linearGradient>
        <radialGradient id={`${id}-gloss`} cx="30%" cy="22%" r="42%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="40%" stopColor={pal.hi} stopOpacity="0" />
          <stop offset="85%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-kraft`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#d9b483" />
          <stop offset="100%" stopColor="#a87d4b" />
        </radialGradient>
        <radialGradient id={`${id}-hole`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="38%" stopColor="#fff" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx={C} cy={C} r={R_MAX} />
        </clipPath>
      </defs>

      {/* Disco lateral trasero con rejilla hexagonal panal */}
      <motion.g style={{ rotate: rot, originX: '50%', originY: '50%' }}>
        <circle cx={C} cy={C} r={R_FLANGE} fill={`url(#${id}-plastic)`} />
        <path d={HONEYCOMB_SVG} fill="#14171e" opacity={0.65} />
        <path d={HONEYCOMB_SVG} fill="none" stroke="#525a68" strokeOpacity={0.4} strokeWidth={1} />
      </motion.g>

      {/* Filamento enrollado: un disco escalado por debajo del núcleo */}
      <motion.g style={{ scale, originX: '50%', originY: '50%' }} opacity={empty ? 0 : 1}>
        <g clipPath={`url(#${id}-clip)`} opacity={filamentOpacity}>
          <motion.g style={{ rotate: rot, originX: '50%', originY: '50%' }}>
            <circle cx={C} cy={C} r={R_MAX} fill={`url(#${id}-fil)`} />
            <path d={WINDING} fill="none" stroke={pal.line} strokeOpacity={finish === 'matte' ? 0.22 : 0.3} strokeWidth={0.55} />
            {glitter && (
              <>
                <path d={glitter.dim} fill={shade(color, 0.55)} opacity={0.5} />
                <path d={glitter.bright} fill="#fff" opacity={0.85} />
              </>
            )}
          </motion.g>
          {/* luz fija (no gira con el carrete) */}
          <circle cx={C} cy={C} r={R_MAX} fill={`url(#${id}-shade)`} />
          {finish === 'silk' &&
            SILK_LAYERS.map((d, i) => <path key={i} d={d} fill="#fff" opacity={0.1 + i * 0.05} style={{ mixBlendMode: 'soft-light' }} />)}
          {finish === 'silk' && SILK_LAYERS.map((d, i) => <path key={`s${i}`} d={d} fill="#fff" opacity={0.05 + i * 0.03} />)}
          {(finish === 'glossy' || finish === 'glitter') && <circle cx={C} cy={C} r={R_MAX} fill={`url(#${id}-gloss)`} />}
          {translucent && <circle cx={C} cy={C} r={R_MAX} fill={`url(#${id}-glow)`} />}
        </g>
        {/* borde nítido del bobinado a cualquier escala */}
        <circle
          cx={C}
          cy={C}
          r={R_MAX - 0.4}
          fill="none"
          stroke={pal.edge}
          strokeOpacity={0.55}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </motion.g>

      {/* Aviso de bajo stock: halo que pulsa alrededor del núcleo */}
      {(level === 'low' || level === 'critical') && (
        <circle
          cx={C}
          cy={C}
          r={R_CORE + 7}
          fill="none"
          stroke={warnColor}
          strokeWidth={level === 'critical' ? 3 : 2}
          className={level === 'critical' ? 'pulse-crit' : 'pulse-warn'}
        />
      )}
      {empty && (
        <circle cx={C} cy={C} r={R_CORE + 6} fill="none" stroke="var(--text-faint)" strokeOpacity={0.5} strokeWidth={1.2} strokeDasharray="3 4" />
      )}

      {/* Núcleo de cartón + buje */}
      <motion.g style={{ rotate: rot, originX: '50%', originY: '50%' }}>
        <circle cx={C} cy={C} r={R_CORE} fill={`url(#${id}-kraft)`} />
        <circle cx={C} cy={C} r={R_CORE - 0.6} fill="none" stroke="#5a3d1c" strokeOpacity={0.35} strokeWidth={1.2} />
        <circle cx={C} cy={C} r={R_CORE - 6} fill="none" stroke="#5a3d1c" strokeOpacity={0.12} strokeWidth={0.8} />
        <circle cx={C} cy={C} r={R_HUB} fill={`url(#${id}-plastic)`} />
        <circle cx={C} cy={C} r={R_HUB} fill="none" stroke="#fff" strokeOpacity={0.12} strokeWidth={0.8} />
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
          return <circle key={i} cx={C + Math.cos(a) * (R_HUB - 3.6)} cy={C + Math.sin(a) * (R_HUB - 3.6)} r={1.6} fill="#000" opacity={0.5} />;
        })}
        <circle cx={C} cy={C} r={R_HOLE} fill={`url(#${id}-hole)`} />
      </motion.g>

      {/* Disco frontal: aro exterior, rejilla hexagonal panal y reflejo */}
      <circle
        cx={C}
        cy={C}
        r={(R_FLANGE + R_MAX + 1) / 2}
        fill="none"
        stroke={`url(#${id}-plastic)`}
        strokeWidth={R_FLANGE - R_MAX - 1}
      />
      <circle cx={C} cy={C} r={R_FLANGE - 0.5} fill="none" stroke="#fff" strokeOpacity={0.14} strokeWidth={1} />
      <circle cx={C} cy={C} r={R_MAX + 1} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={1} />
      <path d={HONEYCOMB_SVG} fill="none" stroke="#525a68" strokeOpacity={0.65} strokeWidth={1.2} />
      <circle cx={C} cy={C} r={R_FLANGE} fill={`url(#${id}-glass)`} pointerEvents="none" />
    </svg>
  );
});
