import { motion, AnimatePresence } from 'motion/react';
import React, { useState } from 'react';
import { X, Check, Scale, Sparkles } from 'lucide-react';
import type { Roll } from '../../shared/types';
import { useStore } from '../../store/useStore';
import { fmtG, pctRemaining, stockLevel } from '../../lib/roll';
import { Spool } from './Spool';
import { GaugeRing } from './GaugeRing';

interface QuickUseModalProps {
  roll: Roll | null;
  onClose: () => void;
}

const PRESETS = [5, 15, 25, 40, 75, 120, 200];

export function QuickUseModal({ roll, onClose }: QuickUseModalProps) {
  const logUse = useStore((s) => s.logUse);
  const settings = useStore((s) => s.settings);

  const [grams, setGrams] = useState<number>(20);
  const [note, setNote] = useState<string>('');

  if (!roll) return null;

  const currentRem = roll.remainingWeight;
  const nextRem = Math.max(0, currentRem - (grams || 0));
  const nextPct = roll.initialWeight > 0 ? (nextRem / roll.initialWeight) * 100 : 0;
  const nextLevel = stockLevel(
    { ...roll, remainingWeight: nextRem },
    settings,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (grams > 0) {
      logUse(roll.id, grams, note.trim() || 'Uso registrado');
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-md rounded-2xl bg-elevated border border-line p-6 shadow-2xl space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-line">
            <div>
              <span className="text-[11px] font-mono text-muted uppercase tracking-wider">
                Registrar consumo de filamento
              </span>
              <h2 className="font-display font-bold text-lg text-text flex items-center gap-2">
                <span>{roll.colorName}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted font-mono">
                  {roll.brand} {roll.material}
                </span>
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-faint hover:text-text hover:bg-surface-2 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Spool comparison preview */}
          <div className="flex items-center justify-around p-3 rounded-xl bg-surface-2/60 border border-line">
            <div className="text-center">
              <span className="text-[11px] text-faint block mb-1">Actual</span>
              <div className="w-16 h-16 mx-auto">
                <Spool
                  color={roll.colorHex}
                  finish={roll.finish}
                  fraction={roll.initialWeight > 0 ? roll.remainingWeight / roll.initialWeight : 0}
                  level={stockLevel(roll, settings)}
                  className="w-full h-full"
                />
              </div>
              <span className="font-mono text-xs font-semibold text-text mt-1 block">
                {fmtG(currentRem)}
              </span>
            </div>

            <div className="flex flex-col items-center justify-center text-muted">
              <span className="text-xs font-mono text-crit-text font-bold">
                -{grams || 0}g
              </span>
              <span className="text-lg">→</span>
            </div>

            <div className="text-center">
              <span className="text-[11px] text-faint block mb-1">Tras imprimir</span>
              <div className="w-16 h-16 mx-auto">
                <Spool
                  color={roll.colorHex}
                  finish={roll.finish}
                  fraction={roll.initialWeight > 0 ? nextRem / roll.initialWeight : 0}
                  level={nextLevel}
                  className="w-full h-full"
                />
              </div>
              <span className="font-mono text-xs font-semibold text-text mt-1 block">
                {fmtG(nextRem)}
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Gramos usados en la impresión</label>
              <div className="relative">
                <input
                  type="number"
                  min="0.5"
                  max={currentRem}
                  step="0.5"
                  autoFocus
                  value={grams || ''}
                  onChange={(e) => setGrams(parseFloat(e.target.value) || 0)}
                  className="field font-mono text-lg font-bold pr-12 text-center"
                  placeholder="0"
                />
                <span className="absolute right-4 top-2 text-sm text-faint font-mono">
                  gramos
                </span>
              </div>
            </div>

            {/* Quick buttons */}
            <div>
              <span className="text-[11px] text-muted block mb-1.5 font-medium">
                Atajos frecuentes:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setGrams(p)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-all active:scale-95 ${
                      grams === p
                        ? 'bg-accent text-accent-ink border-accent-strong font-bold shadow-xs'
                        : 'bg-surface-2 text-text border-line hover:border-line-strong'
                    }`}
                  >
                    {p}g
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setGrams(currentRem)}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono border border-crit/30 bg-crit-soft text-crit-text hover:bg-crit/20 transition-all ml-auto"
                >
                  Todo ({fmtG(currentRem)})
                </button>
              </div>
            </div>

            <div>
              <label className="label">¿Qué imprimiste? (Opcional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. Maceta hexagonal, soporte para auriculares, pieza de repuesto..."
                className="field"
              />
            </div>

            {/* Submit */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-muted hover:text-text hover:bg-surface-2 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!grams || grams <= 0}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-accent text-accent-ink hover:bg-accent-strong shadow-sm transition-all disabled:opacity-40 flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <Check size={14} />
                <span>Descontar {grams || 0}g</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
