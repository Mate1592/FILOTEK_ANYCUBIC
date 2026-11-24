import assert from 'node:assert/strict';
import {
  assertNoPageErrors,
  launchFiloteca,
  resetDbState,
  skipOnboardingFast,
  waitForAppReady,
} from '../lib/harness.mjs';
import { SEL, normalizeNbsp } from '../lib/selectors.mjs';

let ctx = null;

async function ensureSession() {
  if (!ctx || ctx.page.isClosed()) {
    ctx = await launchFiloteca({ reducedMotion: true });
    await skipOnboardingFast(ctx.page);
  }
  return ctx;
}

export async function afterAll() {
  if (ctx) {
    await ctx.close();
    ctx = null;
  }
}

async function prepareTest(snapshot = {}) {
  const session = await ensureSession();
  session.pageErrors.length = 0;
  session.consoleErrors.length = 0;
  await resetDbState(session.page, snapshot);
  return session;
}

async function waitForCardCount(page, count, timeout = 8000) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('[role="button"][aria-label^="Bobina "]').length === expected,
    count,
    { timeout },
  );
}

async function waitForCardOrder(page, expectedNames, timeout = 8000) {
  await page.waitForFunction(
    (expected) => {
      const actual = Array.from(
        document.querySelectorAll('[role="button"][aria-label^="Bobina "] h3'),
      ).map((el) => (el.textContent || '').trim());
      return (
        actual.length === expected.length &&
        actual.every((name, idx) => name === expected[idx])
      );
    },
    expectedNames,
    { timeout },
  );
}

function makeRoll(id, overrides = {}) {
  return {
    id,
    brand: 'Anycubic',
    material: 'PLA',
    finish: 'glossy',
    colorName: 'Negro carbón',
    colorHex: '#1f2023',
    diameter: 1.75,
    initialWeight: 1000,
    remainingWeight: 1000,
    price: 75000,
    purchaseDate: '2026-10-01',
    location: 'Estante A · 1',
    nozzleTemp: { min: 200, max: 220 },
    bedTemp: { min: 55, max: 65 },
    notes: '',
    status: 'in_use',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    deliveryDays: 6,
    ...overrides,
  };
}

function makeUsage(id, rollId, grams, note, at = '2026-10-02T10:00:00.000Z') {
  return {
    id,
    rollId,
    grams,
    at,
    note,
    origin: 'manual',
  };
}

async function loadDb(page) {
  const res = await page.evaluate(() => window.filoteca.db.load());
  assert.equal(res.ok, true, `db.load() failed: ${res.error ?? 'unknown'}`);
  return res.data;
}

export const tests = [
  {
    id: 'T1-F3-01',
    tier: 1,
    tag: 'v1',
    feature: 'F3',
    name: 'Add new spool via RollEditorModal persists in UI and SQLite across reload',
    run: async () => {
      const session = await prepareTest({ rolls: [] });
      const { page } = session;

      await SEL.TitleBar.newRollBtn(page).click();
      const form = SEL.RollEditorModal.form(page);
      await form.waitFor({ state: 'visible' });

      await SEL.RollEditorModal.brandInput(form).fill('Prusament');
      await SEL.RollEditorModal.materialSelect(form).selectOption('PETG');
      await SEL.RollEditorModal.colorNameInput(form).fill('Naranja Prusa');
      await SEL.RollEditorModal.finishSelect(form).selectOption('glossy');
      await SEL.RollEditorModal.colorHexInput(form).fill('#ff6600');
      await SEL.RollEditorModal.diameterBtn(form, '1.75 mm').click();
      await SEL.RollEditorModal.initialWeightInput(form).fill('1000');
      await SEL.RollEditorModal.remainingWeightInput(form).fill('850');
      await SEL.RollEditorModal.priceInput(form).fill('125000');
      await SEL.RollEditorModal.locationInput(form).fill('Estante C · 2');
      await SEL.RollEditorModal.statusBtn(form, 'En uso').click();
      await SEL.RollEditorModal.notesTextarea(form).fill('Boquilla 240C');

      await SEL.RollEditorModal.submitBtn(form).click();
      await form.waitFor({ state: 'hidden' });
      await waitForCardCount(page, 1);

      const card = SEL.SpoolCard.cardByName(page, 'Naranja Prusa');
      await card.waitFor({ state: 'visible' });
      const cardText = normalizeNbsp(await card.innerText());
      assert.match(cardText, /Prusament/i);
      assert.match(cardText, /\bPETG\b/);
      assert.match(cardText, /850g/);
      assert.match(cardText, /Estante C · 2/);

      const priceText = normalizeNbsp(await SEL.SpoolCard.cardPrice(card).textContent());
      assert.match(priceText, /\$\s*125\.000/);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      await waitForCardCount(page, 1);

      const dbData = await loadDb(page);
      assert.equal(dbData.rolls.length, 1);
      const saved = dbData.rolls[0];
      assert.equal(saved.brand, 'Prusament');
      assert.equal(saved.material, 'PETG');
      assert.equal(saved.colorName, 'Naranja Prusa');
      assert.equal(saved.colorHex, '#ff6600');
      assert.equal(saved.initialWeight, 1000);
      assert.equal(saved.remainingWeight, 850);
      assert.equal(saved.price, 125000);
      assert.equal(saved.location, 'Estante C · 2');
      assert.equal(saved.status, 'in_use');
      assert.equal(saved.notes, 'Boquilla 240C');

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F3-02',
    tier: 1,
    tag: 'v1',
    feature: 'F3',
    name: 'Edit spool name, price, and notes via quick menu updates card, detail modal, and DB',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('roll-edit-1', {
            colorName: 'Azul Cobalto',
            price: 75000,
            notes: 'Original',
          }),
        ],
      });
      const { page } = session;

      const card = SEL.SpoolCard.cardByName(page, 'Azul Cobalto');
      await card.scrollIntoViewIfNeeded();
      await card.hover();
      await SEL.SpoolCard.cardQuickMenuBtn(card).click();
      await SEL.SpoolCard.portalMenuItem(page, 'edit').click();

      const form = SEL.RollEditorModal.form(page);
      await form.waitFor({ state: 'visible' });
      await SEL.RollEditorModal.colorNameInput(form).fill('Azul Marino Pro');
      await SEL.RollEditorModal.priceInput(form).fill('94500');
      await SEL.RollEditorModal.notesTextarea(form).fill('Secar 4h a 55C');
      await SEL.RollEditorModal.submitBtn(form).click();
      await form.waitFor({ state: 'hidden' });

      assert.equal(await SEL.SpoolCard.cardByName(page, 'Azul Cobalto').count(), 0);
      const updatedCard = SEL.SpoolCard.cardByName(page, 'Azul Marino Pro');
      await updatedCard.waitFor({ state: 'visible' });
      const priceText = normalizeNbsp(await SEL.SpoolCard.cardPrice(updatedCard).textContent());
      assert.match(priceText, /\$\s*94\.500/);

      await updatedCard.locator('h3').click();
      const detail = SEL.RollDetailModal.modal(page);
      await detail.waitFor({ state: 'visible' });
      const detailText = normalizeNbsp(await detail.innerText());
      assert.ok(detailText.includes('Secar 4h a 55C'), 'Expected updated notes in RollDetailModal');
      await SEL.RollDetailModal.closeBtn(detail).click();
      await detail.waitFor({ state: 'hidden' });

      const dbData = await loadDb(page);
      const saved = dbData.rolls.find((r) => r.id === 'roll-edit-1');
      assert.ok(saved);
      assert.equal(saved.colorName, 'Azul Marino Pro');
      assert.equal(saved.price, 94500);
      assert.equal(saved.notes, 'Secar 4h a 55C');

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F3-03',
    tier: 1,
    tag: 'v1',
    feature: 'F3',
    name: 'Duplicate spool from RollDetailModal adds sealed full recompra while preserving original',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('roll-dup-1', {
            colorName: 'Negro Clásico',
            initialWeight: 1000,
            remainingWeight: 220,
            status: 'in_use',
          }),
        ],
      });
      const { page } = session;

      await SEL.SpoolCard.cardByName(page, 'Negro Clásico').locator('h3').click();
      const detail = SEL.RollDetailModal.modal(page);
      await detail.waitFor({ state: 'visible' });
      await SEL.RollDetailModal.duplicateBtn(detail).click();
      await detail.waitFor({ state: 'hidden' });

      await SEL.Toasts.toastByTitle(page, /Recompra añadida/i).first().waitFor({ state: 'visible' });
      await waitForCardCount(page, 2);

      const dbData = await loadDb(page);
      assert.equal(dbData.rolls.length, 2);
      const original = dbData.rolls.find((r) => r.id === 'roll-dup-1');
      const copy = dbData.rolls.find((r) => r.id !== 'roll-dup-1');
      assert.ok(original);
      assert.ok(copy);
      assert.equal(original.remainingWeight, 220);
      assert.equal(original.status, 'in_use');
      assert.equal(copy.colorName, 'Negro Clásico');
      assert.equal(copy.remainingWeight, 1000);
      assert.equal(copy.status, 'sealed');

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F3-04',
    tier: 1,
    tag: 'v1',
    feature: 'F3',
    name: 'Delete spool via quick menu triggers zero native confirm dialogs and persists across reload',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('roll-keep', { colorName: 'Rollo Conservar', remainingWeight: 700 }),
          makeRoll('roll-del', { colorName: 'Rollo Eliminar', remainingWeight: 500 }),
        ],
      });
      const { page } = session;

      const dialogs = [];
      const onDialog = (d) => {
        dialogs.push(d.message());
        d.dismiss().catch(() => {});
      };
      page.on('dialog', onDialog);

      try {
        const target = SEL.SpoolCard.cardByName(page, 'Rollo Eliminar');
        await target.scrollIntoViewIfNeeded();
        await target.hover();
        await SEL.SpoolCard.cardQuickMenuBtn(target).click();
        await SEL.SpoolCard.portalMenuItem(page, 'delete').click();

        await SEL.Toasts.toastByTitle(page, /Rollo Eliminar eliminado/i)
          .first()
          .waitFor({ state: 'visible' });
        await waitForCardCount(page, 1);

        const countText = normalizeNbsp(await SEL.ShelfView.resultsCount(page).textContent());
        assert.match(countText, /1 de 1 rollos/i);
        assert.equal(dialogs.length, 0, `Unexpected native dialog(s): ${dialogs.join('; ')}`);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForAppReady(page);
        await waitForCardCount(page, 1);

        assert.equal(await SEL.SpoolCard.cardByName(page, 'Rollo Eliminar').count(), 0);
        await SEL.SpoolCard.cardByName(page, 'Rollo Conservar').waitFor({ state: 'visible' });

        const dbData = await loadDb(page);
        assert.equal(dbData.rolls.length, 1);
        assert.equal(dbData.rolls[0].id, 'roll-keep');

        assertNoPageErrors(session);
      } finally {
        page.off('dialog', onDialog);
      }
    },
  },

  {
    id: 'T1-F3-05',
    tier: 1,
    tag: 'v1',
    feature: 'F3',
    name: 'Status pills Sellado, En uso, Seco, and Agotado update RollDetailModal and SQLite state',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('roll-status-1', {
            colorName: 'Gris Técnico',
            remainingWeight: 600,
            status: 'sealed',
          }),
        ],
      });
      const { page } = session;

      await SEL.SpoolCard.cardByName(page, 'Gris Técnico').locator('h3').click();
      const detail = SEL.RollDetailModal.modal(page);
      await detail.waitFor({ state: 'visible' });

      const transitions = [
        ['En uso', 'in_use'],
        ['Seco', 'dry'],
        ['Agotado', 'empty'],
        ['Sellado', 'sealed'],
        ['En uso', 'in_use'],
      ];

      for (const [label, expectedStatus] of transitions) {
        const btn = SEL.RollDetailModal.statusBtn(detail, label);
        await btn.click();
        await page.waitForFunction(
          async ({ rollId, st }) => {
            const res = await window.filoteca.db.load();
            return res.ok && res.data.rolls.find((r) => r.id === rollId)?.status === st;
          },
          { rollId: 'roll-status-1', st: expectedStatus },
        );
        const cls = (await btn.getAttribute('class')) ?? '';
        assert.ok(cls.includes('font-bold'), `Expected "${label}" pill active class, got "${cls}"`);
        assert.ok(cls.includes('border-accent'), `Expected "${label}" border-accent, got "${cls}"`);
      }

      await SEL.RollDetailModal.closeBtn(detail).click();
      await detail.waitFor({ state: 'hidden' });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      const dbData = await loadDb(page);
      assert.equal(dbData.rolls.find((r) => r.id === 'roll-status-1')?.status, 'in_use');

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F3-06',
    tier: 1,
    tag: 'v1',
    feature: 'F3',
    name: 'Inline location edit in RollDetailModal updates card, emits toast, and persists',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('roll-loc-1', {
            colorName: 'Blanco Nieve',
            location: 'Estante A · 1',
          }),
        ],
      });
      const { page } = session;

      await SEL.SpoolCard.cardByName(page, 'Blanco Nieve').locator('h3').click();
      const detail = SEL.RollDetailModal.modal(page);
      await detail.waitFor({ state: 'visible' });

      await SEL.RollDetailModal.changeLocationBtn(detail).click();
      await SEL.RollDetailModal.locationInput(detail).fill('Caja seca 3 · Superior');
      await SEL.RollDetailModal.saveLocationBtn(detail).click();

      await SEL.Toasts.toastByTitle(page, /Mudanza completada/i).first().waitFor({ state: 'visible' });
      const detailText = normalizeNbsp(await detail.innerText());
      assert.ok(detailText.includes('Caja seca 3 · Superior'), 'Expected updated location in detail modal');

      await SEL.RollDetailModal.closeBtn(detail).click();
      await detail.waitFor({ state: 'hidden' });

      const cardText = normalizeNbsp(await SEL.SpoolCard.cardByName(page, 'Blanco Nieve').innerText());
      assert.ok(cardText.includes('Caja seca 3 · Superior'), 'Expected updated location on SpoolCard');

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      const reloadedText = normalizeNbsp(
        await SEL.SpoolCard.cardByName(page, 'Blanco Nieve').innerText(),
      );
      assert.ok(reloadedText.includes('Caja seca 3 · Superior'));
      const dbData = await loadDb(page);
      assert.equal(dbData.rolls[0].location, 'Caja seca 3 · Superior');

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F4-01',
    tier: 1,
    tag: 'v1',
    feature: 'F4',
    name: 'Search input filters spools by color name, brand, and material, and restores on clear',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('s-1', { brand: 'Prusament', material: 'PLA', colorName: 'Galaxy Black' }),
          makeRoll('s-2', { brand: 'eSun', material: 'PETG', colorName: 'Azul Cristal' }),
          makeRoll('s-3', { brand: 'NinjaTek', material: 'TPU', colorName: 'Verde Neón' }),
        ],
      });
      const { page } = session;
      const search = SEL.TitleBar.searchInput(page);

      await search.fill('Galaxy');
      await waitForCardCount(page, 1);
      await SEL.SpoolCard.cardByName(page, 'Galaxy Black').waitFor({ state: 'visible' });

      await search.fill('eSun');
      await waitForCardCount(page, 1);
      await SEL.SpoolCard.cardByName(page, 'Azul Cristal').waitFor({ state: 'visible' });

      await search.fill('TPU');
      await waitForCardCount(page, 1);
      await SEL.SpoolCard.cardByName(page, 'Verde Neón').waitFor({ state: 'visible' });

      await search.fill('');
      await waitForCardCount(page, 3);

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F4-02',
    tier: 1,
    tag: 'v1',
    feature: 'F4',
    name: 'Material filter pills support multi-select union (PLA + PETG) and toggle off',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('m-1', { brand: 'Bambu Lab', material: 'PLA', colorName: 'Rojo PLA' }),
          makeRoll('m-2', { brand: 'Sunlu', material: 'PLA', colorName: 'Blanco PLA' }),
          makeRoll('m-3', { brand: 'Prusament', material: 'PETG', colorName: 'Ámbar PETG' }),
          makeRoll('m-4', { brand: 'eSun', material: 'ABS', colorName: 'Gris ABS' }),
        ],
      });
      const { page } = session;

      await SEL.ShelfView.filtersToggle(page).click();
      await SEL.ShelfView.materialPill(page, 'PLA').click();
      await waitForCardCount(page, 2);
      assert.match(
        normalizeNbsp(await SEL.ShelfView.resultsCount(page).textContent()),
        /2 de 4 rollos/i,
      );

      await SEL.ShelfView.materialPill(page, 'PETG').click();
      await waitForCardCount(page, 3);
      assert.match(
        normalizeNbsp(await SEL.ShelfView.resultsCount(page).textContent()),
        /3 de 4 rollos/i,
      );

      await SEL.ShelfView.materialPill(page, 'PLA').click();
      await waitForCardCount(page, 1);
      await SEL.SpoolCard.cardByName(page, 'Ámbar PETG').waitFor({ state: 'visible' });

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F4-03',
    tier: 1,
    tag: 'v1',
    feature: 'F4',
    name: 'Brand filter pill narrows results and Reset button clears combined brand and search filters',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('b-1', { brand: 'Anycubic', colorName: 'Anycubic Negro' }),
          makeRoll('b-2', { brand: 'Anycubic', colorName: 'Anycubic Blanco' }),
          makeRoll('b-3', { brand: 'Bambu Lab', colorName: 'Bambu Verde' }),
          makeRoll('b-4', { brand: 'Sunlu', colorName: 'Sunlu Azul' }),
        ],
      });
      const { page } = session;

      await SEL.ShelfView.filtersToggle(page).click();
      await SEL.ShelfView.brandPill(page, 'Anycubic').click();
      await waitForCardCount(page, 2);

      const search = SEL.TitleBar.searchInput(page);
      await search.fill('SinResultados999');
      await waitForCardCount(page, 0);

      await SEL.ShelfView.resetFiltersBtn(page).click();
      await waitForCardCount(page, 4);
      assert.equal(await search.inputValue(), '');

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F4-04',
    tier: 1,
    tag: 'v1',
    feature: 'F4',
    name: 'Sort controls order spools by remaining weight, name, price, and purchase date',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('sort-a', {
            colorName: 'Alfa',
            remainingWeight: 900,
            price: 50000,
            purchaseDate: '2026-08-01',
          }),
          makeRoll('sort-b', {
            colorName: 'Beta',
            remainingWeight: 200,
            price: 90000,
            purchaseDate: '2026-10-01',
          }),
          makeRoll('sort-g', {
            colorName: 'Gamma',
            remainingWeight: 600,
            price: 70000,
            purchaseDate: '2026-09-01',
          }),
        ],
      });
      const { page } = session;

      // Initial: remaining desc (900, 600, 200)
      await waitForCardOrder(page, ['Alfa', 'Gamma', 'Beta']);

      // Click remaining -> asc (200, 600, 900)
      await SEL.ShelfView.sortBtn(page, 'remaining').click();
      await waitForCardOrder(page, ['Beta', 'Gamma', 'Alfa']);

      // Click name -> asc (Alfa, Beta, Gamma) -> desc (Gamma, Beta, Alfa)
      await SEL.ShelfView.sortBtn(page, 'name').click();
      await waitForCardOrder(page, ['Alfa', 'Beta', 'Gamma']);
      await SEL.ShelfView.sortBtn(page, 'name').click();
      await waitForCardOrder(page, ['Gamma', 'Beta', 'Alfa']);

      // Click price -> desc (90k, 70k, 50k) -> asc (50k, 70k, 90k)
      await SEL.ShelfView.sortBtn(page, 'price').click();
      await waitForCardOrder(page, ['Beta', 'Gamma', 'Alfa']);
      await SEL.ShelfView.sortBtn(page, 'price').click();
      await waitForCardOrder(page, ['Alfa', 'Gamma', 'Beta']);

      // Click date -> desc (Oct, Sep, Aug) -> asc (Aug, Sep, Oct)
      await SEL.ShelfView.sortBtn(page, 'date').click();
      await waitForCardOrder(page, ['Beta', 'Gamma', 'Alfa']);
      await SEL.ShelfView.sortBtn(page, 'date').click();
      await waitForCardOrder(page, ['Alfa', 'Gamma', 'Beta']);

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F4-05',
    tier: 1,
    tag: 'v1',
    feature: 'F4',
    name: 'Low-stock toggle shows badge count for low/critical rolls and filters out healthy rolls',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('ls-ok', { colorName: 'Stock Alto', material: 'PLA', remainingWeight: 800 }),
          makeRoll('ls-low', { colorName: 'Stock Bajo', material: 'PETG', remainingWeight: 150 }),
          makeRoll('ls-crit', { colorName: 'Stock Crítico', material: 'ABS', remainingWeight: 50 }),
          makeRoll('ls-empty', {
            colorName: 'Stock Vacío',
            material: 'TPU',
            remainingWeight: 0,
            status: 'empty',
          }),
        ],
      });
      const { page } = session;

      const toggle = SEL.ShelfView.lowStockToggle(page);
      const badge = toggle.locator('span.rounded-full');
      await badge.waitFor({ state: 'visible' });
      assert.equal((await badge.textContent())?.trim(), '2');

      await toggle.click();
      await waitForCardCount(page, 3);
      assert.equal(await SEL.SpoolCard.cardByName(page, 'Stock Alto').count(), 0);
      await SEL.SpoolCard.cardByName(page, 'Stock Bajo').waitFor({ state: 'visible' });
      await SEL.SpoolCard.cardByName(page, 'Stock Crítico').waitFor({ state: 'visible' });
      await SEL.SpoolCard.cardByName(page, 'Stock Vacío').waitFor({ state: 'visible' });

      await toggle.click();
      await waitForCardCount(page, 4);

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F4-06',
    tier: 1,
    tag: 'v1',
    feature: 'F4',
    name: 'Backup stock suppresses critical/low alert only when matching spool has >=150g and >=lowThreshold',
    run: async () => {
      // Part A: second spool has 140g/500g (28% >= 20%, but <150g => NOT backup)
      const session = await prepareTest({
        rolls: [
          makeRoll('bk-crit-a', {
            material: 'PLA',
            colorName: 'Rojo Lava',
            colorHex: '#c8372d',
            initialWeight: 1000,
            remainingWeight: 80,
          }),
          makeRoll('bk-small-a', {
            material: 'PLA',
            colorName: 'Rojo Lava',
            colorHex: '#c8372d',
            initialWeight: 500,
            remainingWeight: 140,
          }),
        ],
      });
      const { page } = session;

      const critCardA = SEL.SpoolCard.allCards(page).filter({ hasText: 'Restante: 80g' });
      await SEL.SpoolCard.cardCriticalBadge(critCardA).waitFor({ state: 'visible' });
      assert.equal(await SEL.SpoolCard.cardBackupBadge(critCardA).count(), 0);
      assert.equal(
        (await SEL.ShelfView.lowStockToggle(page).locator('span.rounded-full').textContent())?.trim(),
        '1',
      );

      // Part B: second spool has 800g/1000g (80% >= 20% AND >= 150g => IS backup)
      await prepareTest({
        rolls: [
          makeRoll('bk-crit-b', {
            material: 'PLA',
            colorName: 'Rojo Lava',
            colorHex: '#c8372d',
            initialWeight: 1000,
            remainingWeight: 80,
          }),
          makeRoll('bk-healthy-b', {
            material: 'PLA',
            colorName: 'Rojo Lava',
            colorHex: '#c8372d',
            initialWeight: 1000,
            remainingWeight: 800,
          }),
        ],
      });

      const backedCard = SEL.SpoolCard.allCards(page).filter({ hasText: 'Restante: 80g' });
      const backupBadge = SEL.SpoolCard.cardBackupBadge(backedCard).first();
      await backupBadge.waitFor({ state: 'visible' });
      assert.match(normalizeNbsp(await backupBadge.textContent()), /8%\s*·\s*Respaldado/i);
      assert.equal(await SEL.SpoolCard.cardCriticalBadge(backedCard).count(), 0);
      assert.equal(await SEL.ShelfView.lowStockToggle(page).locator('span.rounded-full').count(), 0);

      await SEL.ShelfView.lowStockToggle(page).click();
      await waitForCardCount(page, 0);

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F5-01',
    tier: 1,
    tag: 'v1',
    feature: 'F5',
    name: 'Inline card -10g and -25g quick-use buttons deduct weight, transition sealed to in_use, and persist',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('qu-inline-1', {
            colorName: 'Cobre Seda',
            initialWeight: 1000,
            remainingWeight: 500,
            status: 'sealed',
          }),
        ],
      });
      const { page } = session;

      const card = SEL.SpoolCard.cardByName(page, 'Cobre Seda');
      await SEL.SpoolCard.cardQuickUseBtn(card, '-10g').click();
      await SEL.Toasts.toastByTitle(page, /−10 g/i).first().waitFor({ state: 'visible' });

      await SEL.SpoolCard.cardQuickUseBtn(card, '-25g').click();
      await SEL.Toasts.toastByTitle(page, /−25 g/i).first().waitFor({ state: 'visible' });

      const cardText = normalizeNbsp(await card.innerText());
      assert.ok(cardText.includes('Restante: 465g'), `Expected Restante: 465g, got "${cardText}"`);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      const dbData = await loadDb(page);
      assert.equal(dbData.rolls[0].remainingWeight, 465);
      assert.equal(dbData.rolls[0].status, 'in_use');
      assert.equal(dbData.usage.length, 2);

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F5-02',
    tier: 1,
    tag: 'v1',
    feature: 'F5',
    name: 'QuickUseModal preset and note deduct custom grams and persist usage entry',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('qu-modal-1', {
            colorName: 'Negro Mate',
            initialWeight: 1000,
            remainingWeight: 600,
            status: 'in_use',
          }),
        ],
      });
      const { page } = session;

      const card = SEL.SpoolCard.cardByName(page, 'Negro Mate');
      await SEL.SpoolCard.cardQuickUseBtn(card, 'Otro').click();

      const modal = SEL.QuickUseModal.modal(page);
      await modal.waitFor({ state: 'visible' });
      await SEL.QuickUseModal.presetBtn(modal, 75).click();
      assert.equal(await SEL.QuickUseModal.gramsInput(modal).inputValue(), '75');
      await SEL.QuickUseModal.noteInput(modal).fill('Soporte VESA personalizado');
      await SEL.QuickUseModal.submitBtn(modal).click();
      await modal.waitFor({ state: 'hidden' });

      const cardText = normalizeNbsp(await card.innerText());
      assert.ok(cardText.includes('Restante: 525g'), `Expected Restante: 525g, got "${cardText}"`);

      const dbData = await loadDb(page);
      assert.equal(dbData.rolls[0].remainingWeight, 525);
      assert.equal(dbData.usage.length, 1);
      assert.equal(dbData.usage[0].grams, 75);
      assert.equal(dbData.usage[0].note, 'Soporte VESA personalizado');

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F5-03',
    tier: 1,
    tag: 'v1',
    feature: 'F5',
    name: 'RollDetailModal usage history renders entries newest-first with grams, notes, and total consumed',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('hist-1', {
            colorName: 'Oro Seda',
            initialWeight: 1000,
            remainingWeight: 920,
          }),
        ],
        usage: [
          makeUsage('u-1', 'hist-1', 20, 'Primera pieza', '2026-10-02T10:00:00.000Z'),
          makeUsage('u-2', 'hist-1', 60, 'Segunda pieza', '2026-10-03T10:00:00.000Z'),
        ],
      });
      const { page } = session;

      await SEL.SpoolCard.cardByName(page, 'Oro Seda').locator('h3').click();
      const detail = SEL.RollDetailModal.modal(page);
      await detail.waitFor({ state: 'visible' });

      const text = normalizeNbsp(await detail.innerText());
      assert.ok(text.includes('Historial de impresiones (2)'));
      assert.ok(text.includes('Total consumido: 80 g'));
      assert.equal(await SEL.RollDetailModal.undoUsageBtns(detail).count(), 2);

      const secondIdx = text.indexOf('Segunda pieza');
      const firstIdx = text.indexOf('Primera pieza');
      assert.ok(secondIdx !== -1 && firstIdx !== -1 && secondIdx < firstIdx, 'Expected newest entry first');
      assert.ok(text.includes('-60g'));
      assert.ok(text.includes('-20g'));

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F5-04',
    tier: 1,
    tag: 'v1',
    feature: 'F5',
    name: 'Toast Deshacer button restores deducted weight and removes usage entry across reload',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('undo-toast-1', {
            colorName: 'Azul Eléctrico',
            initialWeight: 1000,
            remainingWeight: 400,
            status: 'in_use',
          }),
        ],
      });
      const { page } = session;

      const card = SEL.SpoolCard.cardByName(page, 'Azul Eléctrico');
      await SEL.SpoolCard.cardQuickUseBtn(card, '-50g').click();

      const toast = SEL.Toasts.toastByTitle(page, /−50 g/i).first();
      await toast.waitFor({ state: 'visible' });
      await SEL.Toasts.toastActionBtn(toast, /^(Deshacer|Undo|Desfazer)$/i).click();

      await page.waitForFunction(() => {
        const el = document.querySelector('[role="button"][aria-label^="Bobina "]');
        return el && (el.textContent || '').includes('Restante: 400g');
      });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      const dbData = await loadDb(page);
      assert.equal(dbData.rolls[0].remainingWeight, 400);
      assert.equal(dbData.usage.length, 0);

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F5-05',
    tier: 1,
    tag: 'v1',
    feature: 'F5',
    name: 'History row Deshacer este consumo restores weight and clears usage entry',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('undo-hist-1', {
            colorName: 'Púrpura Real',
            initialWeight: 1000,
            remainingWeight: 850,
          }),
        ],
        usage: [makeUsage('u-del-1', 'undo-hist-1', 150, 'Pieza defectuosa')],
      });
      const { page } = session;

      await SEL.SpoolCard.cardByName(page, 'Púrpura Real').locator('h3').click();
      const detail = SEL.RollDetailModal.modal(page);
      await detail.waitFor({ state: 'visible' });

      await SEL.RollDetailModal.undoUsageBtns(detail).first().click();
      await detail.getByText(/Historial de impresiones \(0\)/).waitFor({ state: 'visible' });
      await detail
        .getByText(/Este rollo aún no tiene consumos registrados\./)
        .waitFor({ state: 'visible' });

      await SEL.RollDetailModal.closeBtn(detail).click();
      await detail.waitFor({ state: 'hidden' });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      const dbData = await loadDb(page);
      assert.equal(dbData.rolls[0].remainingWeight, 1000);
      assert.equal(dbData.usage.length, 0);

      assertNoPageErrors(session);
    },
  },

  {
    id: 'T1-F5-06',
    tier: 1,
    tag: 'v1',
    feature: 'F5',
    name: 'Delete roll Toast Deshacer restores deleted roll and its usage history across reload',
    run: async () => {
      const session = await prepareTest({
        rolls: [
          makeRoll('undo-del-roll', {
            colorName: 'Verde Bosque',
            initialWeight: 1000,
            remainingWeight: 880,
          }),
        ],
        usage: [makeUsage('u-forest-1', 'undo-del-roll', 120, 'Maceta')],
      });
      const { page } = session;

      const card = SEL.SpoolCard.cardByName(page, 'Verde Bosque');
      await card.scrollIntoViewIfNeeded();
      await card.hover();
      await SEL.SpoolCard.cardQuickMenuBtn(card).click();
      await SEL.SpoolCard.portalMenuItem(page, 'delete').click();

      await waitForCardCount(page, 0);
      const toast = SEL.Toasts.toastByTitle(page, /Verde Bosque eliminado/i).first();
      await toast.waitFor({ state: 'visible' });
      await SEL.Toasts.toastActionBtn(toast, /^(Deshacer|Undo|Desfazer)$/i).click();

      await waitForCardCount(page, 1);
      await page.waitForFunction(async () => {
        const res = await window.filoteca.db.load();
        return res.ok && res.data.rolls.length === 1 && res.data.usage.length === 1;
      });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      await waitForCardCount(page, 1);

      const restoredCard = SEL.SpoolCard.cardByName(page, 'Verde Bosque');
      await restoredCard.waitFor({ state: 'visible' });
      const dbData = await loadDb(page);
      assert.equal(dbData.rolls.length, 1);
      assert.equal(dbData.rolls[0].colorName, 'Verde Bosque');
      assert.equal(dbData.rolls[0].remainingWeight, 880);
      assert.equal(dbData.usage.length, 1);
      assert.equal(dbData.usage[0].grams, 120);
      assert.equal(dbData.usage[0].note, 'Maceta');

      assertNoPageErrors(session);
    },
  },
];
