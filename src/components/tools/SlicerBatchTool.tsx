import React, { useMemo, useRef } from 'react';
import {
  FolderOpen,
  Trash2,
  Calculator,
  Inbox,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Scale,
  Layers,
  FileCode,
} from 'lucide-react';
import { api, isDesktop } from '../../lib/api';
import { formatPrintTime, parseGcodeText } from '../../lib/gcodeParser';
import { costPerGram, fmtG, fmtMoney, uid } from '../../lib/roll';
import { useI18n } from '../../lib/i18n';
import { useStore, type ToolDraftMaterial } from '../../store/useStore';
import type { GcodeJob, Roll } from '../../shared/types';

export interface BatchItem {
  id: string;
  job: GcodeJob;
  copies: number;
  rollOverrides: Record<number, string>;
}

interface SlicerBatchToolProps {
  items: BatchItem[];
  setItems: React.Dispatch<React.SetStateAction<BatchItem[]>>;
}

export function flattenGcodeJobs(jobs: GcodeJob[]): GcodeJob[] {
  const out: GcodeJob[] = [];
  for (const job of jobs) {
    if (job.plates && job.plates.length > 0) {
      out.push(...job.plates);
    } else {
      out.push(job);
    }
  }
  return out;
}

export function SlicerBatchTool({ items, setItems }: SlicerBatchToolProps) {
  const { t } = useI18n();
  const rolls = useStore((s) => s.rolls);
  const settings = useStore((s) => s.settings);
  const openToolsWithDraft = useStore((s) => s.openToolsWithDraft);
  const upsertGcodeJobs = useStore((s) => s.upsertGcodeJobs);
  const toast = useStore((s) => s.toast);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rollsById = useMemo(() => {
    const map = new Map<string, Roll>();
    for (const r of rolls) map.set(r.id, r);
    return map;
  }, [rolls]);

  const appendParsedJobs = (jobs: GcodeJob[]) => {
    const flattened = flattenGcodeJobs(jobs);
    if (!flattened.length) return;
    setItems((prev) => [
      ...prev,
      ...flattened.map((job) => ({
        id: uid(),
        job,
        copies: 1,
        rollOverrides: {},
      })),
    ]);
  };

  const handleSelectFiles = async () => {
    if (isDesktop) {
      const paths = await api.file.openMultiple([
        { name: 'Slicer (.gcode, .3mf, .metadata)', extensions: ['gcode', '3mf', 'metadata'] },
      ]);
      if (!paths.length) return;
      const parsed: GcodeJob[] = [];
      for (const fp of paths) {
        const res = await api.file.parseGcodePath(fp);
        if (res.ok && res.data) {
          parsed.push(res.data);
        } else {
          toast({ kind: 'warn', title: t('batchParseError', { name: fp.split(/[\\/]/).pop() || fp }) });
        }
      }
      appendParsedJobs(parsed);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleBrowserFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const parsed: GcodeJob[] = [];
    for (const file of files) {
      const fp = api.file.getPathForFile(file);
      if (fp) {
        const res = await api.file.parseGcodePath(fp);
        if (res.ok && res.data) {
          parsed.push(res.data);
          continue;
        }
      }
      if (file.name.toLowerCase().endsWith('.gcode')) {
        const text = await file.text();
        const job = parseGcodeText(text, file.name, '', rolls, settings.rememberedMappings);
        if (job) parsed.push(job);
        else toast({ kind: 'warn', title: t('batchParseError', { name: file.name }) });
      } else {
        toast({ kind: 'warn', title: t('batchParseError', { name: file.name }) });
      }
    }
    appendParsedJobs(parsed);
  };

  const summary = useMemo(() => {
    let totalSeconds = 0;
    let totalGrams = 0;
    let totalMeters = 0;
    let totalMaterialCost = 0;
    let unmatchedSlots = 0;
    const rollDemand = new Map<string, number>();

    for (const item of items) {
      const copies = Math.max(1, Math.round(item.copies || 1));
      totalSeconds += (item.job.printTimeSeconds || 0) * copies;

      for (const slot of item.job.filaments) {
        const slotGrams = Math.max(0, slot.grams) * copies;
        totalGrams += slotGrams;
        if (slot.lengthMm && slot.lengthMm > 0) {
          totalMeters += (slot.lengthMm / 1000) * copies;
        }
        const chosenId = item.rollOverrides[slot.slotIndex] ?? slot.rollId ?? slot.suggestedRollId;
        if (chosenId) {
          const roll = rollsById.get(chosenId);
          if (roll) {
            rollDemand.set(roll.id, (rollDemand.get(roll.id) || 0) + slotGrams);
            totalMaterialCost += slotGrams * costPerGram(roll);
          } else {
            unmatchedSlots += 1;
          }
        } else {
          unmatchedSlots += 1;
        }
      }

      if (item.job.filaments.length === 0 && item.job.totalGrams > 0) {
        totalGrams += item.job.totalGrams * copies;
      }
      if (
        item.job.filaments.every((f) => !f.lengthMm) &&
        item.job.filamentLengthMm &&
        item.job.filamentLengthMm > 0
      ) {
        totalMeters += (item.job.filamentLengthMm / 1000) * copies;
      }
    }

    const rollChecks = Array.from(rollDemand.entries()).map(([rollId, neededGrams]) => {
      const roll = rollsById.get(rollId)!;
      const availableGrams = roll.remainingWeight;
      const missingGrams = Math.max(0, neededGrams - availableGrams);
      return {
        roll,
        neededGrams,
        availableGrams,
        missingGrams,
        ok: missingGrams <= 0.05,
      };
    });

    const shortages = rollChecks.filter((rc) => !rc.ok);

    return {
      totalSeconds,
      totalGrams,
      totalMeters,
      totalMaterialCost,
      unmatchedSlots,
      rollChecks,
      shortages,
    };
  }, [items, rollsById]);

  const handleSendToQuote = () => {
    if (!items.length) return;
    const byKey = new Map<string, ToolDraftMaterial>();
    for (const item of items) {
      const copies = Math.max(1, Math.round(item.copies || 1));
      for (const slot of item.job.filaments) {
        const chosenId = item.rollOverrides[slot.slotIndex] ?? slot.rollId ?? slot.suggestedRollId;
        const roll = chosenId ? rollsById.get(chosenId) : undefined;
        const key = roll ? `roll:${roll.id}` : `mat:${slot.materialName}:${slot.colorHex}`;
        const grams = Math.max(0, slot.grams) * copies;
        const prev = byKey.get(key);
        if (prev) {
          prev.grams = Number((prev.grams + grams).toFixed(1));
        } else if (roll) {
          byKey.set(key, {
            name: `${roll.brand} ${roll.material} — ${roll.colorName}`,
            rollId: roll.id,
            grams: Number(grams.toFixed(1)),
            costPerGram: Number(costPerGram(roll).toFixed(4)),
            spoolPrice: roll.price,
            spoolWeightGrams: roll.initialWeight,
            colorHex: roll.colorHex,
            materialName: roll.material,
          });
        } else {
          byKey.set(key, {
            name: `${slot.materialName || 'PLA'}${slot.brand ? ` (${slot.brand})` : ''}`,
            grams: Number(grams.toFixed(1)),
            colorHex: slot.colorHex,
            materialName: slot.materialName,
          });
        }
      }
      if (item.job.filaments.length === 0 && item.job.totalGrams > 0) {
        const grams = Math.max(0, item.job.totalGrams) * copies;
        const key = 'mat:PLA:generic';
        const prev = byKey.get(key);
        if (prev) {
          prev.grams = Number((prev.grams + grams).toFixed(1));
        } else {
          byKey.set(key, {
            name: 'PLA',
            grams: Number(grams.toFixed(1)),
            materialName: 'PLA',
          });
        }
      }
    }

    const firstLabel = items[0].job.jobName || items[0].job.filename;
    const jobName = items.length === 1 ? firstLabel : `${firstLabel} (+${items.length - 1})`;

    openToolsWithDraft({
      tab: 'quote',
      source: 'batch',
      jobName,
      printTimeSeconds: summary.totalSeconds,
      materials: Array.from(byKey.values()),
    });
  };

  const handleSendToInbox = async () => {
    if (!items.length) return;
    const jobsToSave: GcodeJob[] = [];
    for (const item of items) {
      const patchedFilaments = item.job.filaments.map((f) => {
        const overrideRollId = item.rollOverrides[f.slotIndex];
        return overrideRollId ? { ...f, rollId: overrideRollId } : f;
      });
      const copies = Math.max(1, Math.round(item.copies || 1));
      for (let c = 0; c < copies; c++) {
        const suffix = copies > 1 ? ` (${c + 1}/${copies})` : '';
        jobsToSave.push({
          ...item.job,
          id: c === 0 ? item.job.id : `${item.job.id}-copy-${c + 1}-${uid()}`,
          jobName: `${item.job.jobName || item.job.filename}${suffix}`,
          filaments: patchedFilaments,
          status: 'unreviewed',
        });
      }
    }
    await upsertGcodeJobs(jobsToSave);
    toast({
      kind: 'success',
      title: t('batchSentInboxToast', { count: jobsToSave.length }),
    });
  };

  const handleDownloadCsv = async () => {
    if (!items.length) return;
    const esc = (v: string | number | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'Job',
      'File',
      'Plate',
      'Copies',
      'Slicer',
      'Printer',
      'TimeSeconds',
      'Layers',
      'LayerHeight',
      'Nozzle',
      'GramsPerCopy',
      'TotalGrams',
    ];
    const rows = items.map((it) => {
      const c = Math.max(1, Math.round(it.copies || 1));
      return [
        esc(it.job.jobName || it.job.filename),
        esc(it.job.filename),
        esc(it.job.plateIndex),
        esc(c),
        esc([it.job.slicerName, it.job.slicerVersion].filter(Boolean).join(' ')),
        esc(it.job.printerModel || ''),
        esc(it.job.printTimeSeconds || 0),
        esc(it.job.totalLayersCount || 0),
        esc(it.job.layerHeight ?? ''),
        esc(it.job.nozzleDiameter ?? ''),
        esc(it.job.totalGrams),
        esc((it.job.totalGrams * c).toFixed(1)),
      ].join(',');
    });
    const content = '\ufeff' + [headers.join(','), ...rows].join('\r\n');
    const res = await api.file.saveTextFile({
      defaultName: 'filoteca-batch.csv',
      content,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (res.ok && res.path) {
      toast({ kind: 'success', title: t('batchExportedToast', { path: res.path }) });
    }
  };

  const handleDownloadJson = async () => {
    if (!items.length) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      summary: {
        itemsCount: items.length,
        totalTimeSeconds: summary.totalSeconds,
        totalGrams: Number(summary.totalGrams.toFixed(1)),
        totalMeters: Number(summary.totalMeters.toFixed(2)),
        estimatedMaterialCost: Number(summary.totalMaterialCost.toFixed(2)),
      },
      items: items.map((it) => ({
        copies: it.copies,
        job: it.job,
      })),
    };
    const res = await api.file.saveTextFile({
      defaultName: 'filoteca-batch.json',
      content: JSON.stringify(payload, null, 2),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (res.ok && res.path) {
      toast({ kind: 'success', title: t('batchExportedToast', { path: res.path }) });
    }
  };

  return (
    <div className="space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".gcode,.3mf"
        onChange={handleBrowserFiles}
        className="hidden"
      />

      {/* Header & File Selection */}
      <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-base text-text">{t('batchTitle')}</h2>
          <p className="text-xs text-muted mt-0.5">{t('batchSubtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="batch-select-files-btn"
            onClick={() => void handleSelectFiles()}
            className="px-3.5 py-2 rounded-xl bg-accent text-accent-ink hover:bg-accent-strong font-semibold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
          >
            <FolderOpen size={14} />
            <span>{t('batchSelectFilesBtn')}</span>
          </button>

          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setItems([])}
              className="px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-muted hover:text-crit-text text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Trash2 size={13} />
              <span>{t('batchClearBtn')}</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-surface-1 border border-line shadow-xs">
            <span className="text-[11px] font-mono text-muted uppercase">{t('batchKpiFiles')}</span>
            <div className="text-xl font-mono font-bold text-text mt-0.5 tabular">{items.length}</div>
          </div>
          <div className="p-3.5 rounded-2xl bg-surface-1 border border-line shadow-xs">
            <span className="text-[11px] font-mono text-muted uppercase">{t('batchKpiTotalGrams')}</span>
            <div className="text-xl font-mono font-bold text-text mt-0.5 tabular">
              {fmtG(summary.totalGrams)}
              {summary.totalMeters > 0 && (
                <span className="text-xs text-faint font-normal ml-1.5">
                  ({summary.totalMeters.toFixed(1)} m)
                </span>
              )}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-surface-1 border border-line shadow-xs">
            <span className="text-[11px] font-mono text-muted uppercase">{t('batchKpiTotalTime')}</span>
            <div className="text-xl font-mono font-bold text-text mt-0.5 tabular">
              {formatPrintTime(summary.totalSeconds)}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-surface-1 border border-line shadow-xs">
            <span className="text-[11px] font-mono text-muted uppercase">{t('batchKpiEstCost')}</span>
            <div className="text-xl font-mono font-bold text-accent-text mt-0.5 tabular">
              {fmtMoney(summary.totalMaterialCost, settings.currency)}
            </div>
          </div>
        </div>
      )}

      {/* Empty State or Table */}
      {items.length === 0 ? (
        <div className="p-10 rounded-2xl border-2 border-dashed border-line bg-surface-1/40 flex flex-col items-center justify-center text-center space-y-2">
          <FileCode size={34} className="text-muted/60" />
          <p className="text-xs text-muted max-w-md">{t('batchDropHint')}</p>
        </div>
      ) : (
        <>
          {/* Combined Stock Feasibility Panel */}
          <div className="p-4 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-text flex items-center gap-1.5">
                <Scale size={14} className="text-accent-text" />
                <span>{t('batchFeasibilitySummaryTitle')}</span>
              </span>
              {summary.shortages.length === 0 && summary.unmatchedSlots === 0 && (
                <span className="text-[11px] font-medium text-ok flex items-center gap-1">
                  <CheckCircle2 size={13} />
                  <span>{t('batchStockOk')}</span>
                </span>
              )}
            </div>

            {summary.shortages.length === 0 && summary.unmatchedSlots === 0 && summary.rollChecks.length > 0 && (
              <p className="text-xs text-muted">{t('batchFeasibilityAllOk')}</p>
            )}

            {summary.shortages.map((sh) => (
              <div
                key={sh.roll.id}
                className="p-2.5 rounded-xl bg-crit-soft border border-crit/30 text-crit-text text-xs flex items-center gap-2 font-medium"
              >
                <AlertTriangle size={14} className="shrink-0" />
                <span>
                  {t('batchFeasibilityWarn', {
                    grams: sh.missingGrams.toFixed(1),
                    spool: `${sh.roll.brand} ${sh.roll.material} (${sh.roll.colorName})`,
                    need: sh.neededGrams.toFixed(1),
                    have: sh.availableGrams.toFixed(1),
                  })}
                </span>
              </div>
            ))}

            {summary.unmatchedSlots > 0 && (
              <div className="p-2.5 rounded-xl bg-warn-soft border border-warn/30 text-warn-text text-xs flex items-center gap-2 font-medium">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{t('batchFeasibilityUnmatchedCount', { count: summary.unmatchedSlots })}</span>
              </div>
            )}
          </div>

          {/* Batch Table */}
          <div className="rounded-2xl bg-surface-1 border border-line shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line bg-surface-2/60 text-[11px] font-mono uppercase text-muted">
                    <th className="p-3">{t('batchColFile')}</th>
                    <th className="p-3">{t('batchColSlicer')}</th>
                    <th className="p-3">{t('batchColParams')}</th>
                    <th className="p-3">{t('batchColTime')}</th>
                    <th className="p-3">{t('batchColGrams')}</th>
                    <th className="p-3">{t('batchColStock')}</th>
                    <th className="p-3 w-20">{t('batchColCopies')}</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((item) => {
                    const { job, copies } = item;
                    const c = Math.max(1, Math.round(copies || 1));
                    const meters =
                      job.filamentLengthMm && job.filamentLengthMm > 0
                        ? (job.filamentLengthMm / 1000) * c
                        : job.filaments.reduce((acc, f) => acc + ((f.lengthMm || 0) / 1000) * c, 0);

                    return (
                      <tr key={item.id} className="hover:bg-surface-2/40 transition-colors align-top">
                        <td className="p-3 space-y-0.5">
                          <div className="font-semibold text-text">{job.jobName || job.filename}</div>
                          <div className="text-[11px] font-mono text-faint flex items-center gap-1.5">
                            <span>{job.filename}</span>
                            {job.plateIndex > 1 && (
                              <span className="px-1.5 py-0.2 rounded bg-surface-2 border border-line text-muted">
                                {t('batchPlateLabel', { plate: job.plateIndex })}
                              </span>
                            )}
                          </div>
                          {job.dimensions && (
                            <div className="text-[10px] font-mono text-faint">
                              {job.dimensions.x.toFixed(0)} × {job.dimensions.y.toFixed(0)} × {job.dimensions.z.toFixed(0)} mm
                            </div>
                          )}
                        </td>

                        <td className="p-3 text-muted">
                          <div className="font-medium text-text">
                            {[job.slicerName, job.slicerVersion].filter(Boolean).join(' ') || '—'}
                          </div>
                          {job.printerModel && (
                            <div className="text-[11px] text-faint">{job.printerModel}</div>
                          )}
                        </td>

                        <td className="p-3 font-mono text-[11px] text-muted space-y-0.5">
                          {job.totalLayersCount > 0 && (
                            <div className="flex items-center gap-1">
                              <Layers size={11} />
                              <span>{job.totalLayersCount}</span>
                            </div>
                          )}
                          {(job.layerHeight || job.nozzleDiameter) && (
                            <div className="text-faint">
                              {[
                                job.layerHeight ? `${job.layerHeight}mm` : null,
                                job.nozzleDiameter ? `Ø${job.nozzleDiameter}` : null,
                                job.infillPercent !== undefined ? `${job.infillPercent}%` : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                        </td>

                        <td className="p-3 font-mono text-text space-y-0.5">
                          <div className="flex items-center gap-1">
                            <Clock size={12} className="text-muted" />
                            <span>{formatPrintTime((job.printTimeSeconds || 0) * c)}</span>
                          </div>
                          {(job.silentTimeSeconds || job.sportTimeSeconds) && (
                            <div className="text-[10px] text-faint">
                              {job.silentTimeSeconds ? `${t('batchSilentMode')}: ${formatPrintTime(job.silentTimeSeconds * c)}` : ''}
                              {job.silentTimeSeconds && job.sportTimeSeconds ? ' · ' : ''}
                              {job.sportTimeSeconds ? `${t('batchSportMode')}: ${formatPrintTime(job.sportTimeSeconds * c)}` : ''}
                            </div>
                          )}
                        </td>

                        <td className="p-3 font-mono text-text">
                          <div className="font-semibold">{fmtG(job.totalGrams * c)}</div>
                          {meters > 0 && <div className="text-[10px] text-faint">{meters.toFixed(1)} m</div>}
                        </td>

                        <td className="p-3 space-y-1.5 min-w-[200px]">
                          {job.filaments.map((slot) => {
                            const chosenId = item.rollOverrides[slot.slotIndex] ?? slot.rollId ?? slot.suggestedRollId ?? '';
                            const roll = chosenId ? rollsById.get(chosenId) : undefined;
                            const reqGrams = slot.grams * c;
                            const short = roll && reqGrams > roll.remainingWeight;

                            return (
                              <div key={slot.slotIndex} className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full border border-line shrink-0"
                                    style={{ backgroundColor: slot.colorHex }}
                                  />
                                  <select
                                    value={chosenId}
                                    onChange={(e) =>
                                      setItems((prev) =>
                                        prev.map((it) =>
                                          it.id === item.id
                                            ? {
                                                ...it,
                                                rollOverrides: {
                                                  ...it.rollOverrides,
                                                  [slot.slotIndex]: e.target.value,
                                                },
                                              }
                                            : it,
                                        ),
                                      )
                                    }
                                    className="field h-7 text-[11px] py-0"
                                  >
                                    <option value="">{t('batchStockUnmatched')}</option>
                                    {rolls.map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.brand} {r.material} — {r.colorName} ({fmtG(r.remainingWeight)})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                {short && roll && (
                                  <div className="text-[10px] text-crit-text font-medium">
                                    {t('batchStockShort', { grams: (reqGrams - roll.remainingWeight).toFixed(1) })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </td>

                        <td className="p-3">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={item.copies}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setItems((prev) =>
                                prev.map((it) => (it.id === item.id ? { ...it, copies: val } : it)),
                              );
                            }}
                            className="field h-7 w-16 font-mono text-xs text-center"
                          />
                        </td>

                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => setItems((prev) => prev.filter((it) => it.id !== item.id))}
                            className="p-1.5 rounded-lg text-faint hover:text-crit-text hover:bg-crit-soft cursor-pointer transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Batch Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-surface-1 border border-line shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="batch-send-quote-btn"
                onClick={handleSendToQuote}
                className="px-4 py-2 rounded-xl bg-accent text-accent-ink hover:bg-accent-strong font-semibold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
              >
                <Calculator size={14} />
                <span>{t('batchSendQuoteBtn')}</span>
              </button>

              <button
                type="button"
                data-testid="batch-send-inbox-btn"
                onClick={() => void handleSendToInbox()}
                className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-text font-medium text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Inbox size={14} className="text-accent-text" />
                <span>{t('batchSendInboxBtn')}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleDownloadCsv()}
                className="px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-text font-medium text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download size={13} className="text-muted" />
                <span>{t('batchExportCsvBtn')}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadJson()}
                className="px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-text font-medium text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download size={13} className="text-muted" />
                <span>{t('batchExportJsonBtn')}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
