import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, X, Inbox, ArrowRight, Printer } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { fmtG } from '../../lib/roll';

interface CompanionPromptModalProps {
  unreviewedCount: number;
  sessionJobsCount: number;
  onClose: () => void;
  onGoToInbox: () => void;
}

export function CompanionPromptModal({
  unreviewedCount,
  sessionJobsCount,
  onClose,
  onGoToInbox,
}: CompanionPromptModalProps) {
  const gcodeJobs = useStore((s) => s.gcodeJobs);
  const markJobPrinted = useStore((s) => s.markJobPrinted);
  const discardJob = useStore((s) => s.discardJob);

  // Obtener los trabajos pendientes más recientes de la sesión
  const pendingJobs = gcodeJobs
    .filter((j) => (j.status || 'unreviewed') === 'unreviewed')
    .slice(0, 4);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        className="w-full max-w-lg rounded-2xl bg-surface-1 border border-line shadow-2xl p-5 space-y-4"
      >
        <div className="flex items-center gap-3 border-b border-line pb-3">
          <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent-text">
            <Printer size={20} />
          </div>
          <div>
            <h3 className="font-display font-extrabold text-base text-text">
              ¿Qué imprimiste en esta sesión?
            </h3>
            <p className="text-xs text-muted">
              Detectamos que cerraste el laminador. Tienes {unreviewedCount} archivo(s) por revisar.
            </p>
          </div>
        </div>

        {/* Lista de archivos laminados en la sesión */}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {pendingJobs.map((job) => (
            <div
              key={job.id}
              className="p-3 rounded-xl bg-surface-2 border border-line flex items-center justify-between gap-3 text-xs"
            >
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-text truncate block">{job.jobName}</span>
                <span className="text-[11px] text-muted font-mono">{fmtG(job.totalGrams)} • {job.filaments.length} color(es)</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    await markJobPrinted(job.id);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-accent text-accent-ink hover:bg-accent-strong text-xs font-bold flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer"
                >
                  <Check size={12} strokeWidth={3} />
                  <span>Lo imprimí</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await discardJob(job.id);
                  }}
                  className="px-2 py-1 rounded-lg bg-surface-3 hover:bg-surface-3/80 text-muted hover:text-danger text-xs font-medium transition-all cursor-pointer"
                  title="No se imprimió"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Acciones del pie */}
        <div className="flex items-center justify-between pt-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted hover:text-text cursor-pointer"
          >
            Revisar más tarde
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onGoToInbox();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-xs font-semibold text-text flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Inbox size={14} className="text-accent-text" />
            <span>Abrir Bandeja completa</span>
            <ArrowRight size={12} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
