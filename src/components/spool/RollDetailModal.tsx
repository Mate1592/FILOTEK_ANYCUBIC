import { motion, AnimatePresence } from 'motion/react';
import React, { useState } from 'react';
import {
  X,
  Edit3,
  Copy,
  Trash2,
  Calendar,
  DollarSign,
  Thermometer,
  Layers,
  MapPin,
  Clock,
  RotateCcw,
  Plus,
  Minus,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowRight,
  Store,
  ExternalLink,
  Truck,
} from 'lucide-react';
import type { Roll, RollStatus } from '../../shared/types';
import { useStore } from '../../store/useStore';
import {
  FINISH_LABEL,
  STATUS_LABEL,
  costPerGram,
  fmtDate,
  fmtG,
  fmtMoney,
  fmtMoney4,
  fmtRelative,
  pctRemaining,
  stockLevel,
} from '../../lib/roll';
import { Spool } from './Spool';
import { InteractiveSpool3D } from '../spool3d/InteractiveSpool3D';
import { GaugeRing } from './GaugeRing';
import { CapacityBar } from './CapacityBar';
import { AnimatedNumber } from './AnimatedNumber';

interface RollDetailModalProps {
  roll: Roll | null;
  onClose: () => void;
  onOpenQuickUse: (roll: Roll) => void;
}

export function RollDetailModal({ roll, onClose, onOpenQuickUse }: RollDetailModalProps) {
  const settings = useStore((s) => s.settings);
  const allUsage = useStore((s) => s.usage);
  const usage = React.useMemo(() => allUsage.filter((u) => u.rollId === roll?.id), [allUsage, roll?.id]);
  const undoUse = useStore((s) => s.undoUse);
  const openEditor = useStore((s) => s.openEditor);
  const duplicate = useStore((s) => s.duplicate);
  const deleteRoll = useStore((s) => s.deleteRoll);
  const setStatus = useStore((s) => s.setStatus);
  const moveRoll = useStore((s) => s.moveRoll);

  const [isEditingLoc, setIsEditingLoc] = useState(false);
  const [newLoc, setNewLoc] = useState('');

  if (!roll) return null;

  const pct = pctRemaining(roll);
  const level = stockLevel(roll, settings);
  const cpg = costPerGram(roll);
  const fraction = roll.initialWeight > 0 ? roll.remainingWeight / roll.initialWeight : 0;

  const handleSaveLoc = (e: React.FormEvent) => {
    e.preventDefault();
    moveRoll(roll.id, newLoc);
    setIsEditingLoc(false);
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          layoutId={`roll-card-${roll.id}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-3xl rounded-3xl bg-elevated border border-line shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Bar with actions */}
          <div className="flex items-center justify-between p-5 border-b border-line bg-surface-1/50 sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <span
                className="w-4 h-4 rounded-full border border-line shadow-xs"
                style={{ backgroundColor: roll.colorHex }}
              />
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-muted font-semibold">
                  {roll.brand} · {roll.material} · {roll.diameter}mm
                </span>
                <h2 className="font-display font-bold text-xl text-text">
                  {roll.colorName}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openEditor({ mode: 'edit', id: roll.id });
                }}
                className="p-2 rounded-xl text-muted hover:text-text hover:bg-surface-2 transition-colors border border-line"
                title="Editar datos del rollo"
              >
                <Edit3 size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  duplicate(roll.id);
                  onClose();
                }}
                className="p-2 rounded-xl text-muted hover:text-text hover:bg-surface-2 transition-colors border border-line"
                title="Duplicar para recompra"
              >
                <Copy size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteRoll(roll.id);
                  onClose();
                }}
                className="p-2 rounded-xl text-crit-text hover:bg-crit-soft transition-colors border border-line"
                title="Eliminar rollo"
              >
                <Trash2 size={16} />
              </button>
              <div className="w-[1px] h-6 bg-line mx-1" />
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-faint hover:text-text hover:bg-surface-2 transition-colors"
                title="Cerrar (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="overflow-y-auto p-6 space-y-6">
            {/* Main Spool + Disk Gauge Showcase */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center p-6 rounded-2xl bg-surface-2/40 border border-line">
              <div className="flex flex-col items-center justify-center relative">
                <div className="w-56 h-56 relative drop-shadow-xl">
                  <InteractiveSpool3D
                    color={roll.colorHex}
                    finish={roll.finish}
                    fraction={fraction}
                    level={level}
                    className="w-full h-full"
                  />
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted font-medium">
                  <span className="capitalize">Acabado: {FINISH_LABEL[roll.finish]}</span>
                  <span>•</span>
                  <span>Color: {roll.colorHex}</span>
                </div>
              </div>

              {/* Disk usage gauges & live numbers */}
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-1 border border-line shadow-xs">
                  <div className="relative w-18 h-18 flex items-center justify-center shrink-0">
                    <GaugeRing percent={pct} level={level} size={70} strokeWidth={6.5} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-mono text-sm font-bold text-text tabular">
                        <AnimatedNumber value={Math.round(pct)} />%
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-muted uppercase tracking-wider block">
                      Filamento disponible
                    </span>
                    <div className="text-2xl font-mono font-bold text-text tabular">
                      <AnimatedNumber value={roll.remainingWeight} /> g
                    </div>
                    <span className="text-xs text-faint">
                      de {fmtG(roll.initialWeight)} netos iniciales
                    </span>
                  </div>
                </div>

                <CapacityBar
                  remaining={roll.remainingWeight}
                  initial={roll.initialWeight}
                  percent={pct}
                  level={level}
                />

                {/* Primary Action Button */}
                <button
                  type="button"
                  onClick={() => onOpenQuickUse(roll)}
                  className="w-full py-2.5 px-4 rounded-xl bg-accent text-accent-ink hover:bg-accent-strong font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
                >
                  <Minus size={16} />
                  <span>Registrar impresión (descontar gramos)</span>
                </button>
              </div>
            </div>

            {/* Technical Specs & Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-surface-1 border border-line">
                <div className="flex items-center gap-1.5 text-muted text-xs mb-1">
                  <Thermometer size={14} className="text-accent-text" />
                  <span>Boquilla</span>
                </div>
                <div className="font-mono text-sm font-semibold text-text">
                  {roll.nozzleTemp.min}° - {roll.nozzleTemp.max}°C
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-surface-1 border border-line">
                <div className="flex items-center gap-1.5 text-muted text-xs mb-1">
                  <Layers size={14} className="text-warn" />
                  <span>Cama</span>
                </div>
                <div className="font-mono text-sm font-semibold text-text">
                  {roll.bedTemp.min}° - {roll.bedTemp.max}°C
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-surface-1 border border-line">
                <div className="flex items-center gap-1.5 text-muted text-xs mb-1">
                  <DollarSign size={14} className="text-ok" />
                  <span>Coste / gramo</span>
                </div>
                <div className="font-mono text-sm font-semibold text-text">
                  {fmtMoney4(cpg, settings.currency)}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-surface-1 border border-line">
                <div className="flex items-center gap-1.5 text-muted text-xs mb-1">
                  <Calendar size={14} className="text-faint" />
                  <span>Comprado</span>
                </div>
                <div className="font-mono text-sm font-semibold text-text">
                  {fmtDate(roll.purchaseDate)}
                </div>
              </div>
            </div>

            {/* Store, Purchase, and Shipping Info */}
            <div className="p-4 rounded-2xl bg-surface-1 border border-line space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-muted uppercase tracking-wider flex items-center gap-1.5 font-semibold">
                  <Store size={14} className="text-accent-text" />
                  <span>Compra y Proveedor</span>
                </span>
                {roll.store && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-2 text-text border border-line">
                    {roll.store}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 rounded-xl bg-surface-2/60 border border-line/60">
                  <span className="text-faint text-[10px] block uppercase font-mono">Precio rollo</span>
                  <span className="font-mono font-bold text-text text-sm">
                    {fmtMoney(roll.price, settings.currency)}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-surface-2/60 border border-line/60">
                  <span className="text-faint text-[10px] block uppercase font-mono">Envío e impuestos</span>
                  <span className="font-mono font-medium text-text">
                    {(roll.shippingCost || 0) + (roll.taxCost || 0) > 0
                      ? fmtMoney((roll.shippingCost || 0) + (roll.taxCost || 0), settings.currency)
                      : 'Incluido'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-surface-2/60 border border-line/60">
                  <span className="text-faint text-[10px] block uppercase font-mono">Tiempo de entrega</span>
                  <span className="font-mono font-medium text-text flex items-center gap-1">
                    <Truck size={12} className="text-muted" />
                    <span>{roll.deliveryDays ?? 6} días</span>
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-surface-2/60 border border-line/60 flex flex-col justify-center">
                  <span className="text-faint text-[10px] block uppercase font-mono mb-1">Enlace de compra</span>
                  {roll.productUrl ? (
                    <a
                      href={roll.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent-text hover:underline font-medium truncate"
                    >
                      <span>Ver producto</span>
                      <ExternalLink size={11} className="shrink-0" />
                    </a>
                  ) : (
                    <span className="text-faint italic text-[11px]">No configurado</span>
                  )}
                </div>
              </div>
            </div>

            {/* Status & Location Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Status pill changer */}
              <div className="p-4 rounded-xl bg-surface-1 border border-line space-y-2">
                <label className="label">Estado del rollo</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['sealed', 'in_use', 'dry', 'empty'] as RollStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus(roll.id, st)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        roll.status === st
                          ? 'bg-accent/20 border-accent text-accent-text font-bold'
                          : 'bg-surface-2 border-line text-muted hover:text-text'
                      }`}
                    >
                      {STATUS_LABEL[st]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Location editor */}
              <div className="p-4 rounded-xl bg-surface-1 border border-line space-y-2">
                <div className="flex items-center justify-between">
                  <label className="label">Ubicación física</label>
                  {!isEditingLoc && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewLoc(roll.location);
                        setIsEditingLoc(true);
                      }}
                      className="text-xs text-accent-text hover:underline"
                    >
                      Cambiar
                    </button>
                  )}
                </div>

                {isEditingLoc ? (
                  <form onSubmit={handleSaveLoc} className="flex gap-2">
                    <input
                      type="text"
                      value={newLoc}
                      onChange={(e) => setNewLoc(e.target.value)}
                      placeholder="Ej. Estante A, Caja seca 2..."
                      className="field text-xs h-8"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-3 py-1 rounded-lg bg-accent text-accent-ink text-xs font-semibold"
                    >
                      Guardar
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-2 border border-line text-xs font-medium text-text">
                    <MapPin size={14} className="text-accent-text shrink-0" />
                    <span>{roll.location || 'Sin ubicación asignada'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes if any */}
            {roll.notes && (
              <div className="p-4 rounded-xl bg-surface-1 border border-line">
                <span className="text-[11px] font-mono text-muted uppercase tracking-wider block mb-1">
                  Notas de taller
                </span>
                <p className="text-xs text-text leading-relaxed whitespace-pre-wrap">
                  {roll.notes}
                </p>
              </div>
            )}

            {/* Usage History */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-sm text-text flex items-center gap-2">
                  <Clock size={16} className="text-muted" />
                  <span>Historial de impresiones ({usage.length})</span>
                </span>
                <span className="text-xs text-faint font-mono">
                  Total consumido: {fmtG(roll.initialWeight - roll.remainingWeight)}
                </span>
              </div>

              {usage.length === 0 ? (
                <div className="p-6 rounded-xl bg-surface-1 border border-dashed border-line text-center text-xs text-faint">
                  Este rollo aún no tiene consumos registrados.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {[...usage].reverse().map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-surface-1 border border-line text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-crit-text bg-crit-soft px-2 py-0.5 rounded text-[11px]">
                          -{entry.grams}g
                        </span>
                        <div>
                          <span className="text-text font-medium block">
                            {entry.note || 'Impresión sin nota'}
                          </span>
                          <span className="text-[10px] text-faint">
                            {fmtRelative(entry.at)} ({fmtDate(entry.at)})
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => undoUse(entry.id)}
                        className="p-1 rounded-md text-faint hover:text-crit-text hover:bg-surface-2 transition-colors"
                        title="Deshacer este consumo"
                      >
                        <RotateCcw size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
