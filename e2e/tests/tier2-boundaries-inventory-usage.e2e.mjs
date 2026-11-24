import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertNoPageErrors,
  launchFiloteca,
  resetDbState,
  rmDirWithRetry,
  skipOnboardingFast,
  waitForAppReady,
} from '../lib/harness.mjs';
import { SEL, fieldByLabel, normalizeNbsp } from '../lib/selectors.mjs';

let sharedCtx = null;

export async function beforeAll() {
  sharedCtx = await launchFiloteca({ reducedMotion: true });
  await skipOnboardingFast(sharedCtx.page);
}

export async function afterAll() {
  if (sharedCtx) {
    await sharedCtx.close();
    sharedCtx = null;
  }
}

function makeRoll(overrides = {}) {
  const now = '2026-11-18T10:00:00.000Z';
  return {
    id: overrides.id ?? 'roll-t2-1',
    brand: overrides.brand ?? 'Anycubic',
    material: overrides.material ?? 'PLA',
    finish: overrides.finish ?? 'glossy',
    colorName: overrides.colorName ?? 'Negro Prueba',
    colorHex: overrides.colorHex ?? '#1f2023',
    diameter: overrides.diameter ?? 1.75,
    initialWeight: overrides.initialWeight ?? 1000,
    remainingWeight: overrides.remainingWeight ?? 1000,
    price: overrides.price ?? 68900,
    purchaseDate: overrides.purchaseDate ?? '2026-11-18',
    location: overrides.location ?? 'Estante A · 1',
    nozzleTemp: overrides.nozzleTemp ?? { min: 195, max: 220 },
    bedTemp: overrides.bedTemp ?? { min: 55, max: 65 },
    notes: overrides.notes ?? '',
    status: overrides.status ?? 'in_use',
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    deliveryDays: overrides.deliveryDays ?? 6,
  };
}

function daysAgoIso(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function dbLoad(page) {
  const res = await page.evaluate(() => window.filoteca.db.load());
  assert.equal(res.ok, true, `db.load failed: ${res?.error ?? 'unknown'}`);
  return res.data;
}

async function setRangeValue(locator, val) {
  await locator.evaluate((el, v) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(el, String(v));
    } else {
      el.value = String(v);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, val);
}

export const tests = [
  // =========================================================================
  // F1 / F2 Boundaries (10 tests: 7 v1, 3 v2)
  // =========================================================================
  {
    id: 'T2-F1-01',
    tier: 2,
    tag: 'v1',
    feature: 'F1',
    name: 'OnboardingModal blocks Escape across steps 1-5 and finish sets onboardingCompleted',
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({ reducedMotion: true, signal });
      try {
        const { page } = ctx;
        const modal = SEL.OnboardingModal.modal(page);
        await modal.waitFor({ state: 'visible' });

        for (let step = 1; step <= 5; step++) {
          const stepText = normalizeNbsp(await SEL.OnboardingModal.stepCounter(page).textContent());
          assert.match(stepText, new RegExp(`Filoteca · ${step} \\/ 5`));
          await page.keyboard.press('Escape');
          await page.waitForTimeout(150);
          assert.equal(await modal.isVisible(), true, `Escape closed modal on step ${step}`);
          if (step < 5) {
            await SEL.OnboardingModal.nextBtn(page).click();
            await modal
              .locator('span', { hasText: new RegExp(`Filoteca · ${step + 1} \\/ 5`) })
              .waitFor({ state: 'visible' });
          }
        }

        await SEL.OnboardingModal.finishBtn(page).click();
        await modal.waitFor({ state: 'hidden' });
        await page.waitForTimeout(250);

        const data = await dbLoad(page);
        assert.equal(data.settings.onboardingCompleted, true);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T2-F1-02',
    tier: 2,
    tag: 'v1',
    feature: 'F1',
    name: 'OnboardingModal blocks backdrop click across steps 1-5 and hides Back button on step 1',
    run: async ({ signal }) => {
      const ctx = await launchFiloteca({ reducedMotion: true, signal });
      try {
        const { page } = ctx;
        const modal = SEL.OnboardingModal.modal(page);
        await modal.waitFor({ state: 'visible' });

        assert.equal(await SEL.OnboardingModal.backBtn(page).count(), 0, 'Back button must be absent on step 1');
        await page.mouse.click(10, 10);
        await page.waitForTimeout(150);
        assert.equal(await modal.isVisible(), true, 'Backdrop click closed modal on step 1');

        // Advance to step 2 -> Back appears -> click Back -> returns to step 1 & Back disappears
        await SEL.OnboardingModal.nextBtn(page).click();
        await modal.locator('span', { hasText: /Filoteca · 2 \/ 5/ }).waitFor({ state: 'visible' });
        const backBtn = SEL.OnboardingModal.backBtn(page);
        await backBtn.waitFor({ state: 'visible' });
        assert.equal(await backBtn.isEnabled(), true);

        await backBtn.click();
        await modal.locator('span', { hasText: /Filoteca · 1 \/ 5/ }).waitFor({ state: 'visible' });
        assert.equal(await SEL.OnboardingModal.backBtn(page).count(), 0, 'Back button must disappear on step 1');

        // Advance through steps 2..5 checking backdrop click on each
        for (let step = 2; step <= 5; step++) {
          await SEL.OnboardingModal.nextBtn(page).click();
          await modal
            .locator('span', { hasText: new RegExp(`Filoteca · ${step} \\/ 5`) })
            .waitFor({ state: 'visible' });
          await page.mouse.click(10, 10);
          await page.waitForTimeout(120);
          assert.equal(await modal.isVisible(), true, `Backdrop click closed modal on step ${step}`);
        }

        await SEL.OnboardingModal.finishBtn(page).click();
        await modal.waitFor({ state: 'hidden' });
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T2-F2-01',
    tier: 2,
    tag: 'v1',
    feature: 'F2',
    name: 'Currency custom input handles empty, whitespace, lowercase uppercasing, and 6-char max',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'cur-1', colorName: 'Moneda Test', price: 68900 })],
      });

      const checkShelfNoNaN = async () => {
        await SEL.TitleBar.navTab(page, 'shelf').click();
        const card = SEL.SpoolCard.cardByName(page, 'Moneda Test').first();
        await card.waitFor({ state: 'visible' });
        const priceTxt = normalizeNbsp(await SEL.SpoolCard.cardPrice(card).textContent());
        assert.equal(/\b(?:NaN|Infinity|undefined)\b/i.test(priceTxt), false, `Invalid price text: ${priceTxt}`);
        assert.match(priceTxt, /68\.900,00/, `Expected formatted amount 68.900,00, got: ${priceTxt}`);
        return priceTxt;
      };

      await SEL.TitleBar.navTab(page, 'settings').click();
      const input = SEL.SettingsView.currencyCustomInput(page);
      await input.waitFor({ state: 'visible' });

      // Empty string
      await input.fill('');
      await page.waitForTimeout(200);
      assert.equal((await dbLoad(page)).settings.currency, '');
      await checkShelfNoNaN();

      // Whitespace-only
      await SEL.TitleBar.navTab(page, 'settings').click();
      await input.fill('   ');
      await page.waitForTimeout(200);
      assert.equal((await dbLoad(page)).settings.currency, '   ');
      await checkShelfNoNaN();

      // Lowercase 'usd' -> 'USD'
      await SEL.TitleBar.navTab(page, 'settings').click();
      await input.fill('usd');
      assert.equal(await input.inputValue(), 'USD');
      await page.waitForTimeout(200);
      assert.equal((await dbLoad(page)).settings.currency, 'USD');
      const usdPrice = await checkShelfNoNaN();
      assert.match(usdPrice, /^(?:US\$|USD|\$)\s*68\.900,00$/);

      // 8 chars 'ABCDEFGH' -> truncated to 6 chars 'ABCDEF'
      await SEL.TitleBar.navTab(page, 'settings').click();
      await input.fill('');
      await input.pressSequentially('abcdefgh');
      assert.equal(await input.inputValue(), 'ABCDEF');
      await page.waitForTimeout(200);
      assert.equal((await dbLoad(page)).settings.currency, 'ABCDEF');
      const customPrice = await checkShelfNoNaN();
      assert.match(customPrice, /^ABCDEF\s*68\.900,00$/);

      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F2-02',
    tier: 2,
    tag: 'v1',
    feature: 'F2',
    name: 'Currency $ alias matches COP 0-decimal parity and parsePriceInput parses $ 89.900 & 89.900,50',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, { rolls: [] });

      // Select '$' quick pill
      await SEL.TitleBar.navTab(page, 'settings').click();
      await SEL.SettingsView.currencyPill(page, '$').click();
      await page.waitForTimeout(200);
      assert.equal((await dbLoad(page)).settings.currency, '$');

      // Create roll via RollEditorModal with '$ 89.900'
      await SEL.TitleBar.navTab(page, 'shelf').click();
      await SEL.ShelfView.emptyAddBtn(page).click();
      const form = SEL.RollEditorModal.form(page);
      await form.waitFor({ state: 'visible' });
      await SEL.RollEditorModal.brandInput(form).fill('Anycubic');
      await SEL.RollEditorModal.colorNameInput(form).fill('Alias Peso');
      await SEL.RollEditorModal.priceInput(form).fill('$ 89.900');
      await SEL.RollEditorModal.submitBtn(form).click();
      await form.waitFor({ state: 'hidden' });

      const afterCreate = await dbLoad(page);
      assert.equal(afterCreate.rolls.length, 1);
      assert.equal(afterCreate.rolls[0].price, 89900);

      const card = SEL.SpoolCard.cardByName(page, 'Alias Peso').first();
      const copAliasPrice = normalizeNbsp(await SEL.SpoolCard.cardPrice(card).textContent());
      assert.match(copAliasPrice, /^\$\s*89\.900$/);

      // Edit roll with '89.900,50' and switch to USD/EUR to assert 2 decimals
      await SEL.SpoolCard.cardQuickMenuBtn(card).click({ force: true });
      await SEL.SpoolCard.portalMenuItem(page, 'edit').click();
      await form.waitFor({ state: 'visible' });
      await SEL.RollEditorModal.priceInput(form).fill('89.900,50');
      await SEL.RollEditorModal.submitBtn(form).click();
      await form.waitFor({ state: 'hidden' });

      const afterEdit = await dbLoad(page);
      assert.equal(afterEdit.rolls[0].price, 89900.5);

      await SEL.TitleBar.navTab(page, 'settings').click();
      await SEL.SettingsView.currencyPill(page, 'USD').click();
      await SEL.TitleBar.navTab(page, 'shelf').click();
      const usdPrice = normalizeNbsp(await SEL.SpoolCard.cardPrice(card).textContent());
      assert.match(usdPrice, /^(?:US\$|USD|\$)\s*89\.900,50$/);

      await SEL.TitleBar.navTab(page, 'settings').click();
      await SEL.SettingsView.currencyPill(page, 'EUR').click();
      await SEL.TitleBar.navTab(page, 'shelf').click();
      const eurPrice = normalizeNbsp(await SEL.SpoolCard.cardPrice(card).textContent());
      assert.match(eurPrice, /^(?:EUR|€)\s*89\.900,50$/);

      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F2-03',
    tier: 2,
    tag: 'v2',
    feature: 'F2',
    name: 'BRL quick pill in SettingsView formats 0, 0.05, and 1234.56 with 2 decimals in Shelf and Stats',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [
          makeRoll({ id: 'brl-0', colorName: 'BRL Cero', price: 0 }),
          makeRoll({ id: 'brl-005', colorName: 'BRL Centavos', price: 0.05 }),
          makeRoll({ id: 'brl-1234', colorName: 'BRL Miles', price: 1234.56 }),
        ],
      });

      await SEL.TitleBar.navTab(page, 'settings').click();
      const brlPill = SEL.SettingsView.currencyPill(page, 'BRL');
      await brlPill.waitFor({ state: 'visible' });
      await brlPill.click();
      await page.waitForTimeout(200);
      assert.equal((await dbLoad(page)).settings.currency, 'BRL');

      await SEL.TitleBar.navTab(page, 'shelf').click();
      const p0 = normalizeNbsp(
        await SEL.SpoolCard.cardPrice(SEL.SpoolCard.cardByName(page, 'BRL Cero').first()).textContent(),
      );
      const p005 = normalizeNbsp(
        await SEL.SpoolCard.cardPrice(SEL.SpoolCard.cardByName(page, 'BRL Centavos').first()).textContent(),
      );
      const p1234 = normalizeNbsp(
        await SEL.SpoolCard.cardPrice(SEL.SpoolCard.cardByName(page, 'BRL Miles').first()).textContent(),
      );
      assert.match(p0, /^(?:R\$|BRL)\s*0,00$/);
      assert.match(p005, /^(?:R\$|BRL)\s*0,05$/);
      assert.match(p1234, /^(?:R\$|BRL)\s*1\.234,56$/);

      await SEL.TitleBar.navTab(page, 'stats').click();
      const invValue = normalizeNbsp(
        await SEL.StatsView.kpiValueText(SEL.StatsView.kpiInventoryValue(page)).textContent(),
      );
      assert.match(invValue, /^(?:R\$|BRL)\s*1\.234,61$/);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F2-04',
    tier: 2,
    tag: 'v2',
    feature: 'F2',
    name: 'Decimal-safe workshopPrefs rates (0.001 kWh rate) persist in Settings/Tools across reload without NaN',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'wp-1', colorName: 'Taller Rate', price: 75000 })],
      });

      const quoteRateLocator = () =>
        page
          .locator('[data-testid="workshop-electricity-rate"], [data-testid="quote-electricity-rate"]')
          .or(
            page
              .locator('label', { hasText: /Tarifa el[eé]ctrica|Electricity rate|Tarifa de energia|\bkWh\b/i })
              .locator('xpath=ancestor::div[1]')
              .locator('input[type="number"]'),
          )
          .first();

      await SEL.TitleBar.navTab(page, 'tools').click();
      await SEL.ToolsView.toolsTabQuote(page).first().click();
      const quoteRate = quoteRateLocator();
      await quoteRate.waitFor({ state: 'visible' });
      await quoteRate.fill('0.001');

      const saveDefaultsBtn = page.getByRole('button', {
        name: /(Fijar tarifas del taller|Set workshop defaults|Fixar tarifas padrão)/i,
      });
      await saveDefaultsBtn.waitFor({ state: 'visible' });
      await saveDefaultsBtn.click();
      await SEL.Toasts.toastByTitle(
        page,
        /(Tarifas del taller actualizadas|Workshop defaults updated|Tarifas padrão atualizadas)/i,
      ).waitFor({ state: 'visible' });

      const beforeReload = await dbLoad(page);
      assert.equal(beforeReload.settings.workshopPrefs?.electricityRatePerKwh, 0.001);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);

      const data = await dbLoad(page);
      assert.equal(data.settings.workshopPrefs?.electricityRatePerKwh, 0.001);

      await SEL.TitleBar.navTab(page, 'tools').click();
      await SEL.ToolsView.toolsTabQuote(page).first().click();
      const reloadedRate = quoteRateLocator();
      await reloadedRate.waitFor({ state: 'visible' });
      assert.equal(await reloadedRate.inputValue(), '0.001');

      const bodyText = await page.locator('body').innerText();
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(bodyText), false);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F2-05',
    tier: 2,
    tag: 'v2',
    feature: 'F2',
    name: 'SettingsView v2.0.0 footer and BRL/COP/USD/EUR edge amounts (0, 0.05) across es/en/pt',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [
          makeRoll({ id: 'edge-0', colorName: 'Edge Cero', price: 0 }),
          makeRoll({ id: 'edge-005', colorName: 'Edge Cinco', price: 0.05 }),
        ],
      });

      await SEL.TitleBar.navTab(page, 'settings').click();
      const footerText = normalizeNbsp(await SEL.SettingsView.versionFooter(page).textContent());
      assert.match(footerText, /Filoteca v2\.0\.0/);

      const checks = [
        { lang: 'es', cur: 'COP', zeroRx: /^\$\s*0$/, smallRx: /^\$\s*0$/ },
        { lang: 'en', cur: 'USD', zeroRx: /^(?:US\$|USD|\$)\s*0[.,]00$/, smallRx: /^(?:US\$|USD|\$)\s*0[.,]05$/ },
        { lang: 'pt', cur: 'BRL', zeroRx: /^(?:R\$|BRL)\s*0[.,]00$/, smallRx: /^(?:R\$|BRL)\s*0[.,]05$/ },
        { lang: 'es', cur: 'EUR', zeroRx: /^(?:EUR|€)\s*0[.,]00$/, smallRx: /^(?:EUR|€)\s*0[.,]05$/ },
      ];

      for (const { lang, cur, zeroRx, smallRx } of checks) {
        await SEL.TitleBar.navTab(page, 'settings').click();
        await SEL.SettingsView.langBtn(page, lang).click();
        await SEL.SettingsView.currencyPill(page, cur).click();
        await SEL.TitleBar.navTab(page, 'shelf').click();

        const txt0 = normalizeNbsp(
          await SEL.SpoolCard.cardPrice(SEL.SpoolCard.cardByName(page, 'Edge Cero').first()).textContent(),
        );
        const txt005 = normalizeNbsp(
          await SEL.SpoolCard.cardPrice(SEL.SpoolCard.cardByName(page, 'Edge Cinco').first()).textContent(),
        );
        assert.match(txt0, zeroRx, `${lang}/${cur} 0 mismatch: ${txt0}`);
        assert.match(txt005, smallRx, `${lang}/${cur} 0.05 mismatch: ${txt005}`);
        assert.equal(/\b(?:NaN|Infinity)\b/i.test(txt0 + ' ' + txt005), false);
      }
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F2-06',
    tier: 2,
    tag: 'v1',
    feature: 'F2',
    timeoutMs: 120_000,
    name: 'Theme (dark and light) persists across full Electron cold restarts',
    run: async ({ signal }) => {
      const persistentUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-e2e-theme-'));
      try {
        // Launch 1: set dark
        const ctx1 = await launchFiloteca({ userDataDir: persistentUserData, reducedMotion: true, signal });
        try {
          await skipOnboardingFast(ctx1.page);
          await SEL.TitleBar.navTab(ctx1.page, 'settings').click();
          await SEL.SettingsView.themeBtn(ctx1.page, 'dark').click();
          assert.equal(
            await ctx1.page.evaluate(() => document.documentElement.classList.contains('dark')),
            true,
          );
          await ctx1.page.waitForTimeout(250);
          assertNoPageErrors(ctx1);
        } finally {
          await ctx1.close();
        }

        // Launch 2: verify dark survived cold restart, switch to light
        const ctx2 = await launchFiloteca({ userDataDir: persistentUserData, reducedMotion: true, signal });
        try {
          assert.equal((await dbLoad(ctx2.page)).settings.theme, 'dark', 'Dark theme did not persist in DB');
          assert.equal(
            await ctx2.page.evaluate(() => document.documentElement.classList.contains('dark')),
            true,
            'Dark theme did not persist across cold restart',
          );
          await SEL.TitleBar.navTab(ctx2.page, 'settings').click();
          await SEL.SettingsView.themeBtn(ctx2.page, 'light').click();
          assert.equal(
            await ctx2.page.evaluate(() => document.documentElement.classList.contains('dark')),
            false,
          );
          await ctx2.page.waitForTimeout(250);
          assertNoPageErrors(ctx2);
        } finally {
          await ctx2.close();
        }

        // Launch 3: verify light survived cold restart
        const ctx3 = await launchFiloteca({ userDataDir: persistentUserData, reducedMotion: true, signal });
        try {
          assert.equal((await dbLoad(ctx3.page)).settings.theme, 'light', 'Light theme did not persist in DB');
          assert.equal(
            await ctx3.page.evaluate(() => document.documentElement.classList.contains('dark')),
            false,
            'Light theme did not persist across cold restart',
          );
          assertNoPageErrors(ctx3);
        } finally {
          await ctx3.close();
        }
      } finally {
        await rmDirWithRetry(persistentUserData);
      }
    },
  },

  {
    id: 'T2-F2-07',
    tier: 2,
    tag: 'v1',
    feature: 'F2',
    name: 'lowThreshold (10..40) and criticalThreshold (5..20) sliders handle boundaries and inverted critical >= low',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'thresh-1', colorName: 'Umbral 15pct', initialWeight: 1000, remainingWeight: 150 })],
      });

      await SEL.TitleBar.navTab(page, 'settings').click();
      const thresholdSection = page
        .locator('div.rounded-2xl')
        .filter({ hasText: /Umbrales de Alerta de Filamento/i });
      const lowSlider = thresholdSection.locator('input[type="range"]').nth(0);
      const critSlider = thresholdSection.locator('input[type="range"]').nth(1);

      assert.equal(await lowSlider.getAttribute('min'), '10');
      assert.equal(await lowSlider.getAttribute('max'), '40');
      assert.equal(await critSlider.getAttribute('min'), '5');
      assert.equal(await critSlider.getAttribute('max'), '20');

      // Inverted boundary: low = 10%, critical = 20% -> 15% roll must evaluate as critical (precedence)
      await setRangeValue(lowSlider, 10);
      await setRangeValue(critSlider, 20);
      await page.waitForTimeout(250);

      const dbInverted = await dbLoad(page);
      assert.equal(dbInverted.settings.lowThreshold, 10);
      assert.equal(dbInverted.settings.criticalThreshold, 20);

      await SEL.TitleBar.navTab(page, 'shelf').click();
      const card = SEL.SpoolCard.cardByName(page, 'Umbral 15pct').first();
      await card.waitFor({ state: 'visible' });
      await SEL.SpoolCard.cardCriticalBadge(card).waitFor({ state: 'visible' });
      assert.equal(await SEL.SpoolCard.cardLowBadge(card).count(), 0);

      // Wide boundary: low = 40%, critical = 5% -> 15% roll must evaluate as low
      await SEL.TitleBar.navTab(page, 'settings').click();
      await setRangeValue(lowSlider, 40);
      await setRangeValue(critSlider, 5);
      await page.waitForTimeout(250);

      const dbWide = await dbLoad(page);
      assert.equal(dbWide.settings.lowThreshold, 40);
      assert.equal(dbWide.settings.criticalThreshold, 5);

      await SEL.TitleBar.navTab(page, 'shelf').click();
      await SEL.SpoolCard.cardLowBadge(card).waitFor({ state: 'visible' });
      assert.equal(await SEL.SpoolCard.cardCriticalBadge(card).count(), 0);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F2-08',
    tier: 2,
    tag: 'v1',
    feature: 'F2',
    name: 'BRL 2-decimal edge formatting (0, 0.05, 1234.56) via custom currency input on baseline',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [
          makeRoll({ id: 'brl-b1', colorName: 'Base Cero', price: 0 }),
          makeRoll({ id: 'brl-b2', colorName: 'Base Cent', price: 0.05 }),
          makeRoll({ id: 'brl-b3', colorName: 'Base Mil', price: 1234.56 }),
        ],
      });

      await SEL.TitleBar.navTab(page, 'settings').click();
      await SEL.SettingsView.currencyCustomInput(page).fill('brl');
      await page.waitForTimeout(200);
      assert.equal((await dbLoad(page)).settings.currency, 'BRL');

      await SEL.TitleBar.navTab(page, 'shelf').click();
      const p0 = normalizeNbsp(
        await SEL.SpoolCard.cardPrice(SEL.SpoolCard.cardByName(page, 'Base Cero').first()).textContent(),
      );
      const p005 = normalizeNbsp(
        await SEL.SpoolCard.cardPrice(SEL.SpoolCard.cardByName(page, 'Base Cent').first()).textContent(),
      );
      const p1234 = normalizeNbsp(
        await SEL.SpoolCard.cardPrice(SEL.SpoolCard.cardByName(page, 'Base Mil').first()).textContent(),
      );
      assert.match(p0, /^(?:R\$|BRL)\s*0,00$/);
      assert.match(p005, /^(?:R\$|BRL)\s*0,05$/);
      assert.match(p1234, /^(?:R\$|BRL)\s*1\.234,56$/);

      await SEL.TitleBar.navTab(page, 'stats').click();
      const invValue = normalizeNbsp(
        await SEL.StatsView.kpiValueText(SEL.StatsView.kpiInventoryValue(page)).textContent(),
      );
      assert.match(invValue, /^(?:R\$|BRL)\s*1\.234,61$/);
      assertNoPageErrors(sharedCtx);
    },
  },

  // =========================================================================
  // F3 / F4 Inventory & Filter Boundaries (11 tests: all v1)
  // =========================================================================
  {
    id: 'T2-F3-01',
    tier: 2,
    tag: 'v1',
    feature: 'F3',
    name: 'Empty inventory shows 0 de 0 rollos, hides low-stock badge, and empty CTA opens RollEditorModal',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, { rolls: [] });

      const countText = normalizeNbsp(await SEL.ShelfView.resultsCount(page).textContent());
      assert.equal(countText, '0 de 0 rollos');
      assert.equal(await SEL.SpoolCard.allCards(page).count(), 0);

      const lowBtnText = normalizeNbsp(await SEL.ShelfView.lowStockToggle(page).textContent());
      assert.equal(/\d/.test(lowBtnText), false, `Unexpected low-stock count badge on empty shelf: ${lowBtnText}`);

      await page.getByRole('heading', { name: /Tu estantería está completamente vacía/i }).waitFor({ state: 'visible' });
      await SEL.ShelfView.emptyAddBtn(page).click();
      await SEL.RollEditorModal.form(page).waitFor({ state: 'visible' });
      await SEL.RollEditorModal.cancelBtn(SEL.RollEditorModal.form(page)).click();
      await SEL.RollEditorModal.form(page).waitFor({ state: 'hidden' });
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F3-02',
    tier: 2,
    tag: 'v1',
    feature: 'F3',
    name: 'RollEditorModal initialWeight rejects 49g and 10001g while accepting 50g and 10000g',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, { rolls: [] });

      await SEL.ShelfView.emptyAddBtn(page).click();
      const form = SEL.RollEditorModal.form(page);
      await form.waitFor({ state: 'visible' });
      await SEL.RollEditorModal.brandInput(form).fill('Anycubic');
      await SEL.RollEditorModal.colorNameInput(form).fill('Limite Min');

      const iniInput = SEL.RollEditorModal.initialWeightInput(form);
      const remInput = SEL.RollEditorModal.remainingWeightInput(form);

      // 49g -> rangeUnderflow
      await iniInput.fill('49');
      await remInput.fill('49');
      await SEL.RollEditorModal.submitBtn(form).click();
      assert.equal(await form.isVisible(), true);
      assert.equal(await iniInput.evaluate((el) => el.validity.rangeUnderflow), true);
      assert.equal((await dbLoad(page)).rolls.length, 0);

      // 50g -> accepted
      await iniInput.fill('50');
      await remInput.fill('50');
      await SEL.RollEditorModal.submitBtn(form).click();
      await form.waitFor({ state: 'hidden' });
      assert.equal((await dbLoad(page)).rolls.length, 1);
      assert.equal((await dbLoad(page)).rolls[0].initialWeight, 50);

      // Open new roll -> 10001g -> rangeOverflow
      await SEL.TitleBar.newRollBtn(page).click();
      await form.waitFor({ state: 'visible' });
      await SEL.RollEditorModal.brandInput(form).fill('Anycubic');
      await SEL.RollEditorModal.colorNameInput(form).fill('Limite Max');
      await iniInput.fill('10001');
      await remInput.fill('10000');
      await SEL.RollEditorModal.submitBtn(form).click();
      assert.equal(await form.isVisible(), true);
      assert.equal(await iniInput.evaluate((el) => el.validity.rangeOverflow), true);
      assert.equal((await dbLoad(page)).rolls.length, 1);

      // 10000g -> accepted
      await iniInput.fill('10000');
      await remInput.fill('10000');
      await SEL.RollEditorModal.submitBtn(form).click();
      await form.waitFor({ state: 'hidden' });

      const data = await dbLoad(page);
      assert.equal(data.rolls.length, 2);
      assert.equal(data.rolls[1].initialWeight, 10000);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F3-03',
    tier: 2,
    tag: 'v1',
    feature: 'F3',
    name: 'RollEditorModal remainingWeight = 0g automatically marks roll status empty (Agotado)',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, { rolls: [] });

      await SEL.ShelfView.emptyAddBtn(page).click();
      const form = SEL.RollEditorModal.form(page);
      await form.waitFor({ state: 'visible' });

      await SEL.RollEditorModal.brandInput(form).fill('Sunlu');
      await SEL.RollEditorModal.colorNameInput(form).fill('Cero Gramos');
      await SEL.RollEditorModal.initialWeightInput(form).fill('1000');
      await SEL.RollEditorModal.remainingWeightInput(form).fill('0');
      await SEL.RollEditorModal.statusBtn(form, 'Sellado').click();
      await SEL.RollEditorModal.submitBtn(form).click();
      await form.waitFor({ state: 'hidden' });

      const data = await dbLoad(page);
      assert.equal(data.rolls.length, 1);
      assert.equal(data.rolls[0].remainingWeight, 0);
      assert.equal(data.rolls[0].status, 'empty');

      const card = SEL.SpoolCard.cardByName(page, 'Cero Gramos').first();
      await card.getByText('Agotado', { exact: true }).waitFor({ state: 'visible' });
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F3-04',
    tier: 2,
    tag: 'v1',
    feature: 'F3',
    name: 'RollEditorModal rejects remainingWeight > initialWeight via HTML5 rangeOverflow',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, { rolls: [] });

      await SEL.ShelfView.emptyAddBtn(page).click();
      const form = SEL.RollEditorModal.form(page);
      await form.waitFor({ state: 'visible' });

      await SEL.RollEditorModal.brandInput(form).fill('eSUN');
      await SEL.RollEditorModal.colorNameInput(form).fill('Sobrepeso');
      await SEL.RollEditorModal.initialWeightInput(form).fill('1000');
      await SEL.RollEditorModal.remainingWeightInput(form).fill('1200');
      await SEL.RollEditorModal.submitBtn(form).click();

      assert.equal(await form.isVisible(), true);
      assert.equal(
        await SEL.RollEditorModal.remainingWeightInput(form).evaluate((el) => el.validity.rangeOverflow),
        true,
      );
      assert.equal((await dbLoad(page)).rolls.length, 0);
      await SEL.RollEditorModal.cancelBtn(form).click();
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F3-05',
    tier: 2,
    tag: 'v1',
    feature: 'F3',
    name: 'RollEditorModal invalid hex color (not-a-color) sanitizes cleanly to #888888 with 0 pageerrors',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, { rolls: [] });

      await SEL.ShelfView.emptyAddBtn(page).click();
      const form = SEL.RollEditorModal.form(page);
      await form.waitFor({ state: 'visible' });

      await SEL.RollEditorModal.brandInput(form).fill('Polymaker');
      await SEL.RollEditorModal.colorNameInput(form).fill('Hex Invalido');
      await SEL.RollEditorModal.colorHexInput(form).fill('not-a-color');
      await SEL.RollEditorModal.submitBtn(form).click();
      await form.waitFor({ state: 'hidden' });

      const data = await dbLoad(page);
      assert.equal(data.rolls.length, 1);
      assert.equal(data.rolls[0].colorHex, '#888888');
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F3-06',
    tier: 2,
    tag: 'v1',
    feature: 'F3',
    name: 'RollEditorModal rejects empty required brand/colorName and normalizes whitespace-only to defaults',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, { rolls: [] });

      await SEL.ShelfView.emptyAddBtn(page).click();
      const form = SEL.RollEditorModal.form(page);
      await form.waitFor({ state: 'visible' });

      const brandInput = SEL.RollEditorModal.brandInput(form);
      const colorInput = SEL.RollEditorModal.colorNameInput(form);

      // Empty brand rejected
      await brandInput.fill('');
      await colorInput.fill('Blanco');
      await SEL.RollEditorModal.submitBtn(form).click();
      assert.equal(await form.isVisible(), true);
      assert.equal(await brandInput.evaluate((el) => el.validity.valueMissing), true);

      // Empty colorName rejected
      await brandInput.fill('Anycubic');
      await colorInput.fill('');
      await SEL.RollEditorModal.submitBtn(form).click();
      assert.equal(await form.isVisible(), true);
      assert.equal(await colorInput.evaluate((el) => el.validity.valueMissing), true);
      assert.equal((await dbLoad(page)).rolls.length, 0);

      // Whitespace-only trimmed to defaults ('Sin marca' / 'Sin nombre')
      await brandInput.fill('   ');
      await colorInput.fill('   ');
      await SEL.RollEditorModal.submitBtn(form).click();
      await form.waitFor({ state: 'hidden' });

      const data = await dbLoad(page);
      assert.equal(data.rolls.length, 1);
      assert.equal(data.rolls[0].brand, 'Sin marca');
      assert.equal(data.rolls[0].colorName, 'Sin nombre');
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F3-07',
    tier: 2,
    tag: 'v1',
    feature: 'F3',
    name: 'RollEditorModal closes cleanly on Escape and Cancelar without creating or modifying roll',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'cancel-1', colorName: 'Original Intacto', brand: 'Prusament' })],
      });

      // Cancel new roll via Escape
      await SEL.TitleBar.newRollBtn(page).click();
      const form = SEL.RollEditorModal.form(page);
      await form.waitFor({ state: 'visible' });
      await SEL.RollEditorModal.colorNameInput(form).fill('No Guardar Esc');
      await page.keyboard.press('Escape');
      await form.waitFor({ state: 'hidden' });
      assert.equal((await dbLoad(page)).rolls.length, 1);

      // Edit existing roll and discard via Cancelar
      const card = SEL.SpoolCard.cardByName(page, 'Original Intacto').first();
      await SEL.SpoolCard.cardQuickMenuBtn(card).click({ force: true });
      await SEL.SpoolCard.portalMenuItem(page, 'edit').click();
      await form.waitFor({ state: 'visible' });
      await SEL.RollEditorModal.colorNameInput(form).fill('Cambio Descartado');
      await SEL.RollEditorModal.cancelBtn(form).click();
      await form.waitFor({ state: 'hidden' });

      const data = await dbLoad(page);
      assert.equal(data.rolls.length, 1);
      assert.equal(data.rolls[0].colorName, 'Original Intacto');
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F4-01',
    tier: 2,
    tag: 'v1',
    feature: 'F4',
    name: 'Search with zero matches displays 0 de N rollos, empty filter state, and Limpiar filtros restores all',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [
          makeRoll({ id: 'sr-1', colorName: 'Azul Marino' }),
          makeRoll({ id: 'sr-2', colorName: 'Verde Oliva' }),
        ],
      });

      const search = SEL.TitleBar.searchInput(page);
      await search.fill('ZZZZ_NO_MATCH_999');

      await page.waitForFunction(() => document.body.innerText.includes('0 de 2 rollos'));
      await page.getByRole('heading', { name: /No hay bobinas con estos filtros/i }).waitFor({ state: 'visible' });
      await page.getByRole('button', { name: /Limpiar filtros/i }).click();

      await page.waitForFunction(() => document.body.innerText.includes('2 de 2 rollos'));
      assert.equal(await SEL.SpoolCard.allCards(page).count(), 2);
      assert.equal(await search.inputValue(), '');
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F4-02',
    tier: 2,
    tag: 'v1',
    feature: 'F4',
    name: 'Search with regex special characters matches literally without crash or pageerror',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [
          makeRoll({ id: 'rx-1', colorName: 'Literal Batch', notes: 'Batch [PLA+] (test).* ok' }),
          makeRoll({ id: 'rx-2', colorName: 'Normal Spool', notes: 'Standard roll' }),
        ],
      });

      const search = SEL.TitleBar.searchInput(page);
      await search.fill('[PLA+] (test).*');
      await page.waitForFunction(() => document.body.innerText.includes('1 de 2 rollos'));
      assert.equal(await SEL.SpoolCard.cardByName(page, 'Literal Batch').count(), 1);

      await search.fill('[((invalid*regex');
      await page.waitForFunction(() => document.body.innerText.includes('0 de 2 rollos'));
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F4-03',
    tier: 2,
    tag: 'v1',
    feature: 'F4',
    name: 'Search with whitespace-only query shows all rolls and keeps Restablecer hidden',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [
          makeRoll({ id: 'ws-1', colorName: 'Uno' }),
          makeRoll({ id: 'ws-2', colorName: 'Dos' }),
        ],
      });

      await SEL.TitleBar.searchInput(page).fill('   ');
      await page.waitForTimeout(200);
      assert.equal(normalizeNbsp(await SEL.ShelfView.resultsCount(page).textContent()), '2 de 2 rollos');
      assert.equal(await SEL.SpoolCard.allCards(page).count(), 2);
      assert.equal(await SEL.ShelfView.resetFiltersBtn(page).count(), 0);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F4-04',
    tier: 2,
    tag: 'v1',
    feature: 'F4',
    name: 'Backup stock suppression enforces 149g vs 150g, lowThreshold - 1 vs lowThreshold, and never suppresses empty rolls',
    run: async () => {
      const { page } = sharedCtx;
      const baseLow = {
        id: 'low-target',
        material: 'PLA',
        colorName: 'Naranja Fuego',
        colorHex: '#f2754e',
        initialWeight: 1000,
        remainingWeight: 100, // 10% < lowThreshold(20)
        status: 'in_use',
      };

      // (a) Backup 149g / 500g (29.8%, <150g) -> NOT backed up
      await resetDbState(page, {
        settings: { lowThreshold: 20, criticalThreshold: 10 },
        rolls: [
          makeRoll(baseLow),
          makeRoll({
            id: 'backup-roll',
            material: 'PLA',
            colorName: 'Naranja Fuego',
            colorHex: '#f2754e',
            brand: 'Bambu Lab',
            initialWeight: 500,
            remainingWeight: 149,
            status: 'in_use',
          }),
        ],
      });
      let lowCard = SEL.SpoolCard.cardByName(page, '100g').first();
      await lowCard.waitFor({ state: 'visible' });
      assert.equal(await SEL.SpoolCard.cardBackupBadge(lowCard).count(), 0, '149g backup must NOT suppress');
      await SEL.ShelfView.lowStockToggle(page).click();
      await page.waitForFunction(() => document.body.innerText.includes('1 de 2 rollos'));

      // (b) Backup 150g / 500g (30%, >=150g) -> IS backed up & suppressed from lowOnly
      await resetDbState(page, {
        settings: { lowThreshold: 20, criticalThreshold: 10 },
        rolls: [
          makeRoll(baseLow),
          makeRoll({
            id: 'backup-roll',
            material: 'PLA',
            colorName: 'Naranja Fuego',
            colorHex: '#f2754e',
            brand: 'Bambu Lab',
            initialWeight: 500,
            remainingWeight: 150,
            status: 'in_use',
          }),
        ],
      });
      lowCard = SEL.SpoolCard.cardByName(page, '100g').first();
      await SEL.SpoolCard.cardBackupBadge(lowCard).first().waitFor({ state: 'visible' });
      await SEL.ShelfView.lowStockToggle(page).click();
      await page.waitForFunction(() => document.body.innerText.includes('0 de 2 rollos'));

      // (c) Backup 190g / 1000g (19% === lowThreshold - 1) -> NOT backed up
      await resetDbState(page, {
        settings: { lowThreshold: 20, criticalThreshold: 10 },
        rolls: [
          makeRoll(baseLow),
          makeRoll({
            id: 'backup-roll',
            material: 'PLA',
            colorName: 'Naranja Fuego',
            colorHex: '#f2754e',
            brand: 'Bambu Lab',
            initialWeight: 1000,
            remainingWeight: 190,
            status: 'in_use',
          }),
        ],
      });
      lowCard = SEL.SpoolCard.cardByName(page, '100g').first();
      assert.equal(await SEL.SpoolCard.cardBackupBadge(lowCard).count(), 0, '19% backup must NOT suppress');

      // (d) Backup 200g / 1000g (20% === lowThreshold) -> IS backed up
      await resetDbState(page, {
        settings: { lowThreshold: 20, criticalThreshold: 10 },
        rolls: [
          makeRoll(baseLow),
          makeRoll({
            id: 'backup-roll',
            material: 'PLA',
            colorName: 'Naranja Fuego',
            colorHex: '#f2754e',
            brand: 'Bambu Lab',
            initialWeight: 1000,
            remainingWeight: 200,
            status: 'in_use',
          }),
        ],
      });
      lowCard = SEL.SpoolCard.cardByName(page, '100g').first();
      await SEL.SpoolCard.cardBackupBadge(lowCard).first().waitFor({ state: 'visible' });

      // (e) Empty roll <= 0.5g with full 1000g backup -> shows Agotado (never Respaldado) and stays visible in Bajo stock
      await resetDbState(page, {
        settings: { lowThreshold: 20, criticalThreshold: 10 },
        rolls: [
          makeRoll({
            id: 'empty-target',
            material: 'PLA',
            colorName: 'Naranja Fuego',
            colorHex: '#f2754e',
            initialWeight: 1000,
            remainingWeight: 0.5,
            status: 'in_use',
          }),
          makeRoll({
            id: 'backup-full',
            material: 'PLA',
            colorName: 'Naranja Fuego',
            colorHex: '#f2754e',
            brand: 'Bambu Lab',
            initialWeight: 1000,
            remainingWeight: 1000,
            status: 'sealed',
          }),
        ],
      });
      const emptyCard = SEL.SpoolCard.cardByName(page, 'Anycubic').first();
      await emptyCard.getByText('Agotado', { exact: true }).waitFor({ state: 'visible' });
      assert.equal(await SEL.SpoolCard.cardBackupBadge(emptyCard).count(), 0);
      await SEL.ShelfView.lowStockToggle(page).click();
      await page.waitForFunction(() => document.body.innerText.includes('1 de 2 rollos'));
      assert.equal(await SEL.SpoolCard.cardByName(page, 'Anycubic').count(), 1);
      assertNoPageErrors(sharedCtx);
    },
  },

  // =========================================================================
  // F5 / F6 / F7 Usage, Stats, Replenishment & Shopping Boundaries (11 v1)
  // =========================================================================
  {
    id: 'T2-F5-01',
    tier: 2,
    tag: 'v1',
    feature: 'F5',
    name: 'QuickUseModal rejects 0g, negative (-5g), and <0.5g (0.4g) inputs',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'qu-1', colorName: 'Consumo Cero', remainingWeight: 1000 })],
      });

      const card = SEL.SpoolCard.cardByName(page, 'Consumo Cero').first();
      await SEL.SpoolCard.cardQuickUseBtn(card, 'Otro').click();
      const modal = SEL.QuickUseModal.modal(page);
      await modal.waitFor({ state: 'visible' });

      const input = SEL.QuickUseModal.gramsInput(modal);
      const submit = SEL.QuickUseModal.submitBtn(modal);

      await input.fill('0');
      assert.equal(await submit.isDisabled(), true, '0g must disable submit');

      await input.fill('-5');
      assert.equal(await submit.isDisabled(), true, '-5g must disable submit');

      await input.fill('0.4');
      await submit.click();
      assert.equal(await modal.isVisible(), true, '0.4g must be rejected by min=0.5');
      assert.equal(await input.evaluate((el) => el.validity.rangeUnderflow), true);

      const data = await dbLoad(page);
      assert.equal(data.usage.length, 0);
      assert.equal(data.rolls[0].remainingWeight, 1000);
      await SEL.QuickUseModal.cancelBtn(modal).click();
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F5-02',
    tier: 2,
    tag: 'v1',
    feature: 'F5',
    name: 'QuickUseModal 0.5g decimal deduction persists 999.5g in DB and -0.5g in RollDetailModal history',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'qu-dec', colorName: 'Decimal Medio', remainingWeight: 1000 })],
      });

      const card = SEL.SpoolCard.cardByName(page, 'Decimal Medio').first();
      await SEL.SpoolCard.cardQuickUseBtn(card, 'Otro').click();
      const modal = SEL.QuickUseModal.modal(page);
      await modal.waitFor({ state: 'visible' });

      await SEL.QuickUseModal.gramsInput(modal).fill('0.5');
      await SEL.QuickUseModal.submitBtn(modal).click();
      await modal.waitFor({ state: 'hidden' });

      const data = await dbLoad(page);
      assert.equal(data.rolls[0].remainingWeight, 999.5);
      assert.equal(data.usage.length, 1);
      assert.equal(data.usage[0].grams, 0.5);

      await card.click();
      const detail = SEL.RollDetailModal.modal(page);
      await detail.waitFor({ state: 'visible' });
      await detail.getByText('-0.5g', { exact: true }).waitFor({ state: 'visible' });
      await SEL.RollDetailModal.closeBtn(detail).click();
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F5-03',
    tier: 2,
    tag: 'v1',
    feature: 'F5',
    name: 'QuickUseModal rejects >remainingWeight, Todo depletes to 0g/empty, and Inbox logUse clamps over-remaining to 0g/empty',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'qu-max', colorName: 'Casi Vacio', remainingWeight: 120 })],
      });

      const card = SEL.SpoolCard.cardByName(page, 'Casi Vacio').first();
      await SEL.SpoolCard.cardQuickUseBtn(card, 'Otro').click();
      const modal = SEL.QuickUseModal.modal(page);
      await modal.waitFor({ state: 'visible' });

      const input = SEL.QuickUseModal.gramsInput(modal);
      await input.fill('150');
      await SEL.QuickUseModal.submitBtn(modal).click();
      assert.equal(await modal.isVisible(), true);
      assert.equal(await input.evaluate((el) => el.validity.rangeOverflow), true);
      assert.equal((await dbLoad(page)).rolls[0].remainingWeight, 120);

      // Click Todo -> exact depletion to 0g + Agotado
      await SEL.QuickUseModal.allBtn(modal).click();
      await SEL.QuickUseModal.submitBtn(modal).click();
      await modal.waitFor({ state: 'hidden' });

      const afterTodo = await dbLoad(page);
      assert.equal(afterTodo.rolls[0].remainingWeight, 0);
      assert.equal(afterTodo.rolls[0].status, 'empty');
      await SEL.Toasts.toastByTitle(page, /carrete vacío/i).waitFor({ state: 'visible' });
      await card.getByText('Agotado', { exact: true }).waitFor({ state: 'visible' });

      // Over-remaining programmatic/store logUse via InboxView Lo imprimí clamps to 0g + empty
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'clamp-roll', colorName: 'Clamp Roll', colorHex: '#f2754e', remainingWeight: 50 })],
        gcodeJobs: [
          {
            id: 'job-over',
            sessionKey: 'sess-over',
            filename: 'over.gcode',
            filepath: 'over.gcode',
            fileHash: 'hash-over',
            jobName: 'OverRemainingPrint',
            plateIndex: 1,
            slicedAt: '2026-11-18T10:00:00.000Z',
            createdAt: '2026-11-18T10:01:00.000Z',
            modelNames: ['Over.stl'],
            totalLayersCount: 50,
            printTimeSeconds: 1800,
            colorChangesCount: 0,
            totalGrams: 200,
            manualReviewRequired: false,
            filaments: [
              {
                slotIndex: 0,
                grams: 200,
                colorHex: '#f2754e',
                materialName: 'PLA',
                brand: 'Anycubic',
                finish: 'glossy',
                rollId: 'clamp-roll',
                suggestedRollId: 'clamp-roll',
                confidence: 1,
              },
            ],
            status: 'unreviewed',
          },
        ],
      });

      await SEL.TitleBar.navTab(page, 'inbox').click();
      const jobCard = SEL.InboxView.jobCard(page, 'OverRemainingPrint');
      await jobCard.waitFor({ state: 'visible' });
      await SEL.InboxView.printBtn(jobCard).click();
      await page.waitForTimeout(250);

      const afterClamp = await dbLoad(page);
      assert.equal(afterClamp.rolls[0].remainingWeight, 0);
      assert.equal(afterClamp.rolls[0].status, 'empty');
      assert.equal(afterClamp.usage.length, 1);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F5-04',
    tier: 2,
    tag: 'v1',
    feature: 'F5',
    name: 'Rapid deductions (-10g, -25g, -50g) + LIFO toast undo + out-of-order RollDetailModal undo stay consistent',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'undo-roll', colorName: 'Undo Rapido', remainingWeight: 1000 })],
      });

      const card = SEL.SpoolCard.cardByName(page, 'Undo Rapido').first();
      await SEL.SpoolCard.cardQuickUseBtn(card, '-10g').click();
      await SEL.SpoolCard.cardQuickUseBtn(card, '-25g').click();
      await SEL.SpoolCard.cardQuickUseBtn(card, '-50g').click();
      await page.waitForTimeout(250);

      let data = await dbLoad(page);
      assert.equal(data.rolls[0].remainingWeight, 915);
      assert.equal(data.usage.length, 3);

      // LIFO toast undo on latest (-50g)
      await SEL.Toasts.toastUndoBtn(page).last().click();
      await page.waitForTimeout(200);
      data = await dbLoad(page);
      assert.equal(data.rolls[0].remainingWeight, 965);
      assert.equal(data.usage.length, 2);

      // Out-of-order undo of oldest (-10g) inside RollDetailModal (reversed list -> .last())
      await card.click();
      const detail = SEL.RollDetailModal.modal(page);
      await detail.waitFor({ state: 'visible' });
      await SEL.RollDetailModal.undoUsageBtns(detail).last().click();
      await page.waitForTimeout(200);

      data = await dbLoad(page);
      assert.equal(data.rolls[0].remainingWeight, 975);
      assert.equal(data.usage.length, 1);
      assert.equal(data.usage[0].grams, 25);

      await SEL.RollDetailModal.closeBtn(detail).click();
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F6-01',
    tier: 2,
    tag: 'v1',
    feature: 'F6',
    name: 'StatsView with 0 rolls renders zero NaN/Infinity/pageerror and displays empty chart states',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, { rolls: [], usage: [] });

      await SEL.TitleBar.navTab(page, 'stats').click();
      await SEL.StatsView.kpiTotalRolls(page).waitFor({ state: 'visible' });

      assert.equal(
        normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiTotalRolls(page)).textContent()),
        '0',
      );
      assert.equal(
        normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiAvailableGrams(page)).textContent()),
        '0 g',
      );
      assert.match(
        normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiInventoryValue(page)).textContent()),
        /^\$\s*0$/,
      );
      assert.match(
        normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiAvgCostPerGram(page)).textContent()),
        /^\$\s*0,0\/g$/,
      );

      assert.equal(await page.getByText(/Sin datos para mostrar en este gráfico/i).count(), 2);
      await page.getByText(/Sin bobinas con filamento disponible/i).waitFor({ state: 'visible' });
      await page.getByText(/Sin impresiones registradas en el tiempo/i).waitFor({ state: 'visible' });

      const bodyText = await page.locator('main').innerText();
      const bodyHtml = await page.locator('main').innerHTML();
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(bodyText), false, `Found NaN/Infinity in StatsView: ${bodyText}`);
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(bodyHtml), false, 'Found NaN/Infinity in StatsView HTML');
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F6-02',
    tier: 2,
    tag: 'v1',
    feature: 'F6',
    name: 'StatsView with 1 roll at 0 price and 1 usage entry renders finite KPIs and charts without NaN',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'zero-price', colorName: 'Gratis PLA', price: 0, initialWeight: 1000, remainingWeight: 950 })],
        usage: [{ id: 'u-1', rollId: 'zero-price', grams: 50, at: daysAgoIso(1), note: 'Test' }],
      });

      await SEL.TitleBar.navTab(page, 'stats').click();
      await SEL.StatsView.kpiTotalRolls(page).waitFor({ state: 'visible' });

      assert.equal(
        normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiTotalRolls(page)).textContent()),
        '1',
      );
      assert.equal(
        normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiAvailableGrams(page)).textContent()),
        '950 g',
      );
      assert.match(
        normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiInventoryValue(page)).textContent()),
        /^\$\s*0$/,
      );
      assert.match(
        normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiAvgCostPerGram(page)).textContent()),
        /^\$\s*0,0\/g$/,
      );

      assert.equal(await page.getByText('100%').count() >= 1, true);
      const treemapRect = page.locator('main svg rect').first();
      await treemapRect.waitFor({ state: 'visible' });
      const rectDims = await treemapRect.evaluate((el) => ({
        width: Number(el.getAttribute('width')),
        height: Number(el.getAttribute('height')),
      }));
      assert.ok(Number.isFinite(rectDims.width) && rectDims.width > 0, `Invalid Treemap rect width: ${rectDims.width}`);
      assert.ok(Number.isFinite(rectDims.height) && rectDims.height > 0, `Invalid Treemap rect height: ${rectDims.height}`);

      const bodyText = await page.locator('main').innerText();
      const bodyHtml = await page.locator('main').innerHTML();
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(bodyText), false, `Found NaN/Infinity in StatsView: ${bodyText}`);
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(bodyHtml), false, 'Found NaN/Infinity in StatsView HTML');
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F6-03',
    tier: 2,
    tag: 'v1',
    feature: 'F6',
    name: 'StatsView with all-empty rolls renders zero NaN/Infinity/pageerror and empty chart states',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [
          makeRoll({ id: 'emp-1', colorName: 'Vacio 1', price: 80000, remainingWeight: 0, status: 'empty' }),
          makeRoll({ id: 'emp-2', colorName: 'Vacio 2', price: 60000, remainingWeight: 0, status: 'empty' }),
        ],
        usage: [],
      });

      await SEL.TitleBar.navTab(page, 'stats').click();
      await SEL.StatsView.kpiTotalRolls(page).waitFor({ state: 'visible' });

      assert.equal(
        normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiTotalRolls(page)).textContent()),
        '2',
      );
      assert.equal(
        normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiAvailableGrams(page)).textContent()),
        '0 g',
      );
      assert.match(
        normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiInventoryValue(page)).textContent()),
        /^\$\s*0$/,
      );
      assert.match(
        normalizeNbsp(await SEL.StatsView.kpiValueText(SEL.StatsView.kpiAvgCostPerGram(page)).textContent()),
        /^\$\s*70,0\/g$/,
      );
      assert.equal(await page.getByText(/Sin datos para mostrar en este gráfico/i).count(), 2);
      await page.getByText(/Sin bobinas con filamento disponible/i).waitFor({ state: 'visible' });
      await page.getByText(/Sin impresiones registradas en el tiempo/i).waitFor({ state: 'visible' });

      const bodyText = await page.locator('main').innerText();
      const bodyHtml = await page.locator('main').innerHTML();
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(bodyText), false);
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(bodyHtml), false, 'Found NaN/Infinity in StatsView HTML');
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F7-01',
    tier: 2,
    tag: 'v1',
    feature: 'F7',
    name: 'ReplenishmentView keeps <3 usage entries in Sin datos and moves product out when 3rd entry is added',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'rep-1', brand: 'Anycubic', material: 'PLA', colorName: 'Negro Replen', remainingWeight: 700 })],
        usage: [
          { id: 'u-r1', rollId: 'rep-1', grams: 100, at: daysAgoIso(4), note: 'P1' },
          { id: 'u-r2', rollId: 'rep-1', grams: 120, at: daysAgoIso(2), note: 'P2' },
        ],
      });

      await SEL.TitleBar.navTab(page, 'replenish').click();
      await SEL.ReplenishmentView.tab(page, /Sin datos/i).click();
      const card = page
        .locator('div.rounded-3xl, div.rounded-2xl')
        .filter({ hasText: 'Negro Replen' })
        .filter({ has: page.getByRole('button', { name: /Marcar como pedido/i }) })
        .first();
      await card.waitFor({ state: 'visible' });
      await card.getByText(/Datos insuficientes/i).first().waitFor({ state: 'visible' });

      // Add 3rd usage entry via ShelfView quick use -> moves out of Sin datos
      await SEL.TitleBar.navTab(page, 'shelf').click();
      await SEL.SpoolCard.cardQuickUseBtn(SEL.SpoolCard.cardByName(page, 'Negro Replen').first(), '-50g').click();
      await page.waitForTimeout(250);

      await SEL.TitleBar.navTab(page, 'replenish').click();
      await SEL.ReplenishmentView.tab(page, /Sin datos/i).click();
      assert.equal(await card.count(), 0, 'Product with 3 usage entries must exit Sin datos');

      await SEL.ReplenishmentView.tab(page, /^Todos/i).click();
      await card.waitFor({ state: 'visible' });
      await card.getByText(/g\/día/i).waitFor({ state: 'visible' });
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F7-02',
    tier: 2,
    tag: 'v1',
    feature: 'F7',
    name: 'ReplenishmentView ManualRateInput rejects 0 and -50 and accepts 150 (21,4 g/día)',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'man-1', brand: 'Sunlu', material: 'PETG', colorName: 'Manual Rate', remainingWeight: 500 })],
        usage: [],
      });

      await SEL.TitleBar.navTab(page, 'replenish').click();
      await SEL.ReplenishmentView.tab(page, /Sin datos/i).click();
      const card = page
        .locator('div.rounded-3xl, div.rounded-2xl')
        .filter({ hasText: 'Manual Rate' })
        .filter({ has: page.getByRole('button', { name: /Marcar como pedido/i }) })
        .first();
      await card.waitFor({ state: 'visible' });

      const rateInput = SEL.ReplenishmentView.manualRateInput(card);
      const saveBtn = SEL.ReplenishmentView.manualRateSaveBtn(card);

      await rateInput.fill('0');
      await saveBtn.click();
      await page.waitForTimeout(150);
      assert.deepEqual((await dbLoad(page)).settings.productOverrides ?? {}, {});

      await rateInput.fill('-50');
      await saveBtn.click();
      await page.waitForTimeout(150);
      assert.deepEqual((await dbLoad(page)).settings.productOverrides ?? {}, {});

      await rateInput.fill('150');
      await saveBtn.click();
      await page.waitForTimeout(250);

      await SEL.ReplenishmentView.tab(page, /^Todos/i).click();
      await card.waitFor({ state: 'visible' });
      await card.getByText(/21[.,]4\s*g\/día/i).waitFor({ state: 'visible' });
      const overrides = (await dbLoad(page)).settings.productOverrides ?? {};
      assert.equal(Object.values(overrides)[0]?.manualWeeklyRate, 150);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F7-03',
    tier: 2,
    tag: 'v1',
    feature: 'F7',
    name: 'ShoppingView prevents empty and whitespace-only description on submit',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, { rolls: [], shopping: [] });

      await SEL.TitleBar.navTab(page, 'shopping').click();
      const input = SEL.ShoppingView.customInput(page);
      const addBtn = SEL.ShoppingView.customAddBtn(page);

      assert.equal(await addBtn.isDisabled(), true);
      await input.fill('   ');
      assert.equal(await addBtn.isDisabled(), true);
      await input.press('Enter');
      await page.waitForTimeout(150);

      assert.equal((await dbLoad(page)).shopping.length, 0);
      await page.getByText(/Tu lista de compras está vacía\./i).waitFor({ state: 'visible' });
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F7-04',
    tier: 2,
    tag: 'v1',
    feature: 'F7',
    name: 'ShoppingView toggles done and deletes items down to 0 items remaining',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, { rolls: [], shopping: [] });

      await SEL.TitleBar.navTab(page, 'shopping').click();
      const input = SEL.ShoppingView.customInput(page);
      const addBtn = SEL.ShoppingView.customAddBtn(page);

      await input.fill('Item A');
      await addBtn.click();
      await input.fill('Item B');
      await addBtn.click();

      assert.equal(normalizeNbsp(await SEL.ShoppingView.pendingCount(page).textContent()), '2 pendientes');

      const rowA = SEL.ShoppingView.rowByText(page, 'Item A');
      const rowB = SEL.ShoppingView.rowByText(page, 'Item B');
      await SEL.ShoppingView.rowToggleDoneBtn(rowA).click();
      assert.equal(normalizeNbsp(await SEL.ShoppingView.pendingCount(page).textContent()), '1 pendientes');
      assert.match((await rowA.getAttribute('class')) ?? '', /line-through/);

      await SEL.ShoppingView.rowToggleDoneBtn(rowB).click();
      assert.equal(normalizeNbsp(await SEL.ShoppingView.pendingCount(page).textContent()), '0 pendientes');

      await SEL.ShoppingView.rowDeleteBtn(rowA).click();
      await SEL.ShoppingView.rowDeleteBtn(rowB).click();

      await page.getByText(/Tu lista de compras está vacía\./i).waitFor({ state: 'visible' });
      assert.equal(normalizeNbsp(await SEL.ShoppingView.pendingCount(page).textContent()), '0 pendientes');
      assert.equal((await dbLoad(page)).shopping.length, 0);
      assertNoPageErrors(sharedCtx);
    },
  },
];
