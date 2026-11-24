import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertNoExternalNetworkRequests,
  assertNoPageErrors,
  launchFiloteca,
  mockOpenDialog,
  mockSaveDialog,
  resetDbState,
  rmDirWithRetry,
  skipOnboardingFast,
  waitForAppReady,
} from '../lib/harness.mjs';
import { SEL, normalizeNbsp } from '../lib/selectors.mjs';
import { createCsvRolls, createValidGcode } from '../lib/fixtures.mjs';

function makeRoll(overrides = {}) {
  const iso = overrides.createdAt ?? '2026-11-10T10:00:00.000Z';
  return {
    id: overrides.id ?? 'roll-default-1',
    brand: overrides.brand ?? 'Anycubic',
    material: overrides.material ?? 'PLA',
    finish: overrides.finish ?? 'glossy',
    colorName: overrides.colorName ?? 'Negro Clásico',
    colorHex: overrides.colorHex ?? '#1f2023',
    diameter: overrides.diameter ?? 1.75,
    initialWeight: overrides.initialWeight ?? 1000,
    remainingWeight: overrides.remainingWeight ?? 1000,
    price: overrides.price ?? 85000,
    purchaseDate: overrides.purchaseDate ?? '2026-11-10',
    location: overrides.location ?? 'Estante A · 1',
    nozzleTemp: overrides.nozzleTemp ?? { min: 200, max: 220 },
    bedTemp: overrides.bedTemp ?? { min: 55, max: 65 },
    notes: overrides.notes ?? '',
    status: overrides.status ?? 'in_use',
    createdAt: iso,
    updatedAt: overrides.updatedAt ?? iso,
    deliveryDays: overrides.deliveryDays ?? 6,
  };
}

function daysAgoIso(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function makeUnreviewedGcodeJob(overrides = {}) {
  return {
    id: overrides.id ?? 'job-t3-default',
    filename: overrides.filename ?? 'Bracket_Quote.gcode',
    jobName: overrides.jobName ?? 'Bracket_Quote',
    slicer: overrides.slicer ?? 'OrcaSlicer',
    slicedAt: overrides.slicedAt ?? new Date().toISOString(),
    importedAt: overrides.importedAt ?? new Date().toISOString(),
    printTimeSeconds: overrides.printTimeSeconds ?? 7200,
    totalLayersCount: overrides.totalLayersCount ?? 120,
    totalGrams: overrides.totalGrams ?? 65,
    status: overrides.status ?? 'unreviewed',
    filaments: overrides.filaments ?? [
      {
        slotIndex: 0,
        grams: 65,
        colorHex: '#f2754e',
        materialName: 'PLA',
        brand: 'Anycubic',
        finish: 'glossy',
        rollId: overrides.rollId ?? 'roll-t3-quote',
        suggestedRollId: overrides.rollId ?? 'roll-t3-quote',
        confidence: 100,
      },
    ],
  };
}

function inboxStatusTab(page, labelRegex) {
  return page.locator('div.bg-surface-2.p-1.rounded-xl').getByRole('button', { name: labelRegex });
}

function replenishCard(page, text) {
  return page.locator('div.rounded-3xl.bg-surface-1').filter({ hasText: text }).first();
}

async function emitSecondInstanceFile(app, filePath) {
  await app.evaluate(({ app: electronApp }, target) => {
    electronApp.emit('second-instance', {}, ['filoteca.exe', '--importar-gcode', target]);
  }, filePath);
}

function buildContextualInboxQuoteBtn(card) {
  return card
    .locator('[data-testid="inbox-quote-btn"]')
    .or(card.getByRole('button', { name: /(Cotizar|Quote|Or[cç]ar|Calculadora)/i }))
    .first();
}

function buildDetailToolsBtn(detail) {
  return detail
    .locator('[data-testid="roll-detail-quote-btn"]')
    .or(
      detail.getByRole('button', {
        name: /(Calcular costo|Calcular coste|Calculate cost|Calcular custo)/i,
      }),
    )
    .first();
}

function parseMoneyAmount(raw) {
  const cleaned = normalizeNbsp(raw).replace(/[^0-9.,-]/g, '');
  if (!cleaned) return 0;
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/\./g, '');
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? num : 0;
}

async function readQuoteTotalText(page) {
  const byTestId = SEL.ToolsView.quoteTotalOutput(page);
  if ((await byTestId.count()) > 0) {
    return normalizeNbsp(await byTestId.first().textContent());
  }
  const fallback = page
    .locator('main, div.workbench-bg')
    .locator('div, span')
    .filter({ hasText: /(\$|US\$|USD|EUR|€|R\$|BRL)\s*[\d.]+/ })
    .last();
  return normalizeNbsp(await fallback.textContent());
}

export const tests = [
  {
    id: 'T3-01',
    tier: 3,
    tag: 'v1',
    feature: 'F5+F6+F8',
    name: 'G-code ingestion -> Inbox Lo imprimí -> Shelf deduction, Usage history & Stats KPI update',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({ reducedMotion: true, signal });
      try {
        const { app, page, artifactsDir } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({
          id: 't3-01-roll',
          brand: 'Anycubic',
          material: 'PLA',
          colorName: 'Naranja Taller',
          colorHex: '#f2754e',
          initialWeight: 1000,
          remainingWeight: 500,
          price: 85000,
        });
        await resetDbState(page, { rolls: [roll] });

        await SEL.TitleBar.navTab(page, 'stats').click();
        const availCard = SEL.StatsView.kpiAvailableGrams(page);
        await availCard.waitFor({ state: 'visible' });
        assert.equal(normalizeNbsp(await SEL.StatsView.kpiValueText(availCard).textContent()), '500 g');

        const gcodePath = path.join(artifactsDir, 'soporte_t301.gcode');
        fs.writeFileSync(
          gcodePath,
          createValidGcode({
            slicer: 'orca',
            models: ['Soporte_T301.stl'],
            slots: [{ grams: 42, colorHex: '#f2754e', material: 'PLA', brand: 'Anycubic' }],
            printTime: '1h 15m 0s',
            includeThumbnail: '300x300',
          }),
          'utf8',
        );

        await SEL.TitleBar.navTab(page, 'shelf').click();
        await emitSecondInstanceFile(app, gcodePath);

        await SEL.InboxView.drawer(page).waitFor({ state: 'visible', timeout: 10_000 });
        await SEL.InboxView.drawerReviewBtn(page).click();
        await SEL.InboxView.inboxHeading(page).waitFor({ state: 'visible' });

        const jobCard = SEL.InboxView.jobCard(page, /Soporte_T301|soporte_t301/i);
        await jobCard.waitFor({ state: 'visible' });
        await SEL.InboxView.slotRollSelect(jobCard, 0).selectOption('t3-01-roll');
        await SEL.InboxView.printBtn(jobCard).click();

        await SEL.Toasts.toastByTitle(page, /Impresión registrada/i).waitFor({ state: 'visible' });
        await inboxStatusTab(page, /^Impresos/i).click();
        await SEL.InboxView.jobCard(page, /Soporte_T301|soporte_t301/i).waitFor({ state: 'visible' });

        await SEL.TitleBar.navTab(page, 'shelf').click();
        const updatedCard = SEL.SpoolCard.cardByName(page, 'Naranja Taller').first();
        await updatedCard.waitFor({ state: 'visible' });
        const aria = normalizeNbsp(await updatedCard.getAttribute('aria-label'));
        assert.match(aria, /458 g restantes/i);

        await updatedCard.click();
        const detail = SEL.RollDetailModal.modal(page);
        await detail.waitFor({ state: 'visible' });
        const detailText = normalizeNbsp(await detail.innerText());
        assert.match(detailText, /458\s*g/);
        assert.match(detailText, /Historial de impresiones \(1\)/i);
        assert.match(detailText, /-42g/);
        await SEL.RollDetailModal.closeBtn(detail).click();
        await detail.waitFor({ state: 'hidden' });

        await SEL.TitleBar.navTab(page, 'stats').click();
        const updatedAvail = SEL.StatsView.kpiAvailableGrams(page);
        await updatedAvail.waitFor({ state: 'visible' });
        assert.equal(normalizeNbsp(await SEL.StatsView.kpiValueText(updatedAvail).textContent()), '458 g');

        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T3-02',
    tier: 3,
    tag: 'v1',
    feature: 'F3+F4+F5+F7',
    name: 'Usage deduction -> Low-stock alert -> Duplicate backup (Respaldado) suppresses alert & Shopping -> Delete backup restores alert',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({ reducedMotion: true, signal });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({
          id: 't3-02-roll',
          brand: 'Anycubic',
          material: 'PLA',
          colorName: 'Azul Cobalto',
          colorHex: '#2563eb',
          initialWeight: 1000,
          remainingWeight: 220,
        });
        await resetDbState(page, { rolls: [roll] });

        const card = SEL.SpoolCard.cardByName(page, 'Azul Cobalto').first();
        await card.waitFor({ state: 'visible' });
        await SEL.SpoolCard.cardQuickUseBtn(card, '-50g').click();

        await page.waitForFunction(() => {
          const el = document.querySelector('[role="button"][aria-label*="Azul Cobalto"]');
          return el && el.getAttribute('aria-label')?.includes('170 g restantes');
        });
        await SEL.SpoolCard.cardLowBadge(card).waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await SEL.ShelfView.lowStockToggle(page).textContent()), /1/);

        await SEL.TitleBar.navTab(page, 'shopping').click();
        await SEL.ShoppingView.suggestionButtons(page).filter({ hasText: 'Azul Cobalto' }).first().waitFor({
          state: 'visible',
        });

        await SEL.TitleBar.navTab(page, 'shelf').click();
        await card.hover();
        await SEL.SpoolCard.cardQuickMenuBtn(card).click({ force: true });
        await SEL.SpoolCard.portalMenuItem(page, 'duplicate').click();

        await SEL.ShelfView.resultsCount(page).filter({ hasText: '2 de 2 rollos' }).waitFor({
          state: 'visible',
        });

        const lowCard = page
          .locator('[role="button"][aria-label*="Azul Cobalto"][aria-label*="170 g restantes"]')
          .first();
        await SEL.SpoolCard.cardBackupBadge(lowCard).first().waitFor({ state: 'visible' });
        assert.equal(await SEL.SpoolCard.cardLowBadge(lowCard).count(), 0);
        assert.equal(normalizeNbsp(await SEL.ShelfView.lowStockToggle(page).textContent()), 'Bajo stock');

        await SEL.TitleBar.navTab(page, 'shopping').click();
        assert.equal(await SEL.ShoppingView.suggestionButtons(page).count(), 0);

        await SEL.TitleBar.navTab(page, 'shelf').click();
        const backupCard = page
          .locator('[role="button"][aria-label*="Azul Cobalto"][aria-label*="1 kg restantes"]')
          .first();
        await backupCard.waitFor({ state: 'visible' });
        await backupCard.hover();
        await SEL.SpoolCard.cardQuickMenuBtn(backupCard).click({ force: true });
        await SEL.SpoolCard.portalMenuItem(page, 'delete').click();

        await SEL.ShelfView.resultsCount(page).filter({ hasText: '1 de 1 rollos' }).waitFor({
          state: 'visible',
        });
        const restoredLowCard = SEL.SpoolCard.cardByName(page, 'Azul Cobalto').first();
        await SEL.SpoolCard.cardLowBadge(restoredLowCard).waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await SEL.ShelfView.lowStockToggle(page).textContent()), /1/);

        await SEL.TitleBar.navTab(page, 'shopping').click();
        await SEL.ShoppingView.suggestionButtons(page).filter({ hasText: 'Azul Cobalto' }).first().waitFor({
          state: 'visible',
        });

        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T3-03',
    tier: 3,
    tag: 'v1',
    feature: 'F3+F4+F7',
    name: 'Shopping auto-suggestion -> Toggle done -> Recibido en taller -> New sealed roll on Shelf & Replenishment updated',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({ reducedMotion: true, signal });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({
          id: 't3-03-roll',
          brand: 'Anycubic',
          material: 'PLA',
          colorName: 'Verde Bosque',
          colorHex: '#15803d',
          initialWeight: 1000,
          remainingWeight: 150,
          price: 82000,
        });
        const usage = [
          { id: 'u-t303-1', rollId: roll.id, grams: 250, at: daysAgoIso(12), note: 'P1', origin: 'manual' },
          { id: 'u-t303-2', rollId: roll.id, grams: 300, at: daysAgoIso(7), note: 'P2', origin: 'manual' },
          { id: 'u-t303-3', rollId: roll.id, grams: 300, at: daysAgoIso(2), note: 'P3', origin: 'manual' },
        ];
        await resetDbState(page, { rolls: [roll], usage });

        await SEL.TitleBar.navTab(page, 'replenish').click();
        const beforeGroup = replenishCard(page, 'Verde Bosque');
        await beforeGroup.waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await beforeGroup.innerText()), /Stock total producto:\s*150 g/i);

        await SEL.TitleBar.navTab(page, 'shopping').click();
        const sugBtn = SEL.ShoppingView.suggestionButtons(page).filter({ hasText: 'Verde Bosque' }).first();
        await sugBtn.waitFor({ state: 'visible' });
        await sugBtn.click();

        const row = SEL.ShoppingView.rowByText(page, 'Verde Bosque');
        await row.waitFor({ state: 'visible' });
        await SEL.ShoppingView.rowToggleDoneBtn(row).click();
        const receiveBtn = SEL.ShoppingView.rowReceiveBtn(row);
        await receiveBtn.waitFor({ state: 'visible' });
        await receiveBtn.click();

        await row.waitFor({ state: 'hidden' });

        await SEL.TitleBar.navTab(page, 'shelf').click();
        await SEL.ShelfView.resultsCount(page).filter({ hasText: '2 de 2 rollos' }).waitFor({
          state: 'visible',
        });
        await page
          .locator('[role="button"][aria-label*="Verde Bosque"][aria-label*="1 kg restantes"]')
          .first()
          .waitFor({ state: 'visible' });
        const lowBacked = page
          .locator('[role="button"][aria-label*="Verde Bosque"][aria-label*="150 g restantes"]')
          .first();
        await SEL.SpoolCard.cardBackupBadge(lowBacked).first().waitFor({ state: 'visible' });

        await SEL.TitleBar.navTab(page, 'replenish').click();
        const afterGroup = replenishCard(page, 'Verde Bosque');
        await afterGroup.waitFor({ state: 'visible' });
        const afterText = normalizeNbsp(await afterGroup.innerText());
        assert.match(afterText, /2 rollos en total/i);
        assert.match(afterText, /Stock total producto:\s*1,2 kg/i);
        assert.match(afterText, /Sellados de repuesto:\s*1 kg/i);

        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T3-04',
    tier: 3,
    tag: 'v1',
    feature: 'F4+F5+F6',
    name: 'Usage deduction -> Toast Deshacer -> Restores Shelf weight, clears Low-stock alert & restores Stats KPI',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({ reducedMotion: true, signal });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({
          id: 't3-04-roll',
          brand: 'eSUN',
          material: 'PLA',
          colorName: 'Rojo Carmesí',
          colorHex: '#dc2626',
          initialWeight: 1000,
          remainingWeight: 220,
        });
        await resetDbState(page, { rolls: [roll] });

        await SEL.TitleBar.navTab(page, 'stats').click();
        const availCard = SEL.StatsView.kpiAvailableGrams(page);
        await availCard.waitFor({ state: 'visible' });
        assert.equal(normalizeNbsp(await SEL.StatsView.kpiValueText(availCard).textContent()), '220 g');

        await SEL.TitleBar.navTab(page, 'shelf').click();
        const card = SEL.SpoolCard.cardByName(page, 'Rojo Carmesí').first();
        await card.waitFor({ state: 'visible' });
        await SEL.SpoolCard.cardQuickUseBtn(card, '-50g').click();

        await page.waitForFunction(() => {
          const el = document.querySelector('[role="button"][aria-label*="Rojo Carmesí"]');
          return el && el.getAttribute('aria-label')?.includes('170 g restantes');
        });
        await SEL.SpoolCard.cardLowBadge(card).waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await SEL.ShelfView.lowStockToggle(page).textContent()), /1/);

        const undoBtn = SEL.Toasts.toastUndoBtn(page).first();
        await undoBtn.waitFor({ state: 'visible' });
        await undoBtn.click();

        await page.waitForFunction(() => {
          const el = document.querySelector('[role="button"][aria-label*="Rojo Carmesí"]');
          return el && el.getAttribute('aria-label')?.includes('220 g restantes');
        });
        assert.equal(await SEL.SpoolCard.cardLowBadge(card).count(), 0);
        assert.equal(normalizeNbsp(await SEL.ShelfView.lowStockToggle(page).textContent()), 'Bajo stock');

        await SEL.TitleBar.navTab(page, 'stats').click();
        assert.equal(
          normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiAvailableGrams(page)).textContent()),
          '220 g',
        );

        const dbRes = await page.evaluate(() => window.filoteca.db.load());
        assert.equal(dbRes.data.usage.length, 0);
        assert.equal(dbRes.data.rolls[0].remainingWeight, 220);

        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T3-05',
    tier: 3,
    tag: 'v1',
    feature: 'F5+F8',
    name: 'Isolated LOCALAPPDATA Temp orcaslicer_model auto-watcher -> PendingJobsDrawer -> Falló / parcial (50%) -> Halves roll weight',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({ reducedMotion: true, signal });
      try {
        const { page, localAppDataDir } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({
          id: 't3-05-roll',
          brand: 'Anycubic',
          material: 'PLA',
          colorName: 'Gris Titanio',
          colorHex: '#64748b',
          initialWeight: 1000,
          remainingWeight: 100,
        });
        await resetDbState(page, { rolls: [roll] });
        await page.waitForTimeout(400);

        const orcaDir = path.join(localAppDataDir, 'Temp', 'orcaslicer_model');
        fs.mkdirSync(orcaDir, { recursive: true });
        const tmpPath = path.join(orcaDir, 'caja_t305.gcode.tmp');
        const gcodePath = path.join(orcaDir, 'caja_t305.gcode');
        fs.writeFileSync(
          tmpPath,
          createValidGcode({
            slicer: 'orca',
            models: ['Caja_T305.stl'],
            slots: [{ grams: 100, colorHex: '#64748b', material: 'PLA', brand: 'Anycubic' }],
            printTime: '2h 00m 0s',
          }),
          'utf8',
        );
        fs.renameSync(tmpPath, gcodePath);

        const drawer = SEL.InboxView.drawer(page);
        await drawer.waitFor({ state: 'visible', timeout: 15_000 });
        assert.match(normalizeNbsp(await drawer.innerText()), /1 pendiente/i);
        assert.equal(normalizeNbsp(await SEL.TitleBar.inboxBadge(page).textContent()), '1');

        await SEL.InboxView.drawerReviewBtn(page).click();
        await SEL.InboxView.inboxHeading(page).waitFor({ state: 'visible' });

        const jobCard = SEL.InboxView.jobCard(page, /Caja_T305|caja_t305/i);
        await jobCard.waitFor({ state: 'visible' });
        await SEL.InboxView.slotRollSelect(jobCard, 0).selectOption('t3-05-roll');
        await SEL.InboxView.partialFailBtn(jobCard).click();

        const failedModal = SEL.InboxView.failedModal(page);
        await failedModal.waitFor({ state: 'visible' });
        const modalText = normalizeNbsp(await failedModal.innerText());
        assert.match(modalText, /50%/);
        assert.match(modalText, /50\s*g/);
        await SEL.InboxView.failedConfirmBtn(failedModal).click();
        await failedModal.waitFor({ state: 'hidden' });

        await inboxStatusTab(page, /^Fallidos/i).click();
        await SEL.InboxView.jobCard(page, /Caja_T305|caja_t305/i).waitFor({ state: 'visible' });

        await SEL.TitleBar.navTab(page, 'shelf').click();
        const card = SEL.SpoolCard.cardByName(page, 'Gris Titanio').first();
        await card.waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await card.getAttribute('aria-label')), /50 g restantes/i);

        await card.click();
        const detail = SEL.RollDetailModal.modal(page);
        await detail.waitFor({ state: 'visible' });
        const detailText = normalizeNbsp(await detail.innerText());
        assert.match(detailText, /Historial de impresiones \(1\)/i);
        assert.match(detailText, /-50g/);
        assert.match(detailText, /50%/);
        await SEL.RollDetailModal.closeBtn(detail).click();

        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T3-06',
    tier: 3,
    tag: 'v1',
    feature: 'F3+F6+F7',
    name: 'Replenishment Marcar como pedido -> Overdue order ¡Sí, ya llegó! (+1 sellado) -> Sealed roll & Inventory value KPI increase',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({ reducedMotion: true, signal });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({
          id: 't3-06-roll',
          brand: 'Anycubic',
          material: 'PLA',
          colorName: 'Amarillo Sol',
          colorHex: '#eab308',
          initialWeight: 1000,
          remainingWeight: 80,
          price: 89900,
          deliveryDays: 6,
        });
        const usage = [
          { id: 'u-t306-1', rollId: roll.id, grams: 300, at: daysAgoIso(14), note: 'P1', origin: 'manual' },
          { id: 'u-t306-2', rollId: roll.id, grams: 310, at: daysAgoIso(9), note: 'P2', origin: 'manual' },
          { id: 'u-t306-3', rollId: roll.id, grams: 310, at: daysAgoIso(4), note: 'P3', origin: 'manual' },
        ];
        await resetDbState(page, { rolls: [roll], usage });

        await SEL.TitleBar.navTab(page, 'stats').click();
        const beforeRolls = SEL.StatsView.kpiTotalRolls(page);
        const beforeValue = SEL.StatsView.kpiInventoryValue(page);
        await beforeRolls.waitFor({ state: 'visible' });
        assert.equal(normalizeNbsp(await SEL.StatsView.kpiValueText(beforeRolls).textContent()), '1');
        assert.match(normalizeNbsp(await SEL.StatsView.kpiValueText(beforeValue).textContent()), /\$\s*7\.192/);

        await SEL.TitleBar.navTab(page, 'replenish').click();
        const groupCard = replenishCard(page, 'Amarillo Sol');
        await groupCard.waitFor({ state: 'visible' });
        await SEL.ReplenishmentView.markOrderedBtn(groupCard).click();

        const orderDlg = SEL.ReplenishmentView.orderDialog(page);
        await orderDlg.waitFor({ state: 'visible' });
        await SEL.ReplenishmentView.orderDaysInput(orderDlg).fill('3');
        await SEL.ReplenishmentView.orderSaveBtn(orderDlg).click();
        await orderDlg.waitFor({ state: 'hidden' });

        await groupCard.getByText(/Pedido en camino/i).first().waitFor({ state: 'visible' });

        // Backdate expectedArrival via DB so overdue arrival UI activates without waiting 3 real days
        await page.evaluate(async () => {
          const api = window.filoteca;
          const loaded = await api.db.load();
          const activeOrder = loaded.data.orders.find((o) => !o.received);
          if (!activeOrder) throw new Error('Expected active order in DB');
          const pastIso = new Date(Date.now() - 3_600_000).toISOString();
          await api.db.upsertOrder({ ...activeOrder, expectedArrival: pastIso });
        });
        await page.waitForTimeout(300);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForAppReady(page);

        await SEL.TitleBar.navTab(page, 'replenish').click();
        const overdueCard = replenishCard(page, 'Amarillo Sol');
        await overdueCard.waitFor({ state: 'visible' });
        const arrivedBtn = SEL.ReplenishmentView.arrivedBtn(overdueCard);
        await arrivedBtn.waitFor({ state: 'visible' });
        await arrivedBtn.click();

        await SEL.Toasts.toastByTitle(page, /Rollo recibido e ingresado/i).waitFor({ state: 'visible' });

        await SEL.TitleBar.navTab(page, 'shelf').click();
        await SEL.ShelfView.resultsCount(page).filter({ hasText: '2 de 2 rollos' }).waitFor({
          state: 'visible',
        });
        await page
          .locator('[role="button"][aria-label*="Amarillo Sol"][aria-label*="1 kg restantes"]')
          .first()
          .waitFor({ state: 'visible' });

        await SEL.TitleBar.navTab(page, 'stats').click();
        assert.equal(
          normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiTotalRolls(page)).textContent()),
          '2',
        );
        assert.equal(
          normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiAvailableGrams(page)).textContent()),
          '1,1 kg',
        );
        assert.match(
          normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiInventoryValue(page)).textContent()),
          /\$\s*97\.092/,
        );

        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T3-07',
    tier: 3,
    tag: 'v1',
    feature: 'F3+F9',
    name: 'Export JSON + CSV -> Delete roll -> Import JSON & CSV -> Merged inventory persists across Electron restart',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-e2e-t307-ud-'));
      const la = fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-e2e-t307-la-'));
      const art = fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-e2e-t307-art-'));

      let ctx1 = null;
      let ctx2 = null;
      try {
        ctx1 = await launchFiloteca({
          userDataDir: ud,
          localAppDataDir: la,
          artifactsDir: art,
          reducedMotion: true,
          signal,
        });
        const { app, page } = ctx1;
        await skipOnboardingFast(page);

        const r1 = makeRoll({
          id: 'exp-r1',
          colorName: 'Negro Export',
          colorHex: '#1f2023',
          remainingWeight: 700,
          price: 78000,
        });
        const r2 = makeRoll({
          id: 'exp-r2',
          brand: 'Sunlu',
          colorName: 'Blanco Export',
          colorHex: '#f4f4f6',
          remainingWeight: 500,
          price: 82000,
        });
        const u1 = {
          id: 'exp-u1',
          rollId: 'exp-r1',
          grams: 300,
          at: daysAgoIso(3),
          note: 'Exported usage',
          origin: 'manual',
        };
        await resetDbState(page, { rolls: [r1, r2], usage: [u1] });

        const jsonOut = path.join(art, 'inventory-export.json');
        const csvOut = path.join(art, 'inventory-export.csv');
        const csvExtra = path.join(art, 'extra-roll.csv');

        await SEL.TitleBar.navTab(page, 'settings').click();
        await mockSaveDialog(app, jsonOut);
        await SEL.SettingsView.exportJsonBtn(page).click();
        await SEL.Toasts.toastByTitle(page, /Exportación completada/i).waitFor({ state: 'visible' });
        assert.equal(fs.existsSync(jsonOut), true);

        await mockSaveDialog(app, csvOut);
        await SEL.SettingsView.exportCsvBtn(page).click();
        await SEL.Toasts.toastByTitle(page, /CSV exportado/i).waitFor({ state: 'visible' });
        assert.equal(fs.existsSync(csvOut), true);
        assert.match(fs.readFileSync(csvOut, 'utf8'), /Negro Export/);

        await SEL.TitleBar.navTab(page, 'shelf').click();
        const delCard = SEL.SpoolCard.cardByName(page, 'Blanco Export').first();
        await delCard.waitFor({ state: 'visible' });
        await delCard.hover();
        await SEL.SpoolCard.cardQuickMenuBtn(delCard).click({ force: true });
        await SEL.SpoolCard.portalMenuItem(page, 'delete').click();
        await SEL.ShelfView.resultsCount(page).filter({ hasText: '1 de 1 rollos' }).waitFor({
          state: 'visible',
        });

        await SEL.TitleBar.navTab(page, 'settings').click();
        await mockOpenDialog(app, jsonOut);
        await SEL.SettingsView.importFileBtn(page).click();
        await SEL.Toasts.toastByTitle(page, /Importación exitosa/i).waitFor({ state: 'visible' });

        fs.writeFileSync(
          csvExtra,
          createCsvRolls([
            {
              brand: 'Prusament',
              material: 'PETG',
              colorName: 'Verde CSV',
              colorHex: '#15803d',
              initialWeight: 1000,
              remainingWeight: 600,
              price: 95000,
            },
          ]),
          'utf8',
        );
        await mockOpenDialog(app, csvExtra);
        await SEL.SettingsView.importFileBtn(page).click();
        await SEL.Toasts.toastByTitle(page, /Importación CSV exitosa/i).waitFor({ state: 'visible' });

        await SEL.TitleBar.navTab(page, 'shelf').click();
        await SEL.ShelfView.resultsCount(page).filter({ hasText: '3 de 3 rollos' }).waitFor({
          state: 'visible',
        });

        await page.waitForTimeout(350);
        assertNoPageErrors(ctx1);
        await ctx1.close();
        ctx1 = null;

        ctx2 = await launchFiloteca({
          userDataDir: ud,
          localAppDataDir: la,
          artifactsDir: art,
          reducedMotion: true,
          signal,
        });
        const page2 = ctx2.page;
        assert.equal(await SEL.OnboardingModal.modal(page2).count(), 0);
        await SEL.ShelfView.resultsCount(page2).filter({ hasText: '3 de 3 rollos' }).waitFor({
          state: 'visible',
        });
        await SEL.SpoolCard.cardByName(page2, 'Negro Export').first().waitFor({ state: 'visible' });
        await SEL.SpoolCard.cardByName(page2, 'Blanco Export').first().waitFor({ state: 'visible' });
        await SEL.SpoolCard.cardByName(page2, 'Verde CSV').first().waitFor({ state: 'visible' });
        assertNoPageErrors(ctx2);
      } finally {
        if (ctx1) await ctx1.close().catch(() => {});
        if (ctx2) await ctx2.close().catch(() => {});
        await rmDirWithRetry(ud).catch(() => {});
        await rmDirWithRetry(la).catch(() => {});
        await rmDirWithRetry(art).catch(() => {});
      }
    },
  },

  {
    id: 'T3-08',
    tier: 3,
    tag: 'v1',
    feature: 'F2+F5',
    name: 'Theme + Language (es -> en -> pt) + Currency (COP -> USD) + Deduction survive cold Electron restart',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-e2e-t308-ud-'));
      const la = fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-e2e-t308-la-'));
      const art = fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-e2e-t308-art-'));

      let ctx1 = null;
      let ctx2 = null;
      try {
        ctx1 = await launchFiloteca({
          userDataDir: ud,
          localAppDataDir: la,
          artifactsDir: art,
          reducedMotion: true,
          signal,
        });
        const page1 = ctx1.page;
        await skipOnboardingFast(page1);

        const roll = makeRoll({
          id: 't3-08-roll',
          colorName: 'Negro Persistencia',
          initialWeight: 1000,
          remainingWeight: 500,
          price: 68900,
        });
        await resetDbState(page1, { rolls: [roll] });

        await SEL.TitleBar.navTab(page1, 'settings').click();
        await SEL.SettingsView.themeBtn(page1, 'dark').click();
        assert.equal(
          await page1.evaluate(() => document.documentElement.classList.contains('dark')),
          true,
        );
        await SEL.SettingsView.themeBtn(page1, 'light').click();
        assert.equal(
          await page1.evaluate(() => document.documentElement.classList.contains('dark')),
          false,
        );
        await SEL.SettingsView.themeBtn(page1, 'dark').click();
        assert.equal(
          await page1.evaluate(() => document.documentElement.classList.contains('dark')),
          true,
        );

        await SEL.SettingsView.langBtn(page1, 'en').click();
        assert.ok(normalizeNbsp(await page1.locator('header nav').innerText()).includes('Shelf'));

        await SEL.SettingsView.langBtn(page1, 'pt').click();
        const ptNav = normalizeNbsp(await page1.locator('header nav').innerText());
        assert.ok(ptNav.includes('Estante'));
        assert.ok(ptNav.includes('Estatísticas'));

        await SEL.SettingsView.currencyPill(page1, 'USD').click();

        await SEL.TitleBar.navTab(page1, 'shelf').click();
        const card1 = SEL.SpoolCard.cardByName(page1, 'Negro Persistencia').first();
        await card1.waitFor({ state: 'visible' });
        const price1 = normalizeNbsp(await SEL.SpoolCard.cardPrice(card1).textContent());
        assert.match(price1, /(?:US\$|USD|\$)\s*68\.900,00/);

        await SEL.SpoolCard.cardQuickUseBtn(card1, '-25g').click();
        await page1.waitForFunction(() => {
          const el = document.querySelector('[role="button"][aria-label*="Negro Persistencia"]');
          return el && el.getAttribute('aria-label')?.includes('475 g restantes');
        });

        await page1.waitForTimeout(350);
        assertNoPageErrors(ctx1);
        await ctx1.close();
        ctx1 = null;

        ctx2 = await launchFiloteca({
          userDataDir: ud,
          localAppDataDir: la,
          artifactsDir: art,
          reducedMotion: true,
          signal,
        });
        const page2 = ctx2.page;
        assert.equal(await SEL.OnboardingModal.modal(page2).count(), 0);
        assert.equal(
          await page2.evaluate(() => document.documentElement.classList.contains('dark')),
          true,
        );
        const reloadedNav = normalizeNbsp(await page2.locator('header nav').innerText());
        assert.ok(reloadedNav.includes('Estante'));
        assert.ok(reloadedNav.includes('Estatísticas'));

        const card2 = SEL.SpoolCard.cardByName(page2, 'Negro Persistencia').first();
        await card2.waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await card2.getAttribute('aria-label')), /475 g restantes/i);
        assert.match(normalizeNbsp(await SEL.SpoolCard.cardPrice(card2).textContent()), /(?:US\$|USD|\$)\s*68\.900,00/);

        const dbRes = await page2.evaluate(() => window.filoteca.db.load());
        assert.equal(dbRes.data.settings.theme, 'dark');
        assert.equal(dbRes.data.settings.language, 'pt');
        assert.equal(dbRes.data.settings.currency, 'USD');
        assert.equal(dbRes.data.rolls[0].remainingWeight, 475);

        assertNoPageErrors(ctx2);
      } finally {
        if (ctx1) await ctx1.close().catch(() => {});
        if (ctx2) await ctx2.close().catch(() => {});
        await rmDirWithRetry(ud).catch(() => {});
        await rmDirWithRetry(la).catch(() => {});
        await rmDirWithRetry(art).catch(() => {});
      }
    },
  },

  {
    id: 'T3-09',
    tier: 3,
    tag: 'v2',
    feature: 'F2+F8+F10',
    name: 'Inbox G-code job -> Contextual link to Quote Calculator -> Currency (COP/USD/BRL) & Language (ES/EN/PT) parity',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({
        reducedMotion: true,
        blockExternalNetwork: true,
        signal,
      });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page, { language: 'es', currency: 'COP' });

        const roll = makeRoll({
          id: 'roll-t3-quote',
          brand: 'Anycubic',
          material: 'PLA',
          colorName: 'Naranja Taller',
          colorHex: '#f2754e',
          initialWeight: 1000,
          remainingWeight: 900,
          price: 90000,
        });
        const job = makeUnreviewedGcodeJob({
          id: 'job-t3-09',
          filename: 'Bracket_Quote.gcode',
          jobName: 'Bracket_Quote',
          totalGrams: 65,
          printTimeSeconds: 7200,
          rollId: roll.id,
        });
        await resetDbState(page, {
          rolls: [roll],
          gcodeJobs: [job],
          settings: { language: 'es', currency: 'COP' },
        });

        await SEL.TitleBar.navTab(page, 'inbox').click();
        const card = SEL.InboxView.jobCard(page, /Bracket_Quote/i);
        await card.waitFor({ state: 'visible' });

        await buildContextualInboxQuoteBtn(card).click();
        await SEL.ToolsView.toolsTabQuote(page).first().waitFor({ state: 'visible' });

        // Verify Bracket_Quote / 65g / 2h prefill from Inbox job
        const projectInput = page.getByPlaceholder(/(Soporte articulado|Articulated mount|Suporte articulado)/i).first();
        await projectInput.waitFor({ state: 'visible' });
        assert.equal(await projectInput.inputValue(), 'Bracket_Quote');

        const hoursInput = page
          .locator('label', { hasText: /^(Horas|Hours)$/i })
          .locator('xpath=ancestor::div[1]')
          .locator('input[type="number"]')
          .first();
        assert.equal(await hoursInput.inputValue(), '2');

        const quoteBodyEs = normalizeNbsp(await page.locator('main, div.workbench-bg').first().innerText());
        assert.match(quoteBodyEs, /Material\s*\(65[.,]0\s*g\)/i);

        const copTotal = await readQuoteTotalText(page);
        assert.match(copTotal, /\$\s*[\d.]+(?!,\d)/, `Expected 0-decimal COP total, got: ${copTotal}`);
        assert.ok(parseMoneyAmount(copTotal) > 0, `Expected positive COP quote total, got: ${copTotal}`);

        const switchCurrencyAndCheck = async (code, rx) => {
          await SEL.TitleBar.navTab(page, 'settings').click();
          await SEL.SettingsView.currencyPill(page, code).click();
          await SEL.TitleBar.navTab(page, 'inbox').click();
          const jobCard = SEL.InboxView.jobCard(page, /Bracket_Quote/i);
          await buildContextualInboxQuoteBtn(jobCard).click();
          await SEL.ToolsView.toolsTabQuote(page).first().waitFor({ state: 'visible' });
          const txt = await readQuoteTotalText(page);
          assert.match(txt, rx, `Expected ${code} quote total format, got: ${txt}`);
          assert.ok(parseMoneyAmount(txt) > 0, `Expected positive ${code} quote total, got: ${txt}`);
        };

        await switchCurrencyAndCheck('USD', /(?:US\$|USD|\$)\s*[\d.]+,\d{2}/);
        await switchCurrencyAndCheck('BRL', /(?:R\$|BRL)\s*[\d.]+,\d{2}/);

        const checkLanguageTools = async (lang, expectedTabLabel, expectedQuoteTabLabel, expectedHeadingRx) => {
          await SEL.TitleBar.navTab(page, 'settings').click();
          const langSection = page.locator('div.rounded-2xl').filter({
            hasText: /Idioma de la interfaz|Idioma da interface|Interface Language|Language/i,
          });
          const langRx = { es: /Español/i, en: /English/i, pt: /Portugu[eê]s/i }[lang];
          await langSection.getByRole('button', { name: langRx }).click();
          const toolsTab = SEL.TitleBar.navTab(page, 'tools').first();
          await toolsTab.waitFor({ state: 'visible' });
          assert.equal(normalizeNbsp(await toolsTab.textContent()), expectedTabLabel);
          await toolsTab.click();
          const quoteSubTab = SEL.ToolsView.toolsTabQuote(page).first();
          await quoteSubTab.waitFor({ state: 'visible' });
          assert.equal(normalizeNbsp(await quoteSubTab.textContent()), expectedQuoteTabLabel);
          const toolsText = normalizeNbsp(await page.locator('main, div.workbench-bg').first().innerText());
          assert.match(toolsText, expectedHeadingRx);
        };

        await checkLanguageTools('en', 'Tools', '3D Quote', /3D Workshop Tools/i);
        await checkLanguageTools('pt', 'Ferramentas', 'Orçamento 3D', /Ferramentas da Oficina 3D/i);
        await checkLanguageTools('es', 'Herramientas', 'Cotizador 3D', /Herramientas del Taller 3D/i);

        assertNoExternalNetworkRequests(ctx);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T3-10',
    tier: 3,
    tag: 'v2',
    feature: 'F3+F6+F10',
    name: 'Scale Tare Estimator (ToolsView) -> 1-click inventory update -> RollDetailModal & StatsView KPI updated',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({ reducedMotion: true, signal });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({
          id: 'tare-roll-1',
          brand: 'Bambu Lab',
          material: 'PLA',
          colorName: 'Azul Cobalto',
          colorHex: '#2563eb',
          initialWeight: 1000,
          remainingWeight: 800,
          price: 90000,
        });
        await resetDbState(page, { rolls: [roll] });

        await SEL.TitleBar.navTab(page, 'stats').click();
        const baselineCard = SEL.StatsView.kpiAvailableGrams(page);
        await baselineCard.waitFor({ state: 'visible' });
        assert.equal(normalizeNbsp(await SEL.StatsView.kpiValueText(baselineCard).textContent()), '800 g');

        await SEL.TitleBar.navTab(page, 'tools').first().click();
        await SEL.ToolsView.toolsTabMath(page).first().click();

        const rollSelect = page
          .locator('[data-testid="tare-roll-select"]')
          .or(page.locator('select').filter({ has: page.locator('option', { hasText: /Azul Cobalto/i }) }));
        assert.ok((await rollSelect.count()) > 0, 'Expected target roll select in Tare estimator');
        await rollSelect.first().selectOption('tare-roll-1');

        const emptyInput = SEL.ToolsView.tareEmptyInput(page).first();
        await emptyInput.waitFor({ state: 'visible' });
        await emptyInput.fill('250');

        const grossInput = SEL.ToolsView.tareGrossInput(page).first();
        await grossInput.fill('670');

        const toolsBody = normalizeNbsp(await page.locator('main, div.workbench-bg').first().innerText());
        assert.match(toolsBody, /420(?:[.,]0)?\s*g/);

        await SEL.ToolsView.tareApplyRollBtn(page).first().click();
        await SEL.Toasts.toastByTitle(page, /Peso actualizado|Updated weight|Peso atualizado/i).waitFor({
          state: 'visible',
        });

        const dbRes = await page.evaluate(() => window.filoteca.db.load());
        assert.equal(dbRes.data.rolls[0].remainingWeight, 420);

        await SEL.TitleBar.navTab(page, 'shelf').click();
        const card = SEL.SpoolCard.cardByName(page, 'Azul Cobalto').first();
        await card.waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await card.getAttribute('aria-label')), /420 g restantes/i);

        await card.click();
        const detail = SEL.RollDetailModal.modal(page);
        await detail.waitFor({ state: 'visible' });
        const detailText = normalizeNbsp(await detail.innerText());
        assert.match(detailText, /420(?:[.,]0)?\s*g/);
        assert.match(detailText, /42%/);
        await SEL.RollDetailModal.closeBtn(detail).click();
        await detail.waitFor({ state: 'hidden' });

        await SEL.TitleBar.navTab(page, 'stats').click();
        assert.equal(
          normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiAvailableGrams(page)).textContent()),
          '420 g',
        );

        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T3-11',
    tier: 3,
    tag: 'v2',
    feature: 'F3+F10',
    name: 'RollDetailModal contextual link -> ToolsView Quote prefill & Math/Drying Guide PETG selection',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({ reducedMotion: true, signal });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const petgRoll = makeRoll({
          id: 'petg-roll-1',
          brand: 'Prusament',
          material: 'PETG',
          colorName: 'Naranja PETG',
          colorHex: '#f97316',
          initialWeight: 1000,
          remainingWeight: 620,
          diameter: 1.75,
          price: 95000,
        });
        await resetDbState(page, { rolls: [petgRoll] });

        const card = SEL.SpoolCard.cardByName(page, 'Naranja PETG').first();
        await card.waitFor({ state: 'visible' });
        await card.click();

        const detail = SEL.RollDetailModal.modal(page);
        await detail.waitFor({ state: 'visible' });
        await buildDetailToolsBtn(detail).click();
        await detail.waitFor({ state: 'hidden' });

        // Verify Quote Calculator opens prefilled with the PETG roll and positive quote output
        await SEL.ToolsView.toolsTabQuote(page).first().waitFor({ state: 'visible' });
        const spoolSelect = page
          .locator('div.p-3\\.5.rounded-xl select')
          .filter({ has: page.locator('option[value="petg-roll-1"]') })
          .first();
        await spoolSelect.waitFor({ state: 'visible' });
        assert.equal(await spoolSelect.inputValue(), 'petg-roll-1');
        const quoteSectionText = normalizeNbsp(await page.locator('main, div.workbench-bg').first().innerText());
        assert.match(quoteSectionText, /Prusament PETG — Naranja PETG|Naranja PETG/i);
        assert.match(quoteSectionText, /PETG/);
        const quoteTotal = await readQuoteTotalText(page);
        assert.ok(parseMoneyAmount(quoteTotal) > 0, `Expected positive quote total for PETG roll, got: ${quoteTotal}`);

        // Switch to Math & Drying tab, select PETG, and verify converter density badge + highlighted drying row
        await SEL.ToolsView.toolsTabMath(page).first().click();
        const matSelect = page
          .locator('label', { hasText: /(Material \(densidad\)|Material \(density\))/i })
          .locator('xpath=ancestor::div[1]')
          .locator('select')
          .first();
        await matSelect.waitFor({ state: 'visible' });
        await matSelect.selectOption('PETG');
        assert.equal(await matSelect.inputValue(), 'PETG');

        const densityBadge = page.locator('span.font-mono.rounded-full', { hasText: /g\/cm³/i }).first();
        assert.match(normalizeNbsp(await densityBadge.innerText()), /1[.,]27\s*g\/cm³/);

        const highlightedRow = page.locator('tbody tr.bg-accent\\/10');
        assert.equal(await highlightedRow.count(), 1, 'Expected exactly 1 highlighted drying table row');
        const rowText = normalizeNbsp(await highlightedRow.innerText());
        assert.match(rowText, /^PETG\b/);
        assert.match(rowText, /1[.,]27\s*g\/cm³/);
        assert.match(rowText, /65\s*°C/);
        assert.match(rowText, /5\s*h/);

        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T3-12',
    tier: 3,
    tag: 'v2',
    feature: 'F5+F8+F10',
    name: 'Batch Slicer Inspector -> Multi-file stock feasibility check -> Send to Quote & Inbox -> Complete print deduction',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({ reducedMotion: true, signal });
      try {
        const { app, page, artifactsDir } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({
          id: 'batch-pla-1',
          brand: 'Anycubic',
          material: 'PLA',
          colorName: 'Negro Taller',
          colorHex: '#1f2023',
          initialWeight: 1000,
          remainingWeight: 100,
          price: 80000,
        });
        await resetDbState(page, { rolls: [roll] });

        const partAPath = path.join(artifactsDir, 'partA.gcode');
        const partBPath = path.join(artifactsDir, 'partB.gcode');
        fs.writeFileSync(
          partAPath,
          createValidGcode({
            slicer: 'orca',
            models: ['PartA.stl'],
            slots: [{ grams: 80, colorHex: '#1f2023', material: 'PLA', brand: 'Anycubic' }],
            printTime: '1h 00m 0s',
          }),
          'utf8',
        );
        fs.writeFileSync(
          partBPath,
          createValidGcode({
            slicer: 'orca',
            models: ['PartB.stl'],
            slots: [{ grams: 70, colorHex: '#1f2023', material: 'PLA', brand: 'Anycubic' }],
            printTime: '0h 45m 0s',
          }),
          'utf8',
        );

        await SEL.TitleBar.navTab(page, 'tools').first().click();
        await SEL.ToolsView.toolsTabBatch(page).first().click();

        await mockOpenDialog(app, [partAPath, partBPath]);
        await SEL.ToolsView.batchSelectFilesBtn(page).first().click();

        const batchContainer = page.locator('main, div.workbench-bg').first();
        await batchContainer.getByText(/PartA|partA/i).first().waitFor({ state: 'visible' });
        await batchContainer.getByText(/PartB|partB/i).first().waitFor({ state: 'visible' });
        const batchText = normalizeNbsp(await batchContainer.innerText());
        assert.match(batchText, /150([.,]0)?\s*g/);
        assert.match(batchText, /1h\s*45m/);
        assert.match(batchText, /(Falta|Insuficiente|Shortage|Deficit|50([.,]0)?\s*g)/i);

        await SEL.ToolsView.batchSendQuoteBtn(page).first().click();
        await SEL.ToolsView.toolsTabQuote(page).first().waitFor({ state: 'visible' });
        const quoteTotal = await readQuoteTotalText(page);
        assert.ok(parseMoneyAmount(quoteTotal) > 0, `Expected positive quote total from batch, got: ${quoteTotal}`);
        const quoteHours = page
          .locator('label', { hasText: /^(Horas|Hours)$/i })
          .locator('xpath=ancestor::div[1]')
          .locator('input[type="number"]')
          .first();
        const quoteMins = page
          .locator('label', { hasText: /^(Minutos|Minutes)$/i })
          .locator('xpath=ancestor::div[1]')
          .locator('input[type="number"]')
          .first();
        assert.equal(await quoteHours.inputValue(), '1');
        assert.equal(await quoteMins.inputValue(), '45');
        assert.match(normalizeNbsp(await batchContainer.innerText()), /Material\s*\(150[.,]0\s*g\)/i);

        await SEL.ToolsView.toolsTabBatch(page).first().click();
        const batchClearBtn = page.getByRole('button', {
          name: /(Limpiar lista|Clear list|Limpar lista)/i,
        });
        await batchClearBtn.waitFor({ state: 'visible' });
        await batchClearBtn.click();
        await batchContainer.locator('tbody tr').first().waitFor({ state: 'hidden' });

        await mockOpenDialog(app, [partAPath]);
        await SEL.ToolsView.batchSelectFilesBtn(page).first().click();
        await batchContainer.getByText(/PartA|partA/i).first().waitFor({ state: 'visible' });
        assert.equal(await batchContainer.locator('tbody tr').count(), 1, 'Expected exactly 1 item in batch list');
        await SEL.ToolsView.batchSendInboxBtn(page).first().click();
        await SEL.Toasts.toastByTitle(page, /1 trabajo.*enviado|1 job.*sent|1 trabalho.*enviado/i).waitFor({
          state: 'visible',
        });

        await SEL.TitleBar.navTab(page, 'inbox').click();
        await SEL.InboxView.inboxHeading(page).waitFor({ state: 'visible' });
        assert.equal(await SEL.InboxView.jobCard(page, /PartB|partB/i).count(), 0);
        const jobCard = SEL.InboxView.jobCard(page, /PartA|partA/i);
        await jobCard.waitFor({ state: 'visible' });
        await SEL.InboxView.slotRollSelect(jobCard, 0).selectOption('batch-pla-1');
        await SEL.InboxView.printBtn(jobCard).click();

        await SEL.Toasts.toastByTitle(page, /Impresión registrada/i).waitFor({ state: 'visible' });
        const dbRes = await page.evaluate(() => window.filoteca.db.load());
        assert.equal(dbRes.data.rolls[0].remainingWeight, 20);
        assert.equal(dbRes.data.usage.length, 1);
        assert.equal(dbRes.data.usage[0].origin, 'gcode');
        assert.equal(dbRes.data.usage[0].grams, 80);

        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },
];
