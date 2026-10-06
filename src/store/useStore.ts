import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  type DbSnapshot,
  type GcodeJob,
  type Material,
  type ProductOrder,
  type ProductReplenishOverride,
  type Result,
  type Roll,
  type RollStatus,
  type Settings,
  type ShoppingItem,
  type UsageEntry,
} from '../shared/types';
import { api } from '../lib/api';
import { buildSeed } from '../lib/seed';
import { nowIso, pctRemaining, stockLevel, uid, fmtG, todayIso } from '../lib/roll';
import { getSlotMappingKey, matchSlotToRoll } from '../lib/colorMath';

export type View = 'shelf' | 'stats' | 'replenish' | 'shopping' | 'inbox' | 'settings';
export type SortKey = 'name' | 'remaining' | 'price' | 'date';
export type LevelFilter = 'all' | 'low' | 'ok';

export interface Filters {
  materials: Material[];
  brands: string[];
  statuses: RollStatus[];
  lowOnly: boolean;
}

export interface Toast {
  id: string;
  kind: 'success' | 'error' | 'info' | 'warn';
  title: string;
  body?: string;
  action?: { label: string; run: () => void };
  duration?: number;
}

interface State {
  loaded: boolean;
  loadError: string | null;
  rolls: Roll[];
  usage: UsageEntry[];
  shopping: ShoppingItem[];
  orders: ProductOrder[];
  gcodeJobs: GcodeJob[];
  settings: Settings;

  view: View;
  selectedId: string | null;
  editor: { mode: 'new' } | { mode: 'edit'; id: string } | { mode: 'clone'; id: string } | null;
  query: string;
  filters: Filters;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  toasts: Toast[];
  searchFocusTick: number;

  // ui
  setView(v: View): void;
  select(id: string | null): void;
  openEditor(e: State['editor']): void;
  setQuery(q: string): void;
  setFilters(f: Partial<Filters>): void;
  resetFilters(): void;
  setSort(key: SortKey): void;
  focusSearch(): void;
  toast(t: Omit<Toast, 'id'>): void;
  dismiss(id: string): void;

  // datos
  load(): Promise<void>;
  saveRoll(r: Roll): Promise<boolean>;
  logUse(id: string, grams: number, note?: string): Promise<void>;
  undoUse(entryId: string): Promise<void>;
  markEmpty(id: string): Promise<void>;
  setStatus(id: string, status: RollStatus): Promise<void>;
  moveRoll(id: string, location: string): Promise<void>;
  duplicate(id: string): Promise<string | null>;
  deleteRoll(id: string): Promise<void>;
  setSetting<K extends keyof Settings>(k: K, v: Settings[K]): Promise<void>;
  clearSeed(): Promise<void>;
  loadSeed(): Promise<void>;
  replaceAll(d: Omit<DbSnapshot, 'settings'>): Promise<boolean>;
  mergeRolls(rolls: Roll[], usage: UsageEntry[]): Promise<boolean>;
  upsertShopping(s: ShoppingItem): Promise<void>;
  deleteShopping(id: string): Promise<void>;
  upsertOrder(order: ProductOrder): Promise<void>;
  deleteOrder(id: string): Promise<void>;
  markOrderReceived(order: ProductOrder): Promise<void>;
  upsertGcodeJob(job: GcodeJob): Promise<void>;
  deleteGcodeJob(id: string): Promise<void>;
  applyGcodeJob(jobId: string, printedPercent?: number): Promise<void>;
  markJobPrinted(jobId: string, filamentRollOverrides?: Record<number, string>): Promise<void>;
  markJobsPrinted(jobIds: string[]): Promise<void>;
  markJobFailed(jobId: string, percent: number, customGrams?: Record<number, number>): Promise<void>;
  discardJob(jobId: string): Promise<void>;
  discardJobs(jobIds: string[]): Promise<void>;
  updateJobFilamentRoll(jobId: string, slotIndex: number, rollId: string): Promise<void>;
  updateJobFilamentColor(jobId: string, slotIndex: number, colorHex: string): Promise<void>;
  updateJobFilamentGrams(jobId: string, slotIndex: number, grams: number): Promise<void>;
  setProductOverride(productKey: string, override: Partial<ProductReplenishOverride>): Promise<void>;
}

const EMPTY_FILTERS: Filters = { materials: [], brands: [], statuses: [], lowOnly: false };

const USE_QUIPS = [
  'Ese print quedó precioso.',
  'Que no se te despegue de la cama.',
  'Capa a capa, como debe ser.',
  'Anotado. La bobina lo agradece.',
  'Otro gramo convertido en algo útil.',
  'Sin spaghetti, esperamos.',
];
const quip = () => USE_QUIPS[Math.floor(Math.random() * USE_QUIPS.length)];

/** Ejecuta una llamada al backend; si falla, revierte el estado y avisa. */
async function persist(
  call: Promise<Result<unknown>>,
  rollback: () => void,
  toast: State['toast'],
  what = 'guardar el cambio',
): Promise<boolean> {
  try {
    const r = await call;
    if (r.ok) return true;
    rollback();
    toast({ kind: 'error', title: `No pude ${what}`, body: r.error });
  } catch (e) {
    rollback();
    toast({ kind: 'error', title: `No pude ${what}`, body: (e as Error).message });
  }
  return false;
}

export const useStore = create<State>((set, get) => ({
  loaded: false,
  loadError: null,
  rolls: [],
  usage: [],
  shopping: [],
  orders: [],
  gcodeJobs: [],
  settings: DEFAULT_SETTINGS,

  view: 'shelf',
  selectedId: null,
  editor: null,
  query: '',
  filters: EMPTY_FILTERS,
  sort: { key: 'remaining', dir: 'desc' },
  toasts: [],
  searchFocusTick: 0,

  setView: (view) => set({ view, selectedId: null }),
  select: (selectedId) => set({ selectedId }),
  openEditor: (editor) => set({ editor }),
  setQuery: (query) => set({ query }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  resetFilters: () => set({ filters: EMPTY_FILTERS, query: '' }),
  setSort: (key) =>
    set((s) => ({
      sort: s.sort.key === key ? { key, dir: s.sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' },
    })),
  focusSearch: () => set((s) => ({ view: 'shelf', searchFocusTick: s.searchFocusTick + 1 })),
  toast: (t) => {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => get().dismiss(id), t.duration ?? (t.action ? 6500 : 3800));
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // ------------------------------------------------------------------ load
  async load() {
    try {
      const r = await api.db.load();
      if (!r.ok) throw new Error(r.error);
      const settings = { ...DEFAULT_SETTINGS, ...r.data.settings };
      set({
        rolls: r.data.rolls,
        usage: r.data.usage,
        shopping: r.data.shopping,
        orders: r.data.orders || [],
        gcodeJobs: r.data.gcodeJobs || [],
        settings,
        loaded: true,
        loadError: null,
      });
      if (!settings.seeded && r.data.rolls.length === 0) {
        await get().loadSeed();
      }
    } catch (e) {
      set({ loaded: true, loadError: (e as Error).message });
    }
  },

  async loadSeed() {
    const seed = buildSeed();
    const prev = get();
    const rolls = [...prev.rolls.filter((r) => !r.seed), ...seed.rolls];
    const usage = [...prev.usage.filter((u) => !u.rollId.startsWith('seed-')), ...seed.usage];
    const gcodeJobs = seed.gcodeJobs ? [...prev.gcodeJobs.filter((j) => !j.id.startsWith('seed-')), ...seed.gcodeJobs] : prev.gcodeJobs;
    set({ rolls, usage, gcodeJobs });
    const ok = await persist(
      api.db.replaceAll({ rolls, usage, shopping: prev.shopping, orders: prev.orders, gcodeJobs }),
      () => set({ rolls: prev.rolls, usage: prev.usage, gcodeJobs: prev.gcodeJobs }),
      get().toast,
      'cargar los datos de ejemplo',
    );
    if (ok) await get().setSetting('seeded', true);
  },

  async clearSeed() {
    const prev = get();
    const rolls = prev.rolls.filter((r) => !r.seed);
    const ids = new Set(rolls.map((r) => r.id));
    const usage = prev.usage.filter((u) => ids.has(u.rollId));
    set({ rolls, usage, selectedId: null });
    const ok = await persist(
      api.db.replaceAll({ rolls, usage, shopping: prev.shopping, orders: prev.orders, gcodeJobs: prev.gcodeJobs }),
      () => set({ rolls: prev.rolls, usage: prev.usage }),
      get().toast,
      'borrar los datos de ejemplo',
    );
    if (ok) {
      get().toast({
        kind: 'success',
        title: 'Datos de ejemplo borrados',
        body: 'Estantería limpia. Es tu turno.',
        action: {
          label: 'Deshacer',
          run: () => {
            set({ rolls: prev.rolls, usage: prev.usage });
            api.db.replaceAll({
              rolls: prev.rolls,
              usage: prev.usage,
              shopping: get().shopping,
              orders: get().orders,
              gcodeJobs: get().gcodeJobs,
            });
          },
        },
      });
    }
  },

  // ----------------------------------------------------------------- rolls
  async saveRoll(roll) {
    const prev = get().rolls;
    const r = { ...roll, updatedAt: nowIso() };
    if (r.remainingWeight <= 0 && r.status !== 'empty') r.status = 'empty';
    const exists = prev.some((x) => x.id === r.id);
    set({ rolls: exists ? prev.map((x) => (x.id === r.id ? r : x)) : [...prev, r] });
    return persist(api.db.upsertRoll(r), () => set({ rolls: prev }), get().toast, 'guardar el rollo');
  },

  async logUse(id, grams, note = '') {
    const s = get();
    const roll = s.rolls.find((r) => r.id === id);
    if (!roll || !(grams > 0)) return;
    const used = Math.min(grams, roll.remainingWeight);
    const before = stockLevel(roll, s.settings);
    const remainingWeight = Math.max(0, +(roll.remainingWeight - used).toFixed(1));
    const updated: Roll = {
      ...roll,
      remainingWeight,
      status: remainingWeight <= 0 ? 'empty' : roll.status === 'sealed' ? 'in_use' : roll.status,
      updatedAt: nowIso(),
    };
    const entry: UsageEntry = { id: uid(), rollId: id, grams: used, at: nowIso(), note };
    const prevRolls = s.rolls;
    const prevUsage = s.usage;
    set({ rolls: prevRolls.map((r) => (r.id === id ? updated : r)), usage: [...prevUsage, entry] });
    const ok = await persist(
      api.db.logUsage(entry, updated),
      () => set({ rolls: prevRolls, usage: prevUsage }),
      get().toast,
      'registrar el consumo',
    );
    if (!ok) return;
    const after = stockLevel(updated, s.settings);
    const undo = { label: 'Deshacer', run: () => get().undoUse(entry.id) };
    if (after === 'empty') {
      get().toast({ kind: 'warn', title: `${roll.colorName}: carrete vacío`, body: 'Un minuto de silencio. ¿Lo añadimos a la lista de compras?', action: undo });
    } else if (after !== before && (after === 'low' || after === 'critical')) {
      get().toast({
        kind: 'warn',
        title: after === 'critical' ? `${roll.colorName} entra en zona crítica` : `${roll.colorName} entra en reserva`,
        body: `Quedan ${fmtG(remainingWeight)} (${Math.round(pctRemaining(updated))} %). Ojo con ese print largo.`,
        action: undo,
      });
    } else {
      get().toast({ kind: 'success', title: `−${fmtG(used)} de ${roll.colorName}`, body: quip(), action: undo });
    }
  },

  async undoUse(entryId) {
    const s = get();
    const entry = s.usage.find((u) => u.id === entryId);
    if (!entry) return;
    const roll = s.rolls.find((r) => r.id === entry.rollId);
    if (!roll) return;
    const updated: Roll = {
      ...roll,
      remainingWeight: Math.min(roll.initialWeight, +(roll.remainingWeight + entry.grams).toFixed(1)),
      status: roll.status === 'empty' ? 'in_use' : roll.status,
      updatedAt: nowIso(),
    };
    const prevR = s.rolls;
    const prevU = s.usage;
    set({ rolls: prevR.map((r) => (r.id === roll.id ? updated : r)), usage: prevU.filter((u) => u.id !== entryId) });
    await persist(api.db.deleteUsage(entryId, updated), () => set({ rolls: prevR, usage: prevU }), get().toast, 'deshacer');
  },

  async markEmpty(id) {
    const roll = get().rolls.find((r) => r.id === id);
    if (!roll) return;
    if (roll.remainingWeight > 0) {
      await get().logUse(id, roll.remainingWeight, 'Marcado como terminado');
    } else {
      await get().saveRoll({ ...roll, status: 'empty' });
    }
  },

  async setStatus(id, status) {
    const roll = get().rolls.find((r) => r.id === id);
    if (roll) await get().saveRoll({ ...roll, status });
  },

  async moveRoll(id, location) {
    const roll = get().rolls.find((r) => r.id === id);
    if (!roll) return;
    if (await get().saveRoll({ ...roll, location })) {
      get().toast({ kind: 'info', title: 'Mudanza completada', body: `${roll.colorName} ahora vive en «${location || 'sin ubicación'}».` });
    }
  },

  async duplicate(id) {
    const roll = get().rolls.find((r) => r.id === id);
    if (!roll) return null;
    const now = nowIso();
    const copy: Roll = {
      ...roll,
      id: uid(),
      remainingWeight: roll.initialWeight,
      status: 'sealed',
      purchaseDate: todayIso(),
      createdAt: now,
      updatedAt: now,
      seed: undefined,
    };
    if (await get().saveRoll(copy)) {
      get().toast({ kind: 'success', title: 'Recompra añadida', body: `${roll.colorName} vuelve a la estantería, sellado y reluciente.` });
      return copy.id;
    }
    return null;
  },

  async deleteRoll(id) {
    const s = get();
    const roll = s.rolls.find((r) => r.id === id);
    if (!roll) return;
    const prevR = s.rolls;
    const prevU = s.usage;
    set({
      rolls: prevR.filter((r) => r.id !== id),
      usage: prevU.filter((u) => u.rollId !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    });
    const res = await api.db.deleteRoll(id).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (!res.ok) {
      set({ rolls: prevR, usage: prevU });
      get().toast({ kind: 'error', title: 'No pude eliminar el rollo', body: res.error });
      return;
    }
    const removedUsage = res.data;
    get().toast({
      kind: 'info',
      title: `${roll.colorName} eliminado`,
      body: '¿Fue sin querer? Tienes unos segundos.',
      action: {
        label: 'Deshacer',
        run: async () => {
          set((st) => ({ rolls: [...st.rolls, roll], usage: [...st.usage, ...removedUsage].sort((a, b) => a.at.localeCompare(b.at)) }));
          const r = await api.db.restoreRoll(roll, removedUsage);
          if (!r.ok) get().toast({ kind: 'error', title: 'No pude restaurarlo', body: r.error });
        },
      },
    });
  },

  async setSetting(k, v) {
    const prev = get().settings;
    set({ settings: { ...prev, [k]: v } });
    await persist(api.db.setSetting(k, v), () => set({ settings: prev }), get().toast, 'guardar el ajuste');
  },

  async replaceAll(d) {
    const prev = get();
    set({
      rolls: d.rolls,
      usage: d.usage,
      shopping: d.shopping,
      orders: d.orders || [],
      gcodeJobs: d.gcodeJobs || [],
      selectedId: null,
    });
    return persist(
      api.db.replaceAll(d),
      () =>
        set({
          rolls: prev.rolls,
          usage: prev.usage,
          shopping: prev.shopping,
          orders: prev.orders,
          gcodeJobs: prev.gcodeJobs,
        }),
      get().toast,
      'importar los datos',
    );
  },

  async mergeRolls(rolls, usage) {
    const prev = get();
    const ids = new Set(rolls.map((r) => r.id));
    const uids = new Set(usage.map((u) => u.id));
    const nextR = [...prev.rolls.filter((r) => !ids.has(r.id)), ...rolls];
    const nextU = [...prev.usage.filter((u) => !uids.has(u.id)), ...usage].sort((a, b) => a.at.localeCompare(b.at));
    set({ rolls: nextR, usage: nextU });
    return persist(
      api.db.replaceAll({
        rolls: nextR,
        usage: nextU,
        shopping: prev.shopping,
        orders: prev.orders,
        gcodeJobs: prev.gcodeJobs,
      }),
      () => set({ rolls: prev.rolls, usage: prev.usage }),
      get().toast,
      'importar los datos',
    );
  },

  async upsertShopping(item) {
    const prev = get().shopping;
    set({ shopping: [...prev.filter((x) => x.id !== item.id), item] });
    await persist(api.db.upsertShopping(item), () => set({ shopping: prev }), get().toast, 'actualizar la lista');
  },

  async deleteShopping(id) {
    const prev = get().shopping;
    set({ shopping: prev.filter((x) => x.id !== id) });
    await persist(api.db.deleteShopping(id), () => set({ shopping: prev }), get().toast, 'actualizar la lista');
  },

  async upsertOrder(order) {
    const prev = get().orders;
    set({ orders: [...prev.filter((o) => o.id !== order.id), order] });
    await persist(api.db.upsertOrder(order), () => set({ orders: prev }), get().toast, 'guardar el pedido');
  },

  async deleteOrder(id) {
    const prev = get().orders;
    set({ orders: prev.filter((o) => o.id !== id) });
    await persist(api.db.deleteOrder(id), () => set({ orders: prev }), get().toast, 'eliminar el pedido');
  },

  async markOrderReceived(order) {
    const updatedOrder: ProductOrder = { ...order, received: true };
    await get().upsertOrder(updatedOrder);

    // Crea automáticamente un nuevo rollo sellado
    const newRoll: Roll = {
      id: uid(),
      brand: order.brand,
      material: order.material,
      finish: 'glossy',
      colorName: order.colorName,
      colorHex: order.colorHex,
      diameter: 1.75,
      initialWeight: 1000,
      remainingWeight: 1000,
      price: 89900,
      purchaseDate: todayIso(),
      location: 'Estante A · 1',
      nozzleTemp: { min: 200, max: 220 },
      bedTemp: { min: 50, max: 60 },
      notes: `Llegó de reabastecimiento pedido el ${order.orderedAt.slice(0, 10)}`,
      status: 'sealed',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deliveryDays: 6,
    };
    await get().saveRoll(newRoll);
    get().toast({
      kind: 'success',
      title: '¡Rollo recibido e ingresado al inventario!',
      body: `Se creó "${newRoll.brand} ${newRoll.material} (${newRoll.colorName})" como rollo sellado.`,
    });
  },

  async upsertGcodeJob(job) {
    const prev = get().gcodeJobs;
    set({ gcodeJobs: [...prev.filter((j) => j.id !== job.id), job] });
    await persist(api.db.upsertGcodeJob(job), () => set({ gcodeJobs: prev }), get().toast, 'guardar el trabajo');
  },

  async deleteGcodeJob(id) {
    const prev = get().gcodeJobs;
    set({ gcodeJobs: prev.filter((j) => j.id !== id) });
    await persist(api.db.deleteGcodeJob(id), () => set({ gcodeJobs: prev }), get().toast, 'eliminar el trabajo');
  },

  async applyGcodeJob(jobId, printedPercent = 100) {
    await get().markJobPrinted(jobId);
  },

  async markJobPrinted(jobId, filamentRollOverrides) {
    const job = get().gcodeJobs.find((j) => j.id === jobId);
    if (!job) return;

    const nextRolls = [...get().rolls];
    const newUsageEntries: UsageEntry[] = [];
    const nextMappings = { ...(get().settings.rememberedMappings || {}) };
    let mappingChanged = false;

    for (const fil of job.filaments) {
      const chosenRollId = filamentRollOverrides?.[fil.slotIndex] ?? fil.rollId ?? fil.suggestedRollId;
      if (!chosenRollId) continue;
      const rollIdx = nextRolls.findIndex((r) => r.id === chosenRollId);
      if (rollIdx === -1) continue;

      const roll = nextRolls[rollIdx];
      const gramsToDeduct = Math.round(fil.grams * 10) / 10;
      if (gramsToDeduct <= 0) continue;

      const entryId = uid();
      const entry: UsageEntry = {
        id: entryId,
        rollId: roll.id,
        grams: gramsToDeduct,
        at: nowIso(),
        note: `Impresión: ${job.jobName || job.filename}`,
        origin: 'gcode',
        jobName: job.jobName || job.filename,
      };

      const updatedRemaining = Math.max(0, roll.remainingWeight - gramsToDeduct);
      const updatedRoll: Roll = {
        ...roll,
        remainingWeight: updatedRemaining,
        status: updatedRemaining <= 0 ? 'empty' : roll.status === 'sealed' ? 'in_use' : roll.status,
        updatedAt: nowIso(),
      };

      await api.db.logUsage(entry, updatedRoll);
      nextRolls[rollIdx] = updatedRoll;
      newUsageEntries.push(entry);

      // Recordar mapeo si el usuario lo confirmó
      if (fil.brand || fil.materialName || fil.colorHex) {
        const key = getSlotMappingKey(fil.brand, fil.materialName, fil.colorHex);
        nextMappings[key] = roll.id;
        mappingChanged = true;
      }
    }

    set((s) => ({
      rolls: nextRolls,
      usage: [...s.usage, ...newUsageEntries],
    }));

    if (mappingChanged) {
      await get().setSetting('rememberedMappings', nextMappings);
    }

    const updatedJob: GcodeJob = {
      ...job,
      status: 'printed',
      printedPercent: 100,
    };
    await get().upsertGcodeJob(updatedJob);
    get().toast({
      kind: 'success',
      title: 'Impresión registrada',
      body: `Se descontaron los gramos de "${job.jobName || job.filename}".`,
    });
    api.companion?.closeIfFinished();
  },

  async markJobsPrinted(jobIds) {
    if (!jobIds.length) return;
    for (const id of jobIds) {
      await get().markJobPrinted(id);
    }
    get().toast({
      kind: 'success',
      title: 'Impresiones registradas',
      body: `Se registraron ${jobIds.length} trabajos y se descontaron de las bobinas.`,
    });
  },

  async markJobFailed(jobId, percent, customGrams) {
    const job = get().gcodeJobs.find((j) => j.id === jobId);
    if (!job) return;
    const factor = Math.max(0, Math.min(100, percent)) / 100;

    const nextRolls = [...get().rolls];
    const newUsageEntries: UsageEntry[] = [];

    for (const fil of job.filaments) {
      const chosenRollId = fil.rollId ?? fil.suggestedRollId;
      if (!chosenRollId) continue;
      const rollIdx = nextRolls.findIndex((r) => r.id === chosenRollId);
      if (rollIdx === -1) continue;

      const roll = nextRolls[rollIdx];
      const gramsToDeduct = customGrams?.[fil.slotIndex] ?? Math.round(fil.grams * factor * 10) / 10;
      if (gramsToDeduct <= 0) continue;

      const entryId = uid();
      const entry: UsageEntry = {
        id: entryId,
        rollId: roll.id,
        grams: gramsToDeduct,
        at: nowIso(),
        note: `Impresión fallida/parcial (${percent}%): ${job.jobName || job.filename}`,
        origin: 'gcode',
        jobName: job.jobName || job.filename,
      };

      const updatedRemaining = Math.max(0, roll.remainingWeight - gramsToDeduct);
      const updatedRoll: Roll = {
        ...roll,
        remainingWeight: updatedRemaining,
        status: updatedRemaining <= 0 ? 'empty' : roll.status === 'sealed' ? 'in_use' : roll.status,
        updatedAt: nowIso(),
      };

      await api.db.logUsage(entry, updatedRoll);
      nextRolls[rollIdx] = updatedRoll;
      newUsageEntries.push(entry);
    }

    set((s) => ({
      rolls: nextRolls,
      usage: [...s.usage, ...newUsageEntries],
    }));

    const updatedJob: GcodeJob = {
      ...job,
      status: 'failed',
      printedPercent: percent,
    };
    await get().upsertGcodeJob(updatedJob);
    get().toast({
      kind: 'warn',
      title: 'Impresión fallida registrada',
      body: `Se descontaron los gramos proporcionales (${percent}%) de "${job.jobName || job.filename}".`,
    });
    api.companion?.closeIfFinished();
  },

  async discardJob(jobId) {
    const job = get().gcodeJobs.find((j) => j.id === jobId);
    if (!job) return;
    const updatedJob: GcodeJob = { ...job, status: 'discarded' };
    await get().upsertGcodeJob(updatedJob);
    get().toast({
      kind: 'info',
      title: 'Trabajo descartado',
      body: `"${job.jobName || job.filename}" se marcó como no impreso.`,
    });
    api.companion?.closeIfFinished();
  },

  async discardJobs(jobIds) {
    for (const id of jobIds) {
      const job = get().gcodeJobs.find((j) => j.id === id);
      if (job) {
        await get().upsertGcodeJob({ ...job, status: 'discarded' });
      }
    }
    get().toast({
      kind: 'info',
      title: 'Trabajos descartados',
      body: `Se descartaron ${jobIds.length} trabajos.`,
    });
    api.companion?.closeIfFinished();
  },

  async updateJobFilamentRoll(jobId, slotIndex, rollId) {
    const job = get().gcodeJobs.find((j) => j.id === jobId);
    if (!job) return;
    const updatedFilaments = job.filaments.map((f) => (f.slotIndex === slotIndex ? { ...f, rollId } : f));
    const targetSlot = job.filaments.find((f) => f.slotIndex === slotIndex);
    if (targetSlot) {
      const key = getSlotMappingKey(targetSlot.brand, targetSlot.materialName, targetSlot.colorHex);
      const nextMappings = { ...(get().settings.rememberedMappings || {}), [key]: rollId };
      await get().setSetting('rememberedMappings', nextMappings);
    }
    await get().upsertGcodeJob({ ...job, filaments: updatedFilaments });
  },

  async updateJobFilamentColor(jobId, slotIndex, colorHex) {
    const job = get().gcodeJobs.find((j) => j.id === jobId);
    if (!job) return;
    const rolls = get().rolls;
    const mappings = get().settings.rememberedMappings;

    const updatedFilaments = job.filaments.map((f) => {
      if (f.slotIndex !== slotIndex) return f;
      const match = matchSlotToRoll(
        {
          materialName: f.materialName,
          brand: f.brand,
          finish: f.finish,
          colorHex,
          grams: f.grams,
        },
        rolls,
        mappings,
      );
      return {
        ...f,
        colorHex,
        suggestedRollId: match.suggestedRollId,
        rollId: match.suggestedRollId ?? f.rollId,
        confidence: match.confidence,
        insufficientStock: match.insufficientStock,
        missingGrams: match.missingGrams,
      };
    });

    await get().upsertGcodeJob({ ...job, filaments: updatedFilaments });
  },

  async updateJobFilamentGrams(jobId, slotIndex, grams) {
    const job = get().gcodeJobs.find((j) => j.id === jobId);
    if (!job) return;
    const updatedFilaments = job.filaments.map((f) => (f.slotIndex === slotIndex ? { ...f, grams } : f));
    const totalGrams = Math.round(updatedFilaments.reduce((acc, f) => acc + f.grams, 0) * 10) / 10;
    await get().upsertGcodeJob({ ...job, filaments: updatedFilaments, totalGrams });
  },

  async setProductOverride(productKey, override) {
    const prev = get().settings;
    const existing = prev.productOverrides?.[productKey] || {};
    const nextOverrides = {
      ...prev.productOverrides,
      [productKey]: { ...existing, ...override },
    };
    await get().setSetting('productOverrides', nextOverrides);
  },
}));

export const useSelectedRoll = () => useStore((s) => s.rolls.find((r) => r.id === s.selectedId) ?? null);
export const useUnreviewedGcodeCount = () => useStore((s) => s.gcodeJobs.filter((j) => j.status === 'unreviewed').length);
