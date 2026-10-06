import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Truck,
  AlertTriangle,
  Clock,
  Calendar,
  Plus,
  ExternalLink,
  ShoppingCart,
  CheckCircle2,
  Package,
  TrendingUp,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  DollarSign,
  ShieldAlert,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import {
  groupInventoryForReplenishment,
  type ProductInventoryGroup,
  type ReplenishStatus,
} from '../../lib/replenishment';
import { fmtDate, fmtG, fmtMoney, fmtCostPerGram, todayIso, nowIso, uid } from '../../lib/roll';
import type { ProductOrder } from '../../shared/types';
import { api } from '../../lib/api';

const STATUS_FILTERS: { key: ReplenishStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'order_now', label: 'Pedir ya' },
  { key: 'order_soon', label: 'Pedir pronto' },
  { key: 'on_the_way', label: 'En camino' },
  { key: 'good_timing', label: 'Con tiempo' },
  { key: 'insufficient_data', label: 'Sin datos' },
];

export function ReplenishmentView() {
  const rolls = useStore((s) => s.rolls);
  const usage = useStore((s) => s.usage);
  const orders = useStore((s) => s.orders);
  const settings = useStore((s) => s.settings);
  const upsertOrder = useStore((s) => s.upsertOrder);
  const markOrderReceived = useStore((s) => s.markOrderReceived);
  const upsertShopping = useStore((s) => s.upsertShopping);
  const setProductOverride = useStore((s) => s.setProductOverride);
  const toast = useStore((s) => s.toast);

  const [activeFilter, setActiveFilter] = useState<ReplenishStatus | 'all'>('all');
  const [orderingProduct, setOrderingProduct] = useState<ProductInventoryGroup | null>(null);
  const [expectedDaysInput, setExpectedDaysInput] = useState<number>(6);
  const [editingOverridesKey, setEditingOverridesKey] = useState<string | null>(null);

  // Group inventory
  const groups = useMemo(() => {
    return groupInventoryForReplenishment(rolls, usage, orders, settings);
  }, [rolls, usage, orders, settings]);

  // Aggregate stats
  const urgentCount = groups.filter((g) => g.status === 'order_now' || g.status === 'order_soon').length;
  const onTheWayCount = groups.filter((g) => g.status === 'on_the_way').length;
  const estimatedReplenishCost = groups
    .filter((g) => g.status === 'order_now' || g.status === 'order_soon')
    .reduce((acc, g) => acc + g.unitPrice, 0);

  // Filter groups
  const filteredGroups = useMemo(() => {
    if (activeFilter === 'all') return groups;
    return groups.filter((g) => g.status === activeFilter);
  }, [groups, activeFilter]);

  const handleMarkAsOrdered = (group: ProductInventoryGroup) => {
    setOrderingProduct(group);
    setExpectedDaysInput(group.deliveryDays);
  };

  const confirmMarkAsOrdered = async () => {
    if (!orderingProduct) return;
    const now = new Date();
    const arrivalDate = new Date(now.getTime() + expectedDaysInput * 86400000);
    const order: ProductOrder = {
      id: uid(),
      productKey: orderingProduct.productKey,
      brand: orderingProduct.brand,
      material: orderingProduct.material,
      colorName: orderingProduct.colorName,
      colorHex: orderingProduct.colorHex,
      orderedAt: nowIso(),
      expectedArrival: arrivalDate.toISOString(),
      received: false,
    };
    await upsertOrder(order);
    toast({
      kind: 'success',
      title: 'Pedido registrado',
      body: `Esperando llegada de ${orderingProduct.brand} ${orderingProduct.material} para el ${fmtDate(order.expectedArrival)}.`,
    });
    setOrderingProduct(null);
  };

  const handleAddShoppingItem = (group: ProductInventoryGroup) => {
    upsertShopping({
      id: uid(),
      label: `${group.brand} ${group.material} · ${group.colorName}`,
      brand: group.brand,
      material: group.material,
      colorHex: group.colorHex,
      qty: 1,
      done: false,
      createdAt: nowIso(),
      sourceRollId: group.rolls[0]?.id ?? null,
      estimatedPrice: group.unitPrice,
    });
    toast({
      kind: 'success',
      title: 'Añadido a lista de compras',
      body: `${group.brand} ${group.material} (${group.colorName}) listo para comprar.`,
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 workbench-bg">
      {/* Header & KPI Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-3xl bg-surface-1 border border-line shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent-text">
              <Truck size={18} />
            </div>
            <div>
              <h1 className="font-display font-extrabold text-xl text-text leading-tight">
                Reabastecimiento predictivo
              </h1>
              <p className="text-xs text-muted">
                Anticípate a los pedidos según tu consumo real para que el filamento llegue antes de que se acabe.
              </p>
            </div>
          </div>
        </div>

        {/* Urgent Stats Badges */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3.5 py-2 rounded-2xl bg-surface-2 border border-line flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                urgentCount > 0 ? 'bg-crit animate-pulse' : 'bg-ok'
              }`}
            />
            <div className="text-left">
              <span className="text-[10px] uppercase font-mono text-faint block leading-none">
                Urgencia de compra
              </span>
              <span className="font-mono font-bold text-xs text-text">
                {urgentCount > 0 ? `${urgentCount} para pedir ya o pronto` : 'Inventario al día'}
              </span>
            </div>
          </div>

          {onTheWayCount > 0 && (
            <div className="px-3.5 py-2 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center gap-2 text-sky-400">
              <Package size={15} />
              <div className="text-left">
                <span className="text-[10px] uppercase font-mono text-sky-400/80 block leading-none">
                  En camino
                </span>
                <span className="font-mono font-bold text-xs text-sky-300">
                  {onTheWayCount} pedido{onTheWayCount > 1 ? 's' : ''}
                </span>
              </div>
            </div>
          )}

          {urgentCount > 0 && (
            <div className="px-3.5 py-2 rounded-2xl bg-surface-2 border border-line flex items-center gap-2">
              <DollarSign size={15} className="text-accent-text" />
              <div className="text-left">
                <span className="text-[10px] uppercase font-mono text-faint block leading-none">
                  Inversión sugerida
                </span>
                <span className="font-mono font-bold text-xs text-text">
                  {fmtMoney(estimatedReplenishCost, settings.currency)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setActiveFilter(f.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
              activeFilter === f.key
                ? 'bg-accent text-accent-ink font-semibold shadow-xs'
                : 'bg-surface-1 hover:bg-surface-2 text-muted hover:text-text border border-line'
            }`}
          >
            {f.label}
            {f.key === 'order_now' && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-crit text-white font-mono">
                {groups.filter((g) => g.status === 'order_now').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Products Timeline List */}
      <div className="space-y-4">
        {filteredGroups.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-surface-1 border border-line space-y-2">
            <Package size={32} className="mx-auto text-faint opacity-50" />
            <h3 className="font-display font-bold text-base text-text">
              No hay productos en esta categoría
            </h3>
            <p className="text-xs text-muted max-w-sm mx-auto">
              Todos tus filamentos están controlados o cumplen con los criterios de stock.
            </p>
          </div>
        ) : (
          filteredGroups.map((group) => {
            const hasOverdueOrder = group.status === 'on_the_way' && group.isOverdueArrival;
            const isEditingOverrides = editingOverridesKey === group.productKey;

            return (
              <motion.div
                key={group.productKey}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-5 rounded-3xl bg-surface-1 border transition-all shadow-xs ${
                  group.status === 'order_now'
                    ? 'border-crit/50 shadow-crit/5'
                    : group.status === 'order_soon'
                    ? 'border-warn/50'
                    : 'border-line'
                }`}
              >
                {/* Header row: Product identity + Status badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line/60">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-5 h-5 rounded-full border border-line shadow-xs shrink-0"
                      style={{ backgroundColor: group.colorHex }}
                    />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted uppercase font-semibold">
                          {group.brand} · {group.material}
                        </span>
                        <span className="text-xs font-semibold text-text">
                          {group.colorName}
                        </span>
                        {group.rolls.length > 1 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-surface-2 text-faint border border-line">
                            {group.rolls.length} rollos en total
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Status Badge */}
                    <StatusBadge status={group.status} daysUntilDeadline={group.daysUntilDeadline} />

                    <button
                      type="button"
                      onClick={() =>
                        setEditingOverridesKey(isEditingOverrides ? null : group.productKey)
                      }
                      className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors border border-line text-xs flex items-center gap-1"
                      title="Configurar entrega y margen de este producto"
                    >
                      <Clock size={13} />
                      <span className="hidden md:inline text-[11px]">Tiempos</span>
                    </button>
                  </div>
                </div>

                {/* Overdue arrival notification banner ("¿Ya llegó?") */}
                {hasOverdueOrder && group.activeOrder && (
                  <div className="my-3 p-3 rounded-2xl bg-sky-500/15 border border-sky-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sky-400 text-xs">
                      <Sparkles size={16} className="shrink-0" />
                      <div>
                        <span className="font-bold text-sky-300 block">¿Ya llegó tu pedido?</span>
                        <span className="text-[11px] text-sky-200/80">
                          La fecha estimada era el {fmtDate(group.activeOrder.expectedArrival)}. Confirma para ingresar el rollo nuevo como sellado.
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => markOrderReceived(group.activeOrder!)}
                      className="px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer transition-all"
                    >
                      <CheckCircle2 size={14} />
                      <span>¡Sí, ya llegó! (+1 sellado)</span>
                    </button>
                  </div>
                )}

                {/* Main Content Grid: Stock metrics, Burn rate, and Timeline */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-3 items-center">
                  {/* Left: Stock Breakdown */}
                  <div className="lg:col-span-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Stock total producto:</span>
                      <span className="font-mono font-bold text-text text-sm">
                        {fmtG(group.totalStockGrams)}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-faint flex flex-col space-y-0.5 pl-2 border-l border-line">
                      <span>• En uso/abiertos: {fmtG(group.openStockGrams)}</span>
                      <span>• Sellados de repuesto: {fmtG(group.sealedStockGrams)}</span>
                    </div>

                    {/* Burn rate display */}
                    <div className="pt-2 flex items-center justify-between text-[11px]">
                      <span className="text-muted flex items-center gap-1">
                        <TrendingUp size={12} className="text-accent-text" />
                        <span>Ritmo de consumo:</span>
                      </span>
                      {group.burnRateGramsPerDay !== null ? (
                        <span className="font-mono font-semibold text-text">
                          {group.burnRateGramsPerDay.toLocaleString('es-CO')} g/día
                          <span className="text-[10px] text-faint ml-1">
                            ({group.burnRateWindowDays === 'manual' ? 'manual' : `${group.burnRateWindowDays}d`})
                          </span>
                        </span>
                      ) : (
                        <span className="text-faint italic">Datos insuficientes</span>
                      )}
                    </div>
                  </div>

                  {/* Center: Horizontal Visual Timeline */}
                  <div className="lg:col-span-6 space-y-2">
                    {group.burnRateGramsPerDay !== null && group.daysUntilDepletion !== null ? (
                      <HorizontalReplenishTimeline group={group} />
                    ) : (
                      /* Manual estimation prompt when < 3 records */
                      <div className="p-3 rounded-2xl bg-surface-2 border border-line text-xs space-y-2">
                        <div className="flex items-center gap-1.5 text-muted">
                          <HelpCircle size={14} className="text-accent-text" />
                          <span>Faltan registros de uso para calcular el ritmo automático.</span>
                        </div>
                        <ManualRateInput
                          currentRate={group.manualWeeklyRate}
                          onSave={(rate) => setProductOverride(group.productKey, { manualWeeklyRate: rate })}
                        />
                      </div>
                    )}

                    {/* Explanatory microcopy */}
                    <p className="text-[11px] text-muted italic">
                      {getExplanatoryTimelineText(group)}
                    </p>
                  </div>

                  {/* Right: Quick Action Buttons */}
                  <div className="lg:col-span-3 flex flex-wrap lg:flex-col gap-2 justify-end">
                    {group.status !== 'on_the_way' ? (
                      <button
                        type="button"
                        onClick={() => handleMarkAsOrdered(group)}
                        className="w-full py-2 px-3 rounded-xl bg-accent text-accent-ink hover:bg-accent-strong text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-98 cursor-pointer"
                      >
                        <Truck size={14} />
                        <span>Marcar como pedido</span>
                      </button>
                    ) : (
                      <div className="w-full py-1.5 px-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-medium text-center">
                        Pedido en camino ({fmtDate(group.activeOrder?.expectedArrival)})
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 w-full">
                      <button
                        type="button"
                        onClick={() => handleAddShoppingItem(group)}
                        className="py-1.5 px-2.5 rounded-xl bg-surface-2 hover:bg-surface-3 text-text border border-line text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        title="Añadir a la lista de compras"
                      >
                        <ShoppingCart size={13} className="text-muted" />
                        <span>A lista</span>
                      </button>

                      {group.productUrl ? (
                        <a
                          href={group.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-1.5 px-2.5 rounded-xl bg-surface-2 hover:bg-surface-3 text-text border border-line text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer truncate"
                          title="Abrir enlace del producto"
                        >
                          <ExternalLink size={13} className="text-accent-text" />
                          <span>Comprar</span>
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="py-1.5 px-2.5 rounded-xl bg-surface-2/40 text-faint border border-line/40 text-[11px] font-medium flex items-center justify-center gap-1 cursor-not-allowed"
                        >
                          <span>Sin URL</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inline Overrides Drawer */}
                {isEditingOverrides && (
                  <div className="mt-4 pt-3 border-t border-line/60 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-surface-2/50 p-3 rounded-2xl">
                    <div>
                      <label className="label">Tiempo de entrega (días para este producto)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        defaultValue={group.deliveryDays}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (val > 0) setProductOverride(group.productKey, { deliveryDays: val });
                        }}
                        className="field font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="label">Margen de seguridad (días de colchón)</label>
                      <input
                        type="number"
                        min="0"
                        max="30"
                        defaultValue={group.safetyMarginDays}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (val >= 0) setProductOverride(group.productKey, { safetyMarginDays: val });
                        }}
                        className="field font-mono text-xs"
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>

      {/* Mark As Ordered Dialog */}
      <AnimatePresence>
        {orderingProduct && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            onClick={() => setOrderingProduct(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md p-6 rounded-3xl bg-elevated border border-line shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <Truck size={20} className="text-accent-text" />
                <h3 className="font-display font-bold text-lg text-text">
                  Marcar como pedido
                </h3>
              </div>

              <p className="text-xs text-muted leading-relaxed">
                Registra la fecha en la que esperas que llegue{' '}
                <strong className="text-text">
                  {orderingProduct.brand} {orderingProduct.material} ({orderingProduct.colorName})
                </strong>
                . Filoteca pausará la alerta de recompra y te avisará cuando deba haber llegado.
              </p>

              <div>
                <label className="label">Días estimados hasta la entrega</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={expectedDaysInput}
                  onChange={(e) => setExpectedDaysInput(Math.max(1, parseInt(e.target.value) || 1))}
                  className="field font-mono text-sm"
                />
                <span className="text-[11px] text-faint block mt-1">
                  Llegada estimada:{' '}
                  {fmtDate(new Date(Date.now() + expectedDaysInput * 86400000).toISOString())}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOrderingProduct(null)}
                  className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-muted hover:text-text text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmMarkAsOrdered}
                  className="px-4 py-2 rounded-xl bg-accent text-accent-ink hover:bg-accent-strong text-xs font-semibold cursor-pointer shadow-xs"
                >
                  Guardar pedido
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- Status Badge
function StatusBadge({
  status,
  daysUntilDeadline,
}: {
  status: ReplenishStatus;
  daysUntilDeadline: number | null;
}) {
  if (status === 'order_now') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-crit/20 text-crit-text border border-crit/40 animate-pulse">
        <ShieldAlert size={13} />
        <span>Pedir ya</span>
      </span>
    );
  }
  if (status === 'order_soon') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-warn/20 text-warn border border-warn/40">
        <AlertTriangle size={13} />
        <span>Pedir pronto ({daysUntilDeadline !== null ? `≤${daysUntilDeadline}d` : ''})</span>
      </span>
    );
  }
  if (status === 'on_the_way') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/40">
        <Package size={13} />
        <span>Pedido en camino</span>
      </span>
    );
  }
  if (status === 'insufficient_data') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-surface-2 text-faint border border-line">
        <HelpCircle size={13} />
        <span>Datos insuficientes</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-ok-soft text-ok border border-ok/30">
      <CheckCircle2 size={13} />
      <span>Con tiempo</span>
    </span>
  );
}

// ------------------------------------------------------ Horizontal Timeline
function HorizontalReplenishTimeline({ group }: { group: ProductInventoryGroup }) {
  const totalDays = Math.max(1, group.daysUntilDepletion ?? 30);
  const deadlineDays = Math.max(0, group.daysUntilDeadline ?? 0);
  const deliveryDays = group.deliveryDays;

  // Percentage positions along timeline (0% = Today, 100% = Depletion)
  const deadlinePct = Math.min(100, Math.max(0, (deadlineDays / totalDays) * 100));
  const arrivalIfOrderedTodayPct = Math.min(100, (deliveryDays / totalDays) * 100);

  return (
    <div className="space-y-1.5">
      {/* Visual Bar Track */}
      <div className="relative h-6 w-full rounded-xl bg-surface-2 border border-line overflow-hidden flex items-center px-1">
        {/* Safe margin zone */}
        <div
          className="absolute left-0 top-0 bottom-0 bg-ok/15 border-r border-ok/40"
          style={{ width: `${deadlinePct}%` }}
          title={`Zona con tiempo (${deadlineDays} días restantes para pedir)`}
        />

        {/* Warning zone between deadline and depletion */}
        <div
          className="absolute top-0 bottom-0 bg-crit/15"
          style={{ left: `${deadlinePct}%`, right: 0 }}
          title="Zona de riesgo de desabastecimiento"
        />

        {/* Marker: Arrival if ordered today */}
        <div
          className="absolute top-1 bottom-1 w-0.5 bg-accent-text z-10"
          style={{ left: `${arrivalIfOrderedTodayPct}%` }}
        >
          <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-accent border border-surface-1" />
        </div>

        {/* Marker: Order Deadline */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-crit z-20"
          style={{ left: `${deadlinePct}%` }}
        >
          <div className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-crit border border-white" />
        </div>
      </div>

      {/* Timeline Labels */}
      <div className="flex items-center justify-between text-[10px] font-mono text-muted">
        <span>Hoy</span>
        <span
          className="text-crit-text font-bold"
          style={{ marginLeft: `${Math.min(70, Math.max(10, deadlinePct - 15))}%` }}
        >
          Límite para pedir: {group.orderDeadline ? fmtDate(group.orderDeadline.toISOString()) : ''}
        </span>
        <span className="text-faint">
          Se agota: {group.depletionDate ? fmtDate(group.depletionDate.toISOString()) : ''}
        </span>
      </div>
    </div>
  );
}

// --------------------------------------------------------- Explanatory Text
function getExplanatoryTimelineText(group: ProductInventoryGroup): string {
  if (group.status === 'on_the_way') {
    return `Pedido realizado el ${fmtDate(group.activeOrder?.orderedAt)}. Llegada estimada: ${fmtDate(group.activeOrder?.expectedArrival)}.`;
  }
  if (group.status === 'insufficient_data') {
    return 'Registra al menos 3 impresiones o ingresa un ritmo semanal estimado para predecir cuándo pedir.';
  }
  if (!group.depletionDate) return '';

  const depStr = fmtDate(group.depletionDate.toISOString());
  const arrivalDate = new Date(Date.now() + group.deliveryDays * 86400000);
  const arrStr = fmtDate(arrivalDate.toISOString());

  if (group.status === 'order_now') {
    return `¡Fecha límite superada! Se agota el ${depStr}. Si pides hoy llegará el ${arrStr} (tiempo de entrega: ${group.deliveryDays} días).`;
  }
  if (group.status === 'order_soon') {
    return `Se agota el ${depStr}. Si pides hoy llega el ${arrStr}. Te quedan ${group.daysUntilDeadline} días para pedir con margen de seguridad.`;
  }
  return `Se agota el ${depStr}. Si pides hoy llega el ${arrStr}. Tienes ${group.daysUntilDeadline} días de margen antes de necesitar pedir.`;
}

// ------------------------------------------------------ Manual Rate Input
function ManualRateInput({
  currentRate,
  onSave,
}: {
  currentRate?: number;
  onSave: (rate: number) => void;
}) {
  const [val, setVal] = useState<string>(currentRate ? String(currentRate) : '150');

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted">Estimación manual:</span>
      <input
        type="number"
        min="10"
        max="5000"
        step="10"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="field font-mono text-xs w-24 h-7 text-center"
        placeholder="150"
      />
      <span className="text-[11px] text-faint">g / semana</span>
      <button
        type="button"
        onClick={() => {
          const parsed = parseFloat(val);
          if (parsed > 0) onSave(parsed);
        }}
        className="px-2.5 py-1 rounded-lg bg-accent text-accent-ink font-semibold text-xs cursor-pointer shadow-xs"
      >
        Guardar
      </button>
    </div>
  );
}
