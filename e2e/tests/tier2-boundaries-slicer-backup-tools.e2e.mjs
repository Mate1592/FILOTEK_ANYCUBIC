import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertNoPageErrors,
  launchFiloteca,
  mockOpenDialog,
  mockSaveDialog,
  resetDbState,
  restoreDialogs,
  rmDirWithRetry,
  skipOnboardingFast,
} from '../lib/harness.mjs';
import {
  createAnycubicMetadata,
  createCorruptThumbnailMetadata,
  createCsvRolls,
  createJsonExportBundle,
  createMalformed3mfBuffer,
  createMalformedCsv,
  createMalformedDbBuffer,
  createMalformedGcode,
  createMalformedJson,
  createUnslicedDummyGcode,
  createValid3mfBuffer,
  createValidGcode,
} from '../lib/fixtures.mjs';
import { SEL, normalizeNbsp } from '../lib/selectors.mjs';

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
    id: overrides.id ?? 'roll-t2-f8-1',
    brand: overrides.brand ?? 'Anycubic',
    material: overrides.material ?? 'PLA',
    finish: overrides.finish ?? 'glossy',
    colorName: overrides.colorName ?? 'Naranja Prueba',
    colorHex: overrides.colorHex ?? '#f2754e',
    diameter: overrides.diameter ?? 1.75,
    initialWeight: overrides.initialWeight ?? 1000,
    remainingWeight: overrides.remainingWeight ?? 1000,
    price: overrides.price ?? 75000,
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

function makeUnreviewedJob(overrides = {}) {
  const targetRollId = overrides.rollId ?? overrides.matchedRollId ?? 'roll-t2-f8-1';
  return {
    id: overrides.id ?? 'job-t2-1',
    sessionKey: overrides.sessionKey ?? 'sess-t2-1',
    filename: overrides.filename ?? 'bracket_test.gcode',
    filepath: overrides.filepath ?? 'bracket_test.gcode',
    fileHash: overrides.fileHash ?? 'hash-t2-1',
    jobName: overrides.jobName ?? 'BracketTest',
    plateIndex: overrides.plateIndex ?? 1,
    slicedAt: overrides.slicedAt ?? '2026-11-18T10:00:00.000Z',
    createdAt: overrides.createdAt ?? '2026-11-18T10:01:00.000Z',
    modelNames: overrides.modelNames ?? ['BracketTest.stl'],
    totalLayersCount: overrides.totalLayersCount ?? 120,
    printTimeSeconds: overrides.printTimeSeconds ?? 3600,
    colorChangesCount: overrides.colorChangesCount ?? 0,
    totalGrams: overrides.totalGrams ?? 50,
    manualReviewRequired: false,
    filaments: overrides.filaments ?? [
      {
        slotIndex: 0,
        grams: overrides.totalGrams ?? 50,
        colorHex: '#f2754e',
        materialName: 'PLA',
        brand: 'Anycubic',
        finish: 'glossy',
        rollId: targetRollId,
        suggestedRollId: targetRollId,
        confidence: 1,
      },
    ],
    status: overrides.status ?? 'unreviewed',
  };
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

async function dropFileOnWindow(page, filename, contentBufferOrText, diskPath = '') {
  const buf = Buffer.isBuffer(contentBufferOrText)
    ? contentBufferOrText
    : Buffer.from(String(contentBufferOrText), 'utf8');
  await page.evaluate(
    ({ name, b64, fPath }) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], name, { type: 'application/octet-stream' });
      if (fPath) {
        try {
          Object.defineProperty(file, 'path', { value: fPath, configurable: true });
        } catch {
          // ignore if readonly
        }
      }
      const dt = new DataTransfer();
      dt.items.add(file);
      const target = document.querySelector('#root > div') || document.body;
      target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    },
    { name: filename, b64: buf.toString('base64'), fPath: diskPath },
  );
}

async function dismissAllToasts(page) {
  const container = SEL.Toasts.toastContainer(page);
  if ((await container.locator('div.pointer-events-auto').count()) === 0) return;
  await container.evaluate((el) => {
    el.querySelectorAll('div.pointer-events-auto button:last-of-type').forEach((btn) => btn.click());
  });
  await page.waitForFunction(
    () => document.querySelectorAll('div.fixed.bottom-4.right-4.z-50 div.pointer-events-auto').length === 0,
    null,
    { timeout: 5000 },
  );
}

function fieldControlByLabel(root, rx, selector = 'input[type="number"], input, select') {
  return root
    .locator('label, span', { hasText: rx })
    .locator('xpath=ancestor::div[1]')
    .locator(selector)
    .first();
}

export const tests = [
  // =========================================================================
  // F8 Slicer / Inbox Boundaries (11 tests: 8 v1, 3 v2)
  // =========================================================================
  {
    id: 'T2-F8-01',
    tier: 2,
    tag: 'v1',
    feature: 'F8',
    name: 'Dropping unsupported .txt and .stl files shows warn toast Archivo no compatible and adds 0 jobs',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, { rolls: [], gcodeJobs: [] });

      await dropFileOnWindow(page, 'notes.txt', 'hello workshop');
      const warnTxt = SEL.Toasts.toastByTitle(page, /Archivo no compatible/i).first();
      await warnTxt.waitFor({ state: 'visible' });
      await dismissAllToasts(page);

      await dropFileOnWindow(page, 'bracket.stl', 'solid bracket\nendsolid bracket');
      const warnStl = SEL.Toasts.toastByTitle(page, /Archivo no compatible/i).first();
      await warnStl.waitFor({ state: 'visible' });

      assert.equal((await dbLoad(page)).gcodeJobs.length, 0);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F8-02',
    tier: 2,
    tag: 'v1',
    feature: 'F8',
    name: 'Un-sliced dummy .gcode (0 layers, 0s, no thumb) is rejected via drop and parseGcodePath with 0 jobs added',
    run: async () => {
      const { page, artifactsDir } = sharedCtx;
      await resetDbState(page, { rolls: [], gcodeJobs: [] });

      const dummyText = createUnslicedDummyGcode();
      const dummyPath = path.join(artifactsDir, 'dummy_unsliced.gcode');
      fs.writeFileSync(dummyPath, dummyText, 'utf8');

      const ipcRes = await page.evaluate((p) => window.filoteca.file.parseGcodePath(p), dummyPath);
      assert.equal(ipcRes.ok, true);
      assert.equal(ipcRes.data, null);

      await dropFileOnWindow(page, 'dummy_unsliced.gcode', dummyText, dummyPath);
      await SEL.Toasts.toastByTitle(page, /Error al procesar archivo/i).waitFor({ state: 'visible' });
      assert.equal((await dbLoad(page)).gcodeJobs.length, 0);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F8-03',
    tier: 2,
    tag: 'v1',
    feature: 'F8',
    name: 'Malformed/truncated .gcode is rejected cleanly via drop with Error al procesar archivo and 0 jobs',
    run: async () => {
      const { page, artifactsDir } = sharedCtx;
      await resetDbState(page, { rolls: [], gcodeJobs: [] });

      const badGcode = createMalformedGcode();
      const badPath = path.join(artifactsDir, 'malformed_header.gcode');
      fs.writeFileSync(badPath, badGcode, 'utf8');

      await dropFileOnWindow(page, 'malformed_header.gcode', badGcode, badPath);
      await SEL.Toasts.toastByTitle(page, /Error al procesar archivo/i).waitFor({ state: 'visible' });
      assert.equal((await dbLoad(page)).gcodeJobs.length, 0);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F8-04',
    tier: 2,
    tag: 'v1',
    feature: 'F8',
    name: 'Corrupt-thumbnail .metadata creates valid job without thumbnail and renders FileCode fallback in InboxView',
    run: async () => {
      const { page, artifactsDir } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'r-corrupt-thumb', colorHex: '#1f2023' })],
        gcodeJobs: [],
      });

      const metaText = createCorruptThumbnailMetadata();
      const metaPath = path.join(artifactsDir, 'corrupt_thumb.gcode.metadata');
      fs.writeFileSync(metaPath, metaText, 'utf8');

      const parsedRes = await page.evaluate(async (p) => {
        const res = await window.filoteca.file.parseGcodePath(p);
        if (res.ok && res.data) {
          await window.filoteca.db.upsertGcodeJob(res.data);
        }
        return res;
      }, metaPath);

      assert.equal(parsedRes.ok, true);
      assert.ok(parsedRes.data, 'Expected valid job from corrupt-thumbnail metadata');
      assert.equal(parsedRes.data.totalGrams, 10.5);
      assert.equal(parsedRes.data.thumbnailSmallPath, undefined);
      assert.equal(parsedRes.data.thumbnailLargePath, undefined);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await SEL.TitleBar.navTab(page, 'inbox').click();
      const card = SEL.InboxView.jobCard(page, 'CorruptThumb_Test');
      await card.waitFor({ state: 'visible' });
      assert.equal(await card.locator('img').count(), 0);
      await card.getByText('G-code', { exact: true }).waitFor({ state: 'visible' });
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F8-05',
    tier: 2,
    tag: 'v1',
    feature: 'F8',
    name: 'InboxView shows deficit warning Faltan X.X g en esta bobina when slot grams exceed matched roll stock',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'roll-deficit', remainingWeight: 20 })],
        gcodeJobs: [
          makeUnreviewedJob({
            id: 'job-deficit',
            jobName: 'DeficitPrint',
            totalGrams: 50,
            matchedRollId: 'roll-deficit',
          }),
        ],
      });

      await SEL.TitleBar.navTab(page, 'inbox').click();
      const card = SEL.InboxView.jobCard(page, 'DeficitPrint');
      await card.waitFor({ state: 'visible' });
      await card.getByText('Faltan 30.0 g en esta bobina', { exact: true }).waitFor({ state: 'visible' });
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F8-06',
    tier: 2,
    tag: 'v1',
    feature: 'F8',
    name: 'InboxView Fallo / parcial minimum 5% slider boundary deducts 5% and moves job to Fallidos',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'roll-fail-min', remainingWeight: 500 })],
        gcodeJobs: [
          makeUnreviewedJob({
            id: 'job-fail-min',
            jobName: 'PartialMin5',
            totalGrams: 100,
            filaments: [
              {
                slotIndex: 0,
                grams: 100,
                colorHex: '#f2754e',
                materialName: 'PLA',
                brand: 'Anycubic',
                finish: 'glossy',
                rollId: 'roll-fail-min',
                suggestedRollId: 'roll-fail-min',
                confidence: 1,
              },
            ],
          }),
        ],
      });

      await SEL.TitleBar.navTab(page, 'inbox').click();
      const card = SEL.InboxView.jobCard(page, 'PartialMin5');
      await SEL.InboxView.partialFailBtn(card).click();
      const modal = SEL.InboxView.failedModal(page);
      await modal.waitFor({ state: 'visible' });

      const range = SEL.InboxView.failedPercentRange(modal);
      assert.equal(await range.getAttribute('min'), '5');
      await setRangeValue(range, 5);
      await modal.getByText('5%', { exact: true }).waitFor({ state: 'visible' });
      await modal.getByText('5 g', { exact: true }).waitFor({ state: 'visible' });

      await SEL.InboxView.failedConfirmBtn(modal).click();
      await modal.waitFor({ state: 'hidden' });

      const data = await dbLoad(page);
      assert.equal(data.rolls[0].remainingWeight, 495);
      assert.equal(data.usage[0].grams, 5);
      assert.equal(data.gcodeJobs[0].status, 'failed');
      assert.equal(data.gcodeJobs[0].printedPercent, 5);

      await SEL.InboxView.statusTab(page, /^Fallidos/i).click();
      await card.getByText(/Fallido \(5%\)/i).waitFor({ state: 'visible' });
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F8-07',
    tier: 2,
    tag: 'v1',
    feature: 'F8',
    name: 'InboxView Fallo / parcial maximum 95% slider boundary deducts 95% and moves job to Fallidos',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'roll-fail-max', remainingWeight: 500 })],
        gcodeJobs: [
          makeUnreviewedJob({
            id: 'job-fail-max',
            jobName: 'PartialMax95',
            totalGrams: 100,
            filaments: [
              {
                slotIndex: 0,
                grams: 100,
                colorHex: '#f2754e',
                materialName: 'PLA',
                brand: 'Anycubic',
                finish: 'glossy',
                rollId: 'roll-fail-max',
                suggestedRollId: 'roll-fail-max',
                confidence: 1,
              },
            ],
          }),
        ],
      });

      await SEL.TitleBar.navTab(page, 'inbox').click();
      const card = SEL.InboxView.jobCard(page, 'PartialMax95');
      await SEL.InboxView.partialFailBtn(card).click();
      const modal = SEL.InboxView.failedModal(page);
      await modal.waitFor({ state: 'visible' });

      const range = SEL.InboxView.failedPercentRange(modal);
      assert.equal(await range.getAttribute('max'), '95');
      await setRangeValue(range, 95);
      await modal.getByText('95%', { exact: true }).waitFor({ state: 'visible' });
      await modal.getByText('95 g', { exact: true }).waitFor({ state: 'visible' });

      await SEL.InboxView.failedConfirmBtn(modal).click();
      await modal.waitFor({ state: 'hidden' });

      const data = await dbLoad(page);
      assert.equal(data.rolls[0].remainingWeight, 405);
      assert.equal(data.usage[0].grams, 95);
      assert.equal(data.gcodeJobs[0].status, 'failed');
      assert.equal(data.gcodeJobs[0].printedPercent, 95);

      await SEL.InboxView.statusTab(page, /^Fallidos/i).click();
      await card.getByText(/Fallido \(95%\)/i).waitFor({ state: 'visible' });
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F8-08',
    tier: 2,
    tag: 'v1',
    feature: 'F8',
    name: 'InboxView Fallo / parcial Cancelar button leaves job unreviewed and inventory untouched',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'roll-fail-cancel', remainingWeight: 500 })],
        gcodeJobs: [
          makeUnreviewedJob({
            id: 'job-fail-cancel',
            jobName: 'PartialCancel',
            totalGrams: 80,
            matchedRollId: 'roll-fail-cancel',
          }),
        ],
      });

      await SEL.TitleBar.navTab(page, 'inbox').click();
      const card = SEL.InboxView.jobCard(page, 'PartialCancel');
      await SEL.InboxView.partialFailBtn(card).click();
      const modal = SEL.InboxView.failedModal(page);
      await modal.waitFor({ state: 'visible' });

      await setRangeValue(SEL.InboxView.failedPercentRange(modal), 30);
      await modal.getByRole('button', { name: /^Cancelar$/i }).click();
      await modal.waitFor({ state: 'hidden' });

      const data = await dbLoad(page);
      assert.equal(data.rolls[0].remainingWeight, 500);
      assert.equal(data.usage.length, 0);
      assert.equal(data.gcodeJobs[0].status, 'unreviewed');
      assert.equal(await card.isVisible(), true);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F8-09',
    tier: 2,
    tag: 'v2',
    feature: 'F8',
    name: 'Corrupt, truncated, empty-zip, and 0-byte .3mf files are handled gracefully with null/error toast and 0 pageerrors',
    run: async () => {
      const { page, artifactsDir } = sharedCtx;
      await resetDbState(page, { rolls: [], gcodeJobs: [] });

      const cases = [
        ['bad_magic.3mf', createMalformed3mfBuffer('bad-magic')],
        ['truncated_zip.3mf', createMalformed3mfBuffer('truncated-zip')],
        ['empty_zip.3mf', createMalformed3mfBuffer('empty-zip')],
        ['zero_byte.3mf', Buffer.alloc(0)],
      ];

      for (const [name, buf] of cases) {
        const filePath = path.join(artifactsDir, name);
        fs.writeFileSync(filePath, buf);
        const ipcRes = await page.evaluate((p) => window.filoteca.file.parseGcodePath(p), filePath);
        assert.equal(ipcRes.ok, true, `${name} IPC call errored unexpectedly`);
        assert.equal(ipcRes.data, null, `${name} should return null`);

        await dismissAllToasts(page);
        await dropFileOnWindow(page, name, buf, filePath);
        await SEL.Toasts.toastByTitle(page, /Error al procesar archivo/i).first().waitFor({ state: 'visible', timeout: 5000 });
        await dismissAllToasts(page);
      }

      assert.equal((await dbLoad(page)).gcodeJobs.length, 0);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F8-10',
    tier: 2,
    tag: 'v2',
    feature: 'F8',
    name: 'Bit-3 Data Descriptor .3mf with comma-delimited volumetric fallback extracts valid grams > 0',
    run: async () => {
      const { page, artifactsDir } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'r-dd', colorHex: '#f2754e', material: 'PLA' })],
        gcodeJobs: [],
      });

      const buf = createValid3mfBuffer(
        [
          {
            slicer: 'orca',
            omitGrams: true,
            models: ['DataDesc_Bracket.stl'],
            slots: [
              {
                grams: 24.8,
                lengthMm: 8306.8,
                volumeCm3: 20.0,
                colorHex: '#f2754e',
                material: 'PLA',
                density: 1.24,
                diameter: 1.75,
              },
            ],
          },
        ],
        { useDataDescriptor: true },
      );

      const filePath = path.join(artifactsDir, 'bit3_datadescriptor.3mf');
      fs.writeFileSync(filePath, buf);

      const res = await page.evaluate((p) => window.filoteca.file.parseGcodePath(p), filePath);
      assert.equal(res.ok, true);
      assert.ok(res.data, 'Expected parsed job from bit-3 data descriptor .3mf');
      assert.ok(res.data.totalGrams > 20 && res.data.totalGrams < 30, `Unexpected grams: ${res.data.totalGrams}`);
      assert.equal(res.data.filaments.length, 1);
      assert.ok(res.data.filaments[0].grams > 20);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F8-11',
    tier: 2,
    tag: 'v2',
    feature: 'F8',
    name: 'Multi-plate .3mf (2+ plates) extracts all plates without losing filament slots',
    run: async () => {
      const { page, artifactsDir } = sharedCtx;
      await resetDbState(page, { rolls: [], gcodeJobs: [] });

      const buf = createValid3mfBuffer([
        {
          plateIndex: 1,
          models: ['BasePlate1.stl'],
          slots: [
            { grams: 15.0, colorHex: '#1f2023', material: 'PLA' },
            { grams: 8.5, colorHex: '#f4f4f6', material: 'PLA' },
          ],
        },
        {
          plateIndex: 2,
          models: ['LidPlate2.stl'],
          slots: [{ grams: 32.5, colorHex: '#f2754e', material: 'PETG' }],
        },
      ]);

      const filePath = path.join(artifactsDir, 'multiplate_project.3mf');
      fs.writeFileSync(filePath, buf);

      const res = await page.evaluate((p) => window.filoteca.file.parseGcodePath(p), filePath);
      assert.equal(res.ok, true);
      assert.ok(res.data, 'Expected multi-plate .3mf result');
      const plates = res.data.plates ?? [];
      assert.equal(plates.length, 2, `Expected 2 plates, got ${plates.length}`);
      assert.equal(plates[0].plateIndex, 1);
      assert.equal(plates[0].filaments.length, 2);
      assert.equal(plates[1].plateIndex, 2);
      assert.equal(plates[1].filaments.length, 1);
      assert.ok(Math.abs(plates[1].totalGrams - 32.5) < 0.2);
      assertNoPageErrors(sharedCtx);
    },
  },

  // =========================================================================
  // F9 Backup, Export & Import Boundaries (9 tests: all v1)
  // =========================================================================
  {
    id: 'T2-F9-01',
    tier: 2,
    tag: 'v1',
    feature: 'F9',
    name: 'Malformed JSON syntax import shows Error de importacion toast and preserves existing rolls',
    run: async () => {
      const { app, page, artifactsDir } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'keep-json-1', colorName: 'Intacto JSON' })],
      });

      const badJsonPath = path.join(artifactsDir, 'bad_syntax.json');
      fs.writeFileSync(badJsonPath, createMalformedJson('syntax'), 'utf8');

      await SEL.TitleBar.navTab(page, 'settings').click();
      await mockOpenDialog(app, badJsonPath);
      try {
        await SEL.SettingsView.importFileBtn(page).click();
        await SEL.Toasts.toastByTitle(page, /Error de importación/i).waitFor({ state: 'visible' });
      } finally {
        await restoreDialogs(app);
      }

      const data = await dbLoad(page);
      assert.equal(data.rolls.length, 1);
      assert.equal(data.rolls[0].id, 'keep-json-1');
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F9-02',
    tier: 2,
    tag: 'v1',
    feature: 'F9',
    name: 'JSON missing rolls array shows Error de importacion / Formato JSON no reconocido and preserves rolls',
    run: async () => {
      const { app, page, artifactsDir } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'keep-json-2', colorName: 'Intacto Estructura' })],
      });

      const missingRollsPath = path.join(artifactsDir, 'missing_rolls.json');
      fs.writeFileSync(missingRollsPath, createMalformedJson('missing-rolls'), 'utf8');

      await SEL.TitleBar.navTab(page, 'settings').click();
      await mockOpenDialog(app, missingRollsPath);
      try {
        await SEL.SettingsView.importFileBtn(page).click();
        const toast = SEL.Toasts.toastByTitle(page, /Error de importación/i);
        await toast.waitFor({ state: 'visible' });
        await toast.getByText(/Formato JSON no reconocido\./i).waitFor({ state: 'visible' });
      } finally {
        await restoreDialogs(app);
      }

      const data = await dbLoad(page);
      assert.equal(data.rolls.length, 1);
      assert.equal(data.rolls[0].id, 'keep-json-2');
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F9-03',
    tier: 2,
    tag: 'v1',
    feature: 'F9',
    name: 'Malformed CSV (insufficient-cols and garbage) shows Error de importacion and preserves rolls',
    run: async () => {
      const { app, page, artifactsDir } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'keep-csv-1', colorName: 'Intacto CSV' })],
      });

      await SEL.TitleBar.navTab(page, 'settings').click();
      for (const mode of ['insufficient-cols', 'garbage']) {
        const csvPath = path.join(artifactsDir, `bad_${mode}.csv`);
        fs.writeFileSync(csvPath, createMalformedCsv(mode), 'utf8');

        await mockOpenDialog(app, csvPath);
        try {
          await SEL.SettingsView.importFileBtn(page).click();
          const toast = SEL.Toasts.toastByTitle(page, /Error de importación/i).first();
          await toast.waitFor({ state: 'visible' });
          await toast.getByText(/No se encontraron filas válidas en el CSV\./i).waitFor({ state: 'visible' });
          await dismissAllToasts(page);
        } finally {
          await restoreDialogs(app);
        }
      }

      const data = await dbLoad(page);
      assert.equal(data.rolls.length, 1);
      assert.equal(data.rolls[0].id, 'keep-csv-1');
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F9-04',
    tier: 2,
    tag: 'v1',
    feature: 'F9',
    name: 'Header-only CSV (0 data rows) shows Error de importacion and preserves existing rolls',
    run: async () => {
      const { app, page, artifactsDir } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'keep-csv-hdr', colorName: 'Intacto HeaderCSV' })],
      });

      const csvPath = path.join(artifactsDir, 'header_only.csv');
      fs.writeFileSync(csvPath, createMalformedCsv('header-only'), 'utf8');

      await SEL.TitleBar.navTab(page, 'settings').click();
      await mockOpenDialog(app, csvPath);
      try {
        await SEL.SettingsView.importFileBtn(page).click();
        const toast = SEL.Toasts.toastByTitle(page, /Error de importación/i);
        await toast.waitFor({ state: 'visible' });
        await toast.getByText(/No se encontraron filas válidas en el CSV\./i).waitFor({ state: 'visible' });
      } finally {
        await restoreDialogs(app);
      }

      const data = await dbLoad(page);
      assert.equal(data.rolls.length, 1);
      assert.equal(data.rolls[0].id, 'keep-csv-hdr');
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F9-05',
    tier: 2,
    tag: 'v1',
    feature: 'F9',
    timeoutMs: 120_000,
    name: 'Corrupt .db restore shows Error al restaurar keeping DB intact, and corrupt filoteca.db cold-boot recovers cleanly',
    run: async ({ signal }) => {
      // Part 1: Restore dialog with corrupt .db file
      const { app, page, artifactsDir } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'keep-db-1', colorName: 'Intacto DB' })],
      });

      const corruptDbPath = path.join(artifactsDir, 'corrupt_backup.db');
      fs.writeFileSync(corruptDbPath, createMalformedDbBuffer());

      await SEL.TitleBar.navTab(page, 'settings').click();
      await mockOpenDialog(app, corruptDbPath);
      try {
        await SEL.SettingsView.restoreDbBtn(page).click();
        const toast = SEL.Toasts.toastByTitle(page, /Error al restaurar/i);
        await toast.waitFor({ state: 'visible' });
        await toast.getByText(/backup válido de Filoteca/i).waitFor({ state: 'visible' });
      } finally {
        await restoreDialogs(app);
      }

      const data = await dbLoad(page);
      assert.equal(data.rolls.length, 1);
      assert.equal(data.rolls[0].id, 'keep-db-1');
      assertNoPageErrors(sharedCtx);

      // Part 2: Pre-seeded corrupt filoteca.db on disk recovers cleanly on cold boot
      const corruptUd = fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-e2e-corruptdb-'));
      try {
        const bootCtx = await launchFiloteca({
          userDataDir: corruptUd,
          reducedMotion: true,
          signal,
          preSeed: ({ userDataDir }) => {
            fs.writeFileSync(path.join(userDataDir, 'filoteca.db'), createMalformedDbBuffer());
          },
        });
        try {
          await SEL.OnboardingModal.modal(bootCtx.page).waitFor({ state: 'visible' });
          const files = fs.readdirSync(corruptUd);
          assert.ok(
            files.some((f) => f.startsWith('filoteca.db.corrupt-')),
            `Expected renamed corrupt DB in ${corruptUd}, found: ${files.join(', ')}`,
          );
          assert.equal(fs.existsSync(path.join(corruptUd, 'filoteca.db')), true);
          assertNoPageErrors(bootCtx);
        } finally {
          await bootCtx.close();
        }
      } finally {
        await rmDirWithRetry(corruptUd);
      }
    },
  },

  {
    id: 'T2-F9-06',
    tier: 2,
    tag: 'v1',
    feature: 'F9',
    name: 'Cancelled save dialogs (backup:create, JSON export, CSV export) leave state unchanged with 0 errors',
    run: async () => {
      const { app, page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'save-cancel-1', colorName: 'Save Cancel' })],
      });

      await SEL.TitleBar.navTab(page, 'settings').click();
      await dismissAllToasts(page);
      await mockSaveDialog(app, null);
      try {
        await SEL.SettingsView.backupDbBtn(page).click();
        await page.waitForTimeout(150);
        await SEL.SettingsView.exportJsonBtn(page).click();
        await page.waitForTimeout(150);
        await SEL.SettingsView.exportCsvBtn(page).click();
        await page.waitForTimeout(150);
      } finally {
        await restoreDialogs(app);
      }

      assert.equal(await SEL.Toasts.toastContainer(page).locator('div.pointer-events-auto').count(), 0);
      assert.equal((await dbLoad(page)).rolls.length, 1);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F9-07',
    tier: 2,
    tag: 'v1',
    feature: 'F9',
    name: 'Cancelled open dialogs (backup:restore, JSON/CSV import) leave state unchanged with 0 errors',
    run: async () => {
      const { app, page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'open-cancel-1', colorName: 'Open Cancel' })],
      });

      await SEL.TitleBar.navTab(page, 'settings').click();
      await dismissAllToasts(page);
      await mockOpenDialog(app, null);
      try {
        await SEL.SettingsView.restoreDbBtn(page).click();
        await page.waitForTimeout(150);
        await SEL.SettingsView.importFileBtn(page).click();
        await page.waitForTimeout(150);
      } finally {
        await restoreDialogs(app);
      }

      assert.equal(await SEL.Toasts.toastContainer(page).locator('div.pointer-events-auto').count(), 0);
      assert.equal((await dbLoad(page)).rolls.length, 1);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F9-08',
    tier: 2,
    tag: 'v1',
    feature: 'F9',
    name: 'Duplicate ID JSON import merges cleanly without creating duplicate roll IDs in DB or DOM',
    run: async () => {
      const { app, page, artifactsDir } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'dup-roll-1', colorName: 'Original Dup', remainingWeight: 500 })],
      });

      const bundlePath = path.join(artifactsDir, 'duplicate_id_bundle.json');
      fs.writeFileSync(
        bundlePath,
        createJsonExportBundle({
          rolls: [makeRoll({ id: 'dup-roll-1', colorName: 'Actualizado Dup', remainingWeight: 750 })],
        }),
        'utf8',
      );

      await SEL.TitleBar.navTab(page, 'settings').click();
      await mockOpenDialog(app, bundlePath);
      try {
        await SEL.SettingsView.importFileBtn(page).click();
        await SEL.Toasts.toastByTitle(page, /Importación exitosa/i).waitFor({ state: 'visible' });
      } finally {
        await restoreDialogs(app);
      }

      const data = await dbLoad(page);
      assert.equal(data.rolls.length, 1);
      assert.equal(data.rolls[0].id, 'dup-roll-1');
      assert.equal(data.rolls[0].colorName, 'Actualizado Dup');
      assert.equal(data.rolls[0].remainingWeight, 750);

      await SEL.TitleBar.navTab(page, 'shelf').click();
      assert.equal(normalizeNbsp(await SEL.ShelfView.resultsCount(page).textContent()), '1 de 1 rollos');
      assert.equal(await SEL.SpoolCard.allCards(page).count(), 1);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F9-09',
    tier: 2,
    tag: 'v1',
    feature: 'F9',
    name: 'JSON import with empty rolls: [] preserves existing rolls without wiping inventory',
    run: async () => {
      const { app, page, artifactsDir } = sharedCtx;
      await resetDbState(page, {
        rolls: [
          makeRoll({ id: 'keep-empty-1', colorName: 'Preservado A' }),
          makeRoll({ id: 'keep-empty-2', colorName: 'Preservado B' }),
        ],
      });

      const emptyBundlePath = path.join(artifactsDir, 'empty_rolls_bundle.json');
      fs.writeFileSync(emptyBundlePath, createJsonExportBundle({ rolls: [] }), 'utf8');

      await SEL.TitleBar.navTab(page, 'settings').click();
      await mockOpenDialog(app, emptyBundlePath);
      try {
        await SEL.SettingsView.importFileBtn(page).click();
        const toast = SEL.Toasts.toastByTitle(page, /Importación exitosa/i);
        await toast.waitFor({ state: 'visible' });
        await toast.getByText(/0 rollos/i).waitFor({ state: 'visible' });
      } finally {
        await restoreDialogs(app);
      }

      const data = await dbLoad(page);
      assert.equal(data.rolls.length, 2);
      assert.deepEqual(
        data.rolls.map((r) => r.id).sort(),
        ['keep-empty-1', 'keep-empty-2'],
      );
      assertNoPageErrors(sharedCtx);
    },
  },

  // =========================================================================
  // F10 Workshop Tools (ToolsView) Boundaries (9 tests: all v2)
  // =========================================================================
  {
    id: 'T2-F10-01',
    tier: 2,
    tag: 'v2',
    feature: 'F10',
    name: 'Quote Calculator with 0g, 0 print time, and 0 kWh rate produces valid 0 total without NaN',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'q-zero', colorName: 'Cero Cotiza', price: 0 })],
      });

      await SEL.TitleBar.navTab(page, 'tools').click();
      await SEL.ToolsView.toolsTabQuote(page).first().click();

      const fillRequiredNumber = async (testId, labelRx, val) => {
        const loc = page
          .locator(`[data-testid="${testId}"]`)
          .or(fieldControlByLabel(page, labelRx, 'input[type="number"]'))
          .first();
        await loc.waitFor({ state: 'visible' });
        await loc.fill(String(val));
      };

      await fillRequiredNumber('quote-grams-input', /^(?:Gramos|Grams|Gramas)\s*\(g\)$/i, '0');
      await fillRequiredNumber('quote-hours-input', /^(?:Horas|Hours)$/i, '0');
      await fillRequiredNumber('quote-minutes-input', /^(?:Minutos|Minutes)$/i, '0');
      await fillRequiredNumber('quote-electricity-rate', /Tarifa el[eé]ctrica|Electricity rate|Tarifa de energia|\bkWh\b/i, '0');
      await fillRequiredNumber('quote-machine-rate', /Tarifa m[aá]quina|Machine rate|Taxa m[aá]quina/i, '0');

      const totalEl = SEL.ToolsView.quoteTotalOutput(page);
      await totalEl.waitFor({ state: 'visible' });
      const totalTxt = normalizeNbsp(await totalEl.innerText());
      assert.match(totalTxt, /^\$\s*0$/, `Expected $ 0 total output, got: ${totalTxt}`);

      const mainTxt = normalizeNbsp(await page.locator('main').innerText());
      assert.equal(/\b(?:NaN|Infinity|undefined)\b/i.test(mainTxt), false, `Found NaN/Infinity in QuoteCalculator: ${mainTxt}`);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F10-02',
    tier: 2,
    tag: 'v2',
    feature: 'F10',
    name: 'Quote Calculator handles 0% margin, 50% failure buffer, 10 units batch, and 0.185 decimal kWh rate',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        settings: { currency: 'USD' },
        rolls: [makeRoll({ id: 'q-dec', colorName: 'Quote Dec', price: 25, initialWeight: 1000, remainingWeight: 1000 })],
      });

      await SEL.TitleBar.navTab(page, 'tools').click();
      await SEL.ToolsView.toolsTabQuote(page).first().click();

      const fillRequired = async (testId, rx, val) => {
        const loc = page
          .locator(`[data-testid="${testId}"]`)
          .or(fieldControlByLabel(page, rx, 'input[type="number"]'))
          .first();
        await loc.waitFor({ state: 'visible' });
        await loc.fill(String(val));
        return loc;
      };

      await fillRequired('quote-spool-price-input', /^(?:Precio bobina|Spool price|Pre[cç]o do carretel)$/i, '25');
      await fillRequired('quote-grams-input', /^(?:Gramos|Grams|Gramas)\s*\(g\)$/i, '100');
      await fillRequired('quote-hours-input', /^(?:Horas|Hours)$/i, '2');
      const kwhLoc = await fillRequired('quote-electricity-rate', /Tarifa el[eé]ctrica|Electricity rate|Tarifa de energia|\bkWh\b/i, '0.185');
      await fillRequired('quote-machine-rate', /Tarifa m[aá]quina|Machine rate|Taxa m[aá]quina/i, '0');
      await fillRequired('quote-failure-input', /Buffer de fallo|Reserva de falha|Failure buffer/i, '50');
      await fillRequired('quote-margin-input', /Utilidad|Lucro|Margen|Ganancia|Margin|Profit/i, '0');
      await fillRequired('quote-units-input', /Unidades|Units/i, '10');

      const totalEl = SEL.ToolsView.quoteTotalOutput(page);
      await totalEl.waitFor({ state: 'visible' });
      const totalTxt = normalizeNbsp(await totalEl.innerText());
      assert.match(totalTxt, /^(?:US\$|USD|\$)\s*3[.,]83$/, `Unexpected total output: ${totalTxt}`);

      const unitSpan = totalEl.locator('xpath=..').locator('span.font-bold.text-text').first();
      await unitSpan.waitFor({ state: 'visible' });
      const unitTxt = normalizeNbsp(await unitSpan.innerText());
      assert.match(unitTxt, /^(?:US\$|USD|\$)\s*0[.,]38$/, `Unexpected unit price output: ${unitTxt}`);

      const parseNum = (s) => {
        const cleaned = s.replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.');
        return Number.parseFloat(cleaned);
      };
      const totalVal = parseNum(totalTxt);
      const unitVal = parseNum(unitTxt);
      assert.ok(Number.isFinite(totalVal) && totalVal > 0);
      assert.ok(Math.abs(unitVal - totalVal / 10) < 0.02, `Unit ${unitVal} does not match total/10 (${totalVal / 10})`);

      assert.equal(await kwhLoc.inputValue(), '0.185');
      const mainTxt = normalizeNbsp(await page.locator('main').innerText());
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(mainTxt), false, `Quote rendered NaN/Infinity: ${mainTxt}`);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F10-03',
    tier: 2,
    tag: 'v2',
    feature: 'F10',
    name: 'Quote Calculator 100% margin boundary clamps cleanly without Infinity or NaN',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'q-margin', colorName: 'Margin Clamp', price: 80000 })],
      });

      await SEL.TitleBar.navTab(page, 'tools').click();
      await SEL.ToolsView.toolsTabQuote(page).first().click();

      const marginModeBtn = page.getByRole('button', {
        name: /Margen \(sobre venta\)|Margin \(over price\)|Margem \(sobre venda\)/i,
      });
      await marginModeBtn.waitFor({ state: 'visible' });
      await marginModeBtn.click();

      const marginInput = page
        .locator('[data-testid="quote-margin-input"]')
        .or(fieldControlByLabel(page, /Utilidad|Lucro|Margen|Ganancia|Margin|Profit/i, 'input[type="number"]'))
        .first();
      await marginInput.waitFor({ state: 'visible' });
      await marginInput.fill('100');

      await page.getByText(/Margen 99\.9%|Margin 99\.9%|Margem 99\.9%/i).waitFor({ state: 'visible' });
      const totalEl = SEL.ToolsView.quoteTotalOutput(page);
      await totalEl.waitFor({ state: 'visible' });
      const totalTxt = normalizeNbsp(await totalEl.innerText());
      const numericTotal = Number.parseFloat(totalTxt.replace(/[^0-9]/g, ''));
      assert.ok(Number.isFinite(numericTotal) && numericTotal >= 1_000_000, `Expected 99.9% margin clamp total >= 1,000,000, got: ${totalTxt}`);

      const mainTxt = normalizeNbsp(await page.locator('main').innerText());
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(mainTxt), false, `Quote rendered NaN/Infinity at 100% margin: ${mainTxt}`);

      // Also verify manual target price below production cost warning
      const targetToggle = page
        .locator('label', { hasText: /precio objetivo manual|manual target price|pre[cç]o-alvo manual/i })
        .locator('input[type="checkbox"]')
        .first();
      await targetToggle.waitFor({ state: 'visible' });
      await targetToggle.check();

      const targetInput = fieldControlByLabel(
        page,
        /Precio total objetivo|Target total price|Pre[cç]o total objetivo/i,
        'input[type="number"]',
      );
      await targetInput.waitFor({ state: 'visible' });
      await targetInput.fill('1');

      await page
        .getByText(/por debajo del costo de producci[oó]n|below production cost|abaixo do custo de produ[cç][aã]o/i)
        .waitFor({ state: 'visible' });
      assert.match(normalizeNbsp(await totalEl.innerText()), /^\$\s*1$/);
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(await page.locator('main').innerText()), false);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F10-04',
    tier: 2,
    tag: 'v2',
    feature: 'F10',
    name: 'Batch Slicer Inspector handles 0 files / cancelled multi-select gracefully',
    run: async () => {
      const { app, page } = sharedCtx;
      await resetDbState(page, { rolls: [] });

      await SEL.TitleBar.navTab(page, 'tools').click();
      await SEL.ToolsView.toolsTabBatch(page).first().click();

      await mockOpenDialog(app, null);
      try {
        await SEL.ToolsView.batchSelectFilesBtn(page).first().click();
        await page.waitForTimeout(200);
      } finally {
        await restoreDialogs(app);
      }

      assert.equal((await dbLoad(page)).gcodeJobs.length, 0);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F10-05',
    tier: 2,
    tag: 'v2',
    feature: 'F10',
    name: 'Batch Slicer Inspector processes mixed valid .gcode + malformed .gcode + corrupt .3mf without crashing',
    run: async () => {
      const { app, page, artifactsDir } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'batch-r1', colorHex: '#f2754e', remainingWeight: 500 })],
      });

      const validPath = path.join(artifactsDir, 'batch_valid.gcode');
      const badGcodePath = path.join(artifactsDir, 'batch_malformed.gcode');
      const bad3mfPath = path.join(artifactsDir, 'batch_corrupt.3mf');
      fs.writeFileSync(validPath, createValidGcode({ models: ['ValidBatchPart.stl'] }), 'utf8');
      fs.writeFileSync(badGcodePath, createMalformedGcode(), 'utf8');
      fs.writeFileSync(bad3mfPath, createMalformed3mfBuffer('truncated-zip'));

      await SEL.TitleBar.navTab(page, 'tools').click();
      await SEL.ToolsView.toolsTabBatch(page).first().click();

      await mockOpenDialog(app, [validPath, badGcodePath, bad3mfPath]);
      try {
        await SEL.ToolsView.batchSelectFilesBtn(page).first().click();
        await page.getByText(/ValidBatchPart|batch_valid/i).first().waitFor({ state: 'visible' });
      } finally {
        await restoreDialogs(app);
      }

      const filesKpi = page
        .locator('div.rounded-2xl')
        .filter({ has: page.locator('span', { hasText: /Archivos \/ placas|Files \/ plates|Arquivos \/ placas/i }) })
        .first()
        .locator('div.text-xl.font-mono.font-bold');
      assert.equal(normalizeNbsp(await filesKpi.textContent()), '1');

      await SEL.Toasts.toastByTitle(page, /batch_malformed\.gcode/i).waitFor({ state: 'visible' });
      await SEL.Toasts.toastByTitle(page, /batch_corrupt\.3mf/i).waitFor({ state: 'visible' });

      const bodyTxt = await page.locator('main').innerText();
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(bodyTxt), false);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F10-06',
    tier: 2,
    tag: 'v2',
    feature: 'F10',
    name: 'Filament Math 0g and 0m boundary outputs 0 with no NaN or Infinity',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, { rolls: [] });

      await SEL.TitleBar.navTab(page, 'tools').click();
      await SEL.ToolsView.toolsTabMath(page).first().click();

      const gramsInput = page
        .locator('[data-testid="math-grams-input"]')
        .or(fieldControlByLabel(page, /^(?:Peso|Weight)\s*\(g\)$/i, 'input[type="number"]'))
        .first();
      const metersInput = page
        .locator('[data-testid="math-meters-input"]')
        .or(fieldControlByLabel(page, /^(?:Longitud|Length|Comprimento)\s*\(m\)$/i, 'input[type="number"]'))
        .first();
      const cm3Input = page
        .locator('[data-testid="math-cm3-input"]')
        .or(fieldControlByLabel(page, /^(?:Volumen|Volume)\s*\(cm³\)$/i, 'input[type="number"]'))
        .first();

      await gramsInput.waitFor({ state: 'visible' });
      await metersInput.waitFor({ state: 'visible' });
      await cm3Input.waitFor({ state: 'visible' });

      await gramsInput.fill('0');
      assert.ok(['', '0'].includes(await metersInput.inputValue()), `Expected '' or '0' meters, got ${await metersInput.inputValue()}`);
      assert.ok(['', '0'].includes(await cm3Input.inputValue()), `Expected '' or '0' cm3, got ${await cm3Input.inputValue()}`);

      await metersInput.fill('0');
      assert.ok(['', '0'].includes(await gramsInput.inputValue()), `Expected '' or '0' grams, got ${await gramsInput.inputValue()}`);
      assert.ok(['', '0'].includes(await cm3Input.inputValue()), `Expected '' or '0' cm3, got ${await cm3Input.inputValue()}`);

      const bodyTxt = await page.locator('main').innerText();
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(bodyTxt), false);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F10-07',
    tier: 2,
    tag: 'v2',
    feature: 'F10',
    name: 'Filament Math extreme length boundary produces finite output or safe 0 clamp with 0 pageerrors',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, { rolls: [] });

      await SEL.TitleBar.navTab(page, 'tools').click();
      await SEL.ToolsView.toolsTabMath(page).first().click();

      const gramsInput = page
        .locator('[data-testid="math-grams-input"]')
        .or(fieldControlByLabel(page, /^(?:Peso|Weight)\s*\(g\)$/i, 'input[type="number"]'))
        .first();
      const metersInput = page
        .locator('[data-testid="math-meters-input"]')
        .or(fieldControlByLabel(page, /^(?:Longitud|Length|Comprimento)\s*\(m\)$/i, 'input[type="number"]'))
        .first();
      const cm3Input = page
        .locator('[data-testid="math-cm3-input"]')
        .or(fieldControlByLabel(page, /^(?:Volumen|Volume)\s*\(cm³\)$/i, 'input[type="number"]'))
        .first();

      await metersInput.waitFor({ state: 'visible' });
      await metersInput.fill('100000000');

      const gramsStr = await gramsInput.inputValue();
      const cm3Str = await cm3Input.inputValue();
      assert.match(gramsStr, /^\d+(?:\.\d+)?$/, `Expected finite numeric grams, got: ${gramsStr}`);
      assert.match(cm3Str, /^\d+(?:\.\d+)?$/, `Expected finite numeric cm3, got: ${cm3Str}`);
      assert.ok(Number.isFinite(Number(gramsStr)) && Number(gramsStr) > 0);
      assert.ok(Number.isFinite(Number(cm3Str)) && Number(cm3Str) > 0);

      const bodyTxt = await page.locator('main').innerText();
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(bodyTxt), false, `Extreme math produced NaN/Infinity: ${bodyTxt}`);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F10-08',
    tier: 2,
    tag: 'v2',
    feature: 'F10',
    name: 'Filament Math material density switch (PLA vs TPU vs Nylon) updates conversions and drying presets',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, { rolls: [] });

      await SEL.TitleBar.navTab(page, 'tools').click();
      await SEL.ToolsView.toolsTabMath(page).first().click();

      const matSelect = page
        .locator('[data-testid="math-material-select"]')
        .or(fieldControlByLabel(page, /Material/i, 'select'))
        .first();
      const gramsInput = page
        .locator('[data-testid="math-grams-input"]')
        .or(fieldControlByLabel(page, /^(?:Peso|Weight)\s*\(g\)$/i, 'input[type="number"]'))
        .first();
      const metersInput = page
        .locator('[data-testid="math-meters-input"]')
        .or(fieldControlByLabel(page, /^(?:Longitud|Length|Comprimento)\s*\(m\)$/i, 'input[type="number"]'))
        .first();
      const cm3Input = page
        .locator('[data-testid="math-cm3-input"]')
        .or(fieldControlByLabel(page, /^(?:Volumen|Volume)\s*\(cm³\)$/i, 'input[type="number"]'))
        .first();

      await matSelect.waitFor({ state: 'visible' });
      await gramsInput.waitFor({ state: 'visible' });
      await gramsInput.fill('1000');

      const results = {};
      for (const mat of ['PLA', 'TPU', 'Nylon']) {
        await matSelect.selectOption(mat);
        await page.waitForTimeout(100);
        const meters = Number(await metersInput.inputValue());
        const cm3 = Number(await cm3Input.inputValue());
        assert.ok(Number.isFinite(meters) && meters > 0, `${mat} meters invalid: ${meters}`);
        assert.ok(Number.isFinite(cm3) && cm3 > 0, `${mat} cm3 invalid: ${cm3}`);
        results[mat] = { meters, cm3 };
      }

      assert.ok(results.PLA.meters < results.TPU.meters && results.TPU.meters < results.Nylon.meters, `Expected PLA < TPU < Nylon meters: ${JSON.stringify(results)}`);
      assert.ok(results.PLA.cm3 < results.TPU.cm3 && results.TPU.cm3 < results.Nylon.cm3, `Expected PLA < TPU < Nylon cm3: ${JSON.stringify(results)}`);

      await page.getByText('45°C · 4h', { exact: true }).waitFor({ state: 'visible' });
      await page.getByText('55°C · 6h', { exact: true }).waitFor({ state: 'visible' });
      await page.getByText('75°C · 10h', { exact: true }).waitFor({ state: 'visible' });

      const mainTxt = normalizeNbsp(await page.locator('main').innerText());
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(mainTxt), false);
      assertNoPageErrors(sharedCtx);
    },
  },

  {
    id: 'T2-F10-09',
    tier: 2,
    tag: 'v2',
    feature: 'F10',
    name: 'Scale Tare Estimator clamps net weight to 0g when grossWeight <= emptySpoolTare without corrupting roll',
    run: async () => {
      const { page } = sharedCtx;
      await resetDbState(page, {
        rolls: [makeRoll({ id: 'tare-roll', colorName: 'Roll Tara', remainingWeight: 600 })],
      });

      await SEL.TitleBar.navTab(page, 'tools').click();
      await SEL.ToolsView.toolsTabMath(page).first().click();

      const grossInput = SEL.ToolsView.tareGrossInput(page).first();
      const emptyInput = SEL.ToolsView.tareEmptyInput(page).first();
      const rollSelect = fieldControlByLabel(
        page,
        /Bobina del inventario|Inventory spool|Carretel do estoque/i,
        'select',
      );

      await grossInput.waitFor({ state: 'visible' });
      await emptyInput.waitFor({ state: 'visible' });
      await rollSelect.waitFor({ state: 'visible' });

      await emptyInput.fill('250');
      await grossInput.fill('180');

      await page.getByText(/^0\.0\s*g$/).waitFor({ state: 'visible' });
      const belowWarn = page.getByText(/menor que la tara|below the configured tare|menor que a tara/i);
      await belowWarn.waitFor({ state: 'visible' });

      const mainTxt = normalizeNbsp(await page.locator('main').innerText());
      assert.equal(/-\d+\s*g\b/.test(mainTxt), false, `Negative net weight rendered: ${mainTxt}`);
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(mainTxt), false);

      await grossInput.fill('250');
      await page.getByText(/^0\.0\s*g$/).waitFor({ state: 'visible' });
      assert.equal(await belowWarn.count(), 0);
      assert.equal(/\b(?:NaN|Infinity)\b/i.test(await page.locator('main').innerText()), false);

      // Select seeded roll, set gross < tare, apply to roll, and verify DB clamps remainingWeight=0 & status='empty'
      await rollSelect.selectOption('tare-roll');
      await emptyInput.fill('250');
      await grossInput.fill('180');
      await belowWarn.waitFor({ state: 'visible' });
      await SEL.ToolsView.tareApplyRollBtn(page).first().click();
      await SEL.Toasts.toastByTitle(page, /0\.0 g/i).waitFor({ state: 'visible' });

      const data = await dbLoad(page);
      assert.equal(data.rolls[0].remainingWeight, 0);
      assert.equal(data.rolls[0].status, 'empty');
      assertNoPageErrors(sharedCtx);
    },
  },
];

// Keep import referenced for consistent fixture validation
void createAnycubicMetadata;
void createCsvRolls;
