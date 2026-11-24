import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT,
  assertNoExternalNetworkRequests,
  assertNoPageErrors,
  completeOnboarding,
  launchFiloteca,
  skipOnboardingFast,
  waitForAppReady,
} from '../lib/harness.mjs';
import { SEL, normalizeNbsp } from '../lib/selectors.mjs';

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.ps1',
  '.bat',
  '.yml',
  '.yaml',
  '.html',
  '.css',
  '.txt',
]);

const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-electron', 'release', '.git']);
const SKIP_FILES = new Set(['package-lock.json']);

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

function walkRepoFiles(dir, relBase = '', out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push({ kind: 'dir', relPath, fullPath, name: entry.name });
      walkRepoFiles(fullPath, relPath, out);
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue;
      out.push({ kind: 'file', relPath, fullPath, name: entry.name });
    }
  }
  return out;
}

export const tests = [
  {
    id: 'T1-F1-01',
    tier: 1,
    tag: 'v2',
    feature: 'F1',
    name: 'package.json declares version 2.0.0, author TermuxX solutions, and portable artifactName',
    run: async () => {
      const pkgPath = path.join(REPO_ROOT, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      assert.equal(pkg.version, '2.0.0');
      assert.equal(pkg.author, 'TermuxX solutions');
      assert.equal(pkg.build?.portable?.artifactName, 'Filoteca-Portable-${version}.exe');
    },
  },

  {
    id: 'T1-F1-02',
    tier: 1,
    tag: 'v2',
    feature: 'F1',
    name: 'Repository static R1 compliance scan finds zero disallowed tokens, paths, or legacy artifacts',
    run: async () => {
      const donationRx = makeDisallowedDonationRegex();
      const userPathRx = makeUserPathRegex();
      const termsRx = makeDisallowedTermsRegex();
      const legacyDirName = ['.', 'ju', 'les'].join('');
      const legacyDocName = ['prompts', '-', 'image', 'gen.md'].join('');

      const violations = [];
      const entries = walkRepoFiles(REPO_ROOT);

      for (const item of entries) {
        const lowerName = item.name.toLowerCase();
        if (lowerName === legacyDirName || lowerName === legacyDocName) {
          violations.push(`${item.relPath}: disallowed legacy path`);
        }
        if (item.kind !== 'file') continue;
        const ext = path.extname(item.name).toLowerCase();
        if (!TEXT_EXTENSIONS.has(ext)) continue;

        const content = fs.readFileSync(item.fullPath, 'utf8');
        const lines = content.split(/\r?\n/);
        for (let idx = 0; idx < lines.length; idx++) {
          const line = lines[idx];
          for (const [label, rx] of [
            ['donation', donationRx],
            ['user-path', userPathRx],
            ['term', termsRx],
          ]) {
            if (rx.test(line)) {
              violations.push(`${item.relPath}:${idx + 1} [${label}]: ${line.trim().slice(0, 140)}`);
            }
          }
        }
      }

      assert.equal(
        violations.length,
        0,
        `R1 static scan found ${violations.length} violation(s):\n${violations.join('\n')}`,
      );
    },
  },

  {
    id: 'T1-F1-03',
    tier: 1,
    tag: 'v2',
    feature: 'F1',
    name: 'SettingsView footer displays Filoteca v2.0.0, TermuxX solutions, and 100% Offline',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);
        await SEL.TitleBar.navTab(page, 'settings').click();
        const footer = SEL.SettingsView.versionFooter(page);
        await footer.waitFor({ state: 'visible' });
        const text = normalizeNbsp(await footer.textContent());
        assert.match(text, /Filoteca v2\.0\.0/);
        assert.match(text, /TermuxX solutions/);
        assert.match(text, /100% Offline/);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F1-04',
    tier: 1,
    tag: 'v1',
    feature: 'F1',
    name: 'OnboardingModal and SettingsView expose only Wompi and PayPal donation links',
    run: async () => {
      const donationRx = makeDisallowedDonationRegex();
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { app, page } = ctx;
        const modal = SEL.OnboardingModal.modal(page);
        await modal.waitFor({ state: 'visible' });

        for (let nextStep = 2; nextStep <= 5; nextStep++) {
          await SEL.OnboardingModal.nextBtn(page).click();
          await modal
            .locator('span', { hasText: new RegExp(`Filoteca · ${nextStep} \\/ 5`) })
            .waitFor({ state: 'visible' });
        }

        await app.evaluate(({ shell }) => {
          globalThis.__e2eOrigOpenExternal = shell.openExternal.bind(shell);
          globalThis.__e2eOpenedUrls = [];
          shell.openExternal = async (url) => {
            globalThis.__e2eOpenedUrls.push(String(url));
          };
        });

        await SEL.OnboardingModal.donateWompiBtn(page).click();
        await SEL.OnboardingModal.donatePayPalBtn(page).click();
        await page.waitForTimeout(100);

        const onboardingUrls = await app.evaluate(() => {
          const urls = [...(globalThis.__e2eOpenedUrls ?? [])];
          globalThis.__e2eOpenedUrls = [];
          return urls;
        });
        assert.deepEqual(onboardingUrls, [
          'https://checkout.wompi.co/l/miKi8F',
          'https://paypal.me/matec15',
        ]);
        const modalText = (await modal.innerText()) || '';
        assert.equal(donationRx.test(modalText), false, 'Disallowed donation platform in OnboardingModal');

        await SEL.OnboardingModal.finishBtn(page).click();
        await modal.waitFor({ state: 'hidden' });

        await SEL.TitleBar.navTab(page, 'settings').click();
        await SEL.SettingsView.donateWompiBtn(page).scrollIntoViewIfNeeded();
        await SEL.SettingsView.donateWompiBtn(page).click();
        await SEL.SettingsView.donatePayPalBtn(page).click();
        await page.waitForTimeout(100);

        const settingsUrls = await app.evaluate(() => [...(globalThis.__e2eOpenedUrls ?? [])]);
        assert.deepEqual(settingsUrls, [
          'https://checkout.wompi.co/l/miKi8F',
          'https://paypal.me/matec15',
        ]);
        const settingsBody = (await page.locator('main').innerText()) || '';
        assert.equal(donationRx.test(settingsBody), false, 'Disallowed donation platform in SettingsView');

        await app.evaluate(({ shell }) => {
          if (globalThis.__e2eOrigOpenExternal) {
            shell.openExternal = globalThis.__e2eOrigOpenExternal;
          }
        });
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F1-05',
    tier: 1,
    tag: 'v1',
    feature: 'F1',
    name: 'Zero external network calls occur during startup and full view navigation',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      const pageRequests = [];
      try {
        const { app, page } = ctx;
        page.on('request', (req) => pageRequests.push(req.url()));

        await app.evaluate(({ session }) => {
          globalThis.__e2eSessionRequests = [];
          session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
            globalThis.__e2eSessionRequests.push(details.url);
            callback({});
          });
        });

        await skipOnboardingFast(page);

        for (const tabKey of ['shelf', 'stats', 'replenish', 'shopping', 'inbox', 'settings']) {
          const tab = SEL.TitleBar.navTab(page, tabKey);
          await tab.click();
          await page.waitForTimeout(150);
        }

        const toolsTab = SEL.TitleBar.navTab(page, 'tools');
        if ((await toolsTab.count()) > 0) {
          await toolsTab.first().click();
          await page.waitForTimeout(150);
        }

        const sessionRequests = await app.evaluate(({ session }) => {
          session.defaultSession.webRequest.onBeforeRequest(null);
          return [...(globalThis.__e2eSessionRequests ?? [])];
        });

        const allUrls = [
          ...ctx.networkRequests.map((r) => r.url),
          ...pageRequests,
          ...sessionRequests,
        ];
        const allowedPrefix = /^(file:|filoteca-media:|devtools:|data:|blob:)/i;
        const disallowed = allUrls.filter((u) => !allowedPrefix.test(u));
        assert.deepEqual(disallowed, [], `Unexpected network URLs: ${disallowed.join(', ')}`);
        assertNoExternalNetworkRequests(ctx);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F1-06',
    tier: 1,
    tag: 'v1',
    feature: 'F1',
    name: 'SettingsView displays generic SQLite DB path inside isolated FILOTECA_USERDATA',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page, userDataDir } = ctx;
        await skipOnboardingFast(page);
        await SEL.TitleBar.navTab(page, 'settings').click();
        const dbPathEl = SEL.SettingsView.dbPathValue(page);
        await dbPathEl.waitFor({ state: 'visible' });
        const displayedPath = (await dbPathEl.textContent())?.trim() ?? '';
        assert.equal(path.resolve(displayedPath), path.resolve(userDataDir, 'filoteca.db'));
        assert.equal(fs.existsSync(displayedPath), true);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F2-01',
    tier: 1,
    tag: 'v1',
    feature: 'F2',
    name: 'Fresh launch shows OnboardingModal (1 / 5), blocks Escape, and Skip persists completion',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page } = ctx;
        const modal = SEL.OnboardingModal.modal(page);
        await modal.waitFor({ state: 'visible' });
        const stepText = normalizeNbsp(await SEL.OnboardingModal.stepCounter(page).textContent());
        assert.match(stepText, /Filoteca · 1 \/ 5/);

        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        assert.equal(await modal.isVisible(), true);

        await SEL.OnboardingModal.skipBtn(page).click();
        await modal.waitFor({ state: 'hidden' });

        await SEL.SpoolCard.allCards(page).first().waitFor({ state: 'visible' });
        const dbRes = await page.evaluate(() => window.filoteca.db.load());
        assert.equal(dbRes.ok, true);
        assert.equal(dbRes.data.settings.onboardingCompleted, true);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F2-02',
    tier: 1,
    tag: 'v1',
    feature: 'F2',
    name: 'Completing 5-step OnboardingModal applies English, USD, and Dark theme to UI and DB',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page } = ctx;
        await completeOnboarding(page, { language: 'en', currency: 'USD', theme: 'dark' });

        const isDark = await page.evaluate(() =>
          document.documentElement.classList.contains('dark'),
        );
        assert.equal(isDark, true);

        const navText = normalizeNbsp(await page.locator('header nav').innerText());
        for (const label of ['Shelf', 'Statistics', 'Restock', 'Shopping', 'Slicer Tray', 'Settings']) {
          assert.ok(navText.includes(label), `Expected nav to contain "${label}", got "${navText}"`);
        }

        await page.waitForTimeout(250);
        const dbRes = await page.evaluate(() => window.filoteca.db.load());
        assert.equal(dbRes.ok, true);
        assert.equal(dbRes.data.settings.language, 'en');
        assert.equal(dbRes.data.settings.currency, 'USD');
        assert.equal(dbRes.data.settings.theme, 'dark');
        assert.equal(dbRes.data.settings.onboardingCompleted, true);
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F2-03',
    tier: 1,
    tag: 'v1',
    feature: 'F2',
    name: 'Theme switching between dark, light, and system updates html.dark and persists on reload',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);
        await SEL.TitleBar.navTab(page, 'settings').click();

        await SEL.SettingsView.themeBtn(page, 'dark').click();
        assert.equal(
          await page.evaluate(() => document.documentElement.classList.contains('dark')),
          true,
        );

        await SEL.SettingsView.themeBtn(page, 'light').click();
        assert.equal(
          await page.evaluate(() => document.documentElement.classList.contains('dark')),
          false,
        );

        await SEL.SettingsView.themeBtn(page, 'system').click();
        const matchesSystem = await page.evaluate(
          () =>
            document.documentElement.classList.contains('dark') ===
            window.matchMedia('(prefers-color-scheme: dark)').matches,
        );
        assert.equal(matchesSystem, true);

        await SEL.SettingsView.themeBtn(page, 'dark').click();
        await page.waitForTimeout(250);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForAppReady(page);
        assert.equal(
          await page.evaluate(() => document.documentElement.classList.contains('dark')),
          true,
        );
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F2-04',
    tier: 1,
    tag: 'v1',
    feature: 'F2',
    name: 'Language switching (es -> en -> pt) updates TitleBar labels and persists across reload',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);
        await SEL.TitleBar.navTab(page, 'settings').click();

        await SEL.SettingsView.langBtn(page, 'es').click();
        const esNav = normalizeNbsp(await page.locator('header nav').innerText());
        for (const label of ['Estantería', 'Estadísticas', 'Reabastecimiento', 'Compras', 'Bandeja', 'Ajustes']) {
          assert.ok(esNav.includes(label), `ES nav missing "${label}": ${esNav}`);
        }

        await SEL.SettingsView.langBtn(page, 'en').click();
        const enNav = normalizeNbsp(await page.locator('header nav').innerText());
        for (const label of ['Shelf', 'Statistics', 'Restock', 'Shopping', 'Slicer Tray', 'Settings']) {
          assert.ok(enNav.includes(label), `EN nav missing "${label}": ${enNav}`);
        }

        await SEL.SettingsView.langBtn(page, 'pt').click();
        const ptNav = normalizeNbsp(await page.locator('header nav').innerText());
        for (const label of ['Estante', 'Estatísticas', 'Reabastecimento', 'Compras', 'Bandeja', 'Ajustes']) {
          assert.ok(ptNav.includes(label), `PT nav missing "${label}": ${ptNav}`);
        }

        await page.waitForTimeout(250);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForAppReady(page);
        const reloadedNav = normalizeNbsp(await page.locator('header nav').innerText());
        assert.ok(reloadedNav.includes('Estante'), `Reloaded PT nav missing Estante: ${reloadedNav}`);
        assert.ok(
          reloadedNav.includes('Estatísticas'),
          `Reloaded PT nav missing Estatísticas: ${reloadedNav}`,
        );
        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F2-05',
    tier: 1,
    tag: 'v1',
    feature: 'F2',
    name: 'Currency formatting parity across COP (0 decimals), USD (2 decimals), and EUR (2 decimals)',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);

        const verifyCurrency = async (code, cardRegex, totalRegex, avgRegex) => {
          await SEL.TitleBar.navTab(page, 'settings').click();
          await SEL.SettingsView.currencyPill(page, code).click();

          await SEL.TitleBar.navTab(page, 'shelf').click();
          const card = SEL.SpoolCard.cardByName(page, 'Negro Clásico').first();
          await card.waitFor({ state: 'visible' });
          const cardPrice = normalizeNbsp(await SEL.SpoolCard.cardPrice(card).textContent());
          assert.match(cardPrice, cardRegex, `${code} shelf price mismatch: ${cardPrice}`);

          await SEL.TitleBar.navTab(page, 'stats').click();
          const invCard = SEL.StatsView.kpiInventoryValue(page);
          await invCard.waitFor({ state: 'visible' });
          const invValue = normalizeNbsp(await SEL.StatsView.kpiValueText(invCard).textContent());
          assert.match(invValue, totalRegex, `${code} stats inventory value mismatch: ${invValue}`);

          if (avgRegex) {
            const avgCard = SEL.StatsView.kpiAvgCostPerGram(page);
            const avgValue = normalizeNbsp(await SEL.StatsView.kpiValueText(avgCard).textContent());
            assert.match(avgValue, avgRegex, `${code} stats avg cost/g mismatch: ${avgValue}`);
          }
        };

        await verifyCurrency(
          'COP',
          /\$\s*68\.900(?!,\d)/,
          /\$\s*[\d.]+(?!,\d)/,
          null,
        );
        await verifyCurrency(
          'USD',
          /(?:US\$|USD|\$)\s*68\.900,00/,
          /(?:US\$|USD|\$)\s*[\d.]+,\d{2}/,
          /(?:US\$|USD|\$)\s*[\d.]+,\d{3}\/g/,
        );
        await verifyCurrency(
          'EUR',
          /(?:EUR|€)\s*68\.900,00/,
          /(?:EUR|€)\s*[\d.]+,\d{2}/,
          null,
        );

        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },

  {
    id: 'T1-F2-06',
    tier: 1,
    tag: 'v2',
    feature: 'F2',
    name: 'SettingsView exposes BRL quick pill, persists BRL, and formats 2 decimals in Shelf and Stats',
    run: async () => {
      const ctx = await launchFiloteca({ reducedMotion: true });
      try {
        const { page } = ctx;
        await skipOnboardingFast(page);
        await SEL.TitleBar.navTab(page, 'settings').click();

        const brlPill = SEL.SettingsView.currencyPill(page, 'BRL');
        await brlPill.waitFor({ state: 'visible' });
        await brlPill.click();
        await page.waitForTimeout(250);

        const dbRes = await page.evaluate(() => window.filoteca.db.load());
        assert.equal(dbRes.ok, true);
        assert.equal(dbRes.data.settings.currency, 'BRL');

        await SEL.TitleBar.navTab(page, 'shelf').click();
        const card = SEL.SpoolCard.cardByName(page, 'Negro Clásico').first();
        await card.waitFor({ state: 'visible' });
        const cardPrice = normalizeNbsp(await SEL.SpoolCard.cardPrice(card).textContent());
        assert.match(cardPrice, /(?:R\$|BRL)\s*68\.900,00/);

        await SEL.TitleBar.navTab(page, 'stats').click();
        const invCard = SEL.StatsView.kpiInventoryValue(page);
        await invCard.waitFor({ state: 'visible' });
        const invValue = normalizeNbsp(await SEL.StatsView.kpiValueText(invCard).textContent());
        assert.match(invValue, /(?:R\$|BRL)\s*[\d.]+,\d{2}/);

        assertNoPageErrors(ctx);
      } finally {
        await ctx.close();
      }
    },
  },
];
