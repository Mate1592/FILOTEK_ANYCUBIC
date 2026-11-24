import React, { Suspense, lazy, useEffect, useState, useRef } from 'react';
import { useStore, useSelectedRoll } from './store/useStore';
import { TitleBar } from './components/layout/TitleBar';
import { ShelfView } from './components/shelf/ShelfView';
import { QuickUseModal } from './components/spool/QuickUseModal';
import { CompanionPromptModal } from './components/inbox/CompanionPromptModal';
import { OnboardingModal } from './components/onboarding/OnboardingModal';
import { Toasts } from './components/layout/Toasts';
import { api } from './lib/api';
import type { GcodeJob, Roll } from './shared/types';
import { parseGcodeText } from './lib/gcodeParser';
import { groupInventoryForReplenishment } from './lib/replenishment';
import { fmtDate } from './lib/roll';
import { AlertCircle, RefreshCw, Printer } from 'lucide-react';

const StatsView = lazy(() => import('./components/stats/StatsView').then((m) => ({ default: m.StatsView })));
const ReplenishmentView = lazy(() => import('./components/replenishment/ReplenishmentView').then((m) => ({ default: m.ReplenishmentView })));
const ShoppingView = lazy(() => import('./components/shopping/ShoppingView').then((m) => ({ default: m.ShoppingView })));
const InboxView = lazy(() => import('./components/inbox/InboxView').then((m) => ({ default: m.InboxView })));
const ToolsView = lazy(() => import('./components/tools/ToolsView').then((m) => ({ default: m.ToolsView })));
const SettingsView = lazy(() => import('./components/settings/SettingsView').then((m) => ({ default: m.SettingsView })));
const RollDetailModal = lazy(() => import('./components/spool/RollDetailModal').then((m) => ({ default: m.RollDetailModal })));
const RollEditorModal = lazy(() => import('./components/spool/RollEditorModal').then((m) => ({ default: m.RollEditorModal })));

function ViewLoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center bg-bg text-muted">
      <div className="w-6 h-6 rounded-full border-2 border-line border-t-accent-text animate-spin" />
    </div>
  );
}

export function App() {
  const loaded = useStore((s) => s.loaded);
  const loadError = useStore((s) => s.loadError);
  const load = useStore((s) => s.load);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const toolsTab = useStore((s) => s.toolsTab);
  const openToolsWithDraft = useStore((s) => s.openToolsWithDraft);
  const selectedRoll = useSelectedRoll();
  const select = useStore((s) => s.select);
  const editor = useStore((s) => s.editor);
  const openEditor = useStore((s) => s.openEditor);
  const focusSearch = useStore((s) => s.focusSearch);
  const settings = useStore((s) => s.settings);
  const rolls = useStore((s) => s.rolls);
  const usage = useStore((s) => s.usage);
  const orders = useStore((s) => s.orders);
  const upsertGcodeJob = useStore((s) => s.upsertGcodeJob);
  const upsertGcodeJobs = useStore((s) => s.upsertGcodeJobs);
  const toast = useStore((s) => s.toast);

  const [quickUseRoll, setQuickUseRoll] = useState<Roll | null>(null);
  const [companionPromptData, setCompanionPromptData] = useState<{
    unreviewedCount: number;
    sessionJobsCount: number;
  } | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounter = useRef(0);
  const notifiedUrgentRef = useRef<Set<string>>(new Set());

  // Initialize DB
  useEffect(() => {
    load();
  }, [load]);

  // Native tray sync on startup & setting changes
  useEffect(() => {
    if (!loaded) return;
    api.win.setTray(!!settings.trayEnabled, !!settings.closeToTray);
  }, [loaded, settings.trayEnabled, settings.closeToTray]);

  // Theme synchronization
  useEffect(() => {
    const applyTheme = () => {
      let isDark = false;
      if (settings.theme === 'dark') isDark = true;
      else if (settings.theme === 'light') isDark = false;
      else isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      api.win.setTheme(isDark);
    };

    applyTheme();

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (settings.theme === 'system') applyTheme();
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [settings.theme]);

  // Global Keyboard shortcuts & Electron menu actions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+N or Cmd+N
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        openEditor({ mode: 'new' });
      }
      // Ctrl+F or Cmd+F
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        focusSearch();
      }
      // Esc
      else if (e.key === 'Escape') {
        if (quickUseRoll) {
          setQuickUseRoll(null);
        } else if (editor) {
          openEditor(null);
        } else if (selectedRoll) {
          select(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Listen to tray menu actions from main process
    const unbind = api.win.onMenuAction((action) => {
      if (action === 'new-roll') openEditor({ mode: 'new' });
      else if (action === 'view-shopping') setView('shopping');
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unbind();
    };
  }, [openEditor, focusSearch, quickUseRoll, editor, selectedRoll, select, setView]);

  // Slicer G-code auto-import from Electron watcher or CLI argument
  useEffect(() => {
    const unbind = api.win.onGcodeImported(async (job) => {
      await upsertGcodeJob(job);
      toast({
        kind: 'info',
        title: 'Nuevo laminado en Bandeja',
        body: `"${job.jobName || job.filename}" listo para revisar (${job.totalGrams} g).`,
        action: {
          label: 'Ver Bandeja',
          run: () => setView('inbox'),
        },
      });
    });

    const unbindCompanion = api.companion?.onSlicerClosedPrompt((data) => {
      setCompanionPromptData(data);
    });

    return () => {
      unbind();
      unbindCompanion?.();
    };
  }, [upsertGcodeJob, toast, setView]);

  // Urgent replenishment check: Native notification when a product enters 'Pedir ya'
  useEffect(() => {
    if (!loaded) return;
    const groups = groupInventoryForReplenishment(rolls, usage, orders, settings);
    const urgent = groups.filter((g) => g.status === 'order_now' && !g.activeOrder);

    for (const g of urgent) {
      if (!notifiedUrgentRef.current.has(g.productKey)) {
        notifiedUrgentRef.current.add(g.productKey);
        const deadlineStr = g.orderDeadline ? fmtDate(g.orderDeadline.toISOString()) : 'hoy';
        const msg = `⚠️ Filamento por agotarse: ${g.brand} ${g.material} ${g.colorName} — pide antes del ${deadlineStr}`;
        api.win.showNotification('⚠️ Filamento por agotarse', msg);
      }
    }

    for (const key of Array.from(notifiedUrgentRef.current)) {
      const isStillUrgent = urgent.some((g) => g.productKey === key);
      if (!isStillUrgent) {
        notifiedUrgentRef.current.delete(key);
      }
    }
  }, [loaded, rolls, usage, orders, settings]);

  // Drag and drop handlers for .gcode and .3mf
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDraggingFile(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDraggingFile(false);

    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;

    const validFiles = files.filter((file) => {
      const lower = file.name.toLowerCase();
      return lower.endsWith('.gcode') || lower.endsWith('.3mf');
    });

    if (validFiles.length === 0) {
      toast({
        kind: 'warn',
        title: 'Archivo no compatible',
        body: 'Arrastra archivos .gcode o .3mf generados por tu laminador.',
      });
      return;
    }

    const parseDroppedFile = async (file: File, filePath: string): Promise<GcodeJob | null> => {
      if (filePath) {
        const res = await api.file.parseGcodePath(filePath);
        if (res.ok && res.data) return res.data;
      }
      if (file.name.toLowerCase().endsWith('.gcode')) {
        const text = await file.text();
        return parseGcodeText(text, file.name, '', rolls, settings.rememberedMappings);
      }
      return null;
    };

    try {
      if (view === 'tools') {
        if (validFiles.length === 1 && toolsTab === 'quote') {
          const file = validFiles[0];
          const filePath = api.file.getPathForFile(file);
          const parsedJob = await parseDroppedFile(file, filePath);
          if (parsedJob) {
            openToolsWithDraft({
              tab: 'quote',
              source: 'drop',
              job: parsedJob,
              jobName: parsedJob.jobName || parsedJob.filename,
              printTimeSeconds: parsedJob.printTimeSeconds,
            });
          } else {
            toast({
              kind: 'error',
              title: 'Error al procesar archivo',
              body: 'No se encontraron datos de consumo o peso en el archivo.',
            });
          }
          return;
        }

        const filePaths: string[] = [];
        const batchJobs: GcodeJob[] = [];
        for (const file of validFiles) {
          const fp = api.file.getPathForFile(file);
          if (fp) {
            filePaths.push(fp);
          } else if (file.name.toLowerCase().endsWith('.gcode')) {
            const text = await file.text();
            const parsed = parseGcodeText(text, file.name, '', rolls, settings.rememberedMappings);
            if (parsed) batchJobs.push(parsed);
          }
        }

        if (filePaths.length === 0 && batchJobs.length === 0) {
          toast({
            kind: 'error',
            title: 'Error al procesar archivo',
            body: 'No se pudieron leer los archivos arrastrados.',
          });
          return;
        }

        openToolsWithDraft({
          tab: 'batch',
          source: 'drop',
          filePaths,
          batchJobs,
        });
        return;
      }

      if (validFiles.length === 1) {
        const file = validFiles[0];
        const filePath = api.file.getPathForFile(file);
        const parsedJob = await parseDroppedFile(file, filePath);
        if (parsedJob) {
          await upsertGcodeJob(parsedJob);
          toast({
            kind: 'success',
            title: 'Archivo añadido a la Bandeja',
            body: `"${parsedJob.jobName || parsedJob.filename}" listo para revisar.`,
            action: {
              label: 'Ver Bandeja',
              run: () => setView('inbox'),
            },
          });
          setView('inbox');
        } else {
          toast({
            kind: 'error',
            title: 'Error al procesar archivo',
            body: 'No se encontraron datos de consumo o peso en el archivo.',
          });
        }
        return;
      }

      const parsedJobs: GcodeJob[] = [];
      for (const file of validFiles) {
        const filePath = api.file.getPathForFile(file);
        const parsed = await parseDroppedFile(file, filePath);
        if (parsed) {
          if (parsed.plates && parsed.plates.length > 0) {
            parsedJobs.push(...parsed.plates);
          } else {
            parsedJobs.push(parsed);
          }
        }
      }

      if (parsedJobs.length > 0) {
        await upsertGcodeJobs(parsedJobs);
        toast({
          kind: 'success',
          title: `${parsedJobs.length} trabajos añadidos a la Bandeja`,
          body: 'Listos para revisar o inspeccionar por lotes.',
          action: {
            label: 'Abrir en Lotes',
            run: () =>
              openToolsWithDraft({
                tab: 'batch',
                source: 'drop',
                batchJobs: parsedJobs,
              }),
          },
        });
        setView('inbox');
      } else {
        toast({
          kind: 'error',
          title: 'Error al procesar archivos',
          body: 'No se encontraron datos de consumo o peso en los archivos arrastrados.',
        });
      }
    } catch (err) {
      toast({
        kind: 'error',
        title: 'Error al leer archivo',
        body: (err as Error).message,
      });
    }
  };

  if (!loaded) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-bg text-text space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-line border-t-accent-text animate-spin" />
        <span className="font-mono text-xs text-muted">Iniciando taller Filoteca...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-bg text-text p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-crit-soft text-crit-text flex items-center justify-center">
          <AlertCircle size={28} />
        </div>
        <div>
          <h2 className="font-display font-bold text-lg">No se pudo cargar la base de datos</h2>
          <p className="text-xs text-muted max-w-md mt-1">{loadError}</p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="px-4 py-2 rounded-xl bg-accent text-accent-ink font-semibold text-xs flex items-center gap-2 cursor-pointer shadow-sm"
        >
          <RefreshCw size={14} />
          <span>Reintentar</span>
        </button>
      </div>
    );
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="h-screen w-screen flex flex-col overflow-hidden bg-bg text-text select-none relative"
    >
      <TitleBar />

      <main className="flex-1 overflow-hidden relative flex flex-col">
        {view === 'shelf' && <ShelfView />}
        {view !== 'shelf' && (
          <Suspense fallback={<ViewLoadingFallback />}>
            {view === 'stats' && <StatsView />}
            {view === 'replenish' && <ReplenishmentView />}
            {view === 'shopping' && <ShoppingView />}
            {view === 'inbox' && <InboxView />}
            {view === 'tools' && <ToolsView />}
            {view === 'settings' && <SettingsView />}
          </Suspense>
        )}
      </main>

      {/* Drag & Drop Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center bg-bg/85 backdrop-blur-xs border-2 border-dashed border-accent m-3 rounded-3xl">
          <div className="flex flex-col items-center gap-3 text-center p-6">
            <div className="w-16 h-16 rounded-3xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent-text animate-pulse">
              <Printer size={32} />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-text">Suelta tu archivo aquí</h3>
              <p className="text-xs text-muted max-w-sm mt-1">
                Detectaremos los gramos, tipo y color de filamento del archivo <span className="font-mono text-accent-text">.gcode</span> o <span className="font-mono text-accent-text">.3mf</span> al instante.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modals & Dialogs */}
      <Suspense fallback={null}>
        {selectedRoll && (
          <RollDetailModal
            roll={selectedRoll}
            onClose={() => select(null)}
            onOpenQuickUse={(r) => {
              select(null);
              setQuickUseRoll(r);
            }}
          />
        )}

        {editor && <RollEditorModal />}
      </Suspense>

      {quickUseRoll && (
        <QuickUseModal
          roll={quickUseRoll}
          onClose={() => setQuickUseRoll(null)}
        />
      )}

      {companionPromptData && (
        <CompanionPromptModal
          unreviewedCount={companionPromptData.unreviewedCount}
          sessionJobsCount={companionPromptData.sessionJobsCount}
          onClose={() => setCompanionPromptData(null)}
          onGoToInbox={() => {
            setCompanionPromptData(null);
            setView('inbox');
          }}
        />
      )}

      {/* Onboarding Tour for first-time users */}
      {!settings.onboardingCompleted && loaded && (
        <OnboardingModal />
      )}

      <Toasts />
    </div>
  );
}
