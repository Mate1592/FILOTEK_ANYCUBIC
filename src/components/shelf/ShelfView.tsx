import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  SlidersHorizontal,
  AlertTriangle,
  RotateCcw,
  PackageOpen,
} from 'lucide-react';
import type { Material, Roll } from '../../shared/types';
import { useStore, type SortKey } from '../../store/useStore';
import { stockLevel, computeBackupRollIds } from '../../lib/roll';
import { SpoolCard } from '../spool/SpoolCard';
import { QuickUseModal } from '../spool/QuickUseModal';
import { PendingJobsDrawer } from '../gcode/PendingJobsDrawer';
import { spoolViewer } from '../spool3d/SpoolViewerManager';

const nameCollator = new Intl.Collator('es');
const VIRTUALIZE_THRESHOLD = 60;
const OVERSCAN_ROWS = 2;
const ROW_GAP = 20;

function getGridCols(width: number): number {
  if (width >= 1536) return 5;
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

export function ShelfView() {
  const rolls = useStore((s) => s.rolls);
  const settings = useStore((s) => s.settings);
  const query = useStore((s) => s.query);
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const resetFilters = useStore((s) => s.resetFilters);
  const sort = useStore((s) => s.sort);
  const setSort = useStore((s) => s.setSort);
  const openEditor = useStore((s) => s.openEditor);
  const loadSeed = useStore((s) => s.loadSeed);

  const [quickUseRoll, setQuickUseRoll] = useState<Roll | null>(null);
  const [showFiltersBar, setShowFiltersBar] = useState(false);

  const deferredQuery = useDeferredValue(query);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const [cols, setCols] = useState(() =>
    typeof window !== 'undefined' ? getGridCols(window.innerWidth) : 3,
  );
  const [rowHeight, setRowHeight] = useState(368);
  const [visibleRange, setVisibleRange] = useState({ startRow: 0, endRow: 8 });

  const handleQuickUse = useCallback((r: Roll) => {
    setQuickUseRoll(r);
  }, []);

  // Precompute backup roll IDs in O(N)
  const backupRollIds = useMemo(
    () => computeBackupRollIds(rolls, { lowThreshold: settings.lowThreshold }),
    [rolls, settings.lowThreshold],
  );

  // Extract distinct materials & brands from existing rolls
  const availableMaterials = useMemo(
    () => Array.from(new Set(rolls.map((r) => r.material))).sort(),
    [rolls],
  );
  const availableBrands = useMemo(
    () => Array.from(new Set(rolls.map((r) => r.brand))).sort(),
    [rolls],
  );

  // Filter & sort logic
  const filteredRolls = useMemo(() => {
    const q = deferredQuery.toLowerCase().trim();
    const { materials, brands, statuses, lowOnly } = filters;

    return rolls
      .filter((roll) => {
        // Query search
        if (q) {
          const matches =
            roll.colorName.toLowerCase().includes(q) ||
            roll.brand.toLowerCase().includes(q) ||
            roll.material.toLowerCase().includes(q) ||
            (roll.location && roll.location.toLowerCase().includes(q)) ||
            (roll.notes && roll.notes.toLowerCase().includes(q));
          if (!matches) return false;
        }

        // Material filter
        if (materials.length > 0 && !materials.includes(roll.material)) {
          return false;
        }

        // Brand filter
        if (brands.length > 0 && !brands.includes(roll.brand)) {
          return false;
        }

        // Status filter
        if (statuses.length > 0 && !statuses.includes(roll.status)) {
          return false;
        }

        // Low stock only (excluye rollos suplidos por otro carrete en inventario)
        if (lowOnly) {
          const lvl = stockLevel(roll, settings);
          if (lvl !== 'low' && lvl !== 'critical' && lvl !== 'empty') return false;
          if (lvl !== 'empty' && backupRollIds.has(roll.id)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const mul = sort.dir === 'asc' ? 1 : -1;
        switch (sort.key) {
          case 'name':
            return mul * nameCollator.compare(a.colorName, b.colorName);
          case 'remaining':
            return mul * (a.remainingWeight - b.remainingWeight);
          case 'price':
            return mul * (a.price - b.price);
          case 'date':
            return mul * (a.purchaseDate || '').localeCompare(b.purchaseDate || '');
          default:
            return 0;
        }
      });
  }, [rolls, deferredQuery, filters, sort, settings.lowThreshold, settings.criticalThreshold, backupRollIds]);

  const hasActiveFilters =
    query.trim() !== '' ||
    filters.materials.length > 0 ||
    filters.brands.length > 0 ||
    filters.statuses.length > 0 ||
    filters.lowOnly;

  const toggleMaterial = (m: Material) => {
    const list = filters.materials.includes(m)
      ? filters.materials.filter((x) => x !== m)
      : [...filters.materials, m];
    setFilters({ materials: list });
  };

  const toggleBrand = (b: string) => {
    const list = filters.brands.includes(b)
      ? filters.brands.filter((x) => x !== b)
      : [...filters.brands, b];
    setFilters({ brands: list });
  };

  const lowStockCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < rolls.length; i++) {
      const r = rolls[i];
      const l = stockLevel(r, settings);
      if ((l === 'low' || l === 'critical') && !backupRollIds.has(r.id)) {
        count++;
      }
    }
    return count;
  }, [rolls, settings.lowThreshold, settings.criticalThreshold, backupRollIds]);

  const isVirtualized = filteredRolls.length > VIRTUALIZE_THRESHOLD;
  const totalRows = Math.ceil(filteredRolls.length / cols);
  const rowStride = rowHeight + ROW_GAP;

  const computeRange = useCallback((scrollEl: HTMLDivElement, rowsCount: number, stride: number) => {
    if (rowsCount <= 0) return { startRow: 0, endRow: 0 };
    const gridEl = gridWrapperRef.current;
    const gridOffsetTop = gridEl ? Math.max(0, gridEl.offsetTop) : 0;
    const relScrollTop = Math.max(0, scrollEl.scrollTop - gridOffsetTop);
    const viewH = scrollEl.clientHeight || 800;
    const startRow = Math.min(
      Math.max(0, Math.floor(relScrollTop / stride) - OVERSCAN_ROWS),
      Math.max(0, rowsCount - 1),
    );
    const endRow = Math.min(
      rowsCount,
      Math.max(startRow + 1, Math.ceil((relScrollTop + viewH) / stride) + OVERSCAN_ROWS),
    );
    return { startRow, endRow };
  }, []);

  // Track responsive Tailwind column count via window width
  useEffect(() => {
    const onResize = () => {
      const next = getGridCols(window.innerWidth);
      setCols((prev) => (prev === next ? prev : next));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Dynamically measure rendered SpoolCard height in virtualized mode
  const isEmpty = filteredRolls.length === 0;
  useEffect(() => {
    if (!isVirtualized || isEmpty) return;
    const firstCard = gridRef.current?.firstElementChild as HTMLElement | null;
    if (!firstCard) return;

    const measure = () => {
      const h = Math.round(firstCard.getBoundingClientRect().height);
      if (h > 100) {
        setRowHeight((prev) => (Math.abs(h - prev) > 1 ? h : prev));
      }
    };
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(firstCard);
    return () => ro.disconnect();
  }, [isVirtualized, cols, isEmpty]);

  // Reset scroll ONLY on query/filter/sort change (never on rolls mutation like -10g) and clamp range
  const prevQueryFilterSortRef = useRef({ deferredQuery, filters, sort });
  useLayoutEffect(() => {
    const prev = prevQueryFilterSortRef.current;
    const criteriaChanged =
      prev.deferredQuery !== deferredQuery ||
      prev.filters !== filters ||
      prev.sort !== sort;
    prevQueryFilterSortRef.current = { deferredQuery, filters, sort };

    const scrollEl = scrollContainerRef.current;
    if (criteriaChanged && scrollEl) {
      scrollEl.scrollTop = 0;
    }

    if (isVirtualized && scrollEl) {
      const next = computeRange(scrollEl, totalRows, rowStride);
      setVisibleRange((cur) =>
        cur.startRow === next.startRow && cur.endRow === next.endRow ? cur : next,
      );
    }
  }, [deferredQuery, filters, sort, isVirtualized, totalRows, rowStride, computeRange]);

  // rAF-coalesced scroll & container resize listener for row-windowing
  useEffect(() => {
    if (!isVirtualized) return;
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    let rafId = 0;
    const update = () => {
      rafId = 0;
      const next = computeRange(scrollEl, totalRows, rowStride);
      setVisibleRange((cur) =>
        cur.startRow === next.startRow && cur.endRow === next.endRow ? cur : next,
      );
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(update);
    };

    update();
    scrollEl.addEventListener('scroll', onScroll, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onScroll);
      ro.observe(scrollEl);
    }

    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      ro?.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isVirtualized, totalRows, rowStride, computeRange]);

  // Sync WebGL layout on filter drawer toggle or sorted/filtered list changes
  const prevShowFiltersBarRef = useRef(showFiltersBar);
  useEffect(() => {
    const filtersToggled = prevShowFiltersBarRef.current !== showFiltersBar;
    prevShowFiltersBarRef.current = showFiltersBar;
    spoolViewer.notifyLayout(filtersToggled ? (isVirtualized ? 120 : 320) : isVirtualized ? 0 : 120);
  }, [filteredRolls, showFiltersBar, isVirtualized]);

  const clampedStartRow = isVirtualized ? Math.min(visibleRange.startRow, Math.max(0, totalRows - 1)) : 0;
  const clampedEndRow = isVirtualized
    ? Math.min(totalRows, Math.max(clampedStartRow + 1, visibleRange.endRow))
    : totalRows;
  const topSpacerHeight = isVirtualized ? clampedStartRow * rowStride : 0;
  const bottomSpacerHeight =
    isVirtualized && clampedEndRow < totalRows ? (totalRows - clampedEndRow) * rowStride : 0;
  const startIndex = isVirtualized ? clampedStartRow * cols : 0;
  const endIndex = isVirtualized ? Math.min(filteredRolls.length, clampedEndRow * cols) : filteredRolls.length;
  const visibleRolls = isVirtualized ? filteredRolls.slice(startIndex, endIndex) : filteredRolls;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Control Bar: Filter pills, sorting, and low stock toggle */}
      <div className="p-4 border-b border-line bg-surface-1 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick toggle: Low stock only */}
          <button
            type="button"
            onClick={() => setFilters({ lowOnly: !filters.lowOnly })}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all ${
              filters.lowOnly
                ? 'bg-warn-soft border-warn text-warn-text font-bold shadow-xs'
                : 'bg-surface-2 border-line text-muted hover:text-text'
            }`}
          >
            <AlertTriangle size={13} className={filters.lowOnly ? 'text-warn' : 'text-faint'} />
            <span>Bajo stock</span>
            {lowStockCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-warn text-surface-1 font-mono font-bold">
                {lowStockCount}
              </span>
            )}
          </button>

          {/* Filter drawer toggle button */}
          <button
            type="button"
            onClick={() => setShowFiltersBar(!showFiltersBar)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all ${
              showFiltersBar || hasActiveFilters
                ? 'bg-accent/15 border-accent text-accent-text font-bold'
                : 'bg-surface-2 border-line text-muted hover:text-text'
            }`}
          >
            <SlidersHorizontal size={13} />
            <span>Filtros {hasActiveFilters ? '•' : ''}</span>
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-2.5 py-1.5 rounded-xl text-xs text-faint hover:text-text transition-colors flex items-center gap-1"
            >
              <RotateCcw size={12} />
              <span>Restablecer</span>
            </button>
          )}
        </div>

        {/* Sort selector + Results count */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-faint">
            {filteredRolls.length} de {rolls.length} rollos
          </span>

          <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-line">
            <span className="text-[11px] text-faint px-1.5 font-medium">Ordenar:</span>
            {(
              [
                ['remaining', 'Restante'],
                ['name', 'Nombre'],
                ['price', 'Precio'],
                ['date', 'Fecha'],
              ] as [SortKey, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  sort.key === key
                    ? 'bg-elevated text-text shadow-xs font-bold'
                    : 'text-muted hover:text-text'
                }`}
              >
                {label} {sort.key === key ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Expandable detailed filter panel */}
      {showFiltersBar && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-b border-line bg-surface-2/60 p-4 space-y-3 shrink-0 overflow-hidden text-xs"
        >
          {/* Materials */}
          <div>
            <span className="text-[11px] font-mono text-muted uppercase tracking-wider block mb-1.5">
              Material:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {availableMaterials.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMaterial(m)}
                  className={`px-2.5 py-1 rounded-lg border font-medium transition-all ${
                    filters.materials.includes(m)
                      ? 'bg-accent text-accent-ink border-accent-strong font-bold shadow-xs'
                      : 'bg-surface-1 text-muted border-line hover:text-text'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Brands */}
          {availableBrands.length > 1 && (
            <div>
              <span className="text-[11px] font-mono text-muted uppercase tracking-wider block mb-1.5">
                Marca:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {availableBrands.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => toggleBrand(b)}
                    className={`px-2.5 py-1 rounded-lg border font-medium transition-all ${
                      filters.brands.includes(b)
                        ? 'bg-accent text-accent-ink border-accent-strong font-bold shadow-xs'
                        : 'bg-surface-1 text-muted border-line hover:text-text'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Shelf Spool Grid */}
      <div ref={scrollContainerRef} className="relative flex-1 overflow-y-auto p-4 sm:p-6 workbench-bg">
        <PendingJobsDrawer />
        {filteredRolls.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-line flex items-center justify-center text-muted">
              <PackageOpen size={32} />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-text">
                {hasActiveFilters
                  ? 'No hay bobinas con estos filtros'
                  : 'Tu estantería está completamente vacía'}
              </h3>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                {hasActiveFilters
                  ? 'Prueba a limpiar la búsqueda o relajar los filtros de material y marca.'
                  : '¿Compraste rollos nuevos o quieres cargar el set de ejemplo para ver cómo se comportan las bobinas y gráficos?'}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-accent-ink hover:bg-accent-strong transition-all shadow-sm"
                >
                  Limpiar filtros
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => openEditor({ mode: 'new' })}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-accent-ink hover:bg-accent-strong transition-all shadow-sm"
                  >
                    + Añadir mi primer rollo
                  </button>
                  <button
                    type="button"
                    onClick={() => loadSeed()}
                    className="px-4 py-2 rounded-xl text-xs font-medium bg-surface-2 text-text hover:bg-surface-3 border border-line transition-all"
                  >
                    Cargar 15 rollos de ejemplo
                  </button>
                </>
              )}
            </div>
          </div>
        ) : isVirtualized ? (
          <div ref={gridWrapperRef}>
            {topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} aria-hidden="true" />}
            <div
              ref={gridRef}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5"
            >
              {visibleRolls.map((roll, i) => (
                <SpoolCard
                  key={roll.id}
                  roll={roll}
                  index={startIndex + i}
                  onQuickUse={handleQuickUse}
                  isBackedUp={backupRollIds.has(roll.id)}
                  lightweight
                />
              ))}
            </div>
            {bottomSpacerHeight > 0 && <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />}
          </div>
        ) : (
          <LayoutGroup>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
              <AnimatePresence mode="popLayout">
                {filteredRolls.map((roll, index) => (
                  <SpoolCard
                    key={roll.id}
                    roll={roll}
                    index={index}
                    onQuickUse={handleQuickUse}
                    isBackedUp={backupRollIds.has(roll.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        )}
      </div>

      {/* Quick Use Modal */}
      {quickUseRoll && (
        <QuickUseModal
          roll={quickUseRoll}
          onClose={() => setQuickUseRoll(null)}
        />
      )}
    </div>
  );
}
