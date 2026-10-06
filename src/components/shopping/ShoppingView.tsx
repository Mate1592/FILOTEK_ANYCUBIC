import React, { useMemo, useState } from 'react';
import {
  ShoppingCart,
  Plus,
  Check,
  Trash2,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  PackageCheck,
  CheckCircle2,
} from 'lucide-react';
import { MATERIALS, type Material, type ShoppingItem } from '../../shared/types';
import { useStore } from '../../store/useStore';
import { stockLevel, uid, nowIso, hasBackupStock } from '../../lib/roll';

export function ShoppingView() {
  const rolls = useStore((s) => s.rolls);
  const shopping = useStore((s) => s.shopping);
  const settings = useStore((s) => s.settings);
  const upsertShopping = useStore((s) => s.upsertShopping);
  const deleteShopping = useStore((s) => s.deleteShopping);
  const duplicate = useStore((s) => s.duplicate);

  const [label, setLabel] = useState('');
  const [material, setMaterial] = useState<Material>('PLA');
  const [brand, setBrand] = useState('Anycubic');

  // Auto-suggestions: rolls in low or critical stock or empty not yet added (excluyendo los suplidos)
  const suggestions = useMemo(() => {
    const existingRollIds = new Set(shopping.map((s) => s.sourceRollId).filter(Boolean));
    return rolls.filter((r) => {
      const lvl = stockLevel(r, settings);
      const isLow = lvl === 'low' || lvl === 'critical' || lvl === 'empty';
      if (!isLow) return false;
      if (existingRollIds.has(r.id)) return false;
      if (hasBackupStock(r, rolls, settings)) return false;
      return true;
    });
  }, [rolls, shopping, settings]);

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    const item: ShoppingItem = {
      id: uid(),
      label: label.trim(),
      material,
      brand: brand.trim(),
      colorHex: '#38bdf8',
      qty: 1,
      done: false,
      createdAt: nowIso(),
      sourceRollId: null,
    };
    upsertShopping(item);
    setLabel('');
  };

  const handleAddSuggestion = (r: (typeof rolls)[0]) => {
    const item: ShoppingItem = {
      id: uid(),
      label: `${r.colorName} (${r.material})`,
      material: r.material,
      brand: r.brand,
      colorHex: r.colorHex,
      qty: 1,
      done: false,
      createdAt: nowIso(),
      sourceRollId: r.id,
    };
    upsertShopping(item);
  };

  const handleToggleDone = (item: ShoppingItem) => {
    upsertShopping({ ...item, done: !item.done });
  };

  const handleReceiveRoll = async (item: ShoppingItem) => {
    if (item.sourceRollId) {
      await duplicate(item.sourceRollId);
    }
    deleteShopping(item.id);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 workbench-bg">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-mono text-muted uppercase tracking-wider block">
            Taller · Abastecimiento
          </span>
          <h2 className="font-display font-bold text-xl text-text">
            Lista de Compras de Filamento
          </h2>
        </div>
        <div className="text-xs font-mono text-faint">
          {shopping.filter((s) => !s.done).length} pendientes
        </div>
      </div>

      {/* Auto-suggestions banner */}
      {suggestions.length > 0 && (
        <div className="p-4 rounded-2xl bg-warn-soft border border-warn/30 space-y-3">
          <div className="flex items-center gap-2 text-warn-text">
            <Sparkles size={16} />
            <h3 className="font-display font-bold text-sm">
              Sugerencias automáticas por bajo stock ({suggestions.length})
            </h3>
          </div>
          <p className="text-xs text-warn-text/90">
            Detectamos que estos carretes están en zona de reserva o agotados. Agrégalos con un clic a tu lista:
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            {suggestions.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => handleAddSuggestion(r)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-1 border border-warn/40 text-text text-xs hover:border-warn hover:shadow-xs transition-all cursor-pointer"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full border border-line"
                  style={{ backgroundColor: r.colorHex }}
                />
                <span className="font-medium">{r.colorName}</span>
                <span className="text-[10px] text-faint">
                  ({r.brand} {r.material})
                </span>
                <Plus size={13} className="text-warn ml-0.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add Custom Item Form */}
      <form
        onSubmit={handleAddCustom}
        className="p-4 rounded-2xl bg-surface-1 border border-line shadow-xs flex flex-wrap sm:flex-nowrap items-center gap-3"
      >
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="¿Qué filamento necesitas comprar? (Ej. PLA+ Negro Anycubic, PETG Sunlu...)"
          className="field flex-1"
        />

        <select
          value={material}
          onChange={(e) => setMaterial(e.target.value as Material)}
          className="field sm:w-36"
        >
          {MATERIALS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={!label.trim()}
          className="px-5 py-2 rounded-xl bg-accent text-accent-ink hover:bg-accent-strong font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5 shrink-0 disabled:opacity-40 cursor-pointer"
        >
          <Plus size={15} />
          <span>Añadir</span>
        </button>
      </form>

      {/* Shopping List Items */}
      <div className="space-y-2">
        {shopping.length === 0 ? (
          <div className="p-12 rounded-2xl bg-surface-1 border border-dashed border-line text-center text-xs text-faint space-y-2">
            <ShoppingCart size={32} className="mx-auto text-muted/50" />
            <p>Tu lista de compras está vacía.</p>
            <p className="text-[11px]">Cuando tus carretes bajen del umbral, aparecerán aquí automáticamente.</p>
          </div>
        ) : (
          shopping.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                item.done
                  ? 'bg-surface-2/40 border-line text-faint line-through'
                  : 'bg-surface-1 border-line shadow-xs text-text'
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleToggleDone(item)}
                  className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors ${
                    item.done
                      ? 'bg-ok border-ok text-white'
                      : 'border-line hover:border-line-strong'
                  }`}
                >
                  {item.done && <Check size={13} strokeWidth={3} />}
                </button>

                <div className="flex items-center gap-2">
                  {item.colorHex && (
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-line"
                      style={{ backgroundColor: item.colorHex }}
                    />
                  )}
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.material && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-2 border border-line text-muted">
                      {item.material}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {item.done && item.sourceRollId && (
                  <button
                    type="button"
                    onClick={() => handleReceiveRoll(item)}
                    className="px-2.5 py-1 rounded-lg bg-accent/20 hover:bg-accent/30 text-accent-text text-xs font-semibold flex items-center gap-1 transition-all"
                    title="Añade una nueva bobina sellada a la estantería"
                  >
                    <PackageCheck size={13} />
                    <span>Recibido en taller</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => deleteShopping(item.id)}
                  className="p-1.5 rounded-lg text-faint hover:text-crit-text hover:bg-surface-2 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
