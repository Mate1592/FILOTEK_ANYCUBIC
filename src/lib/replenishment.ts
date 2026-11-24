import type { Finish, Material, ProductOrder, Roll, Settings, UsageEntry } from '../shared/types';

export type ReplenishStatus = 'order_now' | 'order_soon' | 'good_timing' | 'on_the_way' | 'insufficient_data';

export interface ProductInventoryGroup {
  productKey: string; // brand:::material:::colorName
  brand: string;
  material: Material;
  colorName: string;
  colorHex: string;
  finish: Finish;
  rolls: Roll[];
  activeRolls: Roll[]; // in_use, dry
  sealedRolls: Roll[]; // sealed
  emptyRolls: Roll[];
  totalStockGrams: number;
  openStockGrams: number;
  sealedStockGrams: number;

  // Rate calculation
  usageCount: number;
  burnRateGramsPerDay: number | null;
  burnRateWindowDays: 30 | 90 | 'manual' | null;
  manualWeeklyRate?: number;

  // Timing
  depletionDate: Date | null;
  daysUntilDepletion: number | null;
  deliveryDays: number;
  safetyMarginDays: number;
  orderDeadline: Date | null;
  daysUntilDeadline: number | null;

  // Active order
  activeOrder?: ProductOrder;
  isOverdueArrival?: boolean;

  status: ReplenishStatus;
  productUrl?: string;
  store?: string;
  unitPrice: number;
}

export function computeProductKey(brand: string, material: string, colorName: string): string {
  return `${brand.trim().toLowerCase()}:::${material.trim().toLowerCase()}:::${colorName.trim().toLowerCase()}`;
}

interface TimedUsage {
  grams: number;
  atMs: number;
}

function computeWeightedDailyRateTimed(
  entries: TimedUsage[],
  windowDays: number,
  nowMs: number,
): number | null {
  const windowMs = windowDays * 86400000;
  let validCount = 0;
  let weightedGrams = 0;
  let totalWeight = 0;
  let totalGramsInWindow = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const age = nowMs - e.atMs;
    if (age >= 0 && age <= windowMs) {
      validCount++;
      const w = 1.5 - age / windowMs;
      weightedGrams += e.grams * w;
      totalWeight += w;
      totalGramsInWindow += e.grams;
    }
  }

  if (validCount < 3) return null;

  const avgGramsPerEntry = weightedGrams / totalWeight;
  const baseRate = totalGramsInWindow / windowDays;
  const meanGrams = totalGramsInWindow / validCount;
  const weightFactor = meanGrams > 0 ? avgGramsPerEntry / meanGrams : 1;

  const rate = Math.round(baseRate * weightFactor * 10) / 10;
  return Math.max(0.1, rate);
}

export function computeWeightedDailyRate(
  entries: Pick<UsageEntry, 'grams' | 'at'>[],
  windowDays: number,
  nowMs: number,
): number | null {
  const windowMs = windowDays * 86400000;
  let validCount = 0;
  let weightedGrams = 0;
  let totalWeight = 0;
  let totalGramsInWindow = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const age = nowMs - Date.parse(e.at);
    if (age >= 0 && age <= windowMs) {
      validCount++;
      const w = 1.5 - age / windowMs;
      weightedGrams += e.grams * w;
      totalWeight += w;
      totalGramsInWindow += e.grams;
    }
  }

  if (validCount < 3) return null;

  const avgGramsPerEntry = weightedGrams / totalWeight;
  const baseRate = totalGramsInWindow / windowDays;
  const meanGrams = totalGramsInWindow / validCount;
  const weightFactor = meanGrams > 0 ? avgGramsPerEntry / meanGrams : 1;

  const rate = Math.round(baseRate * weightFactor * 10) / 10;
  return Math.max(0.1, rate);
}

export function groupInventoryForReplenishment(
  rolls: Roll[],
  usage: UsageEntry[],
  orders: ProductOrder[],
  settings: Settings,
  nowMs = Date.now(),
): ProductInventoryGroup[] {
  const groupsMap = new Map<string, Roll[]>();

  // Map rolls by product key
  for (let i = 0; i < rolls.length; i++) {
    const r = rolls[i];
    const key = computeProductKey(r.brand, r.material, r.colorName);
    let list = groupsMap.get(key);
    if (!list) {
      list = [];
      groupsMap.set(key, list);
    }
    list.push(r);
  }

  // Map usage by rollId, pre-parsing timestamps once per entry
  const usageByRoll = new Map<string, TimedUsage[]>();
  for (let i = 0; i < usage.length; i++) {
    const u = usage[i];
    let list = usageByRoll.get(u.rollId);
    if (!list) {
      list = [];
      usageByRoll.set(u.rollId, list);
    }
    list.push({ grams: u.grams, atMs: Date.parse(u.at) });
  }

  // Active orders map
  const activeOrdersMap = new Map<string, ProductOrder>();
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    if (!o.received) {
      activeOrdersMap.set(computeProductKey(o.brand, o.material, o.colorName), o);
    }
  }

  const result: ProductInventoryGroup[] = [];

  for (const [productKey, groupRolls] of groupsMap.entries()) {
    const sample = groupRolls[0];
    const activeRolls: Roll[] = [];
    const sealedRolls: Roll[] = [];
    const emptyRolls: Roll[] = [];
    let openStockGrams = 0;
    let sealedStockGrams = 0;
    let rollWithUrl: Roll | undefined;
    let rollWithStore: Roll | undefined;
    const productUsage: TimedUsage[] = [];

    for (let i = 0; i < groupRolls.length; i++) {
      const r = groupRolls[i];
      if (r.status === 'in_use' || r.status === 'dry') {
        activeRolls.push(r);
        openStockGrams += r.remainingWeight;
      } else if (r.status === 'sealed') {
        sealedRolls.push(r);
        sealedStockGrams += r.initialWeight;
      } else if (r.status === 'empty') {
        emptyRolls.push(r);
      }
      if (!rollWithUrl && r.productUrl) rollWithUrl = r;
      if (!rollWithStore && r.store) rollWithStore = r;

      const uList = usageByRoll.get(r.id);
      if (uList) {
        for (let j = 0; j < uList.length; j++) {
          productUsage.push(uList[j]);
        }
      }
    }

    const totalStockGrams = openStockGrams + sealedStockGrams;
    productUsage.sort((a, b) => a.atMs - b.atMs);

    // Config overrides
    const override = settings.productOverrides?.[productKey];
    const deliveryDays = override?.deliveryDays ?? sample.deliveryDays ?? settings.defaultDeliveryDays ?? 6;
    const safetyMarginDays = override?.safetyMarginDays ?? settings.defaultSafetyMarginDays ?? 2;

    // Burn rate calculation: 30 days -> fallback 90 days -> manual override
    let burnRate: number | null = computeWeightedDailyRateTimed(productUsage, 30, nowMs);
    let windowType: 30 | 90 | 'manual' | null = 30;

    if (burnRate === null) {
      burnRate = computeWeightedDailyRateTimed(productUsage, 90, nowMs);
      windowType = burnRate !== null ? 90 : null;
    }

    if (burnRate === null && override?.manualWeeklyRate && override.manualWeeklyRate > 0) {
      burnRate = Math.round((override.manualWeeklyRate / 7) * 10) / 10;
      windowType = 'manual';
    }

    // Depletion & deadline
    let daysUntilDepletion: number | null = null;
    let depletionDate: Date | null = null;
    let daysUntilDeadline: number | null = null;
    let orderDeadline: Date | null = null;

    if (burnRate !== null && burnRate > 0) {
      daysUntilDepletion = Math.max(0, Math.round(totalStockGrams / burnRate));
      depletionDate = new Date(nowMs + daysUntilDepletion * 86400000);
      daysUntilDeadline = daysUntilDepletion - deliveryDays - safetyMarginDays;
      orderDeadline = new Date(nowMs + daysUntilDeadline * 86400000);
    }

    // Order status
    const activeOrder = activeOrdersMap.get(productKey);
    let isOverdueArrival = false;
    if (activeOrder) {
      const expMs = Date.parse(activeOrder.expectedArrival);
      isOverdueArrival = expMs <= nowMs;
    }

    let status: ReplenishStatus = 'good_timing';
    if (activeOrder) {
      status = 'on_the_way';
    } else if (burnRate === null) {
      status = 'insufficient_data';
    } else if (daysUntilDeadline !== null && daysUntilDeadline <= 0) {
      status = 'order_now';
    } else if (daysUntilDeadline !== null && daysUntilDeadline <= 3) {
      status = 'order_soon';
    } else {
      status = 'good_timing';
    }

    // Best product URL & store from active or latest roll
    const urlRoll = rollWithUrl || sample;
    const storeRoll = rollWithStore || sample;

    result.push({
      productKey,
      brand: sample.brand,
      material: sample.material,
      colorName: sample.colorName,
      colorHex: sample.colorHex,
      finish: sample.finish,
      rolls: groupRolls,
      activeRolls,
      sealedRolls,
      emptyRolls,
      totalStockGrams,
      openStockGrams,
      sealedStockGrams,
      usageCount: productUsage.length,
      burnRateGramsPerDay: burnRate,
      burnRateWindowDays: windowType,
      manualWeeklyRate: override?.manualWeeklyRate,
      depletionDate,
      daysUntilDepletion,
      deliveryDays,
      safetyMarginDays,
      orderDeadline,
      daysUntilDeadline,
      activeOrder,
      isOverdueArrival,
      status,
      productUrl: urlRoll.productUrl,
      store: storeRoll.store,
      unitPrice: sample.price || 89900,
    });
  }

  // Sort by urgency: order_now (0) -> order_soon (1) -> on_the_way (2) -> good_timing (3) -> insufficient_data (4)
  const STATUS_PRIORITY: Record<ReplenishStatus, number> = {
    order_now: 0,
    order_soon: 1,
    on_the_way: 2,
    good_timing: 3,
    insufficient_data: 4,
  };

  result.sort((a, b) => {
    const diff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (diff !== 0) return diff;
    if (a.daysUntilDeadline !== null && b.daysUntilDeadline !== null) {
      return a.daysUntilDeadline - b.daysUntilDeadline;
    }
    return a.totalStockGrams - b.totalStockGrams;
  });

  return result;
}
