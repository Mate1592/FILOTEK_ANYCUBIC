import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Inbox,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Layers,
  Scale,
  Sliders,
  ChevronDown,
  ChevronUp,
  FileCode,
  UploadCloud,
  Check,
  RotateCcw,
  Trash2,
  Maximize2,
  Tag,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  Pipette,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { formatPrintTime } from '../../lib/gcodeParser';
import { fmtG, pctRemaining } from '../../lib/roll';
import { api, isDesktop } from '../../lib/api';
import type { GcodeJob, GcodeJobStatus, Roll } from '../../shared/types';

export function InboxView() {
  const gcodeJobs = useStore((s) => s.gcodeJobs);
  const rolls = useStore((s) => s.rolls);
  const markJobPrinted = useStore((s) => s.markJobPrinted);
  const markJobsPrinted = useStore((s) => s.markJobsPrinted);
  const markJobFailed = useStore((s) => s.markJobFailed);
  const discardJob = useStore((s) => s.discardJob);
  const discardJobs = useStore((s) => s.discardJobs);
  const updateJobFilamentRoll = useStore((s) => s.updateJobFilamentRoll);
  const updateJobFilamentColor = useStore((s) => s.updateJobFilamentColor);
  const updateJobFilamentGrams = useStore((s) => s.updateJobFilamentGrams);
  const toast = useStore((s) => s.toast);

  const [activeTab, setActiveTab] = useState<GcodeJobStatus | 'all'>('unreviewed');
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [editingGrams, setEditingGrams] = useState<Record<string, Record<number, number>>>({});
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  // Estado para el modal de impresión parcial / fallida
  const [failedModalJob, setFailedModalJob] = useState<GcodeJob | null>(null);
  const [failedPercent, setFailedPercent] = useState<number>(50);
  const [failedCustomGrams, setFailedCustomGrams] = useState<Record<number, number>>({});

  // Agrupación por clave de sesión (sessionKey) para evitar duplicados en pantalla
  const groupedJobs = useMemo(() => {
    const list = activeTab === 'all' ? gcodeJobs : gcodeJobs.filter((j) => (j.status || 'unreviewed') === activeTab);
    // Ordenar de más reciente a más antiguo
    const sorted = [...list].sort((a, b) => new Date(b.slicedAt || b.createdAt).getTime() - new Date(a.slicedAt || a.createdAt).getTime());

    const groups: Array<{ key: string; primary: GcodeJob; versions: GcodeJob[] }> = [];
    const seen = new Set<string>();

    for (const job of sorted) {
      const sKey = job.sessionKey || job.id;
      if (seen.has(sKey)) {
        // Añadir como versión secundaria del grupo
        const g = groups.find((grp) => grp.key === sKey);
        if (g) g.versions.push(job);
      } else {
        seen.add(sKey);
        groups.push({ key: sKey, primary: job, versions: [job] });
      }
    }

    return groups;
  }, [gcodeJobs, activeTab]);

  const counts = useMemo(() => {
    return {
      unreviewed: gcodeJobs.filter((j) => (j.status || 'unreviewed') === 'unreviewed').length,
      printed: gcodeJobs.filter((j) => j.status === 'printed').length,
      failed: gcodeJobs.filter((j) => j.status === 'failed').length,
      discarded: gcodeJobs.filter((j) => j.status === 'discarded').length,
      all: gcodeJobs.length,
    };
  }, [gcodeJobs]);

  const toggleSelectJob = (id: string) => {
    const next = new Set(selectedJobIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedJobIds(next);
  };

  const selectAllUnreviewed = () => {
    const unreviewed = gcodeJobs.filter((j) => (j.status || 'unreviewed') === 'unreviewed');
    if (selectedJobIds.size === unreviewed.length) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(unreviewed.map((j) => j.id)));
    }
  };

  const handleBatchPrint = async () => {
    if (selectedJobIds.size === 0) return;
    await markJobsPrinted(Array.from(selectedJobIds));
    setSelectedJobIds(new Set());
  };

  const handleBatchDiscard = async () => {
    if (selectedJobIds.size === 0) return;
    await discardJobs(Array.from(selectedJobIds));
    setSelectedJobIds(new Set());
  };

  const openFailedModal = (job: GcodeJob) => {
    setFailedModalJob(job);
    setFailedPercent(50);
    const initGrams: Record<number, number> = {};
    job.filaments.forEach((f) => {
      initGrams[f.slotIndex] = Math.round(f.grams * 0.5 * 10) / 10;
    });
    setFailedCustomGrams(initGrams);
  };

  const confirmFailedPrint = async () => {
    if (!failedModalJob) return;
    await markJobFailed(failedModalJob.id, failedPercent, failedCustomGrams);
    setFailedModalJob(null);
  };

  // Convertidor de URL de miniaturas para Electron y Web
  const resolveThumbUrl = (url?: string) => {
    if (!url) return undefined;
    if (url.startsWith('data:image/') || url.startsWith('http')) return url;
    if (url.startsWith('filoteca-media:')) return url;
    return `filoteca-media://thumbnail?path=${encodeURIComponent(url)}`;
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Encabezado de la Bandeja */}
      <div className="p-4 sm:p-6 border-b border-line bg-surface-1/60 backdrop-blur-md flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-text">
              <Inbox size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-extrabold text-lg text-text">Bandeja de laminados</h1>
                {counts.unreviewed > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-accent text-accent-ink animate-pulse">
                    {counts.unreviewed} {counts.unreviewed === 1 ? 'pendiente' : 'pendientes'}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">
                Ingestión automática desde Anycubic Slicer Next y OrcaSlicer. Confirma solo lo que imprimas.
              </p>
            </div>
          </div>

          {/* Selector de pestañas de estado */}
          <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-line text-xs font-medium self-start sm:self-auto overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('unreviewed')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'unreviewed' ? 'bg-surface-1 text-text shadow-xs font-semibold' : 'text-muted hover:text-text'
              }`}
            >
              <span>Por revisar</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-surface-3 text-muted">
                {counts.unreviewed}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('printed')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'printed' ? 'bg-surface-1 text-text shadow-xs font-semibold' : 'text-muted hover:text-text'
              }`}
            >
              <span>Impresos</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-surface-3 text-muted">
                {counts.printed}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('failed')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'failed' ? 'bg-surface-1 text-text shadow-xs font-semibold' : 'text-muted hover:text-text'
              }`}
            >
              <span>Fallidos</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-surface-3 text-muted">
                {counts.failed}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('discarded')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'discarded' ? 'bg-surface-1 text-text shadow-xs font-semibold' : 'text-muted hover:text-text'
              }`}
            >
              <span>Descartados</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-surface-3 text-muted">
                {counts.discarded}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'all' ? 'bg-surface-1 text-text shadow-xs font-semibold' : 'text-muted hover:text-text'
              }`}
            >
              <span>Todos</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-surface-3 text-muted">
                {counts.all}
              </span>
            </button>
          </div>
        </div>

        {/* Barra de herramientas para selección por lote (visible en tab 'unreviewed') */}
        {activeTab === 'unreviewed' && counts.unreviewed > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line/60">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllUnreviewed}
                className="text-xs px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 border border-line text-text flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <div
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
                    selectedJobIds.size > 0 && selectedJobIds.size === counts.unreviewed
                      ? 'bg-accent border-accent text-accent-ink'
                      : 'border-muted'
                  }`}
                >
                  {selectedJobIds.size === counts.unreviewed && <Check size={10} strokeWidth={3} />}
                </div>
                <span>
                  {selectedJobIds.size === counts.unreviewed ? 'Deseleccionar todos' : 'Seleccionar todos los pendientes'}
                </span>
              </button>

              {selectedJobIds.size > 0 && (
                <span className="text-xs text-muted font-mono">
                  ({selectedJobIds.size} de {counts.unreviewed} seleccionados)
                </span>
              )}
            </div>

            {selectedJobIds.size > 0 && (
              <div className="flex items-center gap-2 animate-fadeIn">
                <button
                  type="button"
                  onClick={handleBatchPrint}
                  className="px-3 py-1.5 rounded-lg bg-accent text-accent-ink hover:bg-accent-strong text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                >
                  <CheckCircle2 size={14} />
                  <span>Registrar seleccionados como impresos</span>
                </button>

                <button
                  type="button"
                  onClick={handleBatchDiscard}
                  className="px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-line text-muted hover:text-danger text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <XCircle size={14} />
                  <span>Descartar seleccionados</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Contenido principal: Lista de tarjetas */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {groupedJobs.length === 0 ? (
          <div className="h-64 rounded-2xl border-2 border-dashed border-line flex flex-col items-center justify-center text-center p-6 bg-surface-1/30">
            <UploadCloud size={36} className="text-muted/60 mb-3" />
            <p className="font-display font-bold text-sm text-text">No hay laminados en esta categoría</p>
            <p className="text-xs text-muted max-w-sm mt-1">
              Los archivos laminados en Anycubic Slicer Next se detectan automáticamente en segundo plano. También puedes
              arrastrar archivos .gcode o .metadata aquí.
            </p>
          </div>
        ) : (
          groupedJobs.map(({ key, primary, versions }) => {
            const isSelected = selectedJobIds.has(primary.id);
            const hasMultipleVersions = versions.length > 1;
            const isVersionGroupExpanded = expandedSessions.has(key);
            const jobsToRender = isVersionGroupExpanded ? versions : [primary];

            return (
              <div key={key} className="space-y-2">
                {/* Indicador de versiones agrupadas si hay más de 1 laminado repetido */}
                {hasMultipleVersions && (
                  <div className="flex items-center justify-between px-2 text-[11px] text-muted">
                    <span className="font-medium flex items-center gap-1">
                      <Layers size={12} className="text-accent-text" />
                      <span>
                        Se laminó {versions.length} veces en esta sesión (mostrando la versión más reciente)
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Set(expandedSessions);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        setExpandedSessions(next);
                      }}
                      className="text-accent-text hover:underline flex items-center gap-0.5 cursor-pointer font-medium"
                    >
                      <span>{isVersionGroupExpanded ? 'Ocultar versiones previas' : `Ver ${versions.length - 1} versión(es) anterior(es)`}</span>
                      {isVersionGroupExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>
                )}

                {jobsToRender.map((job, vIdx) => {
                  const isVersionSub = hasMultipleVersions && isVersionGroupExpanded && vIdx > 0;
                  const thumb = resolveThumbUrl(job.thumbnailSmallPath);

                  return (
                    <motion.div
                      key={job.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`rounded-2xl border transition-all overflow-hidden ${
                        isVersionSub
                          ? 'bg-surface-2/40 border-line/60 ml-4 scale-98'
                          : 'bg-surface-1 border-line shadow-xs hover:border-line-focus'
                      }`}
                    >
                      <div className="p-4 sm:p-5 flex flex-col lg:flex-row gap-5 items-start">
                        {/* Checkbox de selección + Miniatura 260x260 */}
                        <div className="flex items-start gap-3 w-full lg:w-auto shrink-0">
                          {activeTab === 'unreviewed' && (
                            <button
                              type="button"
                              onClick={() => toggleSelectJob(job.id)}
                              className="mt-1 cursor-pointer"
                            >
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                  selectedJobIds.has(job.id)
                                    ? 'bg-accent border-accent text-accent-ink'
                                    : 'border-muted hover:border-text'
                                }`}
                              >
                                {selectedJobIds.has(job.id) && <Check size={11} strokeWidth={3} />}
                              </div>
                            </button>
                          )}

                          {/* Miniatura del modelo */}
                          <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-xl bg-surface-2 border border-line flex items-center justify-center overflow-hidden shrink-0 group">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={job.jobName}
                                className="w-full h-full object-contain p-1"
                                onError={(e) => {
                                  // Fallback si la imagen no carga
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-faint">
                                <FileCode size={32} />
                                <span className="text-[10px] mt-1 font-mono">G-code</span>
                              </div>
                            )}

                            {/* Badge de estado en la miniatura */}
                            <span
                              className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase shadow-xs ${
                                job.status === 'printed'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : job.status === 'failed'
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : job.status === 'discarded'
                                  ? 'bg-muted/20 text-muted border border-muted/30'
                                  : 'bg-accent/20 text-accent-text border border-accent/40'
                              }`}
                            >
                              {job.status === 'printed'
                                ? 'Impreso'
                                : job.status === 'failed'
                                ? `Fallido ${job.printedPercent ? `(${job.printedPercent}%)` : ''}`
                                : job.status === 'discarded'
                                ? 'Descartado'
                                : 'Por revisar'}
                            </span>
                          </div>
                        </div>

                        {/* Información central del trabajo */}
                        <div className="flex-1 min-w-0 space-y-3 w-full">
                          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                            <div>
                              <h3 className="font-display font-extrabold text-base text-text tracking-tight truncate">
                                {job.jobName}
                              </h3>
                              <p className="text-xs text-muted font-mono flex items-center gap-2 mt-0.5">
                                <span>{job.filename}</span>
                                {job.plateIndex > 1 && <span>• Placa {job.plateIndex}</span>}
                                {job.slicedAt && <span>• {new Date(job.slicedAt).toLocaleTimeString()}</span>}
                              </p>
                            </div>

                            {/* Gramos totales y tiempo */}
                            <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
                              <span className="font-display font-black text-sm text-text flex items-center gap-1">
                                <Scale size={14} className="text-accent-text" />
                                {fmtG(job.totalGrams)}
                              </span>
                              <span className="text-xs text-muted font-mono flex items-center gap-1">
                                <Clock size={13} />
                                {formatPrintTime(job.printTimeSeconds)}
                              </span>
                            </div>
                          </div>

                          {/* Chips de metadatos técnicos (capas, cambios de color, dimensiones) */}
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                            {job.totalLayersCount > 0 && (
                              <span className="px-2 py-0.5 rounded-lg bg-surface-2 border border-line flex items-center gap-1">
                                <Layers size={11} />
                                <span>{job.totalLayersCount} capas</span>
                              </span>
                            )}

                            {job.colorChangesCount > 0 && (
                              <span className="px-2 py-0.5 rounded-lg bg-surface-2 border border-line flex items-center gap-1 text-accent-text">
                                <RotateCcw size={11} />
                                <span>{job.colorChangesCount} cambios de color</span>
                              </span>
                            )}

                            {job.dimensions && (
                              <span className="px-2 py-0.5 rounded-lg bg-surface-2 border border-line font-mono text-[10px]">
                                {job.dimensions.x.toFixed(1)} × {job.dimensions.y.toFixed(1)} × {job.dimensions.z.toFixed(1)} mm
                              </span>
                            )}
                          </div>

                          {/* Banner de Revisión Manual si hay discrepancia */}
                          {job.manualReviewRequired && (
                            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-xs text-amber-300">
                              <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-400" />
                              <div className="flex-1">
                                <span className="font-bold">Revisión requerida: </span>
                                <span>{job.manualReviewReason || 'Discrepancia detectada en los metadatos del laminador.'}</span>
                              </div>
                            </div>
                          )}

                          {/* Lista de filamentos / ranuras usadas */}
                          <div className="space-y-2 pt-1 border-t border-line/60">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-faint">
                              Ranuras de filamento ({job.filaments.length})
                            </span>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {job.filaments.map((slot) => {
                                const currentGrams = editingGrams[job.id]?.[slot.slotIndex] ?? slot.grams;
                                const chosenRollId = slot.rollId ?? slot.suggestedRollId;
                                const chosenRoll = rolls.find((r) => r.id === chosenRollId);
                                const isInsufficient = chosenRoll ? chosenRoll.remainingWeight < currentGrams : slot.insufficientStock;

                                return (
                                  <div
                                    key={slot.slotIndex}
                                    className="p-3 rounded-xl bg-surface-2/80 border border-line/80 flex flex-col gap-2.5 text-xs shadow-xs"
                                  >
                                    {/* Fila superior: Ranura, Material y Gramos */}
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-surface-3 text-muted shrink-0">
                                          #{slot.slotIndex + 1}
                                        </span>
                                        <span className="font-semibold text-text truncate">
                                          {slot.materialName}
                                        </span>
                                        <span className="text-faint">•</span>
                                        <span className="text-muted truncate max-w-[100px]">
                                          {slot.brand || 'Genérico'}
                                        </span>
                                      </div>

                                      {/* Gramos editables */}
                                      <div className="flex items-center gap-1 shrink-0 font-mono">
                                        <input
                                          type="number"
                                          step="0.1"
                                          min="0"
                                          value={currentGrams}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 0;
                                            setEditingGrams((prev) => ({
                                              ...prev,
                                              [job.id]: {
                                                ...(prev[job.id] || {}),
                                                [slot.slotIndex]: val,
                                              },
                                            }));
                                            updateJobFilamentGrams(job.id, slot.slotIndex, val);
                                          }}
                                          className="w-14 h-6 text-right px-1 rounded bg-surface-1 border border-line text-xs font-mono text-text outline-none focus:border-accent-text"
                                          title="Gramos requeridos para este slot"
                                        />
                                        <span className="text-muted text-[11px]">g</span>
                                      </div>
                                    </div>

                                    {/* Fila intermedia: Color en G-code (con selector interactivo y editable) */}
                                    <div className="p-2 rounded-lg bg-surface-1/90 border border-line/60 flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 min-w-0">
                                        {/* Swatch interactivo con input de color transparente encima */}
                                        <label
                                          className="relative w-6 h-6 rounded-md border border-line-strong shadow-xs cursor-pointer overflow-hidden group shrink-0"
                                          style={{ backgroundColor: slot.colorHex }}
                                          title="Haz clic para seleccionar o cambiar el color del G-code"
                                        >
                                          <input
                                            type="color"
                                            value={slot.colorHex.startsWith('#') && slot.colorHex.length === 7 ? slot.colorHex : '#888888'}
                                            onChange={(e) => {
                                              updateJobFilamentColor(job.id, slot.slotIndex, e.target.value.toUpperCase());
                                            }}
                                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                                          />
                                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                            <Pipette size={11} />
                                          </div>
                                        </label>

                                        <div className="flex flex-col min-w-0">
                                          <div className="flex items-center gap-1.5 text-[11px]">
                                            <span className="text-muted font-medium shrink-0">Color G-code:</span>
                                            <input
                                              type="text"
                                              value={slot.colorHex}
                                              onChange={(e) => {
                                                const val = e.target.value.trim().toUpperCase();
                                                if (/^#[0-9A-F]{0,6}$/.test(val)) {
                                                  if (val.length === 7) {
                                                    updateJobFilamentColor(job.id, slot.slotIndex, val);
                                                  }
                                                }
                                              }}
                                              className="w-18 h-5 px-1 rounded bg-surface-2 border border-line text-[11px] font-mono font-bold text-text outline-none focus:border-accent-text uppercase"
                                              placeholder="#RRGGBB"
                                              title="Código HEX del color detectado (editable)"
                                            />
                                          </div>
                                          {slot.gcodeColorHex && slot.gcodeColorHex !== slot.colorHex && (
                                            <span className="text-[9px] text-muted font-mono flex items-center gap-1 mt-0.5">
                                              <span>Orig: {slot.gcodeColorHex}</span>
                                              <button
                                                type="button"
                                                onClick={() => updateJobFilamentColor(job.id, slot.slotIndex, slot.gcodeColorHex!)}
                                                className="text-accent-text hover:underline cursor-pointer"
                                                title="Restaurar color original extraído del archivo G-code"
                                              >
                                                (restaurar)
                                              </button>
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      <span className="text-[10px] text-faint font-mono shrink-0">
                                        {slot.colorHex}
                                      </span>
                                    </div>

                                    {/* Selector de bobina física sugerida / asignada */}
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-faint font-medium">Bobina asignada:</span>
                                        {slot.confidence !== undefined && (
                                          <span
                                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                              slot.confidence >= 80
                                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                                : slot.confidence >= 50
                                                ? 'bg-accent/15 text-accent-text border border-accent/20'
                                                : 'bg-surface-3 text-muted'
                                            }`}
                                          >
                                            {slot.confidence >= 80 ? 'Match exacto' : slot.confidence >= 50 ? 'Match bueno' : 'Sugerido'}
                                          </span>
                                        )}
                                      </div>

                                      <select
                                        value={chosenRollId || ''}
                                        onChange={(e) => {
                                          updateJobFilamentRoll(job.id, slot.slotIndex, e.target.value);
                                        }}
                                        className="h-8 px-2 rounded-lg bg-surface-1 border border-line text-xs text-text outline-none focus:border-accent-text truncate"
                                      >
                                        <option value="">-- Seleccionar bobina física --</option>
                                        {rolls
                                          .filter((r) => r.status !== 'empty')
                                          .map((r) => (
                                            <option key={r.id} value={r.id}>
                                              {r.colorName || r.brand} ({r.material}) — {fmtG(r.remainingWeight)} disp. [{r.colorHex}]
                                            </option>
                                          ))}
                                      </select>

                                      {/* Vista previa de la bobina física asignada */}
                                      {chosenRoll && (
                                        <div className="flex items-center justify-between text-[11px] px-1 py-0.5 rounded bg-surface-1/40 text-muted">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span
                                              className="w-2.5 h-2.5 rounded-full border border-line shrink-0"
                                              style={{ backgroundColor: chosenRoll.colorHex }}
                                              title={`Color real de la bobina física: ${chosenRoll.colorHex}`}
                                            />
                                            <span className="truncate max-w-[120px] font-medium text-text">
                                              {chosenRoll.colorName}
                                            </span>
                                            <span className="text-[10px] font-mono text-faint">
                                              ({chosenRoll.colorHex})
                                            </span>
                                          </div>
                                          <span className="font-mono text-[10px] text-faint shrink-0">
                                            {fmtG(chosenRoll.remainingWeight)} disp.
                                          </span>
                                        </div>
                                      )}

                                      {/* Advertencia de stock insuficiente */}
                                      {isInsufficient && chosenRoll && (
                                        <span className="text-[10px] text-danger font-medium flex items-center gap-1 mt-0.5">
                                          <AlertCircle size={10} />
                                          <span>Faltan {(currentGrams - chosenRoll.remainingWeight).toFixed(1)} g en esta bobina</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Botones de acción por tarjeta */}
                        <div className="flex flex-row lg:flex-col items-center gap-2 w-full lg:w-36 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-line/60">
                          {job.status === 'unreviewed' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => markJobPrinted(job.id)}
                                className="flex-1 lg:w-full h-9 rounded-xl bg-accent text-accent-ink hover:bg-accent-strong text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                              >
                                <Check size={14} strokeWidth={3} />
                                <span>Lo imprimí</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => openFailedModal(job)}
                                className="flex-1 lg:w-full h-8 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-text text-xs font-medium flex items-center justify-center gap-1 transition-all cursor-pointer"
                              >
                                <Sliders size={13} />
                                <span>Falló / parcial</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => discardJob(job.id)}
                                className="h-8 px-2.5 rounded-xl bg-transparent hover:bg-surface-2 text-muted hover:text-danger text-xs font-medium flex items-center justify-center gap-1 transition-all cursor-pointer"
                                title="No se imprimió este archivo"
                              >
                                <XCircle size={13} />
                                <span>No lo imprimí</span>
                              </button>
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => markJobPrinted(job.id)}
                                className="text-xs text-muted hover:text-text underline cursor-pointer"
                              >
                                Re-imprimir
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {/* Modal de Impresión Parcial / Fallida */}
      <AnimatePresence>
        {failedModalJob && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl bg-surface-1 border border-line shadow-xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Sliders size={18} />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-sm text-text">Impresión fallida o parcial</h3>
                    <p className="text-xs text-muted">Ajusta el porcentaje para descontar solo lo gastado</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFailedModalJob(null)}
                  className="text-muted hover:text-text cursor-pointer"
                >
                  <XCircle size={18} />
                </button>
              </div>

              {/* Slider de porcentaje completado */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-text">Porcentaje impreso antes del fallo:</span>
                  <span className="font-mono font-bold text-accent-text text-sm">{failedPercent}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="95"
                  step="5"
                  value={failedPercent}
                  onChange={(e) => {
                    const p = parseInt(e.target.value, 10);
                    setFailedPercent(p);
                    const updatedGrams: Record<number, number> = {};
                    failedModalJob.filaments.forEach((f) => {
                      updatedGrams[f.slotIndex] = Math.round(f.grams * (p / 100) * 10) / 10;
                    });
                    setFailedCustomGrams(updatedGrams);
                  }}
                  className="w-full h-2 rounded-lg bg-surface-2 accent-accent cursor-pointer"
                />
              </div>

              {/* Desglose de gramos a descontar por ranura */}
              <div className="space-y-2 border-t border-line pt-3">
                <span className="text-xs font-semibold text-text">Gramos calculados a descontar:</span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {failedModalJob.filaments.map((f) => (
                    <div
                      key={f.slotIndex}
                      className="flex items-center justify-between p-2 rounded-lg bg-surface-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3.5 h-3.5 rounded-full border border-line"
                          style={{ backgroundColor: f.colorHex }}
                        />
                        <span className="text-muted truncate">{f.materialName} ({f.brand})</span>
                      </div>
                      <span className="font-mono font-bold text-text">
                        {failedCustomGrams[f.slotIndex] ?? Math.round(f.grams * (failedPercent / 100) * 10) / 10} g
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setFailedModalJob(null)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium text-muted hover:text-text cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmFailedPrint}
                  className="px-4 py-1.5 rounded-xl bg-accent text-accent-ink hover:bg-accent-strong text-xs font-bold transition-all active:scale-95 cursor-pointer"
                >
                  Confirmar descuento parcial
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
