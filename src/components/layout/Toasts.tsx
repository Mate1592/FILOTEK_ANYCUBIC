import { motion, AnimatePresence } from 'motion/react';
import React from 'react';
import { CheckCircle2, AlertTriangle, Info, Flame, X } from 'lucide-react';
import { useStore } from '../../store/useStore';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismiss);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none select-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const Icon =
            t.kind === 'success'
              ? CheckCircle2
              : t.kind === 'warn'
              ? AlertTriangle
              : t.kind === 'error'
              ? Flame
              : Info;

          const colorClasses =
            t.kind === 'success'
              ? 'text-ok border-ok/20'
              : t.kind === 'warn'
              ? 'text-warn border-warn/25'
              : t.kind === 'error'
              ? 'text-crit border-crit/25'
              : 'text-accent-text border-accent/20';

          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              className="pointer-events-auto p-3.5 rounded-2xl bg-elevated border shadow-xl flex items-start gap-3 border-line"
            >
              <Icon size={18} className={`shrink-0 mt-0.5 ${colorClasses}`} />

              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-text leading-tight">
                  {t.title}
                </h4>
                {t.body && (
                  <p className="text-[11px] text-muted mt-0.5 leading-snug">
                    {t.body}
                  </p>
                )}

                {t.action && (
                  <button
                    type="button"
                    onClick={() => {
                      t.action?.run();
                      dismiss(t.id);
                    }}
                    className="mt-2 px-2.5 py-1 rounded-lg text-xs font-semibold bg-accent text-accent-ink hover:bg-accent-strong transition-all cursor-pointer shadow-xs active:scale-95 inline-block"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-faint hover:text-text p-1 transition-colors -mr-1 -mt-1"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
