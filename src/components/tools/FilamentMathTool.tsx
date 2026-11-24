import React, { useMemo, useState } from 'react';
import {
  Scale,
  Thermometer,
  AlertTriangle,
  Check,
  Ruler,
} from 'lucide-react';
import {
  MATERIAL_PRESETS,
  SPOOL_TARE_PRESETS,
  cm3ToGrams,
  estimateNetFromTare,
  getMaterialDensity,
  gramsToCm3,
  gramsToMeters,
  metersToGrams,
} from '../../lib/filamentMath';
import { fmtG } from '../../lib/roll';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/i18n';
import { MATERIALS, type Diameter, type Material } from '../../shared/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function FilamentMathTool() {
  const { lang, t } = useI18n();
  const rolls = useStore((s) => s.rolls);
  const saveRoll = useStore((s) => s.saveRoll);
  const toast = useStore((s) => s.toast);

  // 1. Bidirectional Converter State
  const [diameter, setDiameter] = useState<Diameter>(1.75);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | 'custom'>('PLA');
  const [customDensity, setCustomDensity] = useState<number | ''>(1.24);
  const [gramsVal, setGramsVal] = useState<number | ''>(1000);
  const [metersVal, setMetersVal] = useState<number | ''>(() => round2(gramsToMeters(1000, 1.75, 1.24)));
  const [cm3Val, setCm3Val] = useState<number | ''>(() => round2(gramsToCm3(1000, 1.24)));

  const activeDensity = useMemo(() => {
    if (selectedMaterial === 'custom') {
      return typeof customDensity === 'number' && Number.isFinite(customDensity) && customDensity > 0
        ? customDensity
        : 1.24;
    }
    return getMaterialDensity(selectedMaterial);
  }, [selectedMaterial, customDensity]);

  const syncFromGrams = (g: number | '', diam = diameter, dens = activeDensity) => {
    setGramsVal(g);
    if (g === '' || !Number.isFinite(g) || g <= 0) {
      setMetersVal('');
      setCm3Val('');
      return;
    }
    setMetersVal(round2(gramsToMeters(g, diam, dens)));
    setCm3Val(round2(gramsToCm3(g, dens)));
  };

  const syncFromMeters = (m: number | '') => {
    setMetersVal(m);
    if (m === '' || !Number.isFinite(m) || m <= 0) {
      setGramsVal('');
      setCm3Val('');
      return;
    }
    const g = metersToGrams(m, diameter, activeDensity);
    setGramsVal(round2(g));
    setCm3Val(round2(gramsToCm3(g, activeDensity)));
  };

  const syncFromCm3 = (v: number | '') => {
    setCm3Val(v);
    if (v === '' || !Number.isFinite(v) || v <= 0) {
      setGramsVal('');
      setMetersVal('');
      return;
    }
    const g = cm3ToGrams(v, activeDensity);
    setGramsVal(round2(g));
    setMetersVal(round2(gramsToMeters(g, diameter, activeDensity)));
  };

  // 2. Scale Tare Estimator State
  const [targetRollId, setTargetRollId] = useState<string>('');
  const [tarePresetId, setTarePresetId] = useState<string>(SPOOL_TARE_PRESETS[0].id);
  const [grossInput, setGrossInput] = useState<number | ''>(750);
  const [emptyTareInput, setEmptyTareInput] = useState<number | ''>(SPOOL_TARE_PRESETS[0].tareGrams);

  const selectedRoll = useMemo(
    () => rolls.find((r) => r.id === targetRollId) ?? null,
    [rolls, targetRollId],
  );

  const handleSelectRollForTare = (rollId: string) => {
    setTargetRollId(rollId);
    const roll = rolls.find((r) => r.id === rollId);
    if (!roll) return;
    const brandLower = roll.brand.toLowerCase();
    const matchedPreset = SPOOL_TARE_PRESETS.find((p) =>
      brandLower.includes(p.brand.toLowerCase()),
    );
    if (matchedPreset) {
      setTarePresetId(matchedPreset.id);
      setEmptyTareInput(matchedPreset.tareGrams);
    }
  };

  const tareResult = useMemo(() => {
    const gross = typeof grossInput === 'number' && Number.isFinite(grossInput) ? grossInput : 0;
    const tare = typeof emptyTareInput === 'number' && Number.isFinite(emptyTareInput) ? emptyTareInput : 0;
    return estimateNetFromTare(gross, tare, selectedRoll?.initialWeight);
  }, [grossInput, emptyTareInput, selectedRoll]);

  const handleApplyTareToRoll = async () => {
    if (!selectedRoll) return;
    const nextWeight = Math.round(tareResult.netGrams * 10) / 10;
    const nextStatus =
      nextWeight <= 0 ? 'empty' : selectedRoll.status === 'sealed' ? 'in_use' : selectedRoll.status;
    const ok = await saveRoll({
      ...selectedRoll,
      remainingWeight: nextWeight,
      status: nextStatus,
    });
    if (ok) {
      toast({
        kind: 'success',
        title: t('tareAppliedToast', {
          grams: nextWeight.toFixed(1),
          spool: `${selectedRoll.brand} ${selectedRoll.colorName}`,
        }),
      });
    }
  };

  const hygroBadge = (level: 'low' | 'medium' | 'high') => {
    if (level === 'high') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-crit-soft text-crit-text border border-crit/30">
          {t('dryingHygroHigh')}
        </span>
      );
    }
    if (level === 'medium') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-warn-soft text-warn-text border border-warn/30">
          {t('dryingHygroMedium')}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-ok border border-emerald-500/30">
        {t('dryingHygroLow')}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* 1. Bidirectional Converter */}
        <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-text">
              <Ruler size={16} className="text-accent-text" />
              <span>{t('mathConverterTitle')}</span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-surface-2 border border-line text-muted">
              {t('mathDensityUnit', { density: activeDensity.toFixed(2) })}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{t('mathMaterialLabel')}</label>
              <select
                value={selectedMaterial}
                onChange={(e) => {
                  const next = e.target.value as Material | 'custom';
                  setSelectedMaterial(next);
                  const nextDens =
                    next === 'custom'
                      ? typeof customDensity === 'number' && customDensity > 0
                        ? customDensity
                        : 1.24
                      : getMaterialDensity(next);
                  syncFromGrams(gramsVal, diameter, nextDens);
                }}
                className="field text-xs"
              >
                {MATERIALS.map((m) => (
                  <option key={m} value={m}>
                    {m} ({MATERIAL_PRESETS[m].densityGcm3} g/cm³)
                  </option>
                ))}
                <option value="custom">{t('mathCustomMaterial')}</option>
              </select>
            </div>

            <div>
              <label className="label">{t('mathDiameterLabel')}</label>
              <div className="grid grid-cols-2 gap-2">
                {([1.75, 2.85] as Diameter[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDiameter(d);
                      syncFromGrams(gramsVal, d, activeDensity);
                    }}
                    className={`h-9 rounded-xl border text-xs font-mono font-semibold cursor-pointer transition-all ${
                      diameter === d
                        ? 'bg-accent/15 border-accent text-accent-text'
                        : 'bg-surface-2 border-line text-muted hover:text-text'
                    }`}
                  >
                    {d} mm
                  </button>
                ))}
              </div>
            </div>
          </div>

          {selectedMaterial === 'custom' && (
            <div className="max-w-xs">
              <label className="label">{t('mathCustomDensity')}</label>
              <input
                type="number"
                step="any"
                min="0.1"
                value={customDensity}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                  const clean = typeof val === 'number' && Number.isFinite(val) ? Math.max(0, val) : '';
                  setCustomDensity(clean);
                  if (typeof clean === 'number' && clean > 0) {
                    syncFromGrams(gramsVal, diameter, clean);
                  }
                }}
                className="field font-mono text-xs"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="label">{t('mathGramsLabel')}</label>
              <input
                type="number"
                step="any"
                min="0"
                value={gramsVal}
                onChange={(e) => {
                  const v = e.target.value === '' ? '' : parseFloat(e.target.value);
                  syncFromGrams(typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : '');
                }}
                className="field font-mono text-xs"
              />
            </div>
            <div>
              <label className="label">{t('mathMetersLabel')}</label>
              <input
                type="number"
                step="any"
                min="0"
                value={metersVal}
                onChange={(e) => {
                  const v = e.target.value === '' ? '' : parseFloat(e.target.value);
                  syncFromMeters(typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : '');
                }}
                className="field font-mono text-xs"
              />
            </div>
            <div>
              <label className="label">{t('mathVolumeLabel')}</label>
              <input
                type="number"
                step="any"
                min="0"
                value={cm3Val}
                onChange={(e) => {
                  const v = e.target.value === '' ? '' : parseFloat(e.target.value);
                  syncFromCm3(typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : '');
                }}
                className="field font-mono text-xs"
              />
            </div>
          </div>
        </div>

        {/* 2. Scale Tare Estimator */}
        <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-text">
              <Scale size={16} className="text-accent-text" />
              <span>{t('tareTitle')}</span>
            </div>
            <p className="text-xs text-muted mt-0.5">{t('tareSubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{t('tareTargetRollLabel')}</label>
              <select
                value={targetRollId}
                onChange={(e) => handleSelectRollForTare(e.target.value)}
                className="field text-xs"
              >
                <option value="">{t('tareNoRollSelected')}</option>
                {rolls.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.brand} {r.material} — {r.colorName} ({fmtG(r.remainingWeight)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">{t('tarePresetLabel')}</label>
              <select
                value={tarePresetId}
                onChange={(e) => {
                  const id = e.target.value;
                  setTarePresetId(id);
                  const found = SPOOL_TARE_PRESETS.find((p) => p.id === id);
                  if (found) setEmptyTareInput(found.tareGrams);
                }}
                className="field text-xs"
              >
                {SPOOL_TARE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label[lang] || p.label.es}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('tareGrossInputLabel')}</label>
              <input
                type="number"
                step="any"
                min="0"
                data-testid="tare-gross-input"
                value={grossInput}
                onChange={(e) => {
                  const v = e.target.value === '' ? '' : parseFloat(e.target.value);
                  setGrossInput(typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : '');
                }}
                className="field font-mono text-xs"
              />
            </div>

            <div>
              <label className="label">{t('tareEmptyInputLabel')}</label>
              <input
                type="number"
                step="any"
                min="0"
                data-testid="tare-empty-input"
                value={emptyTareInput}
                onChange={(e) => {
                  const v = e.target.value === '' ? '' : parseFloat(e.target.value);
                  setEmptyTareInput(typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : '');
                }}
                className="field font-mono text-xs"
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-2/80 border border-line flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-mono uppercase text-muted block">
                {t('tareNetResultLabel')}
              </span>
              <span className="text-2xl font-mono font-extrabold text-accent-text tabular">
                {tareResult.netGrams.toFixed(1)} g
              </span>
              {tareResult.remainingPct !== null && selectedRoll && (
                <span className="text-xs font-mono text-muted ml-2">
                  ({t('tareRemainingPct', {
                    pct: tareResult.remainingPct.toFixed(0),
                    cap: selectedRoll.initialWeight,
                  })})
                </span>
              )}
            </div>

            <button
              type="button"
              data-testid="tare-apply-roll-btn"
              disabled={!selectedRoll}
              onClick={() => void handleApplyTareToRoll()}
              className="px-3.5 py-2 rounded-xl bg-accent text-accent-ink hover:bg-accent-strong disabled:opacity-45 disabled:cursor-not-allowed font-semibold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-all shrink-0"
            >
              <Check size={14} />
              <span>{t('tareApplyRollBtn')}</span>
            </button>
          </div>

          {tareResult.isBelowTare && (
            <div className="p-2.5 rounded-xl bg-warn-soft border border-warn/30 text-warn-text text-xs flex items-center gap-2 font-medium">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{t('tareBelowWarn')}</span>
            </div>
          )}

          {tareResult.exceedsCapacity && selectedRoll && (
            <div className="p-2.5 rounded-xl bg-warn-soft border border-warn/30 text-warn-text text-xs flex items-center gap-2 font-medium">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{t('tareOverCapWarn', { cap: selectedRoll.initialWeight })}</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Material & Drying Quick Reference Table */}
      <div className="rounded-2xl bg-surface-1 border border-line shadow-xs overflow-hidden">
        <div className="p-4 border-b border-line flex items-center gap-2 text-sm font-bold text-text">
          <Thermometer size={16} className="text-accent-text" />
          <span>{t('dryingTitle')}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-line bg-surface-2/60 text-[11px] font-mono uppercase text-muted">
                <th className="p-3">{t('dryingColMaterial')}</th>
                <th className="p-3">{t('dryingColDensity')}</th>
                <th className="p-3">{t('dryingColNozzle')}</th>
                <th className="p-3">{t('dryingColBed')}</th>
                <th className="p-3">{t('dryingColDryTemp')}</th>
                <th className="p-3">{t('dryingColMoisture')}</th>
                <th className="p-3">{t('dryingColFlags')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {MATERIALS.map((mat) => {
                const p = MATERIAL_PRESETS[mat];
                const isActive = selectedMaterial === mat;
                return (
                  <tr
                    key={mat}
                    className={`transition-colors ${
                      isActive ? 'bg-accent/10' : 'hover:bg-surface-2/40'
                    }`}
                  >
                    <td className="p-3 font-bold text-text">{mat}</td>
                    <td className="p-3 font-mono text-muted">{p.densityGcm3.toFixed(2)} g/cm³</td>
                    <td className="p-3 font-mono text-text">
                      {p.nozzleTempRange[0]}–{p.nozzleTempRange[1]}°C
                    </td>
                    <td className="p-3 font-mono text-text">
                      {p.bedTempRange[0]}–{p.bedTempRange[1]}°C
                    </td>
                    <td className="p-3 font-mono font-semibold text-accent-text">
                      {t('dryingHoursFmt', { temp: p.dryingTempC, hours: p.dryingHours })}
                    </td>
                    <td className="p-3">{hygroBadge(p.hygroscopicLevel)}</td>
                    <td className="p-3 space-y-1">
                      <div className="flex flex-wrap gap-1">
                        {p.requiresEnclosure && (
                          <span className="px-1.5 py-0.5 rounded bg-surface-2 border border-line text-[10px] font-medium text-text">
                            {t('dryingReqEnclosure')}
                          </span>
                        )}
                        {p.requiresHardenedNozzle && (
                          <span className="px-1.5 py-0.5 rounded bg-warn-soft border border-warn/30 text-[10px] font-medium text-warn-text">
                            {t('dryingReqHardened')}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted">{p.notes[lang] || p.notes.es}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
