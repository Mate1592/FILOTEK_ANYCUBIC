// Tipos compartidos entre el proceso main (Electron) y el renderer (React).

export const MATERIALS = [
  'PLA',
  'PLA+',
  'PETG',
  'ABS',
  'ASA',
  'TPU',
  'Nylon',
  'PC',
  'HIPS',
  'PVA',
  'PLA-CF',
  'Otro',
] as const;
export type Material = (typeof MATERIALS)[number];

export const FINISHES = ['matte', 'glossy', 'translucent', 'silk', 'glitter'] as const;
export type Finish = (typeof FINISHES)[number];

export const STATUSES = ['sealed', 'in_use', 'dry', 'empty'] as const;
export type RollStatus = (typeof STATUSES)[number];

export type Diameter = 1.75 | 2.85;

export interface TempRange {
  min: number;
  max: number;
}

export interface Roll {
  id: string;
  brand: string;
  material: Material;
  finish: Finish;
  colorName: string;
  colorHex: string;
  diameter: Diameter;
  /** Peso neto inicial de filamento, en gramos. */
  initialWeight: number;
  /** Peso de filamento restante, en gramos. */
  remainingWeight: number;
  price: number; // en COP por defecto
  /** Fecha ISO (yyyy-mm-dd). */
  purchaseDate: string;
  location: string;
  nozzleTemp: TempRange;
  bedTemp: TempRange;
  notes: string;
  status: RollStatus;
  createdAt: string;
  updatedAt: string;
  /** true si proviene de los datos de ejemplo. */
  seed?: boolean;

  // Nuevos campos iteración 2
  store?: string; // Tienda o proveedor (ej. Amazon, MercadoLibre)
  productUrl?: string; // Enlace directo al producto
  shippingCost?: number; // Costo de envío (opcional, COP)
  taxCost?: number; // Impuestos adicionales (opcional, COP)
  deliveryDays?: number; // Tiempo estimado de entrega en días (6 por defecto)
}

export interface UsageEntry {
  id: string;
  rollId: string;
  grams: number;
  /** Fecha/hora ISO. */
  at: string;
  note: string;
  /** Origen del consumo: manual o gcode */
  origin?: 'manual' | 'gcode';
  jobName?: string;
}

export interface ShoppingItem {
  id: string;
  label: string;
  material: Material | null;
  brand: string;
  colorHex: string;
  qty: number;
  done: boolean;
  createdAt: string;
  /** Rollo del que se originó la sugerencia (si aplica). */
  sourceRollId: string | null;
  estimatedPrice?: number;
}

/** Pedido de reabastecimiento en camino */
export interface ProductOrder {
  id: string;
  productKey: string; // brand:::material:::colorName
  brand: string;
  material: Material;
  colorName: string;
  colorHex: string;
  orderedAt: string;
  expectedArrival: string;
  received: boolean;
}

/** Configuración de anulación por producto para reabastecimiento */
export interface ProductReplenishOverride {
  deliveryDays?: number;
  safetyMarginDays?: number;
  manualWeeklyRate?: number; // g/semana estimado manualmente si faltan datos
}

/** Ranura de filamento detectada en el laminado */
export interface GcodeFilamentMatch {
  slotIndex: number;
  materialName: string;
  brand: string;
  finish: string;
  colorHex: string;
  gcodeColorHex?: string; // Color original extraído del archivo G-code
  colorName?: string;
  grams: number;
  rollId?: string;
  suggestedRollId?: string;
  confidence?: number;
  insufficientStock?: boolean;
  missingGrams?: number;
}

export type GcodeJobStatus = 'unreviewed' | 'printed' | 'failed' | 'discarded';

export interface GcodeJob {
  id: string;
  filename: string;
  filepath: string;
  fileHash: string;
  pid?: number;
  plateIndex: number;
  sessionKey: string;
  jobName: string; // Nombre editable
  modelNames: string[];
  slicedAt: string;
  dimensions?: { x: number; y: number; z: number }; // model_size
  printTimeSeconds: number; // Modo normal
  colorChangesCount: number;
  totalLayersCount: number;
  thumbnailSmallPath?: string; // 260x260
  thumbnailLargePath?: string; // 512x512
  status: GcodeJobStatus;
  manualReviewRequired: boolean;
  manualReviewReason?: string;
  printedPercent?: number; // 0 a 100 para fallidos/parciales
  filaments: GcodeFilamentMatch[];
  totalGrams: number;
  createdAt: string;
  isLatestInSession?: boolean;
  previousVersionsCount?: number;
  versionIds?: string[];
}

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  theme: ThemePref;
  lowThreshold: number; // %
  criticalThreshold: number; // %
  currency: string; // COP por defecto
  trayEnabled: boolean;
  closeToTray: boolean;
  seeded: boolean;

  // Reabastecimiento
  defaultDeliveryDays: number; // 6 por defecto
  defaultSafetyMarginDays: number; // 2 por defecto
  productOverrides: Record<string, ProductReplenishOverride>;

  // Anycubic Slicer Next / G-code / Modo acompañante
  watchedGcodeFolder?: string;
  autoLogGcode?: boolean; // false por defecto
  companionModeEnabled?: boolean;
  companionSlicerExe?: string;
  companionAutoOpen?: boolean;
  companionPromptOnExit?: boolean;
  companionAutoClose?: boolean;
  rememberedMappings?: Record<string, string>;
  slotRollMappings?: Record<string, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  lowThreshold: 20,
  criticalThreshold: 10,
  currency: 'COP',
  trayEnabled: false,
  closeToTray: false,
  seeded: false,
  defaultDeliveryDays: 6,
  defaultSafetyMarginDays: 2,
  productOverrides: {},
  watchedGcodeFolder: '',
  autoLogGcode: false,
  companionModeEnabled: true,
  companionSlicerExe: 'AnycubicSlicerNext.exe',
  companionAutoOpen: true,
  companionPromptOnExit: true,
  companionAutoClose: true,
  rememberedMappings: {},
  slotRollMappings: {},
};

export interface DbSnapshot {
  rolls: Roll[];
  usage: UsageEntry[];
  shopping: ShoppingItem[];
  orders: ProductOrder[];
  gcodeJobs: GcodeJob[];
  settings: Partial<Settings>;
}

export interface ExportBundle {
  app: 'filoteca';
  version: 2;
  exportedAt: string;
  rolls: Roll[];
  usage: UsageEntry[];
  shopping: ShoppingItem[];
  orders: ProductOrder[];
  gcodeJobs: GcodeJob[];
}

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };

export interface FileFilter {
  name: string;
  extensions: string[];
}

/** API expuesta por preload en window.filoteca */
export interface FilotecaApi {
  isElectron: true;
  platform: string;
  db: {
    load(): Promise<Result<DbSnapshot>>;
    upsertRoll(roll: Roll): Promise<Result>;
    upsertRolls(rolls: Roll[]): Promise<Result>;
    deleteRoll(id: string): Promise<Result<UsageEntry[]>>;
    restoreRoll(roll: Roll, usage: UsageEntry[]): Promise<Result>;
    logUsage(entry: UsageEntry, roll: Roll): Promise<Result>;
    deleteUsage(id: string, roll: Roll): Promise<Result>;
    upsertShopping(item: ShoppingItem): Promise<Result>;
    deleteShopping(id: string): Promise<Result>;
    upsertOrder(order: ProductOrder): Promise<Result>;
    deleteOrder(id: string): Promise<Result>;
    upsertGcodeJob(job: GcodeJob): Promise<Result>;
    deleteGcodeJob(id: string): Promise<Result>;
    setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<Result>;
    replaceAll(data: Omit<DbSnapshot, 'settings'>): Promise<Result>;
    path(): Promise<string>;
  };
  backup: {
    create(): Promise<Result<string | null>>;
    restore(): Promise<Result<boolean>>;
  };
  file: {
    save(content: string, defaultName: string, filters: FileFilter[]): Promise<Result<string | null>>;
    open(filters: FileFilter[]): Promise<Result<{ name: string; content: string } | null>>;
    selectFolder(): Promise<Result<string | null>>;
    parseGcodePath(filepath: string): Promise<Result<GcodeJob | null>>;
  };
  win: {
    setTheme(dark: boolean): void;
    onMenuAction(cb: (action: string) => void): () => void;
    onGcodeImported(cb: (job: GcodeJob) => void): () => void;
    setTray(enabled: boolean, closeToTray: boolean): void;
    openDataFolder(): void;
    showNotification(title: string, body: string): void;
    openExternal(url: string): void;
  };
  companion: {
    listProcesses(): Promise<Result<string[]>>;
    closeIfFinished(): Promise<Result<void>>;
    onSlicerClosedPrompt(cb: (data: { unreviewedCount: number; sessionJobsCount: number }) => void): () => void;
  };
}
