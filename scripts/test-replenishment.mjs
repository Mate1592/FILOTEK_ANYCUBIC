import assert from 'node:assert';
import {
  computeProductKey,
  computeWeightedDailyRate,
  groupInventoryForReplenishment,
} from '../src/lib/replenishment.js';

console.log('--- Testing Replenishment Engine ---');

const now = Date.now();
const day = 86400000;

// Test 1: Weighted rate with insufficient data
{
  const entries = [
    { grams: 50, at: new Date(now - 2 * day).toISOString() },
    { grams: 40, at: new Date(now - 7 * day).toISOString() },
  ];
  const rate = computeWeightedDailyRate(entries, 30, now);
  assert.strictEqual(rate, null, 'Should return null for fewer than 3 entries in 30 days');
  console.log('✓ Test 1: Insufficient data handled correctly (<3 entries)');
}

// Test 2: Weighted rate with 3 entries
{
  const entries = [
    { grams: 50, at: new Date(now - 2 * day).toISOString() },
    { grams: 40, at: new Date(now - 7 * day).toISOString() },
    { grams: 60, at: new Date(now - 15 * day).toISOString() },
  ];
  const rate = computeWeightedDailyRate(entries, 30, now);
  assert(typeof rate === 'number' && rate > 0, 'Rate should be a positive number');
  console.log(`✓ Test 2: Rate calculated successfully (${rate} g/day)`);
}

// Test 3: Multiple spools for same product combines stock
{
  const rolls = [
    {
      id: 'roll-1',
      brand: 'Bambu Lab',
      material: 'PLA',
      finish: 'glossy',
      colorName: 'Negro carbón',
      colorHex: '#1f2023',
      initialWeight: 1000,
      remainingWeight: 150,
      price: 89900,
      status: 'in_use',
      deliveryDays: 6,
    },
    {
      id: 'roll-2',
      brand: 'Bambu Lab',
      material: 'PLA',
      finish: 'glossy',
      colorName: 'Negro carbón',
      colorHex: '#1f2023',
      initialWeight: 1000,
      remainingWeight: 1000,
      price: 89900,
      status: 'sealed',
      deliveryDays: 6,
    },
  ];
  const usage = [
    { id: 'u1', rollId: 'roll-1', grams: 50, at: new Date(now - 2 * day).toISOString() },
    { id: 'u2', rollId: 'roll-1', grams: 60, at: new Date(now - 6 * day).toISOString() },
    { id: 'u3', rollId: 'roll-1', grams: 40, at: new Date(now - 12 * day).toISOString() },
  ];
  const settings = {
    defaultDeliveryDays: 6,
    defaultSafetyMarginDays: 2,
    productOverrides: {},
  };

  const groups = groupInventoryForReplenishment(rolls, usage, [], settings, now);
  assert.strictEqual(groups.length, 1, 'Should group both rolls into 1 product');
  assert.strictEqual(groups[0].totalStockGrams, 1150, 'Total stock should be 150 (open) + 1000 (sealed)');
  assert.strictEqual(groups[0].activeRolls.length, 1);
  assert.strictEqual(groups[0].sealedRolls.length, 1);
  assert(groups[0].daysUntilDepletion > 100, 'With spare spool, depletion should be comfortably far');
  assert.strictEqual(groups[0].status, 'good_timing');
  console.log('✓ Test 3: Multiple spools combine into total product stock');
}

// Test 4: Critical low stock leads to 'order_now'
{
  const rolls = [
    {
      id: 'roll-low',
      brand: 'Elegoo',
      material: 'PLA+',
      finish: 'glossy',
      colorName: 'Naranja',
      colorHex: '#f0731d',
      initialWeight: 1000,
      remainingWeight: 15, // 15g left! At ~3g/day, lasts 5 days. Delivery is 6 days -> order_now!
      price: 69900,
      status: 'in_use',
      deliveryDays: 6,
    },
  ];
  // 3 entries in last week with 20g each -> ~10g/day
  const usage = [
    { id: 'u1', rollId: 'roll-low', grams: 30, at: new Date(now - 1 * day).toISOString() },
    { id: 'u2', rollId: 'roll-low', grams: 25, at: new Date(now - 3 * day).toISOString() },
    { id: 'u3', rollId: 'roll-low', grams: 35, at: new Date(now - 5 * day).toISOString() },
  ];
  const settings = {
    defaultDeliveryDays: 6,
    defaultSafetyMarginDays: 2,
    productOverrides: {},
  };

  const groups = groupInventoryForReplenishment(rolls, usage, [], settings, now);
  assert.strictEqual(groups[0].status, 'order_now', 'Urgent low stock should result in order_now');
  console.log(`✓ Test 4: Urgent shortage correctly identified as 'order_now' (deadline: ${groups[0].daysUntilDeadline} days)`);
}

// Test 5: Active order puts product in 'on_the_way'
{
  const rolls = [
    {
      id: 'roll-ord',
      brand: 'Elegoo',
      material: 'PLA+',
      finish: 'glossy',
      colorName: 'Naranja',
      colorHex: '#f0731d',
      initialWeight: 1000,
      remainingWeight: 40,
      price: 69900,
      status: 'in_use',
    },
  ];
  const orders = [
    {
      id: 'order-1',
      brand: 'Elegoo',
      material: 'PLA+',
      colorName: 'Naranja',
      colorHex: '#f0731d',
      orderedAt: new Date(now - 2 * day).toISOString(),
      expectedArrival: new Date(now + 4 * day).toISOString(),
      received: false,
    },
  ];
  const settings = { defaultDeliveryDays: 6, defaultSafetyMarginDays: 2, productOverrides: {} };
  const groups = groupInventoryForReplenishment(rolls, [], orders, settings, now);
  assert.strictEqual(groups[0].status, 'on_the_way');
  assert.strictEqual(groups[0].isOverdueArrival, false);
  console.log('✓ Test 5: Active order correctly transitions product to on_the_way');
}

console.log('ALL REPLENISHMENT TESTS PASSED!');
