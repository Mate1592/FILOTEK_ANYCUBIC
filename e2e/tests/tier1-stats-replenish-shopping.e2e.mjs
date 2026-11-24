import assert from 'node:assert/strict';
import {
  assertNoPageErrors,
  launchFiloteca,
  resetDbState,
  skipOnboardingFast,
} from '../lib/harness.mjs';
import { createLargeInventoryRolls } from '../lib/fixtures.mjs';
import { SEL, normalizeNbsp } from '../lib/selectors.mjs';

const DAY_MS = 86_400_000;

function daysAgoIso(days, offsetMs = 0) {
  return new Date(Date.now() - days * DAY_MS + offsetMs).toISOString();
}

function daysFromNowIso(days) {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

function makeRoll(overrides = {}) {
  const id = overrides.id ?? 'roll-test-1';
  const now = daysAgoIso(10);
  return {
    id,
    brand: 'Anycubic',
    material: 'PLA',
    finish: 'glossy',
    colorName: 'Negro Taller',
    colorHex: '#1f2023',
    diameter: 1.75,
    initialWeight: 1000,
    remainingWeight: 800,
    price: 80000,
    purchaseDate: '2026-11-01',
    location: 'Estante A · 1',
    nozzleTemp: { min: 200, max: 220 },
    bedTemp: { min: 55, max: 65 },
    notes: '',
    status: 'in_use',
    createdAt: now,
    updatedAt: now,
    deliveryDays: 6,
    ...overrides,
  };
}

function makeUsage(id, rollId, grams, daysAgo) {
  return {
    id,
    rollId,
    grams,
    at: daysAgoIso(daysAgo),
    note: `Impresión ${id}`,
  };
}

function makeProductOrder(overrides = {}) {
  return {
    id: overrides.id ?? 'order-test-1',
    productKey: overrides.productKey ?? 'anycubic:::pla:::prod pedido',
    brand: overrides.brand ?? 'Anycubic',
    material: overrides.material ?? 'PLA',
    colorName: overrides.colorName ?? 'Prod Pedido',
    colorHex: overrides.colorHex ?? '#2563eb',
    orderedAt: overrides.orderedAt ?? daysAgoIso(2),
    expectedArrival: overrides.expectedArrival ?? daysFromNowIso(3),
    received: overrides.received ?? false,
    ...overrides,
  };
}

function replenishCardByProduct(page, productName) {
  return page
    .locator('div.p-5.rounded-3xl.bg-surface-1')
    .filter({ hasText: productName })
    .first();
}

let sharedCtx = null;

async function getSharedCtx(snapshot) {
  if (sharedCtx && sharedCtx.page.isClosed()) {
    sharedCtx = null;
  }
  if (!sharedCtx) {
    const freshCtx = await launchFiloteca({});
    try {
      await skipOnboardingFast(freshCtx.page);
    } catch (err) {
      await freshCtx.close().catch(() => {});
      throw err;
    }
    sharedCtx = freshCtx;
  }
  sharedCtx.pageErrors.length = 0;
  sharedCtx.consoleErrors.length = 0;
  await resetDbState(sharedCtx.page, snapshot);
  sharedCtx.pageErrors.length = 0;
  sharedCtx.consoleErrors.length = 0;
  return sharedCtx;
}

export async function afterAll() {
  if (sharedCtx) {
    const ctx = sharedCtx;
    sharedCtx = null;
    await ctx.close();
  }
}

export const tests = [
  // =========================================================================
  // F6 — Stats, Charts, 3D Spool & Large Inventory
  // =========================================================================

  {
    id: 'T1-F6-01',
    tier: 1,
    tag: 'v1',
    feature: 'F6',
    name: 'StatsView renders 4 accurate KPI cards under reducedMotion',
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({ reducedMotion: true, signal });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const r1 = makeRoll({
          id: 'kpi-r1',
          colorName: 'Blanco KPI',
          initialWeight: 1000,
          remainingWeight: 500,
          price: 100000,
        });
        const r2 = makeRoll({
          id: 'kpi-r2',
          colorName: 'Negro KPI',
          initialWeight: 1000,
          remainingWeight: 250,
          price: 80000,
        });

        await resetDbState(page, {
          rolls: [r1, r2],
          settings: { currency: 'COP' },
        });
        ctx.pageErrors.length = 0;

        const prefersReduced = await page.evaluate(
          () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        );
        assert.equal(prefersReduced, true, 'Expected prefers-reduced-motion: reduce to be active');

        await SEL.TitleBar.navTab(page, 'stats').click();

        const totalRollsCard = SEL.StatsView.kpiTotalRolls(page);
        await totalRollsCard.waitFor({ state: 'visible' });

        const totalRollsText = normalizeNbsp(
          await SEL.StatsView.kpiValueText(totalRollsCard).textContent(),
        );
        const availableGramsText = normalizeNbsp(
          await SEL.StatsView.kpiValueText(SEL.StatsView.kpiAvailableGrams(page)).textContent(),
        );
        const inventoryValueText = normalizeNbsp(
          await SEL.StatsView.kpiValueText(SEL.StatsView.kpiInventoryValue(page)).textContent(),
        );
        const avgCostText = normalizeNbsp(
          await SEL.StatsView.kpiValueText(SEL.StatsView.kpiAvgCostPerGram(page)).textContent(),
        );

        assert.equal(totalRollsText, '2');
        assert.equal(availableGramsText, '750 g');
        assert.match(inventoryValueText, /\$\s*70\.000(?!,\d)/);
        assert.match(avgCostText, /\$\s*90,0\/g/);

        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F6-02',
    tier: 1,
    tag: 'v1',
    feature: 'F6',
    name: 'Donut charts (Material & Brand) and Treemap render SVGs cleanly and exclude empty rolls',
    run: async ({ signal }) => {
      const rolls = [
        makeRoll({
          id: 'chart-1',
          brand: 'Anycubic',
          material: 'PLA',
          colorName: 'Rojo Vivo',
          colorHex: '#ef4444',
          remainingWeight: 600,
          status: 'in_use',
        }),
        makeRoll({
          id: 'chart-2',
          brand: 'Sunlu',
          material: 'PETG',
          colorName: 'Verde Bosque',
          colorHex: '#10b981',
          remainingWeight: 400,
          status: 'in_use',
        }),
        makeRoll({
          id: 'chart-3',
          brand: 'Prusament',
          material: 'TPU',
          colorName: 'Azul Marino',
          colorHex: '#2563eb',
          remainingWeight: 300,
          status: 'dry',
        }),
        makeRoll({
          id: 'chart-empty',
          brand: 'eSun',
          material: 'ABS',
          colorName: 'Gris Agotado',
          colorHex: '#64748b',
          remainingWeight: 0,
          status: 'empty',
        }),
      ];

      const ctx = await getSharedCtx({ rolls }, signal);
      const { page } = ctx;

      await SEL.TitleBar.navTab(page, 'stats').click();

      const materialCard = page
        .locator('div.rounded-2xl')
        .filter({ has: page.locator('h3', { hasText: 'Distribución por Material' }) })
        .first();
      await materialCard.waitFor({ state: 'visible' });

      const matSvg = materialCard.locator('svg').first();
      await matSvg.waitFor({ state: 'visible' });
      const matBox = await matSvg.boundingBox();
      assert.ok(matBox && matBox.width >= 200, 'Material Donut SVG width should be >= 200');
      await matSvg.locator('path').first().waitFor({ state: 'visible' });
      assert.equal(await matSvg.locator('path').count(), 3);

      await materialCard.getByRole('button').first().hover();
      await materialCard.getByText(/% del total/i).waitFor({ state: 'visible' });

      const brandCard = page
        .locator('div.rounded-2xl')
        .filter({ has: page.locator('h3', { hasText: 'Distribución por Marca' }) })
        .first();
      await brandCard.waitFor({ state: 'visible' });
      const brandSvg = brandCard.locator('svg').first();
      await brandSvg.waitFor({ state: 'visible' });
      assert.equal(await brandSvg.locator('path').count(), 3);

      const treemapCard = page
        .locator('div.rounded-2xl')
        .filter({ hasText: 'Treemap de inventario' })
        .first();
      await treemapCard.waitFor({ state: 'visible' });
      const treemapSvg = treemapCard.locator('svg').first();
      await treemapSvg.waitFor({ state: 'visible' });
      assert.equal(await treemapSvg.locator('rect').count(), 3);

      await treemapSvg.locator('g').first().hover();
      await treemapCard.locator('span.font-bold', { hasText: '·' }).waitFor({ state: 'visible' });

      assertNoPageErrors(ctx);
    },
  },

  {
    id: 'T1-F6-03',
    tier: 1,
    tag: 'v1',
    feature: 'F6',
    name: 'ConsumptionChart plots >= 2 distinct dates and StatsView shows rankings and < 60d depletion projections',
    run: async ({ signal }) => {
      const rA = makeRoll({
        id: 'proj-a',
        brand: 'Anycubic',
        material: 'PLA',
        colorName: 'Naranja Rápido',
        colorHex: '#f97316',
        remainingWeight: 200,
      });
      const rB = makeRoll({
        id: 'proj-b',
        brand: 'Sunlu',
        material: 'PETG',
        colorName: 'Cian Crítico',
        colorHex: '#06b6d4',
        remainingWeight: 45,
      });

      const usage = [
        makeUsage('u-a1', 'proj-a', 100, 1),
        makeUsage('u-a2', 'proj-a', 100, 3),
        makeUsage('u-a3', 'proj-a', 100, 5),
        makeUsage('u-b1', 'proj-b', 100, 2),
        makeUsage('u-b2', 'proj-b', 100, 4),
        makeUsage('u-b3', 'proj-b', 100, 6),
      ];

      const ctx = await getSharedCtx({ rolls: [rA, rB], usage }, signal);
      const { page } = ctx;

      await SEL.TitleBar.navTab(page, 'stats').click();

      const consumptionCard = page
        .locator('div.rounded-2xl')
        .filter({ hasText: 'Consumo de filamento en el tiempo' })
        .first();
      await consumptionCard.waitFor({ state: 'visible' });

      const chartSvg = consumptionCard.locator('svg').first();
      await chartSvg.waitFor({ state: 'visible' });

      const paths = chartSvg.locator('path');
      assert.ok((await paths.count()) >= 2, 'Expected area and line paths in ConsumptionChart');
      const lineD = await paths.nth(1).getAttribute('d');
      assert.ok(lineD && lineD.length > 5, 'Expected non-empty line path d attribute');

      const circles = chartSvg.locator('circle');
      assert.equal(await circles.count(), 6);

      await circles.last().hover();
      await consumptionCard.locator('span.text-accent-text', { hasText: /g$/i }).waitFor({
        state: 'visible',
      });

      const rankingCard = page
        .locator('div.rounded-2xl')
        .filter({ has: page.locator('h3', { hasText: 'Rollos con más impresiones' }) })
        .first();
      await rankingCard.waitFor({ state: 'visible' });
      const rankingText = normalizeNbsp(await rankingCard.textContent());
      assert.ok(rankingText.includes('#1'));
      assert.ok(rankingText.includes('#2'));
      assert.ok(rankingText.includes('300 g'));

      const projCard = page
        .locator('div.rounded-2xl')
        .filter({ has: page.locator('h3', { hasText: 'Proyección de agotamiento' }) })
        .first();
      await projCard.waitFor({ state: 'visible' });
      const projText = normalizeNbsp(await projCard.textContent());
      assert.ok(projText.includes('Naranja Rápido'));
      assert.ok(projText.includes('Cian Crítico'));
      assert.ok(projText.includes('~5 días'));
      assert.ok(projText.includes('~20 días'));
      assert.ok(projText.includes('g/día'));

      assertNoPageErrors(ctx);
    },
  },

  {
    id: 'T1-F6-04',
    tier: 1,
    tag: 'v1',
    feature: 'F6',
    name: 'Interactive 3D Spool canvas renders, rotates on drag, and survives color/weight edits with zero pageerror',
    run: async ({ signal }) => {
      const roll = makeRoll({
        id: 'spool-3d-test',
        colorName: 'Azul Cobalto',
        colorHex: '#2563eb',
        initialWeight: 1000,
        remainingWeight: 800,
        status: 'in_use',
      });

      const ctx = await getSharedCtx({ rolls: [roll] }, signal);
      const { page } = ctx;

      const card = SEL.SpoolCard.cardByName(page, 'Azul Cobalto').first();
      await card.waitFor({ state: 'visible' });

      const shelfCanvas = page.locator('#spool-shared-canvas');
      const svgFallback = card.locator('svg[role="img"]');
      const hasSharedCanvas = (await shelfCanvas.count()) > 0;
      if (hasSharedCanvas) {
        const box = await shelfCanvas.boundingBox();
        assert.ok(box && box.width > 0 && box.height > 0, 'Shared 3D canvas should have non-zero size');
      } else {
        await svgFallback.first().waitFor({ state: 'visible' });
      }

      await card.click();

      const detailModal = SEL.RollDetailModal.modal(page);
      await detailModal.waitFor({ state: 'visible' });

      const detailCanvas = detailModal.locator('canvas.cursor-grab').first();
      await detailCanvas.waitFor({ state: 'visible' });

      // Wait for Framer Motion layoutId transition to settle before measuring drag coordinates
      let detailBox = await detailCanvas.boundingBox();
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(80);
        const nextBox = await detailCanvas.boundingBox();
        if (
          detailBox &&
          nextBox &&
          Math.abs(nextBox.x - detailBox.x) < 1 &&
          Math.abs(nextBox.y - detailBox.y) < 1 &&
          Math.abs(nextBox.width - detailBox.width) < 1
        ) {
          detailBox = nextBox;
          break;
        }
        detailBox = nextBox;
      }
      assert.ok(detailBox && detailBox.width >= 150, 'Detail 3D canvas width should be >= 150px');

      const startX = detailBox.x + detailBox.width / 2;
      const startY = detailBox.y + detailBox.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 40, startY + 20, { steps: 5 });
      await page.mouse.up();

      await SEL.RollDetailModal.editBtn(detailModal).click();

      const editorForm = SEL.RollEditorModal.form(page);
      await editorForm.waitFor({ state: 'visible' });

      const editorCanvas = editorForm.locator('canvas.cursor-grab').first();
      await editorCanvas.waitFor({ state: 'visible' });
      const editorBoxBefore = await editorCanvas.boundingBox();
      assert.ok(editorBoxBefore && editorBoxBefore.width > 50, 'Editor 3D canvas width should be > 50px');

      await SEL.RollEditorModal.colorHexInput(editorForm).fill('#e8651a');
      await SEL.RollEditorModal.remainingWeightInput(editorForm).fill('350');

      await editorForm.getByText(/350g \/ 1000g \(35%\)/i).waitFor({ state: 'visible' });
      const editorBoxAfter = await editorCanvas.boundingBox();
      assert.ok(
        editorBoxAfter && editorBoxAfter.width > 50,
        'Editor 3D canvas should stay visible after color and weight edits',
      );

      await SEL.RollEditorModal.submitBtn(editorForm).click();
      await editorForm.waitFor({ state: 'hidden' });

      await SEL.SpoolCard.cardByName(page, 'Azul Cobalto').first().click();
      await detailModal.waitFor({ state: 'visible' });
      await detailModal.getByText(/Color:\s*#e8651a/i).waitFor({ state: 'visible' });
      await detailModal.getByText(/350\s*g/i).first().waitFor({ state: 'visible' });
      await detailModal.locator('canvas.cursor-grab').first().waitFor({ state: 'visible' });

      assertNoPageErrors(ctx);
    },
  },

  {
    id: 'T1-F6-05',
    tier: 1,
    tag: 'v1',
    feature: 'F6',
    name: 'ShelfView renders 260-spool inventory cleanly with responsive search',
    run: async ({ signal }) => {
      const rolls = createLargeInventoryRolls(260);
      const ctx = await getSharedCtx({ rolls }, signal);
      const { page } = ctx;

      const resultsCount = SEL.ShelfView.resultsCount(page);
      await resultsCount.waitFor({ state: 'visible' });
      assert.match(normalizeNbsp(await resultsCount.textContent()), /^260 (de|of) 260/i);

      await SEL.SpoolCard.allCards(page).first().waitFor({ state: 'visible' });
      assert.ok((await SEL.SpoolCard.allCards(page).count()) >= 1);

      const scrollContainer = page.locator('div.workbench-bg').first();
      await scrollContainer.evaluate((el) => {
        el.scrollTop = 1200;
      });
      await scrollContainer.evaluate((el) => {
        el.scrollTop = 0;
      });

      const searchInput = SEL.TitleBar.searchInput(page);
      await searchInput.fill('Lote inventario 250');

      await page.waitForFunction(
        () => {
          const spans = Array.from(document.querySelectorAll('span'));
          return spans.some((s) => /^1 (de|of) 260/i.test((s.textContent || '').trim()));
        },
        null,
        { timeout: 5000 },
      );

      assert.match(normalizeNbsp(await resultsCount.textContent()), /^1 (de|of) 260/i);
      await SEL.SpoolCard.cardByName(page, '#250').first().waitFor({ state: 'visible' });

      await searchInput.fill('');
      await page.waitForFunction(
        () => {
          const spans = Array.from(document.querySelectorAll('span'));
          return spans.some((s) => /^260 (de|of) 260/i.test((s.textContent || '').trim()));
        },
        null,
        { timeout: 5000 },
      );
      assert.match(normalizeNbsp(await resultsCount.textContent()), /^260 (de|of) 260/i);

      assertNoPageErrors(ctx);
    },
  },

  // =========================================================================
  // F7 — Predictive Replenishment & Shopping List
  // =========================================================================

  {
    id: 'T1-F7-01',
    tier: 1,
    tag: 'v1',
    feature: 'F7',
    name: 'ReplenishmentView urgency filter tabs classify order_now, order_soon, on_the_way, good_timing, and insufficient_data',
    run: async ({ signal }) => {
      const rYa = makeRoll({
        id: 'rep-ya',
        colorName: 'Prod Ya',
        remainingWeight: 50,
      });
      const rPronto = makeRoll({
        id: 'rep-pronto',
        colorName: 'Prod Pronto',
        remainingWeight: 100,
      });
      const rCamino = makeRoll({
        id: 'rep-camino',
        colorName: 'Prod Camino',
        remainingWeight: 200,
      });
      const rTiempo = makeRoll({
        id: 'rep-tiempo',
        colorName: 'Prod Tiempo',
        remainingWeight: 500,
      });
      const rSinDatos = makeRoll({
        id: 'rep-sindatos',
        colorName: 'Prod SinDatos',
        remainingWeight: 400,
      });

      const usage = [
        makeUsage('u-ya-1', 'rep-ya', 100, 1),
        makeUsage('u-ya-2', 'rep-ya', 100, 3),
        makeUsage('u-ya-3', 'rep-ya', 100, 5),
        makeUsage('u-pr-1', 'rep-pronto', 100, 1),
        makeUsage('u-pr-2', 'rep-pronto', 100, 3),
        makeUsage('u-pr-3', 'rep-pronto', 100, 5),
        makeUsage('u-ti-1', 'rep-tiempo', 100, 1),
        makeUsage('u-ti-2', 'rep-tiempo', 100, 3),
        makeUsage('u-ti-3', 'rep-tiempo', 100, 5),
      ];

      const orders = [
        makeProductOrder({
          id: 'ord-camino',
          productKey: 'anycubic:::pla:::prod camino',
          colorName: 'Prod Camino',
          expectedArrival: daysFromNowIso(3),
          received: false,
        }),
      ];

      const ctx = await getSharedCtx(
        { rolls: [rYa, rPronto, rCamino, rTiempo, rSinDatos], usage, orders },
        signal,
      );
      const { page } = ctx;

      await SEL.TitleBar.navTab(page, 'replenish').click();
      await page.locator('h1', { hasText: /Reabastecimiento predictivo/i }).waitFor({
        state: 'visible',
      });

      for (const name of ['Prod Ya', 'Prod Pronto', 'Prod Camino', 'Prod Tiempo', 'Prod SinDatos']) {
        await replenishCardByProduct(page, name).waitFor({ state: 'visible' });
      }

      const tabChecks = [
        { tabRx: /^Pedir ya/i, expected: 'Prod Ya', badgeRx: /^Pedir ya$/i },
        { tabRx: /^Pedir pronto$/i, expected: 'Prod Pronto', badgeRx: /Pedir pronto/i },
        { tabRx: /^En camino$/i, expected: 'Prod Camino', badgeRx: /Pedido en camino/i },
        { tabRx: /^Con tiempo$/i, expected: 'Prod Tiempo', badgeRx: /^Con tiempo$/i },
        { tabRx: /^Sin datos$/i, expected: 'Prod SinDatos', badgeRx: /Datos insuficientes/i },
      ];

      const allNames = ['Prod Ya', 'Prod Pronto', 'Prod Camino', 'Prod Tiempo', 'Prod SinDatos'];

      for (const { tabRx, expected, badgeRx } of tabChecks) {
        await SEL.ReplenishmentView.tab(page, tabRx).click();
        const activeCard = replenishCardByProduct(page, expected);
        await activeCard.waitFor({ state: 'visible' });
        await activeCard.getByText(badgeRx).first().waitFor({ state: 'visible' });

        for (const other of allNames) {
          if (other !== expected) {
            assert.equal(
              await replenishCardByProduct(page, other).count(),
              0,
              `Product ${other} should not be visible in tab ${tabRx}`,
            );
          }
        }
      }

      assertNoPageErrors(ctx);
    },
  },

  {
    id: 'T1-F7-02',
    tier: 1,
    tag: 'v1',
    feature: 'F7',
    name: 'ReplenishmentView manual burn-rate entry recalculates status and persists across reload',
    run: async ({ signal }) => {
      const roll = makeRoll({
        id: 'rep-manual',
        colorName: 'Prod Manual',
        remainingWeight: 140,
        deliveryDays: 6,
      });

      const ctx = await getSharedCtx({ rolls: [roll], usage: [] }, signal);
      const { page } = ctx;

      await SEL.TitleBar.navTab(page, 'replenish').click();
      const card = replenishCardByProduct(page, 'Prod Manual');
      await card.waitFor({ state: 'visible' });
      await card.getByText(/Datos insuficientes/i).first().waitFor({ state: 'visible' });

      await SEL.ReplenishmentView.manualRateInput(card).fill('350');
      await SEL.ReplenishmentView.manualRateSaveBtn(card).click();

      await card.getByText(/50 g\/día/i).waitFor({ state: 'visible' });
      await card.getByText(/\(manual\)/i).waitFor({ state: 'visible' });
      assert.equal(await SEL.ReplenishmentView.manualRateInput(card).count(), 0);
      await card.getByText(/^Pedir ya$/i).waitFor({ state: 'visible' });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await SEL.TitleBar.navTab(page, 'replenish').click();
      const cardReloaded = replenishCardByProduct(page, 'Prod Manual');
      await cardReloaded.waitFor({ state: 'visible' });
      await cardReloaded.getByText(/50 g\/día/i).waitFor({ state: 'visible' });
      await cardReloaded.getByText(/\(manual\)/i).waitFor({ state: 'visible' });

      assertNoPageErrors(ctx);
    },
  },

  {
    id: 'T1-F7-03',
    tier: 1,
    tag: 'v1',
    feature: 'F7',
    name: 'ReplenishmentView marks product as ordered and persists active order across reload',
    run: async ({ signal }) => {
      const roll = makeRoll({
        id: 'rep-order',
        colorName: 'Prod Pedido',
        remainingWeight: 80,
      });
      const usage = [
        makeUsage('u-ord-1', 'rep-order', 100, 1),
        makeUsage('u-ord-2', 'rep-order', 100, 3),
        makeUsage('u-ord-3', 'rep-order', 100, 5),
      ];

      const ctx = await getSharedCtx({ rolls: [roll], usage }, signal);
      const { page } = ctx;

      await SEL.TitleBar.navTab(page, 'replenish').click();
      const card = replenishCardByProduct(page, 'Prod Pedido');
      await card.waitFor({ state: 'visible' });

      await SEL.ReplenishmentView.markOrderedBtn(card).click();
      const dialog = SEL.ReplenishmentView.orderDialog(page);
      await dialog.waitFor({ state: 'visible' });

      await SEL.ReplenishmentView.orderDaysInput(dialog).fill('4');
      await SEL.ReplenishmentView.orderSaveBtn(dialog).click();

      await SEL.Toasts.toastByTitle(page, /Pedido registrado/i).waitFor({ state: 'visible' });
      await dialog.waitFor({ state: 'hidden' });

      await card.getByText(/Pedido en camino/i).first().waitFor({ state: 'visible' });
      await SEL.ReplenishmentView.tab(page, /^En camino$/i).click();
      await replenishCardByProduct(page, 'Prod Pedido').waitFor({ state: 'visible' });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await SEL.TitleBar.navTab(page, 'replenish').click();
      const reloadedCard = replenishCardByProduct(page, 'Prod Pedido');
      await reloadedCard.waitFor({ state: 'visible' });
      await reloadedCard.getByText(/Pedido en camino/i).first().waitFor({ state: 'visible' });

      const dbRes = await page.evaluate(() => window.filoteca.db.load());
      assert.equal(dbRes?.ok, true);
      const dbState = dbRes.data;
      assert.equal(dbState.orders.length, 1);
      assert.equal(dbState.orders[0].received, false);

      assertNoPageErrors(ctx);
    },
  },

  {
    id: 'T1-F7-04',
    tier: 1,
    tag: 'v1',
    feature: 'F7',
    name: 'ReplenishmentView overdue arrival adds a new 1000g sealed roll and marks order received',
    run: async ({ signal }) => {
      const roll = makeRoll({
        id: 'rep-overdue',
        brand: 'Anycubic',
        material: 'PLA',
        colorName: 'Prod Atrasado',
        remainingWeight: 120,
        status: 'in_use',
      });
      const overdueOrder = makeProductOrder({
        id: 'ord-overdue',
        productKey: 'anycubic:::pla:::prod atrasado',
        brand: 'Anycubic',
        material: 'PLA',
        colorName: 'Prod Atrasado',
        orderedAt: daysAgoIso(8),
        expectedArrival: daysAgoIso(1),
        received: false,
      });

      const ctx = await getSharedCtx({ rolls: [roll], orders: [overdueOrder] }, signal);
      const { page } = ctx;

      await SEL.TitleBar.navTab(page, 'replenish').click();
      const card = replenishCardByProduct(page, 'Prod Atrasado');
      await card.waitFor({ state: 'visible' });

      await card.getByText(/¿Ya llegó tu pedido\?/i).waitFor({ state: 'visible' });
      const arrivedBtn = SEL.ReplenishmentView.arrivedBtn(card);
      await arrivedBtn.waitFor({ state: 'visible' });
      await arrivedBtn.click();

      await SEL.Toasts.toastByTitle(page, /¡Rollo recibido e ingresado al inventario!/i).waitFor({
        state: 'visible',
      });
      await card.getByText(/¿Ya llegó tu pedido\?/i).waitFor({ state: 'hidden' });

      await SEL.TitleBar.navTab(page, 'shelf').click();
      await SEL.ShelfView.resultsCount(page).waitFor({ state: 'visible' });
      assert.match(normalizeNbsp(await SEL.ShelfView.resultsCount(page).textContent()), /^2 (de|of) 2/i);

      const dbRes = await page.evaluate(() => window.filoteca.db.load());
      assert.equal(dbRes?.ok, true);
      const dbState = dbRes.data;
      assert.equal(dbState.orders.length, 1);
      assert.equal(dbState.orders[0].received, true);
      assert.equal(dbState.rolls.length, 2);
      const sealedRoll = dbState.rolls.find((r) => r.id !== 'rep-overdue');
      assert.ok(sealedRoll, 'Expected a new roll created on order arrival');
      assert.equal(sealedRoll.status, 'sealed');
      assert.equal(sealedRoll.initialWeight, 1000);
      assert.equal(sealedRoll.remainingWeight, 1000);

      assertNoPageErrors(ctx);
    },
  },

  {
    id: 'T1-F7-05',
    tier: 1,
    tag: 'v1',
    feature: 'F7',
    name: 'ShoppingView supports custom item add, done toggle persistence, and deletion',
    run: async ({ signal }) => {
      const roll = makeRoll({
        id: 'shop-healthy',
        colorName: 'Blanco Sano',
        remainingWeight: 900,
        status: 'in_use',
      });

      const ctx = await getSharedCtx({ rolls: [roll], shopping: [] }, signal);
      const { page } = ctx;

      await SEL.TitleBar.navTab(page, 'shopping').click();

      const pendingCount = SEL.ShoppingView.pendingCount(page);
      await pendingCount.waitFor({ state: 'visible' });
      assert.equal(normalizeNbsp(await pendingCount.textContent()), '0 pendientes');

      await SEL.ShoppingView.customInput(page).fill('PETG Transparente Taller');
      await SEL.ShoppingView.customMaterialSelect(page).selectOption('PETG');
      await SEL.ShoppingView.customAddBtn(page).click();

      const row = SEL.ShoppingView.rowByText(page, 'PETG Transparente Taller');
      await row.waitFor({ state: 'visible' });
      await row.getByText('PETG', { exact: true }).waitFor({ state: 'visible' });
      assert.equal(normalizeNbsp(await pendingCount.textContent()), '1 pendientes');

      await SEL.ShoppingView.rowToggleDoneBtn(row).click();
      await page.waitForFunction(() => {
        const rows = Array.from(document.querySelectorAll('div.rounded-2xl.border.justify-between'));
        return rows.some(
          (el) =>
            (el.textContent || '').includes('PETG Transparente Taller') &&
            el.className.includes('line-through'),
        );
      });
      assert.equal(normalizeNbsp(await pendingCount.textContent()), '0 pendientes');

      await page.reload({ waitUntil: 'domcontentloaded' });
      await SEL.TitleBar.navTab(page, 'shopping').click();
      const reloadedRow = SEL.ShoppingView.rowByText(page, 'PETG Transparente Taller');
      await reloadedRow.waitFor({ state: 'visible' });
      const reloadedClass = await reloadedRow.getAttribute('class');
      assert.ok(reloadedClass && reloadedClass.includes('line-through'));

      await SEL.ShoppingView.rowDeleteBtn(reloadedRow).click();
      await reloadedRow.waitFor({ state: 'hidden' });
      await page.getByText('Tu lista de compras está vacía.').waitFor({ state: 'visible' });

      assertNoPageErrors(ctx);
    },
  },

  {
    id: 'T1-F7-06',
    tier: 1,
    tag: 'v1',
    feature: 'F7',
    name: 'ShoppingView auto-suggests unbacked low-stock roll and Recibido en taller creates a sealed roll',
    run: async ({ signal }) => {
      const lowRoll = makeRoll({
        id: 'shop-low-1',
        brand: 'Anycubic',
        material: 'PLA',
        colorName: 'Naranja Reserva',
        colorHex: '#f97316',
        initialWeight: 1000,
        remainingWeight: 120,
        status: 'in_use',
      });

      const ctx = await getSharedCtx(
        {
          rolls: [lowRoll],
          shopping: [],
          settings: { lowThreshold: 20, criticalThreshold: 10 },
        },
        signal,
      );
      const { page } = ctx;

      await SEL.TitleBar.navTab(page, 'shopping').click();

      const suggestions = SEL.ShoppingView.suggestionButtons(page);
      await suggestions.first().waitFor({ state: 'visible' });
      assert.equal(await suggestions.count(), 1);
      assert.ok((await suggestions.first().textContent()).includes('Naranja Reserva'));

      await suggestions.first().click();

      const row = SEL.ShoppingView.rowByText(page, 'Naranja Reserva (PLA)');
      await row.waitFor({ state: 'visible' });
      assert.equal(await suggestions.count(), 0);

      const receiveBtn = SEL.ShoppingView.rowReceiveBtn(row);
      assert.equal(await receiveBtn.count(), 0, 'Recibido en taller must not show before done is toggled');

      await SEL.ShoppingView.rowToggleDoneBtn(row).click();
      await receiveBtn.waitFor({ state: 'visible' });

      await receiveBtn.click();
      await row.waitFor({ state: 'hidden' });
      await SEL.Toasts.toastByTitle(page, /Recompra añadida/i).waitFor({ state: 'visible' });

      await SEL.TitleBar.navTab(page, 'shelf').click();
      await SEL.ShelfView.resultsCount(page).waitFor({ state: 'visible' });
      assert.match(normalizeNbsp(await SEL.ShelfView.resultsCount(page).textContent()), /^2 (de|of) 2/i);

      const dbRes = await page.evaluate(() => window.filoteca.db.load());
      assert.equal(dbRes?.ok, true);
      const dbState = dbRes.data;
      assert.equal(dbState.rolls.length, 2);
      const newRoll = dbState.rolls.find((r) => r.id !== 'shop-low-1');
      assert.ok(newRoll, 'Expected a new sealed roll from Recibido en taller');
      assert.equal(newRoll.status, 'sealed');
      assert.equal(newRoll.initialWeight, 1000);
      assert.equal(newRoll.remainingWeight, 1000);

      assertNoPageErrors(ctx);
    },
  },
];
