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
} from '../lib/harness.mjs';
import { SEL, normalizeNbsp } from '../lib/selectors.mjs';
import {
  createAnycubicMetadata,
  createLargeInventoryRolls,
  createValid3mfBuffer,
  createValidGcode,
} from '../lib/fixtures.mjs';

function makeRoll(overrides = {}) {
  const iso = overrides.createdAt ?? '2026-11-10T10:00:00.000Z';
  return {
    id: overrides.id ?? 'roll-s-default',
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

function inboxTabBarBtn(page, labelRegex) {
  return page.locator('div.bg-surface-2.p-1.rounded-xl').getByRole('button', { name: labelRegex });
}

function replenishGroupCard(page, text) {
  return page.locator('div.rounded-3xl.bg-surface-1').filter({ hasText: text }).first();
}

async function emitSecondInstanceFile(app, filePath) {
  await app.evaluate(({ app: electronApp }, target) => {
    electronApp.emit('second-instance', {}, ['filoteca.exe', '--importar-gcode', target]);
  }, filePath);
}

async function readQuoteTotal(page) {
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

function parseMoneyAmount(raw) {
  const cleaned = normalizeNbsp(raw).replace(/[^0-9.,-]/g, '');
  if (!cleaned) return 0;
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/\./g, '');
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? num : 0;
}

async function waitForFileOnDisk(filePath, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for exported file on disk: ${filePath}`);
}

async function configureQuoteInputs(page, { rollIds, gramsList }) {
  const spoolsSection = page
    .locator('div.p-5.rounded-2xl')
    .filter({ has: page.locator('[data-testid="quote-add-spool"]') })
    .first();
  await spoolsSection.waitFor({ state: 'visible' });

  const spoolCards = spoolsSection.locator('div.p-3\\.5.rounded-xl');
  const addBtn = SEL.ToolsView.quoteAddSpoolBtn(page).first();
  while ((await spoolCards.count()) < rollIds.length) {
    const before = await spoolCards.count();
    await addBtn.click();
    await page.waitForFunction(
      ({ expected }) => {
        const sec = Array.from(document.querySelectorAll('div.p-5.rounded-2xl')).find((d) =>
          d.querySelector('[data-testid="quote-add-spool"]'),
        );
        return sec ? sec.querySelectorAll('div.p-3\\.5.rounded-xl').length >= expected : false;
      },
      { expected: before + 1 },
    );
  }

  for (let i = 0; i < rollIds.length; i++) {
    const card = spoolCards.nth(i);
    const invToggle = card.getByRole('button', { name: /^(Inventario|Inventory|Estoque)$/i }).first();
    assert.ok((await invToggle.count()) > 0, `Expected Inventory mode toggle on spool row ${i}`);
    await invToggle.click();

    const rollSelect = card.locator('select').first();
    await rollSelect.waitFor({ state: 'visible' });
    await rollSelect.selectOption(rollIds[i]);
    assert.equal(await rollSelect.inputValue(), rollIds[i]);

    const gramInput = card
      .locator('label', { hasText: /(Gramos|Grams|Gramas)/i })
      .locator('xpath=ancestor::div[1]')
      .locator('input[type="number"]')
      .first();
    assert.ok((await gramInput.count()) > 0, `Expected grams input on spool row ${i}`);
    await gramInput.fill(String(gramsList[i]));
  }

  const fillRequiredField = async (testId, labelRx, val) => {
    const el = page.locator(`[data-testid="${testId}"]`).or(
      page
        .locator('label', { hasText: labelRx })
        .locator('xpath=ancestor::div[1]')
        .locator('input[type="number"]')
        .first(),
    );
    const cnt = await el.count();
    assert.ok(cnt > 0, `Expected quote input matching ${labelRx} (${testId}) to exist`);
    await el.first().fill(String(val));
  };

  await fillRequiredField('quote-hours-input', /^(Horas|Hours)$/i, 3);
  await fillRequiredField(
    'quote-wattage-input',
    /(Consumo promedio|Average power|Consumo médio|Vatios|Watts|Wattage|Potência)/i,
    200,
  );
  await fillRequiredField('quote-kwh-input', /(Tarifa el[eé]ctrica|Electricity rate|kWh)/i, 900);
  await fillRequiredField('quote-machine-rate-input', /(Tarifa máquina|Machine rate|Taxa máquina)/i, 3000);
  await fillRequiredField('quote-labor-rate-input', /(Mano de obra|Labor rate|Mão de obra)/i, 10000);
  await fillRequiredField('quote-failure-input', /(Buffer de fallo|Failure buffer|Reserva de falha)/i, 10);
  await fillRequiredField('quote-margin-input', /(Utilidad|Profit|Lucro|Margen|Margin)/i, 30);
}

export const tests = [
  {
    id: 'T4-S1',
    tier: 4,
    tag: 'v2',
    feature: 'F2+F10',
    name: 'Scenario S1: Multi-Spool Quote Generation, COP/USD/BRL & ES/EN/PT Parity, and Offline .txt/.html Export',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({
        reducedMotion: true,
        blockExternalNetwork: true,
        signal,
      });
      try {
        const { app, page, artifactsDir } = ctx;
        await skipOnboardingFast(page, { language: 'es', currency: 'COP' });

        const plaRoll = makeRoll({
          id: 's1-pla',
          brand: 'Anycubic',
          material: 'PLA',
          colorName: 'Negro S1',
          colorHex: '#1f2023',
          initialWeight: 1000,
          remainingWeight: 900,
          price: 80000,
        });
        const petgRoll = makeRoll({
          id: 's1-petg',
          brand: 'Prusament',
          material: 'PETG',
          colorName: 'Blanco S1',
          colorHex: '#f4f4f6',
          initialWeight: 1000,
          remainingWeight: 850,
          price: 120000,
        });
        await resetDbState(page, {
          rolls: [plaRoll, petgRoll],
          settings: { language: 'es', currency: 'COP' },
        });

        await SEL.TitleBar.navTab(page, 'tools').first().click();
        await SEL.ToolsView.toolsTabQuote(page).first().click();
        await configureQuoteInputs(page, {
          rollIds: ['s1-pla', 's1-petg'],
          gramsList: [100, 50],
        });

        const copTotal = await readQuoteTotal(page);
        assert.match(copTotal, /\$\s*[\d.]+(?!,\d)/, `Expected COP quote total, got: ${copTotal}`);
        assert.ok(parseMoneyAmount(copTotal) > 0, `Expected positive COP quote total, got: ${copTotal}`);

        const formatSelect = page.locator('select[aria-label="Format"]');
        assert.equal(await formatSelect.count(), 1, 'Expected Format select in QuoteCalculatorTool');

        const txtOut = path.join(artifactsDir, 'quote-s1.txt');
        await formatSelect.selectOption('txt');
        await mockSaveDialog(app, txtOut);
        await SEL.ToolsView.quoteSaveBtn(page).first().click();
        await SEL.Toasts.toastByTitle(page, /quote-s1\.txt/i).waitFor({ state: 'visible' });
        await waitForFileOnDisk(txtOut);
        const txtBody = normalizeNbsp(fs.readFileSync(txtOut, 'utf8'));
        assert.ok(txtBody.length > 40, 'Expected non-empty .txt quote');
        assert.match(txtBody, /COP/);
        assert.match(txtBody, /100/);
        assert.match(txtBody, /50/);
        assert.ok(txtBody.includes(copTotal), `Expected .txt export to contain total ${copTotal}`);

        const htmlOut = path.join(artifactsDir, 'quote-s1.html');
        await formatSelect.selectOption('html');
        await mockSaveDialog(app, htmlOut);
        await SEL.ToolsView.quoteSaveBtn(page).first().click();
        await SEL.Toasts.toastByTitle(page, /quote-s1\.html/i).waitFor({ state: 'visible' });
        await waitForFileOnDisk(htmlOut);
        const htmlBody = normalizeNbsp(fs.readFileSync(htmlOut, 'utf8'));
        assert.match(htmlBody, /<!DOCTYPE html>/i);
        assert.match(htmlBody, /<table/i);
        assert.ok(htmlBody.includes(copTotal), `Expected .html export to contain total ${copTotal}`);

        const checkCurrencyInQuote = async (code, rx) => {
          await SEL.TitleBar.navTab(page, 'settings').click();
          await SEL.SettingsView.currencyPill(page, code).click();
          await SEL.TitleBar.navTab(page, 'tools').first().click();
          await SEL.ToolsView.toolsTabQuote(page).first().click();
          await configureQuoteInputs(page, {
            rollIds: ['s1-pla', 's1-petg'],
            gramsList: [100, 50],
          });
          const formatted = await readQuoteTotal(page);
          assert.match(formatted, rx, `Expected ${code} quote format, got: ${formatted}`);
          assert.ok(parseMoneyAmount(formatted) > 0, `Expected positive ${code} quote total, got: ${formatted}`);
        };

        await checkCurrencyInQuote('USD', /(?:US\$|USD|\$)\s*[\d.]+,\d{2}/);
        await checkCurrencyInQuote('BRL', /(?:R\$|BRL)\s*[\d.]+,\d{2}/);

        for (const [lang, toolsLabel, quoteTabLabel, headingRx] of [
          ['en', 'Tools', '3D Quote', /3D Workshop Tools/i],
          ['pt', 'Ferramentas', 'Orçamento 3D', /Ferramentas da Oficina 3D/i],
          ['es', 'Herramientas', 'Cotizador 3D', /Herramientas del Taller 3D/i],
        ]) {
          await SEL.TitleBar.navTab(page, 'settings').click();
          const langSection = page.locator('div.rounded-2xl').filter({
            hasText: /Idioma de la interfaz|Idioma da interface|Interface Language|Language/i,
          });
          const langRx = { es: /Español/i, en: /English/i, pt: /Portugu[eê]s/i }[lang];
          await langSection.getByRole('button', { name: langRx }).click();
          const tab = SEL.TitleBar.navTab(page, 'tools').first();
          assert.equal(normalizeNbsp(await tab.textContent()), toolsLabel);
          await tab.click();
          const quoteSubTab = SEL.ToolsView.toolsTabQuote(page).first();
          await quoteSubTab.waitFor({ state: 'visible' });
          assert.equal(normalizeNbsp(await quoteSubTab.textContent()), quoteTabLabel);
          const toolsBody = normalizeNbsp(await page.locator('main, div.workbench-bg').first().innerText());
          assert.match(toolsBody, headingRx);
        }

        assertNoExternalNetworkRequests(ctx);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T4-S2',
    tier: 4,
    tag: 'v2',
    feature: 'F8+F10',
    name: 'Scenario S2: Batch Slicer Feasibility Check Across .gcode + Multi-Plate Bit-3 .3mf -> Quote & Inbox',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({
        reducedMotion: true,
        blockExternalNetwork: true,
        signal,
      });
      try {
        const { app, page, artifactsDir } = ctx;
        await skipOnboardingFast(page);

        const invPla = makeRoll({
          id: 's2-pla',
          brand: 'Anycubic',
          material: 'PLA',
          colorName: 'Naranja S2',
          colorHex: '#F2754E',
          initialWeight: 1000,
          remainingWeight: 120,
          price: 80000,
        });
        const invPetg = makeRoll({
          id: 's2-petg',
          brand: 'Prusament',
          material: 'PETG',
          colorName: 'Azul S2',
          colorHex: '#2563EB',
          initialWeight: 1000,
          remainingWeight: 40,
          price: 110000,
        });
        await resetDbState(page, { rolls: [invPla, invPetg] });

        const gcodePath = path.join(artifactsDir, 'single_part.gcode');
        fs.writeFileSync(
          gcodePath,
          createValidGcode({
            slicer: 'orca',
            models: ['Clip.stl'],
            slots: [{ grams: 70, colorHex: '#F2754E', material: 'PLA', brand: 'Anycubic' }],
            printTime: '1h 10m 0s',
          }),
          'utf8',
        );

        const threemfPath = path.join(artifactsDir, 'multi_plate_bit3.3mf');
        fs.writeFileSync(
          threemfPath,
          createValid3mfBuffer(
            [
              {
                models: ['Tray_P1.stl'],
                slots: [{ grams: 60, colorHex: '#F2754E', material: 'PLA', brand: 'Anycubic' }],
                printTime: '1h 00m 0s',
              },
              {
                models: ['Tray_P2.stl'],
                slots: [{ grams: 55, colorHex: '#2563EB', material: 'PETG', brand: 'Prusament' }],
                printTime: '0h 50m 0s',
              },
            ],
            { useDataDescriptor: true },
          ),
        );

        await SEL.TitleBar.navTab(page, 'tools').first().click();
        await SEL.ToolsView.toolsTabBatch(page).first().click();

        await mockOpenDialog(app, [gcodePath, threemfPath]);
        await SEL.ToolsView.batchSelectFilesBtn(page).first().click();

        const mainArea = page.locator('main, div.workbench-bg').first();
        await mainArea.getByText(/Clip/i).first().waitFor({ state: 'visible' });
        await mainArea.getByText(/Tray_P1/i).first().waitFor({ state: 'visible' });
        await mainArea.getByText(/Tray_P2/i).first().waitFor({ state: 'visible' });
        assert.equal(await mainArea.locator('tbody tr').count(), 3, 'Expected 3 batch rows (Clip, Tray_P1, Tray_P2)');
        const batchText = normalizeNbsp(await mainArea.innerText());
        assert.match(batchText, /185([.,]0)?\s*g/);
        assert.match(
          batchText,
          /Faltan 10[.,]0 g.*Naranja S2.*130[.,]0 g.*120[.,]0 g/i,
          `Expected combined PLA shortage (130g vs 120g -> 10.0g), got: ${batchText}`,
        );
        assert.match(
          batchText,
          /Faltan 15[.,]0 g.*Azul S2.*55[.,]0 g.*40[.,]0 g/i,
          `Expected PETG shortage (55g vs 40g -> 15.0g), got: ${batchText}`,
        );

        await SEL.ToolsView.batchSendQuoteBtn(page).first().click();
        await SEL.ToolsView.toolsTabQuote(page).first().waitFor({ state: 'visible' });
        const quoteTotal = await readQuoteTotal(page);
        assert.ok(parseMoneyAmount(quoteTotal) > 0, `Expected positive quote total from batch, got: ${quoteTotal}`);
        const quoteHours = page
          .locator('label', { hasText: /^(Horas|Hours)$/i })
          .locator('xpath=ancestor::div[1]')
          .locator('input[type="number"]')
          .first();
        assert.equal(await quoteHours.inputValue(), '3');
        assert.match(normalizeNbsp(await mainArea.innerText()), /Material\s*\(185[.,]0\s*g\)/i);

        await SEL.ToolsView.toolsTabBatch(page).first().click();
        await mainArea.getByText(/Clip/i).first().waitFor({ state: 'visible' });
        await SEL.ToolsView.batchSendInboxBtn(page).first().click();
        await SEL.Toasts.toastByTitle(page, /3 trabajo.*enviado|3 job.*sent|3 trabalho.*enviado/i).waitFor({
          state: 'visible',
        });

        await SEL.TitleBar.navTab(page, 'inbox').click();
        await SEL.InboxView.inboxHeading(page).waitFor({ state: 'visible' });
        const inboxText = normalizeNbsp(await mainArea.innerText());
        assert.match(inboxText, /Clip/i);
        assert.match(inboxText, /Tray_P1/i);
        assert.match(inboxText, /Tray_P2/i);
        assert.match(inboxText, /Faltan/i);

        assertNoExternalNetworkRequests(ctx);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T4-S3',
    tier: 4,
    tag: 'v1',
    feature: 'F3+F5+F6+F7',
    name: 'Scenario S3: Full Inventory Restock Lifecycle (3x Deductions -> Pedir ya -> Shopping -> Recibido -> Stats)',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({ reducedMotion: true, signal });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({
          id: 't4-s3-roll',
          brand: 'Anycubic',
          material: 'PLA',
          colorName: 'Turquesa Taller',
          colorHex: '#0d9488',
          initialWeight: 1000,
          remainingWeight: 1000,
          price: 80000,
          deliveryDays: 6,
        });
        await resetDbState(page, { rolls: [roll] });

        const logViaQuickUse = async (grams, note) => {
          const card = SEL.SpoolCard.cardByName(page, 'Turquesa Taller').first();
          await card.waitFor({ state: 'visible' });
          await SEL.SpoolCard.cardQuickUseBtn(card, 'Otro').click();
          const qModal = SEL.QuickUseModal.modal(page);
          await qModal.waitFor({ state: 'visible' });
          await SEL.QuickUseModal.gramsInput(qModal).fill(String(grams));
          await SEL.QuickUseModal.noteInput(qModal).fill(note);
          await SEL.QuickUseModal.submitBtn(qModal).click();
          await qModal.waitFor({ state: 'hidden' });
        };

        await logViaQuickUse(350, 'Lote estructural 1');
        await logViaQuickUse(350, 'Lote estructural 2');
        await logViaQuickUse(220, 'Lote estructural 3');

        const criticalCard = SEL.SpoolCard.cardByName(page, 'Turquesa Taller').first();
        await page.waitForFunction(() => {
          const el = document.querySelector('[role="button"][aria-label*="Turquesa Taller"]');
          return el && el.getAttribute('aria-label')?.includes('80 g restantes');
        });
        await SEL.SpoolCard.cardCriticalBadge(criticalCard).waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await SEL.ShelfView.lowStockToggle(page).textContent()), /1/);

        await SEL.TitleBar.navTab(page, 'replenish').click();
        await SEL.ReplenishmentView.tab(page, /Pedir ya/i).click();
        const urgentGroup = replenishGroupCard(page, 'Turquesa Taller');
        await urgentGroup.waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await urgentGroup.innerText()), /Pedir ya/i);

        await SEL.TitleBar.navTab(page, 'shopping').click();
        const sugBtn = SEL.ShoppingView.suggestionButtons(page).filter({ hasText: 'Turquesa Taller' }).first();
        await sugBtn.waitFor({ state: 'visible' });
        await sugBtn.click();

        const row = SEL.ShoppingView.rowByText(page, 'Turquesa Taller');
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
          .locator('[role="button"][aria-label*="Turquesa Taller"][aria-label*="1 kg restantes"]')
          .first()
          .waitFor({ state: 'visible' });
        const backedLow = page
          .locator('[role="button"][aria-label*="Turquesa Taller"][aria-label*="80 g restantes"]')
          .first();
        await SEL.SpoolCard.cardBackupBadge(backedLow).first().waitFor({ state: 'visible' });

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
          /\$\s*86\.400/,
        );

        await SEL.TitleBar.navTab(page, 'replenish').click();
        await SEL.ReplenishmentView.tab(page, /Todos/i).click();
        const updatedGroup = replenishGroupCard(page, 'Turquesa Taller');
        await updatedGroup.waitFor({ state: 'visible' });
        const updatedText = normalizeNbsp(await updatedGroup.innerText());
        assert.match(updatedText, /2 rollos en total/i);
        assert.match(updatedText, /Con tiempo/i);

        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T4-S4',
    tier: 4,
    tag: 'v1',
    feature: 'F3+F4+F5+F6',
    name: 'Scenario S4: Large Inventory (260 Spools) Search, Material/Brand Filter, Sort, Scroll, Deduct & Undo',
    timeoutMs: 120_000,
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({
        reducedMotion: true,
        timeoutMs: 30_000,
        signal,
      });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const largeRolls = createLargeInventoryRolls(260);
        await resetDbState(page, { rolls: largeRolls });

        const count260 = SEL.ShelfView.resultsCount(page).filter({ hasText: '260 de 260 rollos' });
        await count260.waitFor({ state: 'visible', timeout: 30_000 });

        const searchInput = SEL.TitleBar.searchInput(page);
        await searchInput.fill('Negro Clásico');
        await SEL.ShelfView.resultsCount(page)
          .filter({ hasText: /^22 de 260 rollos$/i })
          .waitFor({ state: 'visible' });

        await searchInput.fill('');
        await count260.waitFor({ state: 'visible' });

        await SEL.ShelfView.filtersToggle(page).click();
        await SEL.ShelfView.materialPill(page, 'PLA').click();
        await SEL.ShelfView.brandPill(page, 'Anycubic').click();

        const filteredText = normalizeNbsp(await SEL.ShelfView.resultsCount(page).textContent());
        const filteredMatch = filteredText.match(/^(\d+) de 260 rollos$/i);
        assert.ok(filteredMatch && Number(filteredMatch[1]) > 0 && Number(filteredMatch[1]) < 260, filteredText);

        await SEL.ShelfView.resetFiltersBtn(page).click();
        await count260.waitFor({ state: 'visible' });

        await SEL.ShelfView.sortBtn(page, 'remaining').click();
        await SEL.ShelfView.sortBtn(page, 'remaining').click();
        await SEL.ShelfView.sortBtn(page, 'price').click();
        await count260.waitFor({ state: 'visible' });

        for (const targetTop of [2000, 5000, 0]) {
          await page.evaluate((top) => {
            const scroller = document.querySelector('div.flex-1.overflow-y-auto.workbench-bg');
            if (!scroller) throw new Error('Shelf scroll container not found');
            scroller.scrollTop = top;
            scroller.dispatchEvent(new Event('scroll'));
          }, targetTop);
          await page.waitForTimeout(100);
        }

        await searchInput.fill('Rollo principal');
        await SEL.ShelfView.resultsCount(page)
          .filter({ hasText: /^1 de 260 rollos$/i })
          .waitFor({ state: 'visible' });

        await page.waitForFunction(
          () => document.querySelectorAll('[role="button"][aria-label^="Bobina "]').length === 1,
          null,
          { timeout: 15_000 },
        );
        const primaryCard = page
          .locator('[role="button"][aria-label^="Bobina Negro Clásico de Anycubic PLA,"]')
          .first();
        await primaryCard.waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await primaryCard.getAttribute('aria-label')), /850 g restantes/i);

        await SEL.SpoolCard.cardQuickUseBtn(primaryCard, '-25g').click();
        await page.waitForFunction(() => {
          const el = document.querySelector(
            '[role="button"][aria-label^="Bobina Negro Clásico de Anycubic PLA,"]',
          );
          return el && el.getAttribute('aria-label')?.includes('825 g restantes');
        });

        const undoBtn = SEL.Toasts.toastUndoBtn(page).first();
        await undoBtn.waitFor({ state: 'visible' });
        await undoBtn.click();
        await page.waitForFunction(() => {
          const el = document.querySelector(
            '[role="button"][aria-label^="Bobina Negro Clásico de Anycubic PLA,"]',
          );
          return el && el.getAttribute('aria-label')?.includes('850 g restantes');
        });

        await searchInput.fill('');
        await count260.waitFor({ state: 'visible' });

        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T4-S5',
    tier: 4,
    tag: 'v1',
    feature: 'F2+F3+F5+F9',
    name: 'Scenario S5: Offline SQLite .db Backup & Disaster Recovery Restore Across Cold Restart',
    timeoutMs: 120_000,
    run: async ({ signal }) => {
      const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-e2e-s5-ud-'));
      const la = fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-e2e-s5-la-'));
      const art = fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-e2e-s5-art-'));

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
        await page.waitForFunction(
          async () => {
            const r = await window.filoteca.db.load();
            return r?.ok && r.data.settings.seeded === true && r.data.rolls.length > 0;
          },
          null,
          { timeout: 15_000 },
        );
        const seedCount = await page.evaluate(async () => {
          const r = await window.filoteca.db.load();
          return r.data.rolls.length;
        });
        assert.ok(seedCount >= 15, `Expected seeded rolls >= 15, got ${seedCount}`);
        await SEL.ShelfView.resultsCount(page)
          .filter({ hasText: `${seedCount} de ${seedCount} rollos` })
          .waitFor({ state: 'visible' });

        await SEL.TitleBar.newRollBtn(page).click();
        const form = SEL.RollEditorModal.form(page);
        await form.waitFor({ state: 'visible' });
        await SEL.RollEditorModal.brandInput(form).fill('Polymaker');
        await SEL.RollEditorModal.materialSelect(form).selectOption('PETG');
        await SEL.RollEditorModal.colorNameInput(form).fill('Verde Rescate');
        await SEL.RollEditorModal.colorHexInput(form).fill('#10b981');
        await SEL.RollEditorModal.initialWeightInput(form).fill('1000');
        await SEL.RollEditorModal.remainingWeightInput(form).fill('1000');
        await SEL.RollEditorModal.priceInput(form).fill('95000');
        await SEL.RollEditorModal.submitBtn(form).click();
        await form.waitFor({ state: 'hidden' });

        const expectedPlusOne = `${seedCount + 1} de ${seedCount + 1} rollos`;
        await SEL.ShelfView.resultsCount(page).filter({ hasText: expectedPlusOne }).waitFor({
          state: 'visible',
        });

        const customCard = SEL.SpoolCard.cardByName(page, 'Verde Rescate').first();
        await customCard.waitFor({ state: 'visible' });
        await SEL.SpoolCard.cardQuickUseBtn(customCard, '-50g').click();
        await page.waitForFunction(() => {
          const el = document.querySelector('[role="button"][aria-label*="Verde Rescate"]');
          return el && el.getAttribute('aria-label')?.includes('950 g restantes');
        });

        await SEL.TitleBar.navTab(page, 'settings').click();
        await SEL.SettingsView.themeBtn(page, 'dark').click();
        await SEL.SettingsView.currencyPill(page, 'USD').click();
        await page.waitForTimeout(300);

        const backupDbPath = path.join(art, 'workshop-disaster-backup.db');
        await mockSaveDialog(app, backupDbPath);
        await SEL.SettingsView.backupDbBtn(page).click();
        await SEL.Toasts.toastByTitle(page, /Copia de seguridad guardada/i).waitFor({
          state: 'visible',
        });
        assert.equal(fs.existsSync(backupDbPath), true);
        assert.ok(fs.statSync(backupDbPath).size > 4096, 'Expected valid non-trivial SQLite .db backup');

        // Disaster: delete custom roll, wipe seed data, reset theme/currency
        await SEL.TitleBar.navTab(page, 'shelf').click();
        const delCard = SEL.SpoolCard.cardByName(page, 'Verde Rescate').first();
        await delCard.hover();
        await SEL.SpoolCard.cardQuickMenuBtn(delCard).click({ force: true });
        await SEL.SpoolCard.portalMenuItem(page, 'delete').click();
        await SEL.ShelfView.resultsCount(page)
          .filter({ hasText: `${seedCount} de ${seedCount} rollos` })
          .waitFor({ state: 'visible' });

        await SEL.TitleBar.navTab(page, 'settings').click();
        await SEL.SettingsView.clearSeedBtn(page).click();
        await SEL.SettingsView.themeBtn(page, 'light').click();
        await SEL.SettingsView.currencyPill(page, 'COP').click();
        assert.equal(
          await page.evaluate(() => document.documentElement.classList.contains('dark')),
          false,
        );

        await SEL.TitleBar.navTab(page, 'shelf').click();
        await SEL.ShelfView.emptyAddBtn(page).waitFor({ state: 'visible' });

        // Recovery: restore SQLite .db
        await SEL.TitleBar.navTab(page, 'settings').click();
        await mockOpenDialog(app, backupDbPath);
        await SEL.SettingsView.restoreDbBtn(page).click();
        await SEL.Toasts.toastByTitle(page, /Copia de seguridad restaurada/i).waitFor({
          state: 'visible',
        });

        await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
        await page.waitForTimeout(350);
        assertNoPageErrors(ctx1);
        await ctx1.close();
        ctx1 = null;

        // Cold restart on same FILOTECA_USERDATA
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

        await SEL.ShelfView.resultsCount(page2).filter({ hasText: expectedPlusOne }).waitFor({
          state: 'visible',
        });
        const restoredCard = SEL.SpoolCard.cardByName(page2, 'Verde Rescate').first();
        await restoredCard.waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await restoredCard.getAttribute('aria-label')), /950 g restantes/i);
        assert.match(
          normalizeNbsp(await SEL.SpoolCard.cardPrice(restoredCard).textContent()),
          /(?:US\$|USD|\$)\s*95\.000,00/,
        );

        await restoredCard.click();
        const detail = SEL.RollDetailModal.modal(page2);
        await detail.waitFor({ state: 'visible' });
        const detailText = normalizeNbsp(await detail.innerText());
        assert.match(detailText, /Historial de impresiones \(1\)/i);
        assert.match(detailText, /-50g/);
        await SEL.RollDetailModal.closeBtn(detail).click();

        const dbRes = await page2.evaluate(() => window.filoteca.db.load());
        assert.equal(dbRes.data.settings.currency, 'USD');
        assert.equal(dbRes.data.settings.theme, 'dark');

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
    id: 'T4-S6',
    tier: 4,
    tag: 'v1',
    feature: 'F5+F8',
    name: 'Scenario S6: Multi-Slicer Workshop Day (Anycubic .metadata + Orca .gcode + .3mf -> Print, 40% Fail, Discard)',
    timeoutMs: 90_000,
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({ reducedMotion: true, signal });
      try {
        const { app, page, localAppDataDir, artifactsDir } = ctx;
        await skipOnboardingFast(page);

        const rollAnycubic = makeRoll({
          id: 's6-anycubic',
          brand: 'Anycubic',
          material: 'PLA',
          colorName: 'Negro Mate',
          colorHex: '#212721',
          initialWeight: 1000,
          remainingWeight: 500,
        });
        const rollOrca = makeRoll({
          id: 's6-orca',
          brand: 'Anycubic',
          material: 'PLA',
          colorName: 'Naranja Orca',
          colorHex: '#F2754E',
          initialWeight: 1000,
          remainingWeight: 500,
        });
        const roll3mf = makeRoll({
          id: 's6-3mf',
          brand: 'Prusament',
          material: 'PETG',
          colorName: 'Azul 3MF',
          colorHex: '#2563EB',
          initialWeight: 1000,
          remainingWeight: 500,
        });
        await resetDbState(page, { rolls: [rollAnycubic, rollOrca, roll3mf] });
        await page.waitForTimeout(400);

        // 1. Anycubic .metadata via isolated temp watcher
        const anycubicDir = path.join(localAppDataDir, 'Temp', 'anycubicslicer_model');
        fs.mkdirSync(anycubicDir, { recursive: true });
        const metaTmp = path.join(anycubicDir, 'day_anycubic.gcode.metadata.tmp');
        const metaPath = path.join(anycubicDir, 'day_anycubic.gcode.metadata');
        fs.writeFileSync(
          metaTmp,
          createAnycubicMetadata({
            models: ['Soporte_Anycubic.stl'],
            slots: [
              {
                grams: 18.4,
                colorHex: '#212721',
                material: 'PLA',
                brand: 'Anycubic',
                finish: 'glossy',
              },
              {
                grams: 0,
                colorHex: '#FFFFFF',
                material: 'PLA',
                brand: 'Anycubic',
                finish: 'glossy',
              },
            ],
            includeThumbnail: true,
          }),
          'utf8',
        );
        fs.renameSync(metaTmp, metaPath);

        // 2. Orca .gcode via isolated temp watcher
        const orcaDir = path.join(localAppDataDir, 'Temp', 'orcaslicer_model');
        fs.mkdirSync(orcaDir, { recursive: true });
        const orcaTmp = path.join(orcaDir, 'day_orca.gcode.tmp');
        const orcaPath = path.join(orcaDir, 'day_orca.gcode');
        fs.writeFileSync(
          orcaTmp,
          createValidGcode({
            slicer: 'orca',
            models: ['Carcasa_Orca.stl'],
            slots: [{ grams: 42.5, colorHex: '#F2754E', material: 'PLA', brand: 'Anycubic' }],
            printTime: '1h 30m 0s',
            includeThumbnail: '300x300',
          }),
          'utf8',
        );
        fs.renameSync(orcaTmp, orcaPath);

        // 3. .3mf via second-instance CLI ingestion (exercises Central-Directory ZIP + thumbnails)
        const threeMfPath = path.join(artifactsDir, 'day_project.3mf');
        fs.writeFileSync(
          threeMfPath,
          createValid3mfBuffer([
            {
              models: ['Engranaje_3MF.stl'],
              slots: [{ grams: 30, colorHex: '#2563EB', material: 'PETG', brand: 'Prusament' }],
              printTime: '1h 05m 0s',
              includeThumbnail: true,
            },
          ]),
        );
        await emitSecondInstanceFile(app, threeMfPath);

        await SEL.InboxView.drawer(page).waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForFunction(() => {
          const inboxBtn = Array.from(document.querySelectorAll('header nav button')).find((b) =>
            /Bandeja|Slicer Tray/i.test(b.textContent || ''),
          );
          const badge = inboxBtn?.querySelectorAll('span')?.[1];
          return badge && badge.textContent?.trim() === '3';
        }, null, { timeout: 15_000 });

        await SEL.InboxView.drawerReviewBtn(page).click();
        await SEL.InboxView.inboxHeading(page).waitFor({ state: 'visible' });

        const anycubicCard = SEL.InboxView.jobCard(page, /Soporte_Anycubic|day_anycubic/i);
        const orcaCard = SEL.InboxView.jobCard(page, /Carcasa_Orca|day_orca/i);
        const threeMfCard = SEL.InboxView.jobCard(page, /Engranaje_3MF|day_project/i);
        await anycubicCard.waitFor({ state: 'visible' });
        await orcaCard.waitFor({ state: 'visible' });
        await threeMfCard.waitFor({ state: 'visible' });

        // Verify thumbnails loaded via filoteca-media:// & color match badges appear
        for (const card of [anycubicCard, orcaCard, threeMfCard]) {
          assert.match(normalizeNbsp(await card.innerText()), /(Match exacto|Match bueno|Sugerido)/i);
          const img = card.locator('img').first();
          assert.ok((await img.count()) > 0, 'Expected thumbnail <img> element on Inbox job card');
          await img.waitFor({ state: 'visible' });
          await page.waitForFunction(
            (el) => Boolean(el && el.complete && el.naturalWidth > 0),
            await img.elementHandle(),
          );
        }

        // Job 1 (Anycubic 18.4g) -> Lo imprimí
        await SEL.InboxView.slotRollSelect(anycubicCard, 0).selectOption('s6-anycubic');
        await SEL.InboxView.printBtn(anycubicCard).click();
        await SEL.Toasts.toastByTitle(page, /Impresión registrada/i).waitFor({ state: 'visible' });

        // Job 2 (Orca 42.5g) -> Falló / parcial at 40% (17g)
        await SEL.InboxView.slotRollSelect(orcaCard, 0).selectOption('s6-orca');
        await SEL.InboxView.partialFailBtn(orcaCard).click();
        const failedModal = SEL.InboxView.failedModal(page);
        await failedModal.waitFor({ state: 'visible' });
        const range = SEL.InboxView.failedPercentRange(failedModal);
        await range.focus();
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowLeft');
        await failedModal.getByText('40%').waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await failedModal.innerText()), /17\s*g/);
        await SEL.InboxView.failedConfirmBtn(failedModal).click();
        await failedModal.waitFor({ state: 'hidden' });

        // Job 3 (.3mf 30g) -> No lo imprimí
        await SEL.InboxView.discardBtn(threeMfCard).click();

        // Verify Inbox tab counts
        const tabBarText = normalizeNbsp(await page.locator('div.bg-surface-2.p-1.rounded-xl').innerText());
        assert.match(tabBarText, /Impresos\s*1/);
        assert.match(tabBarText, /Fallidos\s*1/);
        assert.match(tabBarText, /Descartados\s*1/);
        assert.match(tabBarText, /Todos\s*3/);

        // Verify Shelf weights & RollDetailModal histories
        await SEL.TitleBar.navTab(page, 'shelf').click();

        const c1 = SEL.SpoolCard.cardByName(page, 'Negro Mate').first();
        await c1.waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await c1.getAttribute('aria-label')), /482 g restantes/i);
        await c1.locator('h3').first().click();
        const d1 = SEL.RollDetailModal.modal(page);
        await d1.waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await d1.innerText()), /-18\.4g/);
        await SEL.RollDetailModal.closeBtn(d1).click();
        await d1.waitFor({ state: 'hidden' });

        const c2 = SEL.SpoolCard.cardByName(page, 'Naranja Orca').first();
        await c2.waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await c2.getAttribute('aria-label')), /483 g restantes/i);
        await c2.locator('h3').first().click();
        const d2 = SEL.RollDetailModal.modal(page);
        await d2.waitFor({ state: 'visible' });
        const d2Text = normalizeNbsp(await d2.innerText());
        assert.match(d2Text, /-17g/);
        assert.match(d2Text, /40%/);
        await SEL.RollDetailModal.closeBtn(d2).click();
        await d2.waitFor({ state: 'hidden' });

        const c3 = SEL.SpoolCard.cardByName(page, 'Azul 3MF').first();
        await c3.waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await c3.getAttribute('aria-label')), /500 g restantes/i);
        await c3.locator('h3').first().click();
        const d3 = SEL.RollDetailModal.modal(page);
        await d3.waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await d3.innerText()), /Historial de impresiones \(0\)/i);
        await SEL.RollDetailModal.closeBtn(d3).click();

        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },
];
