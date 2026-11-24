import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT,
  assertNoExternalNetworkRequests,
  assertNoPageErrors,
  launchFiloteca,
  mockOpenDialog,
  mockSaveDialog,
  resetDbState,
  restoreDialogs,
  skipOnboardingFast,
  waitForAppReady,
} from '../lib/harness.mjs';
import { SEL, normalizeNbsp } from '../lib/selectors.mjs';
import {
  createCsvRolls,
  createJsonExportBundle,
  createValid3mfBuffer,
  createValidGcode,
} from '../lib/fixtures.mjs';

function makeDisallowedDonationRegex() {
  return new RegExp(['ko', '-?fi'].join(''), 'i');
}

function makeUserPathRegex() {
  return new RegExp(
    '([A-Za-z]:[/\\\\]' + 'U' + 'sers[/\\\\]|/' + 'U' + 'sers/|/ho' + 'me/)[^/\\\\\\s"\'`]+',
    'i',
  );
}

function makeDisallowedTermsRegex() {
  const words = [
    'a' + 'i',
    'i' + 'a',
    'l' + 'lm',
    'cla' + 'ude',
    'op' + 'en' + 'a' + 'i',
    'chat' + 'g' + 'pt',
    'gp' + 't-\\d',
    'gem' + 'ini',
    'co' + 'pilot',
    'anthro' + 'pic',
    'ju' + 'les',
    'image' + 'gen',
  ].join('|');
  const phrases = [
    'intel' + 'igencia\\s+arti' + 'ficial',
    'arti' + 'ficial\\s+intell' + 'igence',
    'ag' + 'ente\\s+de\\s+i' + 'a',
    'a' + 'i\\s+ag' + 'ent',
  ].join('|');
  return new RegExp(`\\b(${words})\\b|${phrases}`, 'i');
}

function makeRoll(overrides = {}) {
  const id = overrides.id ?? 'test-roll-1';
  return {
    id,
    brand: 'Anycubic',
    material: 'PLA',
    finish: 'glossy',
    colorName: 'Naranja Taller',
    colorHex: '#F2754E',
    diameter: 1.75,
    initialWeight: 1000,
    remainingWeight: 500,
    price: 75000,
    purchaseDate: '2026-11-18',
    location: 'Estante A · 1',
    nozzleTemp: { min: 200, max: 220 },
    bedTemp: { min: 55, max: 65 },
    notes: '',
    status: 'in_use',
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
    ...overrides,
  };
}

function makeJob(overrides = {}) {
  const id = overrides.id ?? 'test-job-1';
  const filaments = overrides.filaments ?? [
    {
      slotIndex: 0,
      materialName: 'PLA',
      brand: 'Anycubic',
      finish: 'glossy',
      colorHex: '#F2754E',
      gcodeColorHex: '#F2754E',
      grams: 42.5,
      rollId: 'test-roll-1',
      suggestedRollId: 'test-roll-1',
      confidence: 95,
    },
  ];
  const totalGrams =
    overrides.totalGrams ?? filaments.reduce((sum, f) => sum + (Number(f.grams) || 0), 0);
  return {
    id,
    filename: overrides.filename ?? `${id}.gcode`,
    filepath: overrides.filepath ?? `C:\\temp\\${id}.gcode`,
    fileHash: overrides.fileHash ?? `hash-${id}`,
    plateIndex: overrides.plateIndex ?? 1,
    sessionKey: overrides.sessionKey ?? `session-${id}`,
    jobName: overrides.jobName ?? `Trabajo ${id}`,
    modelNames: overrides.modelNames ?? [`${id}.stl`],
    slicedAt: overrides.slicedAt ?? '2026-11-18T11:00:00.000Z',
    printTimeSeconds: overrides.printTimeSeconds ?? 5130,
    colorChangesCount: overrides.colorChangesCount ?? 0,
    totalLayersCount: overrides.totalLayersCount ?? 120,
    status: overrides.status ?? 'unreviewed',
    manualReviewRequired: overrides.manualReviewRequired ?? false,
    filaments,
    totalGrams,
    createdAt: overrides.createdAt ?? '2026-11-18T11:00:00.000Z',
    ...overrides,
  };
}

async function waitForDbCondition(page, predicateFn, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  let lastData = null;
  while (Date.now() < deadline) {
    const res = await page.evaluate(() => window.filoteca.db.load());
    if (res?.ok && res.data) {
      lastData = res.data;
      if (predicateFn(res.data)) return res.data;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(
    `Timed out after ${timeout}ms waiting for DB condition (rolls=${lastData?.rolls?.length ?? 'n/a'}, jobs=${lastData?.gcodeJobs?.length ?? 'n/a'})`,
  );
}

export const tests = [
  // =========================================================================
  // F8 — Inbox & Multi-Slicer Ingestion (6 tests: 4 v1, 2 v2)
  // =========================================================================
  {
    id: 'T1-F8-01',
    tier: 1,
    tag: 'v1',
    feature: 'F8',
    name: 'Parsed .gcode job appears in PendingJobsDrawer, TitleBar badge, and InboxView unreviewed list',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page, artifactsDir } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({ id: 'roll-f8-01', colorName: 'Naranja F8', remainingWeight: 600 });
        await resetDbState(page, { rolls: [roll] });

        const gcodePath = path.join(artifactsDir, 'drawer_clip.gcode');
        fs.writeFileSync(
          gcodePath,
          createValidGcode({
            slicer: 'orca',
            models: ['Drawer_Clip.stl'],
            slots: [
              {
                grams: 32.5,
                lengthMm: 10887,
                volumeCm3: 26.2,
                colorHex: '#F2754E',
                material: 'PLA',
                brand: 'Anycubic',
                finish: 'glossy',
              },
            ],
          }),
          'utf8',
        );

        const parseResult = await page.evaluate(async (fp) => {
          const parsed = await window.filoteca.file.parseGcodePath(fp);
          if (!parsed?.ok || !parsed.data) return parsed;
          const saved = await window.filoteca.db.upsertGcodeJob(parsed.data);
          return { ok: saved.ok, job: parsed.data };
        }, gcodePath);

        assert.equal(parseResult.ok, true);
        assert.ok(parseResult.job, 'Expected parsed GcodeJob from parseGcodePath');

        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForAppReady(page);

        const drawer = SEL.InboxView.drawer(page);
        await drawer.waitFor({ state: 'visible' });
        const drawerText = normalizeNbsp(await drawer.innerText());
        assert.match(drawerText, /1 pendiente/i);

        const badgeText = normalizeNbsp(await SEL.TitleBar.inboxBadge(page).textContent());
        assert.match(badgeText, /1/);

        await SEL.InboxView.drawerReviewBtn(page).click();
        await SEL.InboxView.inboxHeading(page).waitFor({ state: 'visible' });

        const unreviewedTabText = normalizeNbsp(
          await SEL.InboxView.statusTab(page, /^Por revisar/i).textContent(),
        );
        assert.match(unreviewedTabText, /1/);

        const card = SEL.InboxView.jobCard(page, /Drawer_Clip/i);
        await card.waitFor({ state: 'visible' });
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F8-02',
    tier: 1,
    tag: 'v1',
    feature: 'F8',
    name: 'Clicking Lo imprimí deducts matched spool weight, logs gcode usage, and moves job to Impresos',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({ id: 'roll-f8-02', remainingWeight: 500 });
        const job = makeJob({
          id: 'job-f8-02',
          jobName: 'Soporte Motor',
          totalGrams: 42.5,
          filaments: [
            {
              slotIndex: 0,
              materialName: 'PLA',
              brand: 'Anycubic',
              finish: 'glossy',
              colorHex: '#F2754E',
              gcodeColorHex: '#F2754E',
              grams: 42.5,
              rollId: 'roll-f8-02',
              suggestedRollId: 'roll-f8-02',
              confidence: 96,
            },
          ],
        });
        await resetDbState(page, { rolls: [roll], gcodeJobs: [job] });

        await SEL.TitleBar.navTab(page, 'inbox').click();
        const card = SEL.InboxView.jobCard(page, 'Soporte Motor');
        await card.waitFor({ state: 'visible' });

        await SEL.InboxView.printBtn(card).click();
        await SEL.Toasts.toastByTitle(page, /Impresión registrada/i).waitFor({ state: 'visible' });

        await waitForDbCondition(
          page,
          (data) =>
            data.rolls.find((r) => r.id === 'roll-f8-02')?.remainingWeight === 457.5 &&
            data.gcodeJobs.find((j) => j.id === 'job-f8-02')?.status === 'printed',
        );

        const dbRes = await page.evaluate(() => window.filoteca.db.load());
        assert.equal(dbRes.ok, true);
        const updatedRoll = dbRes.data.rolls.find((r) => r.id === 'roll-f8-02');
        assert.equal(updatedRoll.remainingWeight, 457.5);
        const gcodeUsage = dbRes.data.usage.find(
          (u) => u.rollId === 'roll-f8-02' && u.origin === 'gcode',
        );
        assert.ok(gcodeUsage, 'Expected usage entry with origin === gcode');
        assert.equal(gcodeUsage.grams, 42.5);

        await SEL.InboxView.statusTab(page, /^Impresos/i).click();
        await SEL.InboxView.jobCard(page, 'Soporte Motor').waitFor({ state: 'visible' });
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F8-03',
    tier: 1,
    tag: 'v1',
    feature: 'F8',
    name: 'Falló / parcial slider deducts proportional grams and No lo imprimí discards without deduction',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const rollA = makeRoll({
          id: 'roll-f8-03a',
          colorName: 'Rojo Fallo',
          colorHex: '#DC2626',
          remainingWeight: 500,
        });
        const rollB = makeRoll({
          id: 'roll-f8-03b',
          colorName: 'Azul Descarte',
          colorHex: '#2563EB',
          remainingWeight: 500,
        });
        const jobFail = makeJob({
          id: 'job-f8-fail',
          sessionKey: 'sess-fail-03',
          jobName: 'Pieza Fallida',
          slicedAt: '2026-11-18T12:00:00.000Z',
          totalGrams: 40,
          filaments: [
            {
              slotIndex: 0,
              materialName: 'PLA',
              brand: 'Anycubic',
              finish: 'glossy',
              colorHex: '#DC2626',
              grams: 40,
              rollId: 'roll-f8-03a',
              suggestedRollId: 'roll-f8-03a',
              confidence: 95,
            },
          ],
        });
        const jobDiscard = makeJob({
          id: 'job-f8-disc',
          sessionKey: 'sess-disc-03',
          jobName: 'Pieza Descartada',
          slicedAt: '2026-11-18T11:30:00.000Z',
          totalGrams: 30,
          filaments: [
            {
              slotIndex: 0,
              materialName: 'PLA',
              brand: 'Anycubic',
              finish: 'glossy',
              colorHex: '#2563EB',
              grams: 30,
              rollId: 'roll-f8-03b',
              suggestedRollId: 'roll-f8-03b',
              confidence: 95,
            },
          ],
        });

        await resetDbState(page, { rolls: [rollA, rollB], gcodeJobs: [jobFail, jobDiscard] });
        await SEL.TitleBar.navTab(page, 'inbox').click();

        const failCard = SEL.InboxView.jobCard(page, 'Pieza Fallida');
        await failCard.waitFor({ state: 'visible' });
        await SEL.InboxView.partialFailBtn(failCard).click();

        const modal = SEL.InboxView.failedModal(page);
        await modal.waitFor({ state: 'visible' });
        await SEL.InboxView.failedPercentRange(modal).fill('25');

        const modalText = normalizeNbsp(await modal.innerText());
        assert.match(modalText, /25%/);
        assert.match(modalText, /10\s*g/i);

        await SEL.InboxView.failedConfirmBtn(modal).click();
        await modal.waitFor({ state: 'hidden' });
        await SEL.Toasts.toastByTitle(page, /Impresión fallida registrada/i).waitFor({
          state: 'visible',
        });

        const discCard = SEL.InboxView.jobCard(page, 'Pieza Descartada');
        await discCard.waitFor({ state: 'visible' });
        await SEL.InboxView.discardBtn(discCard).click();
        await SEL.Toasts.toastByTitle(page, /Trabajo descartado/i).waitFor({ state: 'visible' });

        await waitForDbCondition(
          page,
          (data) =>
            data.rolls.find((r) => r.id === 'roll-f8-03a')?.remainingWeight === 490 &&
            data.gcodeJobs.find((j) => j.id === 'job-f8-fail')?.status === 'failed' &&
            data.gcodeJobs.find((j) => j.id === 'job-f8-disc')?.status === 'discarded',
        );

        const dbRes = await page.evaluate(() => window.filoteca.db.load());
        assert.equal(dbRes.data.rolls.find((r) => r.id === 'roll-f8-03b').remainingWeight, 500);
        assert.equal(dbRes.data.gcodeJobs.find((j) => j.id === 'job-f8-fail').printedPercent, 25);

        await SEL.InboxView.statusTab(page, /^Fallidos/i).click();
        const failedCardAfter = SEL.InboxView.jobCard(page, 'Pieza Fallida');
        await failedCardAfter.waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await failedCardAfter.innerText()), /Fallido \(25%\)/i);

        await SEL.InboxView.statusTab(page, /^Descartados/i).click();
        await SEL.InboxView.jobCard(page, 'Pieza Descartada').waitFor({ state: 'visible' });
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F8-04',
    tier: 1,
    tag: 'v2',
    feature: 'F8',
    name: 'Multi-slicer .gcode parsing (Cura, PrusaSlicer, Orca, Simplify3D, Creality) ingests into InboxView',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page, artifactsDir } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({ id: 'roll-f8-04', colorHex: '#1F2023', remainingWeight: 900 });
        await resetDbState(page, { rolls: [roll] });

        const curaPath = path.join(artifactsDir, 'cura_part.gcode');
        const prusaPath = path.join(artifactsDir, 'prusa_part.gcode');
        const orcaPath = path.join(artifactsDir, 'orca_part.gcode');
        const s3dPath = path.join(artifactsDir, 'simplify3d_bracket.gcode');
        const crealityPath = path.join(artifactsDir, 'creality_v4_print.gcode');

        fs.writeFileSync(
          curaPath,
          createValidGcode({
            slicer: 'cura',
            models: ['Cura_Part.stl'],
            slots: [{ grams: 24.5, lengthMm: 8200 }],
          }),
          'utf8',
        );
        fs.writeFileSync(
          prusaPath,
          createValidGcode({
            slicer: 'prusa',
            models: ['Prusa_Part.stl'],
            slots: [{ grams: 19.2, colorHex: '#1F2023', material: 'PLA' }],
          }),
          'utf8',
        );
        fs.writeFileSync(
          orcaPath,
          createValidGcode({
            slicer: 'orca',
            models: ['Orca_Part.stl'],
            slots: [{ grams: 31.0, colorHex: '#F2754E', material: 'PLA' }],
          }),
          'utf8',
        );
        fs.copyFileSync(path.join(REPO_ROOT, 'test-fixtures', 'simplify3d_bracket.gcode'), s3dPath);
        fs.copyFileSync(
          path.join(REPO_ROOT, 'test-fixtures', 'creality_v4_print.gcode'),
          crealityPath,
        );

        const filePaths = [curaPath, prusaPath, orcaPath, s3dPath, crealityPath];
        const parsedJobs = await page.evaluate(async (paths) => {
          const out = [];
          for (const fp of paths) {
            const res = await window.filoteca.file.parseGcodePath(fp);
            if (!res?.ok || !res.data) {
              throw new Error(`parseGcodePath failed for ${fp}: ${res?.error ?? 'null'}`);
            }
            const up = await window.filoteca.db.upsertGcodeJob(res.data);
            if (!up?.ok) {
              throw new Error(`upsertGcodeJob failed for ${fp}: ${up?.error ?? 'unknown'}`);
            }
            out.push(res.data);
          }
          return out;
        }, filePaths);

        assert.equal(parsedJobs.length, 5);
        const slicerNames = parsedJobs.map((j) => j.slicerName || '');
        assert.match(slicerNames[0], /Cura/i);
        assert.match(slicerNames[1], /Prusa/i);
        assert.match(slicerNames[2], /Orca/i);
        assert.match(slicerNames[3], /Simplify3D/i);
        assert.match(slicerNames[4], /Creality/i);

        for (const job of parsedJobs) {
          assert.ok(job.totalGrams > 0, `Expected totalGrams > 0 for ${job.filename}`);
          assert.ok(job.printTimeSeconds > 0, `Expected printTimeSeconds > 0 for ${job.filename}`);
          assert.ok(
            Array.isArray(job.filaments) && job.filaments.length >= 1,
            `Expected filaments >= 1 for ${job.filename}`,
          );
        }

        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForAppReady(page);
        await SEL.TitleBar.navTab(page, 'inbox').click();
        await SEL.InboxView.inboxHeading(page).waitFor({ state: 'visible' });

        const unreviewedTabText = normalizeNbsp(
          await SEL.InboxView.statusTab(page, /^Por revisar/i).textContent(),
        );
        assert.match(unreviewedTabText, /5/);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F8-05',
    tier: 1,
    tag: 'v2',
    feature: 'F8',
    name: 'Multi-plate .3mf with Central-Directory ZIP, slice_info.config, and bit-3 data descriptor extracts all plates and thumbnails',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page, artifactsDir, userDataDir } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({ id: 'roll-f8-05', colorHex: '#F2754E', remainingWeight: 800 });
        await resetDbState(page, { rolls: [roll] });

        const threemfPath = path.join(artifactsDir, 'multi_plate_bit3_e2e.3mf');
        const buf = createValid3mfBuffer(
          [
            {
              plateIndex: 1,
              models: ['PlateOne_Housing.stl'],
              printTime: '1h 10m 00s',
              slots: [{ grams: 28.4, colorHex: '#F2754E', material: 'PLA', brand: 'Anycubic' }],
            },
            {
              plateIndex: 2,
              models: ['PlateTwo_Lid.stl'],
              printTime: '35m 00s',
              slots: [{ grams: 14.8, colorHex: '#1F2023', material: 'PLA', brand: 'Anycubic' }],
            },
          ],
          { useDataDescriptor: true, includeSliceInfo: true, includeOpcBoilerplate: true },
        );
        fs.writeFileSync(threemfPath, buf);

        const parsed = await page.evaluate(async (fp) => {
          const res = await window.filoteca.file.parseGcodePath(fp);
          if (!res?.ok || !res.data) return { ok: false, error: res?.error ?? 'null' };
          const primary = res.data;
          const allPlates = Array.isArray(primary.plates) && primary.plates.length > 0 ? primary.plates : [primary];
          for (const plate of allPlates) {
            await window.filoteca.db.upsertGcodeJob(plate);
          }
          return { ok: true, primary, plateCount: allPlates.length };
        }, threemfPath);

        assert.equal(parsed.ok, true, parsed.error);
        assert.equal(parsed.primary.plateIndex, 1);
        assert.equal(parsed.plateCount, 2);
        assert.ok(parsed.primary.plates[1].totalGrams > 14, 'Expected plate 2 totalGrams > 14');
        assert.ok(parsed.primary.thumbnailSmallPath, 'Expected thumbnailSmallPath');
        assert.equal(
          path.resolve(parsed.primary.thumbnailSmallPath).startsWith(path.resolve(userDataDir)),
          true,
          'Thumbnail should be stored inside isolated userDataDir',
        );
        assert.equal(fs.existsSync(parsed.primary.thumbnailSmallPath), true);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForAppReady(page);
        await SEL.TitleBar.navTab(page, 'inbox').click();

        const plate1Card = SEL.InboxView.jobCard(page, /PlateOne_Housing/i);
        const plate2Card = SEL.InboxView.jobCard(page, /PlateTwo_Lid/i);
        await plate1Card.waitFor({ state: 'visible' });
        await plate2Card.waitFor({ state: 'visible' });

        const img = plate1Card.locator('img').first();
        await img.waitFor({ state: 'visible' });
        const imgOk = await img.evaluate((el) => el.complete && el.naturalWidth > 0);
        assert.equal(imgOk, true, 'Expected .3mf thumbnail image to load via filoteca-media://');
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F8-06',
    tier: 1,
    tag: 'v1',
    feature: 'F8',
    name: 'Batch select all and Registrar seleccionados como impresos deducts all selected jobs',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const rollA = makeRoll({
          id: 'roll-f8-06a',
          colorName: 'Verde Lote',
          colorHex: '#15803D',
          remainingWeight: 600,
        });
        const rollB = makeRoll({
          id: 'roll-f8-06b',
          colorName: 'Morado Lote',
          colorHex: '#7C3AED',
          remainingWeight: 600,
        });
        const job1 = makeJob({
          id: 'job-batch-1',
          sessionKey: 'sess-batch-1',
          jobName: 'Lote Pieza Uno',
          slicedAt: '2026-11-18T12:10:00.000Z',
          totalGrams: 25,
          filaments: [
            {
              slotIndex: 0,
              materialName: 'PLA',
              brand: 'Anycubic',
              finish: 'glossy',
              colorHex: '#15803D',
              grams: 25,
              rollId: 'roll-f8-06a',
              suggestedRollId: 'roll-f8-06a',
              confidence: 95,
            },
          ],
        });
        const job2 = makeJob({
          id: 'job-batch-2',
          sessionKey: 'sess-batch-2',
          jobName: 'Lote Pieza Dos',
          slicedAt: '2026-11-18T12:05:00.000Z',
          totalGrams: 35,
          filaments: [
            {
              slotIndex: 0,
              materialName: 'PLA',
              brand: 'Anycubic',
              finish: 'glossy',
              colorHex: '#7C3AED',
              grams: 35,
              rollId: 'roll-f8-06b',
              suggestedRollId: 'roll-f8-06b',
              confidence: 95,
            },
          ],
        });

        await resetDbState(page, { rolls: [rollA, rollB], gcodeJobs: [job1, job2] });
        await SEL.TitleBar.navTab(page, 'inbox').click();
        await SEL.InboxView.inboxHeading(page).waitFor({ state: 'visible' });

        await SEL.InboxView.selectAllBtn(page).click();
        const batchPrintBtn = SEL.InboxView.batchPrintBtn(page);
        await batchPrintBtn.waitFor({ state: 'visible' });
        await batchPrintBtn.click();

        await SEL.Toasts.toastByTitle(page, /Impresiones registradas/i).waitFor({ state: 'visible' });

        await waitForDbCondition(
          page,
          (data) =>
            data.rolls.find((r) => r.id === 'roll-f8-06a')?.remainingWeight === 575 &&
            data.rolls.find((r) => r.id === 'roll-f8-06b')?.remainingWeight === 565 &&
            data.gcodeJobs.filter((j) => j.status === 'printed').length === 2,
        );

        const printedTabText = normalizeNbsp(
          await SEL.InboxView.statusTab(page, /^Impresos/i).textContent(),
        );
        assert.match(printedTabText, /2/);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  // =========================================================================
  // F9 — Backup, Export & Import (6 v1 tests)
  // =========================================================================
  {
    id: 'T1-F9-01',
    tier: 1,
    tag: 'v1',
    feature: 'F9',
    name: 'Export full JSON bundle v2 writes rolls, usage, shopping, orders, and gcodeJobs',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { app, page, artifactsDir } = ctx;
        await skipOnboardingFast(page);

        const rolls = [
          makeRoll({ id: 'json-exp-1', colorName: 'Negro Export' }),
          makeRoll({ id: 'json-exp-2', colorName: 'Blanco Export', colorHex: '#F4F4F6' }),
        ];
        const usage = [
          {
            id: 'u-exp-1',
            rollId: 'json-exp-1',
            grams: 20,
            at: '2026-11-18T10:30:00.000Z',
            note: 'Prueba JSON',
            origin: 'manual',
          },
        ];
        const shopping = [
          {
            id: 'shop-exp-1',
            label: 'Anycubic PLA Negro',
            material: 'PLA',
            brand: 'Anycubic',
            colorHex: '#1F2023',
            qty: 1,
            done: false,
            createdAt: '2026-11-18T10:30:00.000Z',
            sourceRollId: 'json-exp-1',
          },
        ];
        const orders = [
          {
            id: 'ord-exp-1',
            productKey: 'Anycubic:::PLA:::Negro Export',
            brand: 'Anycubic',
            material: 'PLA',
            colorName: 'Negro Export',
            colorHex: '#1F2023',
            orderedAt: '2026-11-17T10:00:00.000Z',
            expectedArrival: '2026-11-23T10:00:00.000Z',
            received: false,
          },
        ];
        const gcodeJobs = [makeJob({ id: 'job-exp-1' })];

        await resetDbState(page, { rolls, usage, shopping, orders, gcodeJobs });
        await SEL.TitleBar.navTab(page, 'settings').click();

        const outJson = path.join(artifactsDir, 'filoteca-export-test.json');
        try {
          await mockSaveDialog(app, outJson);
          await SEL.SettingsView.exportJsonBtn(page).click();
          await SEL.Toasts.toastByTitle(page, /Exportación completada/i).waitFor({
            state: 'visible',
          });
        } finally {
          await restoreDialogs(app).catch(() => {});
        }

        assert.equal(fs.existsSync(outJson), true);
        const parsed = JSON.parse(fs.readFileSync(outJson, 'utf8'));
        assert.equal(parsed.app, 'filoteca');
        assert.equal(parsed.version, 2);
        assert.equal(parsed.rolls.length, 2);
        assert.equal(parsed.usage.length, 1);
        assert.equal(parsed.shopping.length, 1);
        assert.equal(parsed.orders.length, 1);
        assert.equal(parsed.gcodeJobs.length, 1);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F9-02',
    tier: 1,
    tag: 'v1',
    feature: 'F9',
    name: 'Export CSV writes 17 quoted columns with CRLF and preserves embedded quotes/commas',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { app, page, artifactsDir } = ctx;
        await skipOnboardingFast(page);

        const rolls = [
          makeRoll({
            id: 'csv-exp-1',
            brand: 'Prusament',
            colorName: 'Galaxy Black',
            notes: 'Prueba, "especial"',
          }),
          makeRoll({ id: 'csv-exp-2', brand: 'Sunlu', colorName: 'Oro Seda' }),
        ];
        await resetDbState(page, { rolls });
        await SEL.TitleBar.navTab(page, 'settings').click();

        const outCsv = path.join(artifactsDir, 'filoteca-rollos-test.csv');
        try {
          await mockSaveDialog(app, outCsv);
          await SEL.SettingsView.exportCsvBtn(page).click();
          await SEL.Toasts.toastByTitle(page, /CSV exportado/i).waitFor({ state: 'visible' });
        } finally {
          await restoreDialogs(app).catch(() => {});
        }

        assert.equal(fs.existsSync(outCsv), true);
        const csvContent = fs.readFileSync(outCsv, 'utf8');
        assert.ok(csvContent.includes('\r\n'), 'Expected CRLF line endings in CSV export');
        const lines = csvContent.split(/\r\n/).filter((l) => l.length > 0);
        assert.equal(lines.length, 3);
        const headers = lines[0].split(',');
        assert.equal(headers.length, 17);
        assert.equal(headers[0], 'Marca');
        assert.equal(headers[16], 'Notas');
        assert.ok(
          csvContent.includes('"Prueba, ""especial"""'),
          'Expected properly escaped quotes and comma in CSV notes',
        );
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F9-03',
    tier: 1,
    tag: 'v1',
    feature: 'F9',
    name: 'Import valid JSON bundle merges new rolls into existing inventory',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { app, page, artifactsDir } = ctx;
        await skipOnboardingFast(page);

        const baseRoll = makeRoll({ id: 'base-json-roll', colorName: 'Base Existente' });
        await resetDbState(page, { rolls: [baseRoll] });

        const inJson = path.join(artifactsDir, 'import-valid.json');
        fs.writeFileSync(
          inJson,
          createJsonExportBundle({
            rolls: [
              makeRoll({ id: 'imp-json-1', colorName: 'Rojo Importado', colorHex: '#DC2626' }),
              makeRoll({ id: 'imp-json-2', colorName: 'Azul Importado', colorHex: '#2563EB' }),
            ],
          }),
          'utf8',
        );

        await SEL.TitleBar.navTab(page, 'settings').click();
        try {
          await mockOpenDialog(app, inJson);
          await SEL.SettingsView.importFileBtn(page).click();
          await SEL.Toasts.toastByTitle(page, /Importación exitosa/i).waitFor({ state: 'visible' });
        } finally {
          await restoreDialogs(app).catch(() => {});
        }

        await waitForDbCondition(page, (data) => data.rolls.length === 3);

        await SEL.TitleBar.navTab(page, 'shelf').click();
        await SEL.SpoolCard.cardByName(page, 'Base Existente').waitFor({ state: 'visible' });
        await SEL.SpoolCard.cardByName(page, 'Rojo Importado').waitFor({ state: 'visible' });
        await SEL.SpoolCard.cardByName(page, 'Azul Importado').waitFor({ state: 'visible' });
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F9-04',
    tier: 1,
    tag: 'v1',
    feature: 'F9',
    name: 'Import valid CSV merges parsed rows into existing inventory',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { app, page, artifactsDir } = ctx;
        await skipOnboardingFast(page);

        const baseRoll = makeRoll({ id: 'base-csv-roll', colorName: 'Base CSV' });
        await resetDbState(page, { rolls: [baseRoll] });

        const inCsv = path.join(artifactsDir, 'import-rolls.csv');
        fs.writeFileSync(
          inCsv,
          createCsvRolls([
            { brand: 'eSUN', material: 'PETG', colorName: 'Verde CSV', colorHex: '#15803D' },
            { brand: 'Polymaker', material: 'ASA', colorName: 'Morado CSV', colorHex: '#7C3AED' },
          ]),
          'utf8',
        );

        await SEL.TitleBar.navTab(page, 'settings').click();
        try {
          await mockOpenDialog(app, inCsv);
          await SEL.SettingsView.importFileBtn(page).click();
          await SEL.Toasts.toastByTitle(page, /Importación CSV exitosa/i).waitFor({
            state: 'visible',
          });
        } finally {
          await restoreDialogs(app).catch(() => {});
        }

        await waitForDbCondition(page, (data) => data.rolls.length === 3);

        await SEL.TitleBar.navTab(page, 'shelf').click();
        await SEL.SpoolCard.cardByName(page, 'Base CSV').waitFor({ state: 'visible' });
        await SEL.SpoolCard.cardByName(page, 'Verde CSV').waitFor({ state: 'visible' });
        await SEL.SpoolCard.cardByName(page, 'Morado CSV').waitFor({ state: 'visible' });
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F9-05',
    tier: 1,
    tag: 'v1',
    feature: 'F9',
    name: 'Create .db SQLite backup and Restore .db backup recovers wiped inventory',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { app, page, artifactsDir } = ctx;
        await skipOnboardingFast(page);

        const sentinelRoll = makeRoll({
          id: 'sentinel-db-roll',
          colorName: 'Centinela SQLite',
          remainingWeight: 777,
        });
        await resetDbState(page, { rolls: [sentinelRoll] });

        const dbBackupPath = path.join(artifactsDir, 'filoteca-backup.db');
        await SEL.TitleBar.navTab(page, 'settings').click();
        try {
          await mockSaveDialog(app, dbBackupPath);
          await SEL.SettingsView.backupDbBtn(page).click();
          await SEL.Toasts.toastByTitle(page, /Copia de seguridad guardada/i).waitFor({
            state: 'visible',
          });
        } finally {
          await restoreDialogs(app).catch(() => {});
        }

        assert.equal(fs.existsSync(dbBackupPath), true);
        const dbBytes = fs.readFileSync(dbBackupPath);
        assert.ok(dbBytes.length > 1024, 'Expected SQLite backup > 1024 bytes');
        assert.equal(
          dbBytes.subarray(0, 16).toString('utf8'),
          'SQLite format 3\0',
          'Expected valid SQLite 3 magic header',
        );

        await resetDbState(page, { rolls: [] });
        assert.equal(await SEL.SpoolCard.allCards(page).count(), 0);

        await SEL.TitleBar.navTab(page, 'settings').click();
        try {
          await mockOpenDialog(app, dbBackupPath);
          await SEL.SettingsView.restoreDbBtn(page).click();
          await SEL.Toasts.toastByTitle(page, /Copia de seguridad restaurada/i).waitFor({
            state: 'visible',
          });
        } finally {
          await restoreDialogs(app).catch(() => {});
        }

        await waitForDbCondition(
          page,
          (data) =>
            data.rolls.find((r) => r.id === 'sentinel-db-roll')?.remainingWeight === 777,
        );

        await SEL.TitleBar.navTab(page, 'shelf').click();
        await SEL.SpoolCard.cardByName(page, 'Centinela SQLite').waitFor({ state: 'visible' });
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F9-06',
    tier: 1,
    tag: 'v1',
    feature: 'F9',
    name: 'Clear & Reload seed data in SettingsView removes/restores all seed rolls while preserving custom rolls',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);
        await SEL.SpoolCard.allCards(page).first().waitFor({ state: 'visible' });

        await waitForDbCondition(page, (data) => data.rolls.filter((r) => r.seed).length === 17);

        const customRoll = makeRoll({
          id: 'custom-preserve-1',
          colorName: 'Custom Preservado',
          colorHex: '#0D9488',
          seed: false,
        });
        await page.evaluate(async (r) => {
          const res = await window.filoteca.db.upsertRoll(r);
          if (!res?.ok) throw new Error(res?.error || 'upsertRoll failed');
        }, customRoll);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForAppReady(page);

        await SEL.TitleBar.navTab(page, 'settings').click();
        await SEL.SettingsView.clearSeedBtn(page).click();
        await SEL.Toasts.toastByTitle(page, /Datos de ejemplo borrados/i).waitFor({
          state: 'visible',
        });

        await waitForDbCondition(
          page,
          (data) =>
            data.rolls.filter((r) => r.seed).length === 0 &&
            data.rolls.some((r) => r.id === 'custom-preserve-1'),
        );

        await SEL.SettingsView.reloadSeedBtn(page).click();
        await waitForDbCondition(
          page,
          (data) =>
            data.rolls.filter((r) => r.seed).length === 17 &&
            data.rolls.some((r) => r.id === 'custom-preserve-1'),
        );

        await SEL.TitleBar.navTab(page, 'shelf').click();
        const resultsText = normalizeNbsp(await SEL.ShelfView.resultsCount(page).textContent());
        assert.match(resultsText, /18 (de|of) 18/);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  // =========================================================================
  // F10 — Offline Workshop Tools UI (7 v2 tests — exact dispatch ID mapping)
  // =========================================================================
  {
    id: 'T1-F10-01',
    tier: 1,
    tag: 'v2',
    feature: 'F10',
    name: 'Navigate to Tools tab, verify all 3 sub-tabs (Quote/Batch/Math), ES/EN/PT labels, and zero external requests',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true, blockExternalNetwork: true });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const toolsTab = SEL.TitleBar.navTab(page, 'tools').first();
        await toolsTab.waitFor({ state: 'visible' });
        assert.match(normalizeNbsp(await toolsTab.innerText()), /Herramientas/i);
        await toolsTab.click();

        const tabQuote = SEL.ToolsView.toolsTabQuote(page).first();
        const tabBatch = SEL.ToolsView.toolsTabBatch(page).first();
        const tabMath = SEL.ToolsView.toolsTabMath(page).first();

        await tabQuote.waitFor({ state: 'visible' });
        await tabBatch.waitFor({ state: 'visible' });
        await tabMath.waitFor({ state: 'visible' });

        await tabBatch.click();
        await SEL.ToolsView.batchSelectFilesBtn(page).first().waitFor({ state: 'visible' });

        await tabMath.click();
        await SEL.ToolsView.tareGrossInput(page).first().waitFor({ state: 'visible' });

        await tabQuote.click();
        await SEL.ToolsView.quoteAddSpoolBtn(page).first().waitFor({ state: 'visible' });

        await SEL.TitleBar.navTab(page, 'settings').click();
        await SEL.SettingsView.langBtn(page, 'en').click();
        assert.match(
          normalizeNbsp(await SEL.TitleBar.navTab(page, 'tools').first().innerText()),
          /Tools/i,
        );

        await SEL.SettingsView.langBtn(page, 'pt').click();
        assert.match(
          normalizeNbsp(await SEL.TitleBar.navTab(page, 'tools').first().innerText()),
          /Ferramentas/i,
        );

        assertNoExternalNetworkRequests(ctx);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F10-02',
    tier: 1,
    tag: 'v2',
    feature: 'F10',
    name: 'Quote Calculator computes multi-spool material, electricity, machine, labor, and margin in COP and USD',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const rolls = [
          makeRoll({
            id: 'q-roll-1',
            colorName: 'PLA Negro Quote',
            price: 80000,
            initialWeight: 1000,
          }),
          makeRoll({
            id: 'q-roll-2',
            material: 'PETG',
            colorName: 'PETG Azul Quote',
            colorHex: '#2563EB',
            price: 90000,
            initialWeight: 1000,
          }),
        ];
        await resetDbState(page, { rolls, settings: { currency: 'COP' } });

        await SEL.TitleBar.navTab(page, 'tools').first().click();
        await SEL.ToolsView.toolsTabQuote(page).first().click();

        const totalEl = SEL.ToolsView.quoteTotalOutput(page).first();
        await totalEl.waitFor({ state: 'visible' });
        const initialTotal = normalizeNbsp(await totalEl.innerText()).trim();

        await SEL.ToolsView.quoteAddSpoolBtn(page).first().click();

        const invButtons = page.getByRole('button', { name: /^(Inventario|Inventory|Estoque)$/i });
        assert.equal(await invButtons.count(), 2, 'Expected 2 inventory mode toggles for 2 spool rows');
        await invButtons.nth(0).click();
        await invButtons.nth(1).click();

        const spoolSelects = page
          .locator('main select')
          .filter({ has: page.locator('option[value="q-roll-1"]') });
        assert.equal(await spoolSelects.count(), 2, 'Expected 2 inventory spool selects');
        await spoolSelects.nth(0).selectOption('q-roll-1');
        await spoolSelects.nth(1).selectOption('q-roll-2');

        const gramsInputs = page
          .locator('main label', { hasText: /^(Gramos|Grams|Gramas)\s*\(g\)$/i })
          .locator('xpath=ancestor::div[1]//input');
        assert.equal(await gramsInputs.count(), 2, 'Expected 2 grams inputs for 2 spool rows');
        await gramsInputs.nth(0).fill('120');
        await gramsInputs.nth(1).fill('80');

        const hoursInput = page
          .locator('main label', { hasText: /^(Horas|Hours)$/i })
          .locator('xpath=ancestor::div[1]//input')
          .first();
        const elecInput = page
          .locator('main label', { hasText: /kWh/i })
          .locator('xpath=ancestor::div[1]//input')
          .first();
        const machineInput = page
          .locator('main label', { hasText: /(Tarifa máquina|Machine rate|Taxa máquina)/i })
          .locator('xpath=ancestor::div[1]//input')
          .first();
        const laborInput = page
          .locator('main label', { hasText: /(Mano de obra|Labor rate|Mão de obra)/i })
          .locator('xpath=ancestor::div[1]//input')
          .first();
        const profitInput = page
          .locator('main label', { hasText: /^(Utilidad|Profit|Lucro)\s*\(%\)$/i })
          .locator('xpath=ancestor::div[1]//input')
          .first();

        await hoursInput.fill('4');
        await elecInput.fill('900');
        await machineInput.fill('3000');
        await laborInput.fill('15000');
        await profitInput.fill('35');

        await page.locator('main').getByText(/Material\s*\(\s*200(?:\.0)?\s*g\s*\)/i).waitFor({
          state: 'visible',
        });

        const copTotal = normalizeNbsp(await totalEl.innerText()).trim();
        assert.notEqual(copTotal, initialTotal, 'Expected COP quote total to reflect updated inputs');
        assert.match(
          copTotal,
          /^\$\s*[1-9]\d{0,2}(?:\.\d{3})*$/,
          `Expected non-zero COP 0-decimal total, got: ${copTotal}`,
        );

        await SEL.TitleBar.navTab(page, 'settings').click();
        await SEL.SettingsView.currencyPill(page, 'USD').click();
        await SEL.TitleBar.navTab(page, 'tools').first().click();
        await SEL.ToolsView.toolsTabQuote(page).first().click();

        await totalEl.waitFor({ state: 'visible' });
        const usdTotal = normalizeNbsp(await totalEl.innerText()).trim();
        assert.match(
          usdTotal,
          /^(?:US\$|USD|\$)\s*(?:[1-9]\d{0,2}(?:\.\d{3})*,\d{2}|0,[1-9]\d|0,\d[1-9]|[1-9]\d{0,2}(?:,\d{3})*\.\d{2}|0\.[1-9]\d|0\.\d[1-9])$/,
          `Expected non-zero USD 2-decimal total, got: ${usdTotal}`,
        );
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F10-03',
    tier: 1,
    tag: 'v2',
    feature: 'F10',
    name: 'Quote Calculator imports inventory spool and persists workshopPrefs across reload',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({
          id: 'quote-inv-roll',
          colorName: 'Naranja Cotizar',
          price: 85000,
          initialWeight: 1000,
        });
        await resetDbState(page, { rolls: [roll] });

        await SEL.TitleBar.navTab(page, 'tools').first().click();
        await SEL.ToolsView.toolsTabQuote(page).first().click();

        const invToggle = page.getByRole('button', { name: /^(Inventario|Inventory|Estoque)$/i }).first();
        await invToggle.waitFor({ state: 'visible' });
        await invToggle.click();

        const spoolSelect = page
          .locator('[data-testid="quote-spool-select"]')
          .or(page.locator('main select').filter({ hasText: /Naranja Cotizar/i }))
          .first();
        await spoolSelect.waitFor({ state: 'visible' });
        const targetOption = await spoolSelect
          .locator('option', { hasText: /Naranja Cotizar/i })
          .first()
          .getAttribute('value');
        assert.ok(targetOption, 'Expected Naranja Cotizar option in inventory spool select');
        await spoolSelect.selectOption(targetOption);

        await page.locator('main').getByText(/Disponible:\s*500\.0\s*g/i).waitFor({ state: 'visible' });
        const spoolPriceInput = page
          .locator('main label', { hasText: /^(Precio bobina|Spool price|Preço do carretel)$/i })
          .locator('xpath=ancestor::div[1]//input')
          .first();
        assert.equal(await spoolPriceInput.inputValue(), '85000');

        const elecInput = page
          .locator('[data-testid="quote-electricity-rate"]')
          .or(page.locator('main label', { hasText: /kWh/i }).locator('xpath=ancestor::div[1]//input'))
          .first();
        await elecInput.waitFor({ state: 'visible' });
        await elecInput.fill('920');
        await elecInput.blur();

        const machineInput = page
          .locator('[data-testid="quote-machine-rate"]')
          .or(page.locator('main label', { hasText: /(Tarifa máquina|Machine rate|Taxa máquina)/i }).locator('xpath=ancestor::div[1]//input'))
          .first();
        await machineInput.waitFor({ state: 'visible' });
        await machineInput.fill('3200');
        await machineInput.blur();

        const savePrefsBtn = page
          .locator('[data-testid="quote-save-prefs-btn"]')
          .or(
            page.getByRole('button', {
              name: /(Fijar tarifas del taller|Set workshop defaults|Fixar tarifas padr|Guardar valores|Guardar predeterminados|Save defaults|Salvar padr)/i,
            }),
          )
          .first();
        await savePrefsBtn.waitFor({ state: 'visible' });
        await savePrefsBtn.click();

        await waitForDbCondition(
          page,
          (data) =>
            data.settings?.workshopPrefs?.electricityRatePerKwh === 920 &&
            data.settings?.workshopPrefs?.machineHourlyRate === 3200,
        );

        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForAppReady(page);

        const dbRes = await page.evaluate(() => window.filoteca.db.load());
        assert.equal(dbRes.ok, true);
        assert.equal(dbRes.data.settings.workshopPrefs.electricityRatePerKwh, 920);
        assert.equal(dbRes.data.settings.workshopPrefs.machineHourlyRate, 3200);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F10-04',
    tier: 1,
    tag: 'v2',
    feature: 'F10',
    name: 'Quote Calculator exports offline quote text/HTML via file:saveTextFile and copy button',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { app, page, artifactsDir } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({ id: 'quote-exp-roll', colorName: 'PLA Export Quote' });
        await resetDbState(page, { rolls: [roll] });

        await SEL.TitleBar.navTab(page, 'tools').first().click();
        await SEL.ToolsView.toolsTabQuote(page).first().click();

        await SEL.ToolsView.quoteCopyBtn(page).first().click();
        await SEL.Toasts.toastByTitle(
          page,
          /(Resumen copiado|Summary copied|Resumo copiado)/i,
        ).waitFor({ state: 'visible' });

        const outQuote = path.join(artifactsDir, 'cotizacion-taller.txt');
        try {
          await mockSaveDialog(app, outQuote);
          await SEL.ToolsView.quoteSaveBtn(page).first().click();

          const deadline = Date.now() + 8000;
          while (!fs.existsSync(outQuote) && Date.now() < deadline) {
            await page.waitForTimeout(100);
          }
        } finally {
          await restoreDialogs(app).catch(() => {});
        }

        assert.equal(fs.existsSync(outQuote), true, 'Expected quote export file to be written');
        const content = fs.readFileSync(outQuote, 'utf8');
        assert.ok(content.trim().length > 40, 'Expected non-empty exported quote');
        assert.equal(/https?:\/\//i.test(content), false, 'Offline quote must not embed CDN URLs');
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F10-05',
    tier: 1,
    tag: 'v2',
    feature: 'F10',
    name: 'Batch Slicer Inspector opens multiple .gcode/.3mf files, aggregates totals & stock check, and sends to Quote/Inbox',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { app, page, artifactsDir } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({
          id: 'batch-stock-roll',
          colorHex: '#F2754E',
          remainingWeight: 200,
        });
        await resetDbState(page, { rolls: [roll] });

        const batchA = path.join(artifactsDir, 'batch_a.gcode');
        const batchB = path.join(artifactsDir, 'batch_b.gcode');
        const batchC = path.join(artifactsDir, 'batch_c.3mf');

        fs.writeFileSync(
          batchA,
          createValidGcode({
            slicer: 'orca',
            models: ['Batch_A.stl'],
            slots: [{ grams: 25, colorHex: '#F2754E', material: 'PLA' }],
          }),
          'utf8',
        );
        fs.writeFileSync(
          batchB,
          createValidGcode({
            slicer: 'prusa',
            models: ['Batch_B.stl'],
            slots: [{ grams: 30, colorHex: '#F2754E', material: 'PLA' }],
          }),
          'utf8',
        );
        fs.writeFileSync(
          batchC,
          createValid3mfBuffer(
            [
              { plateIndex: 1, models: ['Batch_C1.stl'], slots: [{ grams: 15, colorHex: '#F2754E' }] },
              { plateIndex: 2, models: ['Batch_C2.stl'], slots: [{ grams: 20, colorHex: '#F2754E' }] },
            ],
            { useDataDescriptor: true, includeSliceInfo: true },
          ),
        );

        await SEL.TitleBar.navTab(page, 'tools').first().click();
        await SEL.ToolsView.toolsTabBatch(page).first().click();

        try {
          await mockOpenDialog(app, [batchA, batchB, batchC]);
          await SEL.ToolsView.batchSelectFilesBtn(page).first().click();
          await page.getByText(/Batch_A|batch_a/i).first().waitFor({ state: 'visible' });
        } finally {
          await restoreDialogs(app).catch(() => {});
        }

        const batchText = normalizeNbsp(await page.locator('main').innerText());
        assert.match(batchText, /90(?:\.0)?\s*g/i, `Expected aggregated 90 g in batch view: ${batchText}`);

        await SEL.ToolsView.batchSendQuoteBtn(page).first().click();
        const quoteTotalEl = SEL.ToolsView.quoteTotalOutput(page).first();
        await quoteTotalEl.waitFor({ state: 'visible' });

        await page.locator('main').getByText(/Material\s*\(\s*90(?:\.0)?\s*g\s*\)/i).waitFor({
          state: 'visible',
        });
        const quoteGramsInput = page
          .locator('main label', { hasText: /^(Gramos|Grams|Gramas)\s*\(g\)$/i })
          .locator('xpath=ancestor::div[1]//input')
          .first();
        assert.equal(await quoteGramsInput.inputValue(), '90');
        const transferredTotal = normalizeNbsp(await quoteTotalEl.innerText()).trim();
        assert.match(
          transferredTotal,
          /^\$\s*[1-9]\d{0,2}(?:\.\d{3})*$/,
          `Expected non-zero COP quote total after batch transfer, got: ${transferredTotal}`,
        );

        await SEL.ToolsView.toolsTabBatch(page).first().click();
        await SEL.ToolsView.batchSendInboxBtn(page).first().click();

        await waitForDbCondition(page, (data) => data.gcodeJobs.length >= 3);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F10-06',
    tier: 1,
    tag: 'v2',
    feature: 'F10',
    name: 'Filament Math converts g/m/cm3 and Drying/Temp Guide displays PLA, PETG, Nylon, and PC specs',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        await SEL.TitleBar.navTab(page, 'tools').first().click();
        await SEL.ToolsView.toolsTabMath(page).first().click();

        const gramsInput = page
          .locator('[data-testid="math-grams-input"]')
          .or(page.locator('main label', { hasText: /^(Peso|Weight)\s*\(g\)$/i }).locator('xpath=ancestor::div[1]//input'))
          .first();
        const metersInput = page
          .locator('[data-testid="math-meters-input"]')
          .or(page.locator('main label', { hasText: /^(Longitud|Length|Comprimento)\s*\(m\)$/i }).locator('xpath=ancestor::div[1]//input'))
          .first();
        const volumeInput = page
          .locator('[data-testid="math-volume-input"]')
          .or(page.locator('main label', { hasText: /^(Volumen|Volume)\s*\(cm/i }).locator('xpath=ancestor::div[1]//input'))
          .first();

        await gramsInput.waitFor({ state: 'visible' });
        await metersInput.waitFor({ state: 'visible' });
        await volumeInput.waitFor({ state: 'visible' });

        await gramsInput.fill('500');
        assert.match(await metersInput.inputValue(), /^167\.\d+$/, 'Expected ~167.64 m for 500g PLA 1.75mm');
        assert.match(await volumeInput.inputValue(), /^403\.\d+$/, 'Expected ~403.23 cm3 for 500g PLA');

        await gramsInput.fill('1000');
        assert.match(await metersInput.inputValue(), /^335\.\d+$/, 'Expected ~335.28 m for 1000g PLA 1.75mm');
        assert.match(await volumeInput.inputValue(), /^806\.\d+$/, 'Expected ~806.45 cm3 for 1000g PLA');

        const mainText = normalizeNbsp(await page.locator('main').innerText());
        for (const mat of ['PLA', 'PETG', 'Nylon', 'PC']) {
          assert.ok(mainText.includes(mat), `Expected Drying/Temp Guide to list ${mat}`);
        }
        assert.match(mainText, /°C/);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F10-07',
    tier: 1,
    tag: 'v2',
    feature: 'F10',
    name: 'Scale Tare Estimator computes net weight and updates selected inventory roll remainingWeight',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const roll = makeRoll({
          id: 'tare-roll-1',
          colorName: 'Bobina Báscula',
          initialWeight: 1000,
          remainingWeight: 800,
        });
        await resetDbState(page, { rolls: [roll] });

        await SEL.TitleBar.navTab(page, 'tools').first().click();
        await SEL.ToolsView.toolsTabMath(page).first().click();

        const tareRollSelect = page
          .locator('[data-testid="tare-roll-select"]')
          .or(page.locator('main select').filter({ hasText: /Bobina Báscula/i }))
          .first();
        await tareRollSelect.waitFor({ state: 'visible' });
        const optVal = await tareRollSelect
          .locator('option', { hasText: /Bobina Báscula/i })
          .first()
          .getAttribute('value');
        assert.ok(optVal, 'Expected Bobina Báscula option in tare roll select');
        await tareRollSelect.selectOption(optVal);

        const grossInput = SEL.ToolsView.tareGrossInput(page).first();
        const emptyInput = SEL.ToolsView.tareEmptyInput(page).first();
        await grossInput.waitFor({ state: 'visible' });
        await grossInput.fill('750');
        await emptyInput.fill('250');

        const mainText = normalizeNbsp(await page.locator('main').innerText());
        assert.match(mainText, /500(?:\.0)?\s*g/i, 'Expected 500 g net weight from 750 - 250');

        await SEL.ToolsView.tareApplyRollBtn(page).first().click();

        await waitForDbCondition(
          page,
          (data) => data.rolls.find((r) => r.id === 'tare-roll-1')?.remainingWeight === 500,
        );
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  // =========================================================================
  // F11 — Release Docs & Artifacts (5 v2 tests — exact dispatch ID mapping)
  // =========================================================================
  {
    id: 'T1-F11-01',
    tier: 1,
    tag: 'v2',
    feature: 'F11',
    name: 'ROADMAP.md exists in repo root with v2.1+ priorities/impact and zero disallowed terms',
    run: async () => {
      const roadmapPath = path.join(REPO_ROOT, 'ROADMAP.md');
      assert.equal(fs.existsSync(roadmapPath), true, 'Missing ROADMAP.md in repo root');

      const content = fs.readFileSync(roadmapPath, 'utf8');
      assert.ok(content.trim().length > 500, 'Expected non-trivial ROADMAP.md (> 500 chars)');
      assert.match(content, /v2\.[1-9]/i, 'ROADMAP.md must cover v2.1+');
      assert.match(
        content,
        /(prioridad|priority|alta|media|baja|high|medium|low|p0|p1|p2)/i,
        'ROADMAP.md must include priorities',
      );
      assert.match(
        content,
        /(impacto|impact|rendimiento|performance|taller|workshop)/i,
        'ROADMAP.md must describe expected impact',
      );

      assert.equal(makeDisallowedTermsRegex().test(content), false, 'Disallowed term in ROADMAP.md');
      assert.equal(makeDisallowedDonationRegex().test(content), false, 'Disallowed donation link in ROADMAP.md');
      assert.equal(makeUserPathRegex().test(content), false, 'Hardcoded user path in ROADMAP.md');
    },
  },

  {
    id: 'T1-F11-02',
    tier: 1,
    tag: 'v2',
    feature: 'F11',
    name: 'docs/BENCHMARKS_v2.0.0.md exists with before/after performance sections and zero disallowed terms',
    run: async () => {
      const reportPath = path.join(REPO_ROOT, 'docs', 'BENCHMARKS_v2.0.0.md');
      assert.equal(fs.existsSync(reportPath), true, 'Missing docs/BENCHMARKS_v2.0.0.md');

      const content = fs.readFileSync(reportPath, 'utf8');
      assert.ok(content.trim().length > 500, 'Expected non-trivial BENCHMARKS_v2.0.0.md');
      assert.match(content, /(antes|before|v1\.1\.0)/i, 'Missing before/baseline section');
      assert.match(content, /(despu[eé]s|after|v2\.0\.0)/i, 'Missing after/v2.0.0 section');
      assert.match(content, /(arranque|startup|cold start)/i, 'Missing startup benchmark');
      assert.match(content, /(ram|memoria|memory|rss|heap)/i, 'Missing RAM benchmark');
      assert.match(content, /(cpu|gpu|3d|webgl|fps)/i, 'Missing CPU/GPU/3D benchmark');
      assert.match(content, /(lista|list|rollos|spools|200|250|260|1000)/i, 'Missing large-list benchmark');
      assert.match(content, /(asar|bundle|tama[nñ]o|size|portable|\.exe)/i, 'Missing bundle size benchmark');

      assert.equal(makeDisallowedTermsRegex().test(content), false, 'Disallowed term in BENCHMARKS_v2.0.0.md');
      assert.equal(makeDisallowedDonationRegex().test(content), false, 'Disallowed donation in BENCHMARKS_v2.0.0.md');
      assert.equal(makeUserPathRegex().test(content), false, 'Hardcoded user path in BENCHMARKS_v2.0.0.md');
    },
  },

  {
    id: 'T1-F11-03',
    tier: 1,
    tag: 'v2',
    feature: 'F11',
    timeoutMs: 90_000,
    name: 'scripts/benchmark.mjs and scripts/test-workshop-tools.mjs exist and workshop tools unit suite passes',
    run: async () => {
      const benchPath = path.join(REPO_ROOT, 'scripts', 'benchmark.mjs');
      const workshopTestPath = path.join(REPO_ROOT, 'scripts', 'test-workshop-tools.mjs');
      assert.equal(fs.existsSync(benchPath), true, 'Missing scripts/benchmark.mjs');
      assert.equal(fs.existsSync(workshopTestPath), true, 'Missing scripts/test-workshop-tools.mjs');

      const res = spawnSync('npx', ['tsx', 'scripts/test-workshop-tools.mjs'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        shell: process.platform === 'win32',
        timeout: 80_000,
      });
      assert.equal(
        res.status,
        0,
        `scripts/test-workshop-tools.mjs exited with ${res.status}:\n${res.stdout}\n${res.stderr}`,
      );
    },
  },

  {
    id: 'T1-F11-04',
    tier: 1,
    tag: 'v2',
    feature: 'F11',
    name: 'README.md and README.es.md reference 2.0.0, TermuxX solutions, Wompi/PayPal only, and zero disallowed tokens',
    run: async () => {
      const donationRx = makeDisallowedDonationRegex();
      const userPathRx = makeUserPathRegex();
      const termsRx = makeDisallowedTermsRegex();

      for (const name of ['README.md', 'README.es.md']) {
        const fp = path.join(REPO_ROOT, name);
        assert.equal(fs.existsSync(fp), true, `Missing ${name}`);
        const content = fs.readFileSync(fp, 'utf8');
        assert.match(content, /2\.0\.0/, `${name} must reference 2.0.0`);
        assert.ok(content.includes('TermuxX solutions'), `${name} must credit TermuxX solutions`);
        assert.ok(content.includes('https://checkout.wompi.co/l/miKi8F'), `${name} missing Wompi URL`);
        assert.ok(content.includes('https://paypal.me/matec15'), `${name} missing PayPal URL`);
        assert.equal(donationRx.test(content), false, `${name} contains disallowed donation link`);
        assert.equal(userPathRx.test(content), false, `${name} contains hardcoded user path`);
        assert.equal(termsRx.test(content), false, `${name} contains disallowed term`);
      }
    },
  },

  {
    id: 'T1-F11-05',
    tier: 1,
    tag: 'v2',
    feature: 'F11',
    name: 'test-fixtures contains multi-slicer/.3mf fixtures and package.json configures Filoteca-Portable-2.0.0.exe',
    run: async () => {
      const fixturesDir = path.join(REPO_ROOT, 'test-fixtures');
      assert.equal(fs.existsSync(fixturesDir), true, 'Missing test-fixtures/ directory');

      const requiredFixtures = [
        'cura_benchy.gcode',
        'prusaslicer_cover.gcode',
        'simplify3d_bracket.gcode',
        'creality_v4_print.gcode',
        'ideamaker_housing.gcode',
        'klipper_macro_part.gcode',
        'multi_plate_bit3.3mf',
        'multicolor_real.metadata',
        'single_color_real.metadata',
      ];
      for (const fname of requiredFixtures) {
        assert.equal(
          fs.existsSync(path.join(fixturesDir, fname)),
          true,
          `Missing fixture test-fixtures/${fname}`,
        );
      }

      const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
      assert.equal(pkg.version, '2.0.0');
      assert.equal(pkg.build?.asar, true);
      assert.equal(pkg.build?.portable?.artifactName, 'Filoteca-Portable-${version}.exe');
      assert.equal(pkg.build?.win?.icon, 'build/icon.ico');
      assert.equal(fs.existsSync(path.join(REPO_ROOT, 'build', 'icon.ico')), true);
      assert.equal(fs.existsSync(path.join(REPO_ROOT, 'dist', 'index.html')), true);
      assert.equal(fs.existsSync(path.join(REPO_ROOT, 'dist-electron', 'electron', 'main.js')), true);

      const portableExePath = path.join(REPO_ROOT, 'release', 'Filoteca-Portable-2.0.0.exe');
      if (fs.existsSync(portableExePath) || process.env.FILOTECA_REQUIRE_PORTABLE_EXE === '1') {
        assert.equal(fs.existsSync(portableExePath), true, `Missing ${portableExePath}`);
        const stat = fs.statSync(portableExePath);
        assert.ok(stat.size > 20 * 1024 * 1024, `Portable .exe too small: ${stat.size} bytes`);
        const fd = fs.openSync(portableExePath, 'r');
        try {
          const magic = Buffer.alloc(2);
          fs.readSync(fd, magic, 0, 2, 0);
          assert.equal(magic.toString('ascii'), 'MZ', 'Portable .exe missing MZ PE header');
        } finally {
          fs.closeSync(fd);
        }
      }
    },
  },
];
