import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Inbox,
  CheckCircle2,
  Trash2,
  Sliders,
  ArrowRight,
  Clock,
  Layers,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { formatPrintTime } from '../../lib/gcodeParser';
import { fmtG } from '../../lib/roll';
import type { GcodeJob } from '../../shared/types';

export function PendingJobsDrawer() {
  const gcodeJobs = useStore((s) => s.gcodeJobs);
  const unreviewedJobs = gcodeJobs.filter((j) => (j.status || 'unreviewed') === 'unreviewed');
  const setView = useStore((s) => s.setView);
  const markJobPrinted = useStore((s) => s.markJobPrinted);
  const discardJob = useStore((s) => s.discardJob);

  if (unreviewedJobs.length === 0) return null;

  return (
    <div className="p-3 mx-2 sm:mx-0 mb-4 rounded-2xl bg-surface-1/90 backdrop-blur-md border border-line shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent-text shrink-0">
          <Inbox size={16} />
        </div>
        <div>
          <span className="font-display font-bold text-xs text-text flex items-center gap-1.5">
            <span>Bandeja de laminados</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-accent text-accent-ink animate-pulse">
              {unreviewedJobs.length} {unreviewedJobs.length === 1 ? 'pendiente' : 'pendientes'}
            </span>
          </span>
          <p className="text-[11px] text-muted">
            Laminados listos para revisar y registrar consumo.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setView('inbox')}
        className="px-3 py-1.5 rounded-xl bg-accent text-accent-ink hover:bg-accent-strong text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer shrink-0 self-end sm:self-auto"
      >
        <span>Revisar en Bandeja</span>
        <ArrowRight size={13} />
      </button>
    </div>
  );
}
