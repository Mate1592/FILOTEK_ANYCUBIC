import type { Finish, Roll, RollStatus, Settings } from '../shared/types';

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const nowIso = () => new Date().toISOString();
export const todayIso = () => new Date().toISOString().slice(0, 10);

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function pctRemaining(r: Pick<Roll, 'remainingWeight' | 'initialWeight'>): number {
  if (!r.initialWeight || r.initialWeight <= 0) return 0;
  return clamp((r.remainingWeight / r.initialWeight) * 100, 0, 100);
}

export type StockLevel = 'ok' | 'low' | 'critical' | 'empty';

export function stockLevel(r: Roll, s: Pick<Settings, 'lowThreshold' | 'criticalThreshold'>): StockLevel {
  const p = pctRemaining(r);
  if (r.status === 'empty' || r.remainingWeight <= 0.5) return 'empty';
  if (p < s.criticalThreshold) return 'critical';
  if (p < s.lowThreshold) return 'low';
  return 'ok';
}

/**
 * Comprueba si un rollo que está en nivel bajo o crítico cuenta con otro rollo
 * en el inventario que lo supla/respalde (mismo material y color, con stock saludable).
 */
export function hasBackupStock(
  roll: Roll,
  allRolls: Roll[],
  settings: Pick<Settings, 'lowThreshold'>,
): boolean {
  return allRolls.some((other) => {
    if (other.id === roll.id) return false;
    if (other.status === 'empty' || other.remainingWeight <= 0.5) return false;

    // Mismo material (normalizado)
    const sameMat = other.material.toLowerCase().trim() === roll.material.toLowerCase().trim();
    if (!sameMat) return false;

    // Mismo color (por nombre normalizado o por código hexadecimal idéntico)
    const sameColorName = other.colorName.toLowerCase().trim() === roll.colorName.toLowerCase().trim();
    const sameColorHex = other.colorHex.toLowerCase().trim() === roll.colorHex.toLowerCase().trim();
    if (!sameColorName && !sameColorHex) return false;

    // El otro rollo debe tener stock saludable (por encima del umbral de bajo stock)
    const otherPct = pctRemaining(other);
    return otherPct >= settings.lowThreshold && other.remainingWeight >= 150;
  });
}

export const LEVEL_LABEL: Record<StockLevel, string> = {
  ok: 'Bien surtido',
  low: 'Queda poco',
  critical: 'Crítico',
  empty: 'Agotado',
};

export const STATUS_LABEL: Record<RollStatus, string> = {
  sealed: 'Sellado',
  in_use: 'En uso',
  dry: 'Seco',
  empty: 'Agotado',
};

export const FINISH_LABEL: Record<Finish, string> = {
  matte: 'Mate',
  glossy: 'Brillante',
  translucent: 'Translúcido',
  silk: 'Seda',
  glitter: 'Glitter',
};

// ------------------------------------------------------------------ formato
const nf0 = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtG = (g: number) => (Math.abs(g) >= 1000 ? `${nf1.format(g / 1000)} kg` : `${nf0.format(g)} g`);
export const fmtGRaw = (g: number) => nf0.format(g);
export const fmtNum = (n: number) => nf0.format(n);

/** Formatea dinero con soporte especial para COP ($ 89.900) y monedas configuradas */
export function fmtMoney(v: number, cur = 'COP') {
  const isCOP = cur === 'COP' || cur === '$';
  if (isCOP) {
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(v);
    } catch {
      return `$ ${nf0.format(v)}`;
    }
  }
  try {
    const isIsoCode = /^[A-Z]{3}$/.test(cur);
    if (isIsoCode) {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: cur,
        maximumFractionDigits: 2,
      }).format(v);
    }
    return `${cur} ${nf2.format(v)}`;
  } catch {
    return `${cur} ${nf2.format(v)}`;
  }
}

/** Formatea costo por gramo con 1 decimal en COP ($ 89,9/g) */
export function fmtCostPerGram(v: number, cur = 'COP') {
  const isCOP = cur === 'COP' || cur === '$';
  if (isCOP) {
    try {
      const formatted = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(v);
      return `${formatted}/g`;
    } catch {
      return `$ ${nf1.format(v)}/g`;
    }
  }
  try {
    const isIsoCode = /^[A-Z]{3}$/.test(cur);
    if (isIsoCode) {
      return `${new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: cur,
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      }).format(v)}/g`;
    }
    return `${cur} ${new Intl.NumberFormat('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v)}/g`;
  } catch {
    return `${cur} ${new Intl.NumberFormat('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v)}/g`;
  }
}

export const fmtMoney4 = fmtCostPerGram;

/** Tolera entradas como '89900', '89.900', '$ 89.900', '89.900,50' */
export function parsePriceInput(val: string | number | undefined | null): number {
  if (typeof val === 'number') return Number.isFinite(val) ? Math.max(0, val) : 0;
  if (!val) return 0;
  let str = String(val).trim().replace(/[$ \s\u00a0]/g, '');
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if ((str.match(/\./g) || []).length === 1) {
    const parts = str.split('.');
    if (parts[1].length === 3) {
      str = parts[0] + parts[1];
    }
  } else if ((str.match(/\./g) || []).length > 1) {
    str = str.replace(/\./g, '');
  }
  const n = parseFloat(str);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function fmtDate(iso: string | undefined) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtRelative(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const day = 86400000;
  if (diff < 60000) return 'hace un momento';
  if (diff < 3600000) return `hace ${Math.round(diff / 60000)} min`;
  if (diff < day) return `hace ${Math.round(diff / 3600000)} h`;
  if (diff < day * 2) return 'ayer';
  if (diff < day * 30) return `hace ${Math.round(diff / day)} días`;
  return fmtDate(iso);
}

// -------------------------------------------------------------------- color
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

/** Mezcla un color con blanco (amt>0) o negro (amt<0). */
export function shade(hex: string, amt: number) {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  return rgbToHex(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p);
}

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const isValidHex = (h: string) => /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h.trim());
export const normHex = (h: string) => {
  let x = h.trim().replace('#', '');
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  return `#${x.toLowerCase()}`;
};

/** Generador pseudoaleatorio determinista (para glitter estable por rollo). */
export function seeded(seedStr: string) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function costPerGram(r: Roll) {
  if (!r.initialWeight || r.initialWeight <= 0) return 0;
  const totalCost = (r.price || 0) + (r.shippingCost || 0) + (r.taxCost || 0);
  return totalCost / r.initialWeight;
}

/** Normaliza/valida un rollo (import, formularios). Lanza Error con mensaje legible. */
export function sanitizeRoll(raw: Partial<Roll>, fallbackId = uid()): Roll {
  const n = (v: unknown, d = 0) => {
    const x = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
    return Number.isFinite(x) ? x : d;
  };
  const initialWeight = Math.max(0, n(raw.initialWeight, 1000));
  const remainingWeight = clamp(n(raw.remainingWeight, initialWeight), 0, Math.max(initialWeight, 0));
  const hex = typeof raw.colorHex === 'string' && isValidHex(raw.colorHex) ? normHex(raw.colorHex) : '#888888';
  const now = nowIso();
  const status: RollStatus = (['sealed', 'in_use', 'dry', 'empty'] as const).includes(raw.status as RollStatus)
    ? (raw.status as RollStatus)
    : 'in_use';
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : fallbackId,
    brand: String(raw.brand ?? '').trim() || 'Sin marca',
    material: (raw.material as Roll['material']) || 'PLA',
    finish: (['matte', 'glossy', 'translucent', 'silk', 'glitter'] as const).includes(raw.finish as Finish)
      ? (raw.finish as Finish)
      : 'glossy',
    colorName: String(raw.colorName ?? '').trim() || 'Sin nombre',
    colorHex: hex,
    diameter: n(raw.diameter, 1.75) >= 2.5 ? 2.85 : 1.75,
    initialWeight,
    remainingWeight,
    price: Math.max(0, parsePriceInput(raw.price ?? 0)),
    purchaseDate: typeof raw.purchaseDate === 'string' && raw.purchaseDate ? raw.purchaseDate.slice(0, 10) : todayIso(),
    location: String(raw.location ?? '').trim(),
    nozzleTemp: { min: n(raw.nozzleTemp?.min, 200), max: n(raw.nozzleTemp?.max, 220) },
    bedTemp: { min: n(raw.bedTemp?.min, 55), max: n(raw.bedTemp?.max, 65) },
    notes: String(raw.notes ?? ''),
    status,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    seed: raw.seed ? true : undefined,
    store: typeof raw.store === 'string' && raw.store.trim() ? raw.store.trim() : undefined,
    productUrl: typeof raw.productUrl === 'string' && raw.productUrl.trim() ? raw.productUrl.trim() : undefined,
    shippingCost: n(raw.shippingCost, 0) > 0 ? n(raw.shippingCost, 0) : undefined,
    taxCost: n(raw.taxCost, 0) > 0 ? n(raw.taxCost, 0) : undefined,
    deliveryDays: n(raw.deliveryDays, 6) > 0 ? Math.round(n(raw.deliveryDays, 6)) : 6,
  };
}

/** Temperaturas típicas por material para autocompletar el formulario. */
export const MATERIAL_DEFAULTS: Record<string, { nozzle: [number, number]; bed: [number, number] }> = {
  PLA: { nozzle: [195, 220], bed: [50, 65] },
  'PLA+': { nozzle: [205, 230], bed: [55, 65] },
  PETG: { nozzle: [230, 250], bed: [70, 85] },
  ABS: { nozzle: [240, 260], bed: [95, 110] },
  ASA: { nozzle: [240, 260], bed: [90, 110] },
  TPU: { nozzle: [210, 230], bed: [40, 60] },
  Nylon: { nozzle: [250, 270], bed: [70, 90] },
  PC: { nozzle: [260, 290], bed: [100, 120] },
  HIPS: { nozzle: [230, 250], bed: [90, 110] },
  PVA: { nozzle: [185, 205], bed: [45, 60] },
  'PLA-CF': { nozzle: [210, 230], bed: [50, 65] },
  Otro: { nozzle: [200, 230], bed: [50, 70] },
};
