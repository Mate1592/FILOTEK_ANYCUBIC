import React, { useMemo, useRef } from 'react';
import {
  Calculator,
  Plus,
  Trash2,
  Copy,
  Download,
  AlertTriangle,
  AlertCircle,
  Upload,
  Check,
  FileText,
  Zap,
  Wrench,
  Clock,
  Layers,
} from 'lucide-react';
import {
  calculatePrintQuote,
  formatQuoteHtml,
  formatQuoteText,
  type PricingMode,
  type PrintQuoteInput,
  type PrintQuoteMaterialItem,
} from '../../lib/printCalculator';
import { costPerGram, fmtG, fmtMoney, uid } from '../../lib/roll';
import { api, isDesktop } from '../../lib/api';
import { parseGcodeText } from '../../lib/gcodeParser';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/i18n';
import { DEFAULT_WORKSHOP_PREFS, type GcodeJob, type Roll } from '../../shared/types';

export interface QuoteSpoolRow {
  rowId: string;
  mode: 'inventory' | 'manual';
  rollId: string;
  name: string;
  colorHex: string;
  grams: number | '';
  wasteGrams: number | '';
  wastePct: number | '';
  costPerGram: number | '';
  spoolPrice: number | '';
  spoolWeightGrams: number | '';
}

export interface QuoteState {
  jobName: string;
  clientName: string;
  workshopName: string;
  notes: string;
  spools: QuoteSpoolRow[];
  hours: number | '';
  minutes: number | '';
  batchUnits: number | '';
  printerPreset: string;
  printerWattage: number | '';
  electricityRatePerKwh: number | '';
  preferMachineAmortization: boolean;
  machineHourlyRate: number | '';
  machinePrice: number | '';
  machineLifespanHours: number | '';
  maintenancePerHour: number | '';
  laborHourlyRate: number | '';
  setupMinutes: number | '';
  postProcessMinutes: number | '';
  postProcessPerUnit: boolean;
  flatFee: number | '';
  failurePct: number | '';
  pricingMode: PricingMode;
  profitPct: number | '';
  taxPct: number | '';
  useTargetPrice: boolean;
  targetTotalPrice: number | '';
  targetPriceIncludesTax: boolean;
  exportFormat: 'txt' | 'html';
}

export const PRINTER_WATTAGE_PRESETS: Array<{ id: string; wattage: number }> = [
  { id: 'generic-fdm', wattage: 150 },
  { id: 'bambu-corexy', wattage: 120 },
  { id: 'bed-slinger', wattage: 220 },
  { id: 'enclosed-high-temp', wattage: 300 },
  { id: 'custom', wattage: 150 },
];

export function createEmptySpoolRow(roll?: Roll): QuoteSpoolRow {
  if (roll) {
    return {
      rowId: uid(),
      mode: 'inventory',
      rollId: roll.id,
      name: `${roll.brand} ${roll.material} — ${roll.colorName}`,
      colorHex: roll.colorHex,
      grams: 50,
      wasteGrams: 0,
      wastePct: 0,
      costPerGram: Number(costPerGram(roll).toFixed(4)),
      spoolPrice: roll.price,
      spoolWeightGrams: roll.initialWeight,
    };
  }
  return {
    rowId: uid(),
    mode: 'manual',
    rollId: '',
    name: 'PLA',
    colorHex: '#b9ec4a',
    grams: 50,
    wasteGrams: 0,
    wastePct: 0,
    costPerGram: '',
    spoolPrice: 89900,
    spoolWeightGrams: 1000,
  };
}

export function createInitialQuoteState(prefs = DEFAULT_WORKSHOP_PREFS): QuoteState {
  return {
    jobName: '',
    clientName: '',
    workshopName: 'Filoteca Taller 3D',
    notes: '',
    spools: [createEmptySpoolRow()],
    hours: 2,
    minutes: 0,
    batchUnits: 1,
    printerPreset: prefs.defaultPrinterPreset || 'generic-fdm',
    printerWattage: prefs.printerWattage ?? 150,
    electricityRatePerKwh: prefs.electricityRatePerKwh ?? 850,
    preferMachineAmortization: false,
    machineHourlyRate: prefs.machineHourlyRate ?? 2500,
    machinePrice: 1800000,
    machineLifespanHours: 2000,
    maintenancePerHour: 200,
    laborHourlyRate: prefs.laborHourlyRate ?? 0,
    setupMinutes: 10,
    postProcessMinutes: 0,
    postProcessPerUnit: false,
    flatFee: 0,
    failurePct: prefs.defaultFailurePct ?? 5,
    pricingMode: 'markup',
    profitPct: prefs.defaultMarginPct ?? 30,
    taxPct: prefs.defaultTaxPct ?? 0,
    useTargetPrice: false,
    targetTotalPrice: '',
    targetPriceIncludesTax: true,
    exportFormat: 'txt',
  };
}

function numVal(v: number | '', fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v);
  return fallback;
}

function parseNumInput(raw: string): number | '' {
  if (raw === '') return '';
  const n = parseFloat(raw);
  return Number.isFinite(n) ? Math.max(0, n) : '';
}

interface QuoteCalculatorToolProps {
  state: QuoteState;
  setState: React.Dispatch<React.SetStateAction<QuoteState>>;
}

export function QuoteCalculatorTool({ state, setState }: QuoteCalculatorToolProps) {
  const { lang, t } = useI18n();
  const rolls = useStore((s) => s.rolls);
  const gcodeJobs = useStore((s) => s.gcodeJobs);
  const settings = useStore((s) => s.settings);
  const setSetting = useStore((s) => s.setSetting);
  const toast = useStore((s) => s.toast);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rollsById = useMemo(() => {
    const map = new Map<string, Roll>();
    for (const r of rolls) map.set(r.id, r);
    return map;
  }, [rolls]);

  const applyJobToQuote = (job: GcodeJob) => {
    const totalSecs = Math.max(0, Math.round(job.printTimeSeconds || 0));
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.round((totalSecs % 3600) / 60);
    const rows: QuoteSpoolRow[] =
      job.filaments.length > 0
        ? job.filaments.map((slot) => {
            const matchedId = slot.rollId ?? slot.suggestedRollId;
            const roll = matchedId ? rollsById.get(matchedId) : undefined;
            if (roll) {
              return {
                rowId: uid(),
                mode: 'inventory',
                rollId: roll.id,
                name: `${roll.brand} ${roll.material} — ${roll.colorName}`,
                colorHex: roll.colorHex,
                grams: Math.max(0, Number(slot.grams.toFixed(1))),
                wasteGrams: 0,
                wastePct: 0,
                costPerGram: Number(costPerGram(roll).toFixed(4)),
                spoolPrice: roll.price,
                spoolWeightGrams: roll.initialWeight,
              };
            }
            return {
              rowId: uid(),
              mode: 'manual',
              rollId: '',
              name: `${slot.materialName || 'PLA'}${slot.brand ? ` (${slot.brand})` : ''}`,
              colorHex: slot.colorHex || '#888888',
              grams: Math.max(0, Number(slot.grams.toFixed(1))),
              wasteGrams: 0,
              wastePct: 0,
              costPerGram: '',
              spoolPrice: 89900,
              spoolWeightGrams: 1000,
            };
          })
        : [createEmptySpoolRow()];

    setState((prev) => ({
      ...prev,
      jobName: job.jobName || job.filename || prev.jobName,
      hours: hrs,
      minutes: mins,
      spools: rows,
    }));
  };

  const handleOpenSlicerFile = async () => {
    if (isDesktop) {
      const paths = await api.file.openMultiple([
        { name: 'Slicer (.gcode, .3mf, .metadata)', extensions: ['gcode', '3mf', 'metadata'] },
      ]);
      if (!paths.length) return;
      const res = await api.file.parseGcodePath(paths[0]);
      if (res.ok && res.data) {
        applyJobToQuote(res.data);
      } else {
        toast({ kind: 'error', title: t('batchParseError', { name: paths[0] }) });
      }
      return;
    }
    fileInputRef.current?.click();
  };

  const handleBrowserFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.gcode')) {
      toast({ kind: 'warn', title: t('batchParseError', { name: file.name }) });
      return;
    }
    const text = await file.text();
    const parsed = parseGcodeText(text, file.name, '', rolls, settings.rememberedMappings);
    if (parsed) {
      applyJobToQuote(parsed);
    } else {
      toast({ kind: 'error', title: t('batchParseError', { name: file.name }) });
    }
  };

  const updateSpool = (rowId: string, patch: Partial<QuoteSpoolRow>) => {
    setState((prev) => ({
      ...prev,
      spools: prev.spools.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)),
    }));
  };

  const handleSelectInventoryRoll = (rowId: string, rollId: string) => {
    const roll = rollsById.get(rollId);
    if (!roll) {
      updateSpool(rowId, { rollId: '' });
      return;
    }
    updateSpool(rowId, {
      mode: 'inventory',
      rollId: roll.id,
      name: `${roll.brand} ${roll.material} — ${roll.colorName}`,
      colorHex: roll.colorHex,
      costPerGram: Number(costPerGram(roll).toFixed(4)),
      spoolPrice: roll.price,
      spoolWeightGrams: roll.initialWeight,
    });
  };

  const quoteInput: PrintQuoteInput = useMemo(() => {
    const totalSeconds = Math.round((numVal(state.hours) * 3600) + (numVal(state.minutes) * 60));
    const materials: PrintQuoteMaterialItem[] = state.spools.map((sp) => {
      const hasDirectCpg = sp.costPerGram !== '' && Number.isFinite(sp.costPerGram);
      return {
        id: sp.rowId,
        name: sp.name.trim() || 'Filamento',
        rollId: sp.mode === 'inventory' && sp.rollId ? sp.rollId : undefined,
        grams: numVal(sp.grams),
        wasteGrams: numVal(sp.wasteGrams),
        wastePct: numVal(sp.wastePct),
        costPerGram: hasDirectCpg ? Number(sp.costPerGram) : undefined,
        spoolPrice: numVal(sp.spoolPrice),
        spoolWeightGrams: numVal(sp.spoolWeightGrams, 1000),
      };
    });

    return {
      jobName: state.jobName.trim() || undefined,
      materials,
      printTimeSeconds: totalSeconds,
      printerWattage: numVal(state.printerWattage),
      electricityRatePerKwh: numVal(state.electricityRatePerKwh),
      preferMachineAmortization: state.preferMachineAmortization,
      machineHourlyRate: numVal(state.machineHourlyRate),
      machinePrice: numVal(state.machinePrice),
      machineLifespanHours: numVal(state.machineLifespanHours),
      maintenancePerHour: numVal(state.maintenancePerHour),
      laborHourlyRate: numVal(state.laborHourlyRate),
      setupMinutes: numVal(state.setupMinutes),
      postProcessMinutes: numVal(state.postProcessMinutes),
      postProcessPerUnit: state.postProcessPerUnit,
      flatFee: numVal(state.flatFee),
      failurePct: numVal(state.failurePct),
      pricingMode: state.pricingMode,
      profitPct: numVal(state.profitPct),
      taxPct: numVal(state.taxPct),
      batchUnits: Math.max(1, Math.round(numVal(state.batchUnits, 1))),
      targetTotalPrice:
        state.useTargetPrice && state.targetTotalPrice !== '' && Number.isFinite(state.targetTotalPrice)
          ? Math.max(0, state.targetTotalPrice)
          : undefined,
      targetPriceIncludesTax: state.targetPriceIncludesTax,
    };
  }, [state]);

  const result = useMemo(() => calculatePrintQuote(quoteInput), [quoteInput]);

  const handleSaveDefaults = async () => {
    await setSetting('workshopPrefs', {
      electricityRatePerKwh: numVal(state.electricityRatePerKwh, DEFAULT_WORKSHOP_PREFS.electricityRatePerKwh),
      printerWattage: numVal(state.printerWattage, DEFAULT_WORKSHOP_PREFS.printerWattage),
      machineHourlyRate: numVal(state.machineHourlyRate, DEFAULT_WORKSHOP_PREFS.machineHourlyRate),
      laborHourlyRate: numVal(state.laborHourlyRate, DEFAULT_WORKSHOP_PREFS.laborHourlyRate),
      defaultFailurePct: numVal(state.failurePct, DEFAULT_WORKSHOP_PREFS.defaultFailurePct),
      defaultMarginPct: numVal(state.profitPct, DEFAULT_WORKSHOP_PREFS.defaultMarginPct),
      defaultTaxPct: numVal(state.taxPct, DEFAULT_WORKSHOP_PREFS.defaultTaxPct),
      defaultPrinterPreset: state.printerPreset || DEFAULT_WORKSHOP_PREFS.defaultPrinterPreset,
    });
    toast({ kind: 'success', title: t('quoteSavedDefaultsToast') });
  };

  const formatOpts = useMemo(
    () => ({
      lang,
      currency: settings.currency || 'COP',
      formatMoney: (n: number) => fmtMoney(n, settings.currency),
      workshopName: state.workshopName.trim() || undefined,
      clientName: state.clientName.trim() || undefined,
      notes: state.notes.trim() || undefined,
    }),
    [lang, settings.currency, state.workshopName, state.clientName, state.notes],
  );

  const handleCopyQuote = async () => {
    const txt = formatQuoteText(quoteInput, result, formatOpts);
    try {
      await navigator.clipboard.writeText(txt);
      toast({ kind: 'success', title: t('quoteCopiedToast') });
    } catch {
      toast({ kind: 'error', title: 'Clipboard unavailable' });
    }
  };

  const handleSaveQuoteFile = async () => {
    const slug = (state.jobName || 'filoteca-estimate')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-|-$/g, '') || 'filoteca-estimate';
    const isHtml = state.exportFormat === 'html';
    const content = isHtml
      ? formatQuoteHtml(quoteInput, result, formatOpts)
      : formatQuoteText(quoteInput, result, formatOpts);
    const ext = isHtml ? 'html' : 'txt';
    const res = await api.file.saveTextFile({
      defaultName: `${slug}.${ext}`,
      content,
      filters: [{ name: isHtml ? 'HTML' : 'Text', extensions: [ext] }],
    });
    if (res.ok && res.path) {
      toast({ kind: 'success', title: t('quoteSavedFileToast', { path: res.path }) });
    }
  };

  const presetLabels: Record<string, string> = {
    'generic-fdm': t('quotePresetGeneric'),
    'bambu-corexy': t('quotePresetCoreXy'),
    'bed-slinger': t('quotePresetBedLarge'),
    'enclosed-high-temp': t('quotePresetEnclosed'),
    custom: t('quotePresetCustom'),
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <input
        ref={fileInputRef}
        type="file"
        accept=".gcode"
        onChange={handleBrowserFileChange}
        className="hidden"
      />

      {/* Left Column: Inputs */}
      <div className="lg:col-span-7 space-y-5">
        {/* Project & Quick Import */}
        <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-text">
              <FileText size={16} className="text-accent-text" />
              <span>{t('quoteImportTitle')}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value=""
                onChange={(e) => {
                  const job = gcodeJobs.find((j) => j.id === e.target.value);
                  if (job) applyJobToQuote(job);
                }}
                className="field h-8 text-xs w-auto max-w-[210px]"
                aria-label={t('quoteImportFromInbox')}
              >
                <option value="">
                  {gcodeJobs.length > 0 ? t('quoteSelectInboxJob') : t('quoteNoInboxJobs')}
                </option>
                {gcodeJobs.slice(0, 40).map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.jobName || j.filename} ({fmtG(j.totalGrams)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleOpenSlicerFile()}
                className="h-8 px-3 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-text font-medium text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Upload size={13} className="text-accent-text" />
                <span>{t('quoteImportFromFile')}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">{t('quoteProjectName')}</label>
              <input
                type="text"
                value={state.jobName}
                onChange={(e) => setState((p) => ({ ...p, jobName: e.target.value }))}
                placeholder={t('quoteProjectPlaceholder')}
                className="field text-xs"
              />
            </div>
            <div>
              <label className="label">{t('quoteClientName')}</label>
              <input
                type="text"
                value={state.clientName}
                onChange={(e) => setState((p) => ({ ...p, clientName: e.target.value }))}
                placeholder={t('quoteClientPlaceholder')}
                className="field text-xs"
              />
            </div>
            <div>
              <label className="label">{t('quoteWorkshopName')}</label>
              <input
                type="text"
                value={state.workshopName}
                onChange={(e) => setState((p) => ({ ...p, workshopName: e.target.value }))}
                placeholder={t('quoteWorkshopPlaceholder')}
                className="field text-xs"
              />
            </div>
          </div>
        </div>

        {/* Spools / Materials */}
        <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-text">
              <Layers size={16} className="text-accent-text" />
              <span>{t('quoteMaterialsSection')}</span>
            </div>
            <button
              type="button"
              data-testid="quote-add-spool"
              onClick={() =>
                setState((p) => ({
                  ...p,
                  spools: [...p.spools, createEmptySpoolRow()],
                }))
              }
              className="px-3 py-1.5 rounded-xl bg-accent text-accent-ink hover:bg-accent-strong font-semibold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
            >
              <Plus size={13} />
              <span>{t('quoteAddSpool')}</span>
            </button>
          </div>

          <div className="space-y-3">
            {state.spools.map((sp) => {
              const selectedRoll = sp.rollId ? rollsById.get(sp.rollId) : undefined;
              const effectiveGrams =
                numVal(sp.grams) + numVal(sp.wasteGrams) + numVal(sp.grams) * (numVal(sp.wastePct) / 100);
              const missingGrams =
                selectedRoll && effectiveGrams > selectedRoll.remainingWeight
                  ? effectiveGrams - selectedRoll.remainingWeight
                  : 0;

              return (
                <div
                  key={sp.rowId}
                  className="p-3.5 rounded-xl bg-surface-2/60 border border-line space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-line shrink-0"
                        style={{ backgroundColor: sp.colorHex || '#888888' }}
                      />
                      <div className="inline-flex bg-surface-1 p-0.5 rounded-lg border border-line text-[11px]">
                        <button
                          type="button"
                          onClick={() => updateSpool(sp.rowId, { mode: 'inventory' })}
                          className={`px-2 py-0.5 rounded-md cursor-pointer ${
                            sp.mode === 'inventory'
                              ? 'bg-accent text-accent-ink font-semibold'
                              : 'text-muted hover:text-text'
                          }`}
                        >
                          {t('quoteModeInventory')}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSpool(sp.rowId, { mode: 'manual', rollId: '' })}
                          className={`px-2 py-0.5 rounded-md cursor-pointer ${
                            sp.mode === 'manual'
                              ? 'bg-accent text-accent-ink font-semibold'
                              : 'text-muted hover:text-text'
                          }`}
                        >
                          {t('quoteModeManual')}
                        </button>
                      </div>
                    </div>

                    {state.spools.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setState((p) => ({
                            ...p,
                            spools: p.spools.filter((r) => r.rowId !== sp.rowId),
                          }))
                        }
                        className="p-1 rounded-lg text-faint hover:text-crit-text hover:bg-crit-soft transition-colors cursor-pointer"
                        title={t('quoteRemoveSpool')}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    {sp.mode === 'inventory' ? (
                      <div className="sm:col-span-6">
                        <label className="label">{t('quoteSelectRoll')}</label>
                        <select
                          value={sp.rollId}
                          onChange={(e) => handleSelectInventoryRoll(sp.rowId, e.target.value)}
                          className="field text-xs"
                        >
                          <option value="">{t('quoteSelectRoll')}</option>
                          {rolls.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.brand} {r.material} — {r.colorName} ({fmtG(r.remainingWeight)})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="sm:col-span-6">
                        <label className="label">{t('quoteMaterialName')}</label>
                        <input
                          type="text"
                          value={sp.name}
                          onChange={(e) => updateSpool(sp.rowId, { name: e.target.value })}
                          className="field text-xs"
                        />
                      </div>
                    )}

                    <div className="sm:col-span-3">
                      <label className="label">{t('quoteGrams')}</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={sp.grams}
                        onChange={(e) => updateSpool(sp.rowId, { grams: parseNumInput(e.target.value) })}
                        className="field font-mono text-xs"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="label">{t('quoteWastePct')}</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={sp.wastePct}
                        onChange={(e) => updateSpool(sp.rowId, { wastePct: parseNumInput(e.target.value) })}
                        className="field font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="label">{t('quoteCostPerGram')}</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={sp.costPerGram}
                        onChange={(e) => updateSpool(sp.rowId, { costPerGram: parseNumInput(e.target.value) })}
                        placeholder="auto"
                        className="field font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="label">{t('quoteSpoolPrice')}</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={sp.spoolPrice}
                        onChange={(e) =>
                          updateSpool(sp.rowId, {
                            spoolPrice: parseNumInput(e.target.value),
                            costPerGram: '',
                          })
                        }
                        className="field font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="label">{t('quoteSpoolWeight')}</label>
                      <input
                        type="number"
                        step="any"
                        min="1"
                        value={sp.spoolWeightGrams}
                        onChange={(e) =>
                          updateSpool(sp.rowId, {
                            spoolWeightGrams: parseNumInput(e.target.value),
                            costPerGram: '',
                          })
                        }
                        className="field font-mono text-xs"
                      />
                    </div>
                  </div>

                  {selectedRoll && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono text-muted">
                        {t('quoteStockAvailable', { grams: selectedRoll.remainingWeight.toFixed(1) })}
                      </span>
                      {missingGrams > 0 && (
                        <span className="px-2 py-0.5 rounded-lg bg-warn-soft text-warn-text border border-warn/30 flex items-center gap-1 font-medium">
                          <AlertTriangle size={12} />
                          <span>{t('quoteStockShortWarn', { grams: missingGrams.toFixed(1) })}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Time, Energy & Machine */}
        <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-text">
              <Zap size={16} className="text-accent-text" />
              <span>{t('quoteTimeAndEnergy')}</span>
            </div>
            <button
              type="button"
              onClick={() => void handleSaveDefaults()}
              className="px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 border border-line text-[11px] font-medium text-text flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Check size={12} className="text-ok" />
              <span>{t('quoteSaveDefaults')}</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">{t('quoteHours')}</label>
              <input
                type="number"
                step="1"
                min="0"
                value={state.hours}
                onChange={(e) => setState((p) => ({ ...p, hours: parseNumInput(e.target.value) }))}
                className="field font-mono text-xs"
              />
            </div>
            <div>
              <label className="label">{t('quoteMinutes')}</label>
              <input
                type="number"
                step="1"
                min="0"
                max="59"
                value={state.minutes}
                onChange={(e) => setState((p) => ({ ...p, minutes: parseNumInput(e.target.value) }))}
                className="field font-mono text-xs"
              />
            </div>
            <div>
              <label className="label">{t('quoteUnits')}</label>
              <input
                type="number"
                step="1"
                min="1"
                value={state.batchUnits}
                onChange={(e) => setState((p) => ({ ...p, batchUnits: parseNumInput(e.target.value) }))}
                className="field font-mono text-xs"
              />
            </div>
          </div>

          {numVal(state.hours) === 0 && numVal(state.minutes) === 0 && (
            <div className="p-2.5 rounded-xl bg-warn-soft border border-warn/30 text-warn-text text-xs flex items-center gap-2">
              <Clock size={14} className="shrink-0" />
              <span>{t('quoteZeroTimeHint')}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">{t('quotePrinterPreset')}</label>
              <select
                value={state.printerPreset}
                onChange={(e) => {
                  const id = e.target.value;
                  const found = PRINTER_WATTAGE_PRESETS.find((pr) => pr.id === id);
                  setState((p) => ({
                    ...p,
                    printerPreset: id,
                    printerWattage: found && id !== 'custom' ? found.wattage : p.printerWattage,
                  }));
                }}
                className="field text-xs"
              >
                {PRINTER_WATTAGE_PRESETS.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {presetLabels[pr.id]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('quotePrinterWattage')}</label>
              <input
                type="number"
                step="any"
                min="0"
                value={state.printerWattage}
                onChange={(e) =>
                  setState((p) => ({
                    ...p,
                    printerPreset: 'custom',
                    printerWattage: parseNumInput(e.target.value),
                  }))
                }
                className="field font-mono text-xs"
              />
            </div>
            <div>
              <label className="label">{t('quoteElectricityRate', { currency: settings.currency })}</label>
              <input
                type="number"
                step="any"
                min="0"
                value={state.electricityRatePerKwh}
                onChange={(e) => setState((p) => ({ ...p, electricityRatePerKwh: parseNumInput(e.target.value) }))}
                className="field font-mono text-xs"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-line/60 space-y-3">
            <label className="flex items-center gap-2 text-xs text-text font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={state.preferMachineAmortization}
                onChange={(e) => setState((p) => ({ ...p, preferMachineAmortization: e.target.checked }))}
                className="rounded border-line text-accent focus:ring-accent"
              />
              <span>{t('quoteMachineAmortizationToggle')}</span>
            </label>

            {!state.preferMachineAmortization ? (
              <div className="max-w-xs">
                <label className="label">{t('quoteMachineHourlyRate', { currency: settings.currency })}</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={state.machineHourlyRate}
                  onChange={(e) => setState((p) => ({ ...p, machineHourlyRate: parseNumInput(e.target.value) }))}
                  className="field font-mono text-xs"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">{t('quoteMachinePrice')}</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={state.machinePrice}
                    onChange={(e) => setState((p) => ({ ...p, machinePrice: parseNumInput(e.target.value) }))}
                    className="field font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="label">{t('quoteMachineLifespan')}</label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    value={state.machineLifespanHours}
                    onChange={(e) => setState((p) => ({ ...p, machineLifespanHours: parseNumInput(e.target.value) }))}
                    className="field font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="label">{t('quoteMaintenancePerHour')}</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={state.maintenancePerHour}
                    onChange={(e) => setState((p) => ({ ...p, maintenancePerHour: parseNumInput(e.target.value) }))}
                    className="field font-mono text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Labor, Fees, Risk & Pricing */}
        <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-text">
            <Wrench size={16} className="text-accent-text" />
            <span>{t('quoteLaborAndFees')}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="label">{t('quoteLaborHourlyRate', { currency: settings.currency })}</label>
              <input
                type="number"
                step="any"
                min="0"
                value={state.laborHourlyRate}
                onChange={(e) => setState((p) => ({ ...p, laborHourlyRate: parseNumInput(e.target.value) }))}
                className="field font-mono text-xs"
              />
            </div>
            <div>
              <label className="label">{t('quoteSetupMinutes')}</label>
              <input
                type="number"
                step="any"
                min="0"
                value={state.setupMinutes}
                onChange={(e) => setState((p) => ({ ...p, setupMinutes: parseNumInput(e.target.value) }))}
                className="field font-mono text-xs"
              />
            </div>
            <div>
              <label className="label">{t('quotePostProcessMinutes')}</label>
              <input
                type="number"
                step="any"
                min="0"
                value={state.postProcessMinutes}
                onChange={(e) => setState((p) => ({ ...p, postProcessMinutes: parseNumInput(e.target.value) }))}
                className="field font-mono text-xs"
              />
            </div>
            <div>
              <label className="label">{t('quoteFlatFee')}</label>
              <input
                type="number"
                step="any"
                min="0"
                value={state.flatFee}
                onChange={(e) => setState((p) => ({ ...p, flatFee: parseNumInput(e.target.value) }))}
                className="field font-mono text-xs"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={state.postProcessPerUnit}
              onChange={(e) => setState((p) => ({ ...p, postProcessPerUnit: e.target.checked }))}
              className="rounded border-line text-accent focus:ring-accent"
            />
            <span>{t('quotePostProcessPerUnit')}</span>
          </label>

          <div className="pt-3 border-t border-line/60 space-y-3">
            <div className="text-xs font-bold text-text">{t('quotePricingSection')}</div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">{t('quoteFailurePct')}</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={state.failurePct}
                  onChange={(e) => setState((p) => ({ ...p, failurePct: parseNumInput(e.target.value) }))}
                  className="field font-mono text-xs"
                />
              </div>
              <div>
                <label className="label">{t('quoteProfitPct')}</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={state.profitPct}
                  onChange={(e) => setState((p) => ({ ...p, profitPct: parseNumInput(e.target.value) }))}
                  className="field font-mono text-xs"
                  disabled={state.useTargetPrice}
                />
              </div>
              <div>
                <label className="label">{t('quoteTaxPct')}</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={state.taxPct}
                  onChange={(e) => setState((p) => ({ ...p, taxPct: parseNumInput(e.target.value) }))}
                  className="field font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setState((p) => ({ ...p, pricingMode: 'markup' }))}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer transition-all ${
                  state.pricingMode === 'markup'
                    ? 'bg-accent/15 border-accent text-accent-text font-semibold'
                    : 'bg-surface-2 border-line text-muted hover:text-text'
                }`}
              >
                {t('quotePricingModeMarkup')}
              </button>
              <button
                type="button"
                onClick={() => setState((p) => ({ ...p, pricingMode: 'margin' }))}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer transition-all ${
                  state.pricingMode === 'margin'
                    ? 'bg-accent/15 border-accent text-accent-text font-semibold'
                    : 'bg-surface-2 border-line text-muted hover:text-text'
                }`}
              >
                {t('quotePricingModeMargin')}
              </button>
            </div>

            <div className="pt-2 space-y-2">
              <label className="flex items-center gap-2 text-xs text-text font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.useTargetPrice}
                  onChange={(e) => setState((p) => ({ ...p, useTargetPrice: e.target.checked }))}
                  className="rounded border-line text-accent focus:ring-accent"
                />
                <span>{t('quoteTargetPriceToggle')}</span>
              </label>

              {state.useTargetPrice && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="label">{t('quoteTargetTotalPrice')}</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={state.targetTotalPrice}
                      onChange={(e) => setState((p) => ({ ...p, targetTotalPrice: parseNumInput(e.target.value) }))}
                      className="field font-mono text-xs"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted h-9 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state.targetPriceIncludesTax}
                      onChange={(e) => setState((p) => ({ ...p, targetPriceIncludesTax: e.target.checked }))}
                      className="rounded border-line text-accent focus:ring-accent"
                    />
                    <span>{t('quoteTargetIncludesTax')}</span>
                  </label>
                </div>
              )}
            </div>

            <div>
              <label className="label">{t('quoteNotes')}</label>
              <textarea
                rows={2}
                value={state.notes}
                onChange={(e) => setState((p) => ({ ...p, notes: e.target.value }))}
                placeholder={t('quoteNotesPlaceholder')}
                className="field text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Summary & Export */}
      <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-4">
        <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-text">
              <Calculator size={16} className="text-accent-text" />
              <span>{t('quoteSummaryTitle')}</span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-surface-2 border border-line text-muted">
              {settings.currency}
            </span>
          </div>

          {/* Total Card */}
          <div className="p-4 rounded-xl bg-surface-2/80 border border-line space-y-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted block">
              {t('quoteTotalLabel')}
            </span>
            <div
              data-testid="quote-total-output"
              className="text-3xl font-mono font-extrabold text-accent-text tabular"
            >
              {fmtMoney(result.totalWithTax, settings.currency)}
            </div>
            {result.batchUnits > 1 && (
              <div className="text-xs font-mono text-muted">
                {t('quoteUnitPrice', { units: result.batchUnits })}:{' '}
                <span className="font-bold text-text">{fmtMoney(result.unitTotalWithTax, settings.currency)}</span>
              </div>
            )}
          </div>

          {result.isBelowCost && (
            <div className="p-3 rounded-xl bg-crit-soft border border-crit/30 text-crit-text text-xs flex items-start gap-2 font-medium">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{t('quoteBelowCostWarn')}</span>
            </div>
          )}

          {/* Stacked Cost Distribution Bar */}
          {result.productionCost > 0 && (
            <div className="space-y-1.5">
              <div className="h-2.5 w-full rounded-full overflow-hidden bg-surface-3 flex">
                <div
                  style={{ width: `${result.shares.materialPct}%` }}
                  className="bg-accent h-full"
                  title={t('quoteBreakdownMaterial', { grams: result.totalMaterialGrams.toFixed(1) })}
                />
                <div
                  style={{ width: `${result.shares.machinePct}%` }}
                  className="bg-sky-400 h-full"
                  title={t('quoteBreakdownMachine')}
                />
                <div
                  style={{ width: `${result.shares.electricityPct}%` }}
                  className="bg-amber-400 h-full"
                  title={t('quoteBreakdownElectricity', { kwh: result.energyKwh.toFixed(2) })}
                />
                <div
                  style={{ width: `${result.shares.laborPct}%` }}
                  className="bg-emerald-400 h-full"
                  title={t('quoteBreakdownLabor')}
                />
                <div
                  style={{ width: `${result.shares.flatFeePct}%` }}
                  className="bg-purple-400 h-full"
                  title={t('quoteBreakdownFlatFee')}
                />
                <div
                  style={{ width: `${result.shares.failurePct}%` }}
                  className="bg-rose-400 h-full"
                  title={t('quoteBreakdownFailure')}
                />
              </div>
            </div>
          )}

          {/* Breakdown Rows */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between text-muted">
              <span>{t('quoteBreakdownMaterial', { grams: result.totalMaterialGrams.toFixed(1) })}</span>
              <span className="font-mono text-text font-medium">{fmtMoney(result.materialCost, settings.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-muted">
              <span>{t('quoteBreakdownElectricity', { kwh: result.energyKwh.toFixed(2) })}</span>
              <span className="font-mono text-text font-medium">{fmtMoney(result.electricityCost, settings.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-muted">
              <span>{t('quoteBreakdownMachine')}</span>
              <span className="font-mono text-text font-medium">{fmtMoney(result.machineCost, settings.currency)}</span>
            </div>
            {result.laborCost > 0 && (
              <div className="flex items-center justify-between text-muted">
                <span>{t('quoteBreakdownLabor')}</span>
                <span className="font-mono text-text font-medium">{fmtMoney(result.laborCost, settings.currency)}</span>
              </div>
            )}
            {result.flatFeeCost > 0 && (
              <div className="flex items-center justify-between text-muted">
                <span>{t('quoteBreakdownFlatFee')}</span>
                <span className="font-mono text-text font-medium">{fmtMoney(result.flatFeeCost, settings.currency)}</span>
              </div>
            )}
            {result.failureBufferCost > 0 && (
              <div className="flex items-center justify-between text-muted">
                <span>{t('quoteBreakdownFailure')}</span>
                <span className="font-mono text-text font-medium">{fmtMoney(result.failureBufferCost, settings.currency)}</span>
              </div>
            )}

            <div className="pt-2 border-t border-line flex items-center justify-between font-semibold text-text">
              <span>{t('quoteProductionCost')}</span>
              <span className="font-mono">{fmtMoney(result.productionCost, settings.currency)}</span>
            </div>

            <div className="flex items-center justify-between text-muted">
              <div>
                <span className="block text-ok font-medium">{t('quoteProfitAmount')}</span>
                <span className="text-[10px] font-mono text-faint">
                  {t('quoteEffectiveMargin', {
                    markup: result.effectiveMarkupPct.toFixed(1),
                    margin: result.effectiveMarginPct.toFixed(1),
                  })}
                </span>
              </div>
              <span className={`font-mono font-semibold ${result.isBelowCost ? 'text-crit-text' : 'text-ok'}`}>
                {fmtMoney(result.profitAmount, settings.currency)}
              </span>
            </div>

            {result.taxAmount > 0 && (
              <>
                <div className="flex items-center justify-between text-muted">
                  <span>{t('quoteSubtotal')}</span>
                  <span className="font-mono text-text">{fmtMoney(result.subtotalBeforeTax, settings.currency)}</span>
                </div>
                <div className="flex items-center justify-between text-muted">
                  <span>{t('quoteTaxAmount')}</span>
                  <span className="font-mono text-text">{fmtMoney(result.taxAmount, settings.currency)}</span>
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 border-t border-line space-y-2.5">
            <button
              type="button"
              data-testid="quote-copy-btn"
              onClick={() => void handleCopyQuote()}
              className="w-full py-2 px-3.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-text font-medium text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Copy size={14} className="text-accent-text" />
              <span>{t('quoteCopyBtn')}</span>
            </button>

            <div className="flex items-center gap-2">
              <select
                value={state.exportFormat}
                onChange={(e) =>
                  setState((p) => ({ ...p, exportFormat: e.target.value === 'html' ? 'html' : 'txt' }))
                }
                className="field h-9 text-xs w-36 shrink-0"
                aria-label="Format"
              >
                <option value="txt">{t('quoteFormatTxt')}</option>
                <option value="html">{t('quoteFormatHtml')}</option>
              </select>

              <button
                type="button"
                data-testid="quote-save-btn"
                onClick={() => void handleSaveQuoteFile()}
                className="flex-1 h-9 px-3.5 rounded-xl bg-accent text-accent-ink hover:bg-accent-strong font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-all"
              >
                <Download size={14} />
                <span>{t('quoteSaveBtn')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
