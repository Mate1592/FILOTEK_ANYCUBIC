import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect } from 'react';
import { X, Check, Sparkles, RefreshCw } from 'lucide-react';
import {
  FINISHES,
  MATERIALS,
  STATUSES,
  type Finish,
  type Material,
  type Roll,
  type RollStatus,
} from '../../shared/types';
import { useStore } from '../../store/useStore';
import {
  FINISH_LABEL,
  MATERIAL_DEFAULTS,
  STATUS_LABEL,
  fmtCostPerGram,
  fmtMoney,
  isValidHex,
  normHex,
  parsePriceInput,
  sanitizeRoll,
  todayIso,
} from '../../lib/roll';
import { Spool } from './Spool';
import { InteractiveSpool3D } from '../spool3d/InteractiveSpool3D';
import { GaugeRing } from './GaugeRing';

const BRAND_SUGGESTIONS = [
  'Anycubic',
  'Sunlu',
  'Bambu Lab',
  'Elegoo',
  'eSun',
  'Polymaker',
  'Creality',
  'Prusament',
  'Overture',
  'Hatchbox',
  'Kingroon',
  'NinjaTek',
  'Ultimaker',
];

const POPULAR_COLORS = [
  { name: 'Negro carbón', hex: '#1f2023' },
  { name: 'Blanco nieve', hex: '#f0f0ee' },
  { name: 'Gris máquina', hex: '#5c6068' },
  { name: 'Rojo lava', hex: '#c8372d' },
  { name: 'Azul cobalto', hex: '#2255b4' },
  { name: 'Verde neón', hex: '#55c93a' },
  { name: 'Naranja fuego', hex: '#e8651a' },
  { name: 'Amarillo sol', hex: '#e8b820' },
  { name: 'Oro seda', hex: '#d6a93c' },
  { name: 'Púrpura real', hex: '#7a3ebd' },
  { name: 'Rosa pastel', hex: '#e89ebb' },
  { name: 'Natural / Neutro', hex: '#dcd7c8' },
];

const STORE_SUGGESTIONS = [
  'Anycubic Store',
  'Sunlu Store',
  'Amazon',
  'MercadoLibre',
  'AliExpress',
  'Bambu Lab Store',
  '3D Market Colombia',
  'Prusa Research',
  'MatterHackers',
];

export function RollEditorModal() {
  const editor = useStore((s) => s.editor);
  const openEditor = useStore((s) => s.openEditor);
  const rolls = useStore((s) => s.rolls);
  const saveRoll = useStore((s) => s.saveRoll);
  const settings = useStore((s) => s.settings);

  const existingRoll =
    editor && 'id' in editor ? rolls.find((r) => r.id === editor.id) : null;

  const [form, setForm] = useState<Partial<Roll>>({
    brand: 'Anycubic',
    material: 'PLA',
    finish: 'glossy',
    colorName: 'Negro carbón',
    colorHex: '#1f2023',
    diameter: 1.75,
    initialWeight: 1000,
    remainingWeight: 1000,
    price: 68900,
    purchaseDate: todayIso(),
    location: 'Estante A · 1',
    nozzleTemp: { min: 200, max: 220 },
    bedTemp: { min: 50, max: 60 },
    notes: '',
    status: 'sealed',
    store: 'Anycubic Store',
    productUrl: '',
    shippingCost: 0,
    taxCost: 0,
    deliveryDays: 5,
  });

  const [rawPrice, setRawPrice] = useState<string>('68900');
  const [rawShipping, setRawShipping] = useState<string>('0');
  const [rawTax, setRawTax] = useState<string>('0');

  useEffect(() => {
    if (!editor) return;
    if (existingRoll) {
      if (editor.mode === 'clone') {
        setForm({
          ...existingRoll,
          id: undefined,
          status: 'sealed',
          remainingWeight: existingRoll.initialWeight,
          purchaseDate: todayIso(),
        });
        setRawPrice(String(existingRoll.price || ''));
        setRawShipping(String(existingRoll.shippingCost || '0'));
        setRawTax(String(existingRoll.taxCost || '0'));
      } else {
        setForm({ ...existingRoll });
        setRawPrice(String(existingRoll.price || ''));
        setRawShipping(String(existingRoll.shippingCost || '0'));
        setRawTax(String(existingRoll.taxCost || '0'));
      }
    } else {
      setForm({
        brand: 'Bambu Lab',
        material: 'PLA',
        finish: 'glossy',
        colorName: 'Negro carbón',
        colorHex: '#1f2023',
        diameter: 1.75,
        initialWeight: 1000,
        remainingWeight: 1000,
        price: 89900,
        purchaseDate: todayIso(),
        location: '',
        nozzleTemp: { min: 200, max: 220 },
        bedTemp: { min: 50, max: 60 },
        notes: '',
        status: 'sealed',
        store: 'Bambu Lab Store',
        productUrl: '',
        shippingCost: 0,
        taxCost: 0,
        deliveryDays: 6,
      });
      setRawPrice('89900');
      setRawShipping('0');
      setRawTax('0');
    }
  }, [editor, existingRoll]);

  if (!editor) return null;

  const handleMaterialChange = (mat: Material) => {
    const temps = MATERIAL_DEFAULTS[mat] ?? { nozzle: [200, 220], bed: [50, 60] };
    setForm((f) => ({
      ...f,
      material: mat,
      nozzleTemp: { min: temps.nozzle[0], max: temps.nozzle[1] },
      bedTemp: { min: temps.bed[0], max: temps.bed[1] },
    }));
  };

  const handleColorPreset = (p: { name: string; hex: string }) => {
    setForm((f) => ({
      ...f,
      colorHex: p.hex,
      colorName: f.colorName === '' || f.colorName === 'Negro carbón' ? p.name : f.colorName,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitized = sanitizeRoll(
      {
        ...form,
        id: editor.mode === 'edit' && existingRoll ? existingRoll.id : undefined,
      },
    );
    const ok = await saveRoll(sanitized);
    if (ok) openEditor(null);
  };

  const currentFrac =
    (form.initialWeight || 1000) > 0
      ? (form.remainingWeight || 0) / (form.initialWeight || 1000)
      : 0;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto"
        onClick={() => openEditor(null)}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-2xl rounded-3xl bg-elevated border border-line shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-line bg-surface-1/50 sticky top-0 z-20">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-muted font-semibold">
                {editor.mode === 'new'
                  ? 'Nuevo rollo'
                  : editor.mode === 'clone'
                  ? 'Duplicar rollo (recompra)'
                  : 'Editar datos'}
              </span>
              <h2 className="font-display font-bold text-xl text-text">
                {form.colorName || 'Sin nombre'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => openEditor(null)}
              className="p-2 rounded-xl text-faint hover:text-text hover:bg-surface-2 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-6">
            {/* Live spool preview card */}
            <div className="flex items-center gap-6 p-4 rounded-2xl bg-surface-2/60 border border-line">
              <div className="w-28 h-28 relative shrink-0">
                <InteractiveSpool3D
                  color={form.colorHex || '#1f2023'}
                  finish={form.finish || 'glossy'}
                  fraction={currentFrac}
                  level={currentFrac <= 0.1 ? 'critical' : currentFrac <= 0.2 ? 'low' : 'ok'}
                  className="w-full h-full drop-shadow-md"
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-mono text-muted uppercase">Vista previa en tiempo real</span>
                <div className="font-display font-bold text-base text-text">
                  {form.brand || 'Marca'} {form.material} · {form.colorName || 'Color'}
                </div>
                <div className="text-xs text-muted">
                  Acabado: {FINISH_LABEL[form.finish || 'glossy']} · {form.remainingWeight || 0}g /{' '}
                  {form.initialWeight || 1000}g ({Math.round(currentFrac * 100)}%)
                </div>
              </div>
            </div>

            {/* Brand & Material */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Marca</label>
                <input
                  type="text"
                  required
                  list="brands-list"
                  value={form.brand || ''}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="field"
                  placeholder="Ej. Bambu Lab, Prusament..."
                />
                <datalist id="brands-list">
                  {BRAND_SUGGESTIONS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['Anycubic', 'Sunlu', 'Bambu Lab', 'Elegoo', 'eSun', 'Creality'].map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setForm({ ...form, brand: b })}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded-md border transition-all cursor-pointer ${
                        form.brand === b
                          ? 'bg-accent/20 border-accent text-accent-text font-bold'
                          : 'bg-surface-2 border-line text-muted hover:text-text hover:border-line-strong'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Material</label>
                <select
                  value={form.material || 'PLA'}
                  onChange={(e) => handleMaterialChange(e.target.value as Material)}
                  className="field"
                >
                  {MATERIALS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Color & Finish */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Nombre del color</label>
                  <input
                    type="text"
                    required
                    value={form.colorName || ''}
                    onChange={(e) => setForm({ ...form, colorName: e.target.value })}
                    className="field"
                    placeholder="Ej. Galaxy Black, Blanco seda..."
                  />
                </div>

                <div>
                  <label className="label">Acabado del material</label>
                  <select
                    value={form.finish || 'glossy'}
                    onChange={(e) => setForm({ ...form, finish: e.target.value as Finish })}
                    className="field"
                  >
                    {FINISHES.map((f) => (
                      <option key={f} value={f}>
                        {FINISH_LABEL[f]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Color picker + hex input + quick swatch palette */}
              <div>
                <label className="label">Color (Hexadecimal)</label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="color"
                    value={form.colorHex || '#1f2023'}
                    onChange={(e) => setForm({ ...form, colorHex: e.target.value })}
                    className="swatch"
                    title="Elegir con selector"
                  />
                  <input
                    type="text"
                    value={form.colorHex || '#1f2023'}
                    onChange={(e) => setForm({ ...form, colorHex: e.target.value })}
                    className="field font-mono text-xs uppercase max-w-[120px]"
                    placeholder="#RRGGBB"
                  />
                </div>

                {/* Popular swatches */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {POPULAR_COLORS.map((p) => (
                    <button
                      key={p.hex}
                      type="button"
                      onClick={() => handleColorPreset(p)}
                      className={`w-6 h-6 rounded-lg border transition-transform hover:scale-110 active:scale-95 ${
                        form.colorHex === p.hex ? 'border-accent-text ring-2 ring-accent' : 'border-line'
                      }`}
                      style={{ backgroundColor: p.hex }}
                      title={p.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Weights & Diameter */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Diámetro</label>
                <div className="grid grid-cols-2 gap-1 bg-surface-2 p-1 rounded-xl border border-line">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, diameter: 1.75 })}
                    className={`py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                      form.diameter === 1.75
                        ? 'bg-elevated text-text shadow-xs font-bold'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    1.75 mm
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, diameter: 2.85 })}
                    className={`py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                      form.diameter === 2.85
                        ? 'bg-elevated text-text shadow-xs font-bold'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    2.85 mm
                  </button>
                </div>
              </div>

              <div>
                <label className="label">Peso inicial neto (g)</label>
                <input
                  type="number"
                  min="50"
                  max="10000"
                  step="10"
                  required
                  value={form.initialWeight || ''}
                  onChange={(e) => {
                    const ini = parseFloat(e.target.value) || 0;
                    setForm({ ...form, initialWeight: ini });
                  }}
                  className="field font-mono"
                  placeholder="1000"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label mb-0">Peso restante (g)</label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, remainingWeight: form.initialWeight || 1000 })}
                    className="text-[10px] text-accent-text hover:underline"
                  >
                    Lleno
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  max={form.initialWeight || 1000}
                  step="0.5"
                  required
                  value={form.remainingWeight ?? ''}
                  onChange={(e) => setForm({ ...form, remainingWeight: parseFloat(e.target.value) || 0 })}
                  className="field font-mono"
                  placeholder="1000"
                />
              </div>
            </div>

            {/* Price & Purchase Specs */}
            <div className="space-y-4 p-4 rounded-2xl bg-surface-1 border border-line">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label mb-0">Precio ({settings.currency})</label>
                    {form.price ? (
                      <span className="text-[10px] font-mono text-accent-text font-semibold">
                        {fmtMoney(form.price, settings.currency)}
                      </span>
                    ) : null}
                  </div>
                  <input
                    type="text"
                    value={rawPrice}
                    onChange={(e) => {
                      setRawPrice(e.target.value);
                      const parsed = parsePriceInput(e.target.value);
                      setForm((prev) => ({ ...prev, price: parsed }));
                    }}
                    className="field font-mono"
                    placeholder="89900 o 89.900"
                  />
                  <span className="text-[10px] text-faint mt-1 block">
                    Acepta &quot;89900&quot; y &quot;89.900&quot;
                  </span>
                </div>

                <div>
                  <label className="label">Fecha de compra</label>
                  <input
                    type="date"
                    value={form.purchaseDate || todayIso()}
                    onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                    className="field font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="label">Ubicación / Estante</label>
                  <input
                    type="text"
                    value={form.location || ''}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="field"
                    placeholder="Ej. Estante A · 1, Caja seca"
                  />
                </div>
              </div>

              {/* Provider & Delivery Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-line/60">
                <div>
                  <label className="label">Tienda / Proveedor</label>
                  <input
                    type="text"
                    value={form.store || ''}
                    onChange={(e) => setForm({ ...form, store: e.target.value })}
                    className="field"
                    placeholder="Ej. Amazon, MercadoLibre..."
                    list="store-suggestions"
                  />
                  <datalist id="store-suggestions">
                    {STORE_SUGGESTIONS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>

                <div className="sm:col-span-2">
                  <label className="label">Enlace al producto (URL)</label>
                  <input
                    type="url"
                    value={form.productUrl || ''}
                    onChange={(e) => setForm({ ...form, productUrl: e.target.value })}
                    className="field font-mono text-xs"
                    placeholder="https://tienda.com/producto"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">Envío ({settings.currency})</label>
                  <input
                    type="text"
                    value={rawShipping}
                    onChange={(e) => {
                      setRawShipping(e.target.value);
                      const parsed = parsePriceInput(e.target.value);
                      setForm((prev) => ({ ...prev, shippingCost: parsed }));
                    }}
                    className="field font-mono text-xs"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="label">Impuestos ({settings.currency})</label>
                  <input
                    type="text"
                    value={rawTax}
                    onChange={(e) => {
                      setRawTax(e.target.value);
                      const parsed = parsePriceInput(e.target.value);
                      setForm((prev) => ({ ...prev, taxCost: parsed }));
                    }}
                    className="field font-mono text-xs"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="label">Tiempo entrega (días)</label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={form.deliveryDays ?? 6}
                    onChange={(e) => setForm({ ...form, deliveryDays: parseInt(e.target.value) || 6 })}
                    className="field font-mono text-xs"
                    placeholder="6"
                  />
                </div>
              </div>

              {/* Total & Cost per Gram summary banner */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-2 border border-line/60 text-xs">
                <span className="text-muted">Costo total por gramo (incluye envío e impuestos):</span>
                <span className="font-mono font-bold text-accent-text">
                  {fmtCostPerGram(
                    ((form.price || 0) + (form.shippingCost || 0) + (form.taxCost || 0)) /
                      ((form.initialWeight || 1000) > 0 ? (form.initialWeight || 1000) : 1),
                    settings.currency,
                  )}
                </span>
              </div>
            </div>

            {/* Recommended Temps */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-surface-1 border border-line">
              <div>
                <label className="label">Boquilla (°C)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="150"
                    max="350"
                    value={form.nozzleTemp?.min || 200}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        nozzleTemp: {
                          min: parseInt(e.target.value) || 200,
                          max: form.nozzleTemp?.max || 220,
                        },
                      })
                    }
                    className="field font-mono text-center"
                    placeholder="Min"
                  />
                  <span className="text-muted">-</span>
                  <input
                    type="number"
                    min="150"
                    max="350"
                    value={form.nozzleTemp?.max || 220}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        nozzleTemp: {
                          min: form.nozzleTemp?.min || 200,
                          max: parseInt(e.target.value) || 220,
                        },
                      })
                    }
                    className="field font-mono text-center"
                    placeholder="Max"
                  />
                </div>
              </div>

              <div>
                <label className="label">Cama caliente (°C)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="150"
                    value={form.bedTemp?.min || 50}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        bedTemp: {
                          min: parseInt(e.target.value) || 50,
                          max: form.bedTemp?.max || 60,
                        },
                      })
                    }
                    className="field font-mono text-center"
                    placeholder="Min"
                  />
                  <span className="text-muted">-</span>
                  <input
                    type="number"
                    min="0"
                    max="150"
                    value={form.bedTemp?.max || 60}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        bedTemp: {
                          min: form.bedTemp?.min || 50,
                          max: parseInt(e.target.value) || 60,
                        },
                      })
                    }
                    className="field font-mono text-center"
                    placeholder="Max"
                  />
                </div>
              </div>
            </div>

            {/* Status & Notes */}
            <div className="space-y-4">
              <div>
                <label className="label">Estado inicial</label>
                <div className="grid grid-cols-4 gap-2">
                  {STATUSES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setForm({ ...form, status: st })}
                      className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                        form.status === st
                          ? 'bg-accent/20 border-accent text-accent-text font-bold'
                          : 'bg-surface-2 border-line text-muted hover:text-text'
                      }`}
                    >
                      {STATUS_LABEL[st]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Notas de taller</label>
                <textarea
                  rows={2}
                  value={form.notes || ''}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="field"
                  placeholder="Recomendaciones de retracción, flujo, proveedor, etc."
                />
              </div>
            </div>

            {/* Submit Bar */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line sticky bottom-0 bg-elevated pb-2">
              <button
                type="button"
                onClick={() => openEditor(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-muted hover:text-text hover:bg-surface-2 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl text-xs font-semibold bg-accent text-accent-ink hover:bg-accent-strong shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Check size={16} />
                <span>
                  {editor.mode === 'new'
                    ? 'Crear rollo'
                    : editor.mode === 'clone'
                    ? 'Guardar recompra'
                    : 'Guardar cambios'}
                </span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
