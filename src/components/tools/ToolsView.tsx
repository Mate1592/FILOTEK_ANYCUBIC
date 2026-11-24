import React, { useEffect, useState } from 'react';
import { Calculator, Layers, Scale, Wrench, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';
import { parseGcodeText } from '../../lib/gcodeParser';
import { costPerGram, uid } from '../../lib/roll';
import { DEFAULT_WORKSHOP_PREFS, type GcodeJob } from '../../shared/types';
import {
  QuoteCalculatorTool,
  createEmptySpoolRow,
  createInitialQuoteState,
  type QuoteSpoolRow,
  type QuoteState,
} from './QuoteCalculatorTool';
import { SlicerBatchTool, flattenGcodeJobs, type BatchItem } from './SlicerBatchTool';
import { FilamentMathTool } from './FilamentMathTool';

export function ToolsView() {
  const { t } = useI18n();
  const rolls = useStore((s) => s.rolls);
  const settings = useStore((s) => s.settings);
  const toolsTab = useStore((s) => s.toolsTab);
  const setToolsTab = useStore((s) => s.setToolsTab);
  const toolDraft = useStore((s) => s.toolDraft);
  const clearToolDraft = useStore((s) => s.clearToolDraft);

  const [quoteState, setQuoteState] = useState<QuoteState>(() =>
    createInitialQuoteState(settings.workshopPrefs ?? DEFAULT_WORKSHOP_PREFS),
  );
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [draftSourceBanner, setDraftSourceBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!toolDraft) return;
    let cancelled = false;

    const applyDraft = async () => {
      setToolsTab(toolDraft.tab);

      if (toolDraft.tab === 'quote') {
        if (toolDraft.source === 'roll' && toolDraft.rollId) {
          const roll = rolls.find((r) => r.id === toolDraft.rollId);
          if (roll) {
            setQuoteState((prev) => ({
              ...prev,
              spools: [createEmptySpoolRow(roll)],
            }));
          }
          setDraftSourceBanner(t('toolsDraftSourceRoll'));
        } else if (toolDraft.job) {
          const job = toolDraft.job;
          const totalSeconds = Math.max(0, Math.round(job.printTimeSeconds || 0));
          const hrs = Math.floor(totalSeconds / 3600);
          const mins = Math.round((totalSeconds % 3600) / 60);
          const rows: QuoteSpoolRow[] =
            job.filaments.length > 0
              ? job.filaments.map((slot) => {
                  const matchedId = slot.rollId ?? slot.suggestedRollId;
                  const roll = matchedId ? rolls.find((r) => r.id === matchedId) : undefined;
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

          setQuoteState((prev) => ({
            ...prev,
            jobName: job.jobName || job.filename || prev.jobName,
            hours: hrs,
            minutes: mins,
            spools: rows,
          }));
          setDraftSourceBanner(
            toolDraft.source === 'inbox' ? t('toolsDraftSourceInbox') : t('toolsDraftSourceDrop'),
          );
        } else if (toolDraft.materials && toolDraft.materials.length > 0) {
          const totalSeconds = Math.max(0, Math.round(toolDraft.printTimeSeconds || 0));
          const hrs = Math.floor(totalSeconds / 3600);
          const mins = Math.round((totalSeconds % 3600) / 60);
          const rows: QuoteSpoolRow[] = toolDraft.materials.map((m) => ({
            rowId: uid(),
            mode: m.rollId ? 'inventory' : 'manual',
            rollId: m.rollId || '',
            name: m.name,
            colorHex: m.colorHex || '#888888',
            grams: Math.max(0, Number(m.grams.toFixed(1))),
            wasteGrams: 0,
            wastePct: 0,
            costPerGram: m.costPerGram !== undefined ? m.costPerGram : '',
            spoolPrice: m.spoolPrice ?? 89900,
            spoolWeightGrams: m.spoolWeightGrams ?? 1000,
          }));
          setQuoteState((prev) => ({
            ...prev,
            jobName: toolDraft.jobName || prev.jobName,
            hours: hrs,
            minutes: mins,
            spools: rows,
          }));
          setDraftSourceBanner(t('toolsDraftSourceBatch'));
        }
      } else if (toolDraft.tab === 'batch') {
        const collected: GcodeJob[] = [...(toolDraft.batchJobs || []), ...(toolDraft.jobs || [])];
        if (toolDraft.filePaths && toolDraft.filePaths.length > 0) {
          for (const fp of toolDraft.filePaths) {
            const res = await api.file.parseGcodePath(fp);
            if (res.ok && res.data) {
              collected.push(res.data);
            }
          }
        }
        if (!cancelled && collected.length > 0) {
          const flattened = flattenGcodeJobs(collected);
          setBatchItems((prev) => [
            ...prev,
            ...flattened.map((job) => ({
              id: uid(),
              job,
              copies: 1,
              rollOverrides: {},
            })),
          ]);
          setDraftSourceBanner(t('toolsDraftSourceDrop'));
        }
      }

      if (!cancelled) {
        clearToolDraft();
      }
    };

    void applyDraft();
    return () => {
      cancelled = true;
    };
  }, [toolDraft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper unused-import safeguard for browser text parse if ever extended
  void parseGcodeText;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 workbench-bg">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header & Sub-tab Switcher */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-text shrink-0">
              <Wrench size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-extrabold text-xl text-text">{t('toolsTitle')}</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-surface-2 border border-line text-muted">
                  {t('toolsBadgeOffline')}
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">{t('toolsSubtitle')}</p>
            </div>
          </div>

          <div
            role="tablist"
            className="inline-flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-line self-start md:self-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={toolsTab === 'quote'}
              data-testid="tools-tab-quote"
              onClick={() => setToolsTab('quote')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all ${
                toolsTab === 'quote'
                  ? 'bg-elevated text-text shadow-xs font-semibold'
                  : 'text-muted hover:text-text'
              }`}
            >
              <Calculator size={13} />
              <span>{t('toolsTabQuote')}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={toolsTab === 'batch'}
              data-testid="tools-tab-batch"
              onClick={() => setToolsTab('batch')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all ${
                toolsTab === 'batch'
                  ? 'bg-elevated text-text shadow-xs font-semibold'
                  : 'text-muted hover:text-text'
              }`}
            >
              <Layers size={13} />
              <span>{t('toolsTabBatch')}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={toolsTab === 'math'}
              data-testid="tools-tab-math"
              onClick={() => setToolsTab('math')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all ${
                toolsTab === 'math'
                  ? 'bg-elevated text-text shadow-xs font-semibold'
                  : 'text-muted hover:text-text'
              }`}
            >
              <Scale size={13} />
              <span>{t('toolsTabMath')}</span>
            </button>
          </div>
        </div>

        {/* Draft loaded banner */}
        {draftSourceBanner && (
          <div className="px-4 py-2.5 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-between gap-2 text-xs text-text">
            <span>{t('toolsDraftLoaded', { source: draftSourceBanner })}</span>
            <button
              type="button"
              onClick={() => setDraftSourceBanner(null)}
              className="text-muted hover:text-text flex items-center gap-1 cursor-pointer"
              aria-label={t('toolsDraftClear')}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Active Sub-Tab */}
        {toolsTab === 'quote' && <QuoteCalculatorTool state={quoteState} setState={setQuoteState} />}
        {toolsTab === 'batch' && <SlicerBatchTool items={batchItems} setItems={setBatchItems} />}
        {toolsTab === 'math' && <FilamentMathTool />}
      </div>
    </div>
  );
}
