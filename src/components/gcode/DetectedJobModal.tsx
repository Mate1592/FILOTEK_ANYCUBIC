import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  AlertTriangle,
  Clock,
  Printer,
  X,
  Check,
  Trash2,
  Layers,
  Scale,
} from 'lucide-react';
import type { GcodeJob, Roll } from '../../shared/types';
import { useStore } from '../../store/useStore';
import { formatPrintTime } from '../../lib/gcodeParser';
import { fmtG } from '../../lib/roll';

interface DetectedJobModalProps {
  job: GcodeJob;
  onClose: () => void;
}

export function DetectedJobModal({ job, onClose }: DetectedJobModalProps) {
  const rolls = useStore((s) => s.rolls);
  const markJobPrinted = useStore((s) => s.markJobPrinted);
  const upsertGcodeJob = useStore((s) => s.upsertGcodeJob);
  const discardJob = useStore((s) => s.discardJob);

  const [selectedRollIds, setSelectedRollIds] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    job.filaments.forEach((f) => {
      if (f.rollId) init[f.slotIndex] = f.rollId;
      else if (f.suggestedRollId) init[f.slotIndex] = f.suggestedRollId;
      else {
        const candidate = rolls.find(
          (r) => r.material.toUpperCase() === (f.materialName || 'PLA').toUpperCase() && r.status !== 'empty',
        );
        if (candidate) init[f.slotIndex] = candidate.id;
      }
    });
    return init;
  });

  const handleApplyNow = async () => {
    const updatedJob: GcodeJob = {
      ...job,
      filaments: job.filaments.map((f) => ({
        ...f,
        rollId: selectedRollIds[f.slotIndex] || f.rollId,
      })),
    };
    await upsertGcodeJob(updatedJob);
    await markJobPrinted(updatedJob.id, selectedRollIds);
    onClose();
  };

  const handleDiscard = async () => {
    await discardJob(job.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-lg rounded-2xl bg-surface-1 border border-line shadow-2xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center text-accent-text">
              <Printer size={18} />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-text">{job.jobName}</h3>
              <p className="text-xs text-muted font-mono">{job.filename}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-text cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-muted">
          <span>{fmtG(job.totalGrams)}</span>
          <span>•</span>
          <span>{formatPrintTime(job.printTimeSeconds)}</span>
          <span>•</span>
          <span>{job.filaments.length} filamento(s)</span>
        </div>

        <div className="space-y-2">
          {job.filaments.map((f) => (
            <div key={f.slotIndex} className="p-2.5 rounded-xl bg-surface-2 border border-line text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full border border-line" style={{ backgroundColor: f.colorHex }} />
                <span>{f.materialName} ({f.brand})</span>
              </div>
              <span className="font-mono font-bold">{fmtG(f.grams)}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
          <button
            type="button"
            onClick={handleDiscard}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-muted hover:text-danger cursor-pointer"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={handleApplyNow}
            className="px-4 py-1.5 rounded-xl bg-accent text-accent-ink hover:bg-accent-strong text-xs font-bold transition-all cursor-pointer"
          >
            Registrar como impreso
          </button>
        </div>
      </motion.div>
    </div>
  );
}
