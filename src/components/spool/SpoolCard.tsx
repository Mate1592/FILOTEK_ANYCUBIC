import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react';
import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Flame,
  CheckCircle2,
  MapPin,
  Minus,
  MoreVertical,
  Edit2,
  Copy,
  Trash2,
  Check,
} from 'lucide-react';
import type { Roll } from '../../shared/types';
import { useStore } from '../../store/useStore';
import { FINISH_LABEL, fmtG, fmtMoney, pctRemaining, stockLevel, type StockLevel } from '../../lib/roll';
import { Spool3D } from '../spool3d/Spool3D';
import { spoolViewer } from '../spool3d/SpoolViewerManager';
import { GaugeRing } from './GaugeRing';
import { CapacityBar } from './CapacityBar';
import { AnimatedNumber } from './AnimatedNumber';

interface SpoolCardProps {
  roll: Roll;
  onQuickUse: (roll: Roll) => void;
  index: number;
  isBackedUp?: boolean;
  lightweight?: boolean;
}

interface CardShellProps {
  rollId: string;
  index: number;
  isHovered: boolean;
  ariaLabel: string;
  className: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  children: React.ReactNode;
}

function LightweightCardShell({
  ariaLabel,
  className,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onKeyDown,
  children,
}: CardShellProps) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </div>
  );
}

function MotionCardShell({
  rollId,
  index,
  ariaLabel,
  className,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onKeyDown,
  children,
}: CardShellProps) {
  const reduce = useReducedMotion();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [7, -7]), { stiffness: 300, damping: 25 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-7, 7]), { stiffness: 300, damping: 25 });
  const lastMoveRef = useRef(0);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reduce) return;
      const now = performance.now();
      // Throttle mousemove a ~30 fps (~33ms) para no saturar CPU con ratones de alto polling (500Hz/1000Hz)
      if (now - lastMoveRef.current < 33) return;
      lastMoveRef.current = now;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      mouseX.set(x);
      mouseY.set(y);
      spoolViewer.updateItem(rollId, {
        tiltX: y * -0.15,
        tiltY: x * 0.18,
      });
    },
    [mouseX, mouseY, reduce, rollId],
  );

  const handleLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
    onMouseLeave();
  };

  return (
    <motion.div
      layout="position"
      layoutId={`roll-card-${rollId}`}
      initial={reduce ? { opacity: 1 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.03, 0.4) }}
      style={
        reduce
          ? {}
          : {
              perspective: 1000,
              rotateX,
              rotateY,
              transformStyle: 'preserve-3d',
            }
      }
      onMouseMove={handleMouseMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={handleLeave}
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export const SpoolCard = memo(function SpoolCard({
  roll,
  onQuickUse,
  index,
  isBackedUp = false,
  lightweight = false,
}: SpoolCardProps) {
  const select = useStore((s) => s.select);
  const openEditor = useStore((s) => s.openEditor);
  const duplicate = useStore((s) => s.duplicate);
  const deleteRoll = useStore((s) => s.deleteRoll);
  const markEmpty = useStore((s) => s.markEmpty);
  const logUse = useStore((s) => s.logUse);
  const lowThreshold = useStore((s) => s.settings.lowThreshold);
  const criticalThreshold = useStore((s) => s.settings.criticalThreshold);
  const currency = useStore((s) => s.settings.currency);

  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (showMenu && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    } else {
      setMenuPos(null);
    }
  }, [showMenu]);

  useEffect(() => {
    if (!showMenu) return;
    const handleClose = () => setShowMenu(false);
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [showMenu]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    spoolViewer.updateItem(roll.id, {
      isHovered: false,
      tiltX: 0,
      tiltY: 0,
    });
  }, [roll.id]);

  const pct = pctRemaining(roll);
  const level = stockLevel(roll, { lowThreshold, criticalThreshold });
  const fraction = roll.initialWeight > 0 ? roll.remainingWeight / roll.initialWeight : 0;

  const backedUp = (level === 'low' || level === 'critical') && Boolean(isBackedUp);
  const visualLevel: StockLevel = backedUp ? 'ok' : level;

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      // If clicking an action button, don't open details
      if ((e.target as HTMLElement).closest('button')) return;
      select(roll.id);
    },
    [roll.id, select],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(roll.id);
      }
    },
    [roll.id, select],
  );

  const ariaLabel = `Bobina ${roll.colorName} de ${roll.brand} ${roll.material}, ${fmtG(roll.remainingWeight)} restantes`;
  const shellClassName = `group relative rounded-2xl bg-surface-1 border border-line p-4 transition-all duration-300 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-text flex flex-col justify-between select-none ${
    isHovered ? 'shadow-lg border-line-strong -translate-y-1' : 'shadow-sm cv-auto'
  }`;

  const Shell = lightweight ? LightweightCardShell : MotionCardShell;

  return (
    <Shell
      rollId={roll.id}
      index={index}
      isHovered={isHovered}
      ariaLabel={ariaLabel}
      className={shellClassName}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
    >
      {/* Top row: Brand + Material Tag + Stock Alert Badge */}
      <div className="flex items-start justify-between gap-2 z-10">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-nowrap min-w-0">
            <span
              className="font-mono text-[11px] font-semibold text-muted uppercase tracking-wider truncate min-w-0"
              title={roll.brand}
            >
              {roll.brand}
            </span>
            <span className="text-faint text-[10px] shrink-0">•</span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-surface-2 text-text border border-line shrink-0 whitespace-nowrap">
              {roll.material}
            </span>
            <span className="text-[10px] text-faint font-mono shrink-0 whitespace-nowrap">
              {roll.diameter}mm
            </span>
          </div>
          <h3 className="font-display font-bold text-base text-text mt-1 truncate min-h-[1.5rem]" title={roll.colorName}>
            {roll.colorName}
          </h3>
        </div>

        {/* Stock status indicator */}
        <div className="flex items-center gap-1 shrink-0">
          {backedUp ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-2 text-muted border border-line whitespace-nowrap"
              title={`Rollo por terminar (${roll.remainingWeight}g restantes), pero respaldado por otro carrete de ${roll.material} ${roll.colorName} en inventario.`}
            >
              <CheckCircle2 size={11} className="text-ok shrink-0" />
              <span>{Math.round(pct)}% · Respaldado</span>
            </span>
          ) : level === 'critical' ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-crit-soft text-crit-text border border-crit/40 shadow-xs whitespace-nowrap"
              title="Stock crítico (<10%)"
            >
              <Flame size={12} className="shrink-0" />
              <span>{Math.round(pct)}%</span>
            </span>
          ) : level === 'low' ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-warn-soft text-warn-text border border-warn/20 whitespace-nowrap"
              title="Stock bajo (<20%)"
            >
              <AlertTriangle size={12} className="shrink-0" />
              <span>{Math.round(pct)}%</span>
            </span>
          ) : level === 'empty' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-3 text-faint whitespace-nowrap">
              Agotado
            </span>
          ) : (
            <span
              className="w-2.5 h-2.5 rounded-full border border-line shadow-xs shrink-0"
              style={{ backgroundColor: roll.colorHex }}
              title={roll.colorHex}
            />
          )}

          {/* Quick options menu trigger */}
          <div className="relative">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 rounded-md text-faint hover:text-text hover:bg-surface-2 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label="Opciones rápidas"
            >
              <MoreVertical size={15} />
            </button>

            {showMenu &&
              menuPos &&
              createPortal(
                <div
                  style={{
                    position: 'fixed',
                    top: `${menuPos.top}px`,
                    right: `${menuPos.right}px`,
                    zIndex: 99999,
                  }}
                  className="w-44 rounded-xl bg-surface-1 dark:bg-[#1a1c20] border border-line-strong shadow-2xl py-1.5 text-xs select-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      openEditor({ mode: 'edit', id: roll.id });
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-text hover:bg-surface-2 transition-colors text-left cursor-pointer"
                  >
                    <Edit2 size={13} className="text-muted" />
                    <span>Editar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      duplicate(roll.id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-text hover:bg-surface-2 transition-colors text-left cursor-pointer"
                  >
                    <Copy size={13} className="text-muted" />
                    <span>Duplicar rollo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      markEmpty(roll.id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-text hover:bg-surface-2 transition-colors text-left cursor-pointer"
                  >
                    <Check size={13} className="text-muted" />
                    <span>Marcar agotado</span>
                  </button>
                  <div className="my-1 border-t border-line" />
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      deleteRoll(roll.id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-crit-text hover:bg-crit-soft transition-colors text-left cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Eliminar</span>
                  </button>
                </div>,
                document.body,
              )}
          </div>
        </div>
      </div>

      {/* Center: Spool Visual + Disk Gauge Ring with Grams & % */}
      <div className="relative py-4 flex items-center justify-center my-1">
        {/* Realistic parametric spool */}
        <div className="w-36 h-36 relative transition-transform duration-300 group-hover:scale-105">
          <Spool3D
            id={roll.id}
            color={roll.colorHex}
            finish={roll.finish}
            fraction={fraction}
            level={visualLevel}
            isHovered={isHovered}
            animateLayout={!lightweight}
            className="w-full h-full drop-shadow-md"
            title={`${roll.colorName} (${FINISH_LABEL[roll.finish]})`}
          />
        </div>

        {/* Floating Radial Disk Gauge at bottom corner */}
        <div
          className={`absolute bottom-0 right-1 flex items-center justify-center rounded-full bg-surface-1 p-1 border border-line-strong shadow-md transition-transform duration-300 ${
            isHovered ? 'scale-110 shadow-lg' : ''
          }`}
          title={`${Math.round(pct)}% restante (${fmtG(roll.remainingWeight)})`}
        >
          <div className="relative w-12 h-12 flex items-center justify-center">
            <GaugeRing
              percent={pct}
              level={visualLevel}
              size={48}
              strokeWidth={4.5}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-mono text-[11px] font-bold text-text tabular">
                <AnimatedNumber value={Math.round(pct)} />%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom section: Capacity Bar + Location + Quick Use buttons */}
      <div className="space-y-3 z-10">
        <CapacityBar
          remaining={roll.remainingWeight}
          initial={roll.initialWeight}
          percent={pct}
          level={visualLevel}
        />

        <div className="flex items-center justify-between text-xs text-muted pt-1 border-t border-line/60">
          <div className="flex items-center gap-1 truncate max-w-[130px]" title={roll.location || 'Sin ubicación'}>
            <MapPin size={12} className="text-faint shrink-0" />
            <span className="truncate text-[11px]">{roll.location || 'Sin ubicación'}</span>
          </div>

          <div className="font-mono text-[11px] font-medium text-text">
            {fmtMoney(roll.price, currency)}
          </div>
        </div>

        {/* Quick action: "Usé X gramos" button pills */}
        <div className="grid grid-cols-4 gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => logUse(roll.id, 10, 'Print rápido')}
            className="px-1.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 text-[10.5px] font-mono text-muted hover:text-text border border-line transition-all active:scale-95 text-center"
            title="Descontar 10g"
          >
            -10g
          </button>
          <button
            type="button"
            onClick={() => logUse(roll.id, 25, 'Impresión estándar')}
            className="px-1.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 text-[10.5px] font-mono text-muted hover:text-text border border-line transition-all active:scale-95 text-center"
            title="Descontar 25g"
          >
            -25g
          </button>
          <button
            type="button"
            onClick={() => logUse(roll.id, 50, 'Pieza mediana')}
            className="px-1.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 text-[10.5px] font-mono text-muted hover:text-text border border-line transition-all active:scale-95 text-center"
            title="Descontar 50g"
          >
            -50g
          </button>
          <button
            type="button"
            onClick={() => onQuickUse(roll)}
            className="px-1.5 py-1 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent-text text-[10.5px] font-medium border border-accent/20 transition-all active:scale-95 text-center flex items-center justify-center gap-0.5"
            title="Descontar cantidad personalizada"
          >
            <Minus size={11} />
            <span>Otro</span>
          </button>
        </div>
      </div>
    </Shell>
  );
});
