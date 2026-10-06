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

export function computeWeightedDailyRate(entries: UsageEntry[], windowDays: number, nowMs: number): number | null {
  const windowMs = windowDays * 86400000;
  const valid = entries.filter((e) => {
    const age = nowMs - new Date(e.at).getTime();
    return age >= 0 && age <= windowMs;
  });
  if (valid.length < 3) return null;

  let weightedGrams = 0;
  let totalWeight = 0;
  for (const e of valid) {
    const age = nowMs - new Date(e.at).getTime();
    const w = 1.5 - age / windowMs;
    weightedGrams += e.grams * w;
    totalWeight += w;
  }

  const avgGramsPerEntry = weightedGrams / totalWeight;
  const totalGramsInWindow = valid.reduce((a, b) => a + b.grams, 0);
  const baseRate = totalGramsInWindow / windowDays;
  const weightFactor = (totalGramsInWindow / valid.length > 0)
    ? avgGramsPerEntry / (totalGramsInWindow / valid.length)
    : 1;

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
  for (const r of rolls) {
    const key = computeProductKey(r.brand, r.material, r.colorName);
    const list = groupsMap.get(key) || [];
    list.push(r);
    groupsMap.set(key, list);
  }

  // Map usage by rollId
  const usageByRoll = new Map<string, UsageEntry[]>();
  for (const u of usage) {
    const list = usageByRoll.get(u.rollId) || [];
    list.push(u);
    usageByRoll.set(u.rollId, list);
  }

  // Active orders map
  const activeOrdersMap = new Map<string, ProductOrder>();
  for (const o of orders) {
    if (!o.received) {
      activeOrdersMap.set(computeProductKey(o.brand, o.material, o.colorName), o);
    }
  }

  const result: ProductInventoryGroup[] = [];

  for (const [productKey, groupRolls] of groupsMap.entries()) {
    const sample = groupRolls[0];
    const activeRolls = groupRolls.filter((r) => r.status === 'in_use' || r.status === 'dry');
    const sealedRolls = groupRolls.filter((r) => r.status === 'sealed');
    const emptyRolls = groupRolls.filter((r) => r.status === 'empty');

    const openStockGrams = activeRolls.reduce((acc, r) => acc + r.remainingWeight, 0);
    const sealedStockGrams = sealedRolls.reduce((acc, r) => acc + r.initialWeight, 0);
    const totalStockGrams = openStockGrams + sealedStockGrams;

    // Collect all usage across rolls of this product
    const productUsage: UsageEntry[] = [];
    for (const r of groupRolls) {
      const uList = usageByRoll.get(r.id) || [];
      productUsage.push(...uList);
    }
    productUsage.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    // Config overrides
    const override = settings.productOverrides?.[productKey];
    const deliveryDays = override?.deliveryDays ?? sample.deliveryDays ?? settings.defaultDeliveryDays ?? 6;
    const safetyMarginDays = override?.safetyMarginDays ?? settings.defaultSafetyMarginDays ?? 2;

    // Burn rate calculation: 30 days -> fallback 90 days -> manual override
    let burnRate: number | null = computeWeightedDailyRate(productUsage, 30, nowMs);
    let windowType: 30 | 90 | 'manual' | null = 30;

    if (burnRate === null) {
      burnRate = computeWeightedDailyRate(productUsage, 90, nowMs);
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
      const expMs = new Date(activeOrder.expectedArrival).getTime();
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
    const rollWithUrl = groupRolls.find((r) => r.productUrl) || sample;
    const rollWithStore = groupRolls.find((r) => r.store) || sample;

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
      productUrl: rollWithUrl.productUrl,
      store: rollWithStore.store,
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
