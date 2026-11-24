import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';

export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
export const DEFAULT_VIEWPORT = { width: 1400, height: 900 };
export const DEFAULT_TIMEOUT = 20_000;

const CLEAN_WORKSHOP_PREFS = {
  electricityRatePerKwh: 850,
  printerWattage: 150,
  machineHourlyRate: 2500,
  laborHourlyRate: 0,
  defaultFailurePct: 5,
  defaultMarginPct: 30,
  defaultTaxPct: 0,
  defaultPrinterPreset: 'generic-fdm',
};

const CLEAN_SETTINGS_DEFAULTS = {
  theme: 'system',
  language: 'es',
  onboardingCompleted: true,
  lowThreshold: 20,
  criticalThreshold: 10,
  currency: 'COP',
  trayEnabled: false,
  closeToTray: false,
  seeded: true,
  defaultDeliveryDays: 6,
  defaultSafetyMarginDays: 2,
  productOverrides: {},
  watchedGcodeFolder: '',
  autoLogGcode: false,
  companionModeEnabled: false,
  companionSlicerExe: 'AnycubicSlicerNext.exe',
  companionAutoOpen: true,
  companionPromptOnExit: true,
  companionAutoClose: true,
  rememberedMappings: {},
  slotRollMappings: {},
  workshopPrefs: CLEAN_WORKSHOP_PREFS,
};

const netStateByApp = new WeakMap();
const activeCloses = new Set();

export function registerActiveClose(closeFn) {
  if (typeof closeFn !== 'function') return () => {};
  activeCloses.add(closeFn);
  return () => {
    activeCloses.delete(closeFn);
  };
}

export async function cleanupActiveContexts() {
  const pending = [...activeCloses];
  if (pending.length === 0) return;
  await Promise.allSettled(pending.map((fn) => Promise.resolve().then(() => fn())));
}

export async function forceCloseElectronApp(app, timeoutMs = 5000) {
  if (!app) return;
  await restoreDialogs(app).catch(() => {});
  let timer = null;
  try {
    await Promise.race([
      app.close(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('app.close timeout')), timeoutMs);
      }),
    ]);
  } catch {
    let quitTimer = null;
    try {
      await Promise.race([
        app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => {}),
        new Promise((resolve) => {
          quitTimer = setTimeout(resolve, 1000);
        }),
      ]);
    } finally {
      if (quitTimer) clearTimeout(quitTimer);
    }
    try {
      const proc = app.process?.();
      if (proc && !proc.killed) {
        proc.kill();
      }
    } catch {
      // ignore
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function rmDirWithRetry(dir, retries = 8) {
  if (!dir) return;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      const code = err && typeof err === 'object' ? err.code : '';
      if (code === 'ENOENT') return;
      if (attempt === retries || !['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(code)) {
        throw err;
      }
      await sleep(50 * (attempt + 1));
    }
  }
}

export async function waitForAppReady(page, timeout = DEFAULT_TIMEOUT) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => {
      const root = document.querySelector('#root');
      return Boolean(window.filoteca && root && root.childElementCount > 0);
    },
    null,
    { timeout },
  );
  await page.waitForFunction(
    () => !document.body.innerText.includes('Iniciando taller Filoteca'),
    null,
    { timeout },
  );
}

export async function launchFiloteca(opts = {}) {
  const userDataDir = opts.userDataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-e2e-ud-'));
  const localAppDataDir =
    opts.localAppDataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-e2e-la-'));
  const artifactsDir =
    opts.artifactsDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-e2e-art-'));

  const ownUd = !opts.userDataDir;
  const ownLa = !opts.localAppDataDir;
  const ownArt = !opts.artifactsDir;

  const cleanupTempDirs = async (closeOpts = {}) => {
    if (ownUd && !closeOpts.preserveUserData) {
      await rmDirWithRetry(userDataDir).catch(() => {});
    }
    if (ownLa && !closeOpts.preserveLocalAppData) {
      await rmDirWithRetry(localAppDataDir).catch(() => {});
    }
    if (ownArt && !closeOpts.preserveArtifacts) {
      await rmDirWithRetry(artifactsDir).catch(() => {});
    }
  };

  if (opts.signal?.aborted) {
    await cleanupTempDirs();
    throw new Error('Filoteca launch aborted');
  }

  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(localAppDataDir, { recursive: true });
  fs.mkdirSync(artifactsDir, { recursive: true });

  if (typeof opts.preSeed === 'function') {
    await opts.preSeed({ userDataDir, localAppDataDir, artifactsDir });
  }

  const env = {
    ...process.env,
    ...(opts.env ?? {}),
    FILOTECA_USERDATA: userDataDir,
    LOCALAPPDATA: localAppDataDir,
  };
  delete env.VITE_DEV_SERVER_URL;

  const pageErrors = [];
  const consoleErrors = [];
  const networkRequests = [];

  let app = null;
  let aborted = false;
  let closePromise = null;

  const close = async (closeOpts = {}) => {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      aborted = true;
      if (opts.signal) {
        opts.signal.removeEventListener('abort', forceCleanup);
      }
      try {
        await forceCloseElectronApp(app);
      } finally {
        activeCloses.delete(forceCleanup);
        await cleanupTempDirs(closeOpts);
      }
    })();
    return closePromise;
  };

  const forceCleanup = () => close();
  activeCloses.add(forceCleanup);
  if (opts.signal) {
    opts.signal.addEventListener('abort', forceCleanup, { once: true });
  }

  try {
    app = await electron.launch({
      args: ['.', ...(opts.args ?? [])],
      cwd: REPO_ROOT,
      env,
    });

    if (aborted || opts.signal?.aborted) {
      await forceCloseElectronApp(app);
      await cleanupTempDirs();
      throw new Error('Filoteca launch aborted');
    }

    const browserContext = app.context();
    const netState = {
      blockExternal: Boolean(opts.blockExternalNetwork),
      unblockedWsPending: new Map(),
    };
    netStateByApp.set(app, netState);

    const attachedPages = new WeakSet();
    const attachPageListeners = (targetPage) => {
      if (!targetPage || attachedPages.has(targetPage)) return;
      attachedPages.add(targetPage);
      targetPage.on('pageerror', (err) => pageErrors.push(err));
      targetPage.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      targetPage.on('websocket', (ws) => {
        const wsUrl = ws.url();
        const pendingCount = netState.unblockedWsPending.get(wsUrl) ?? 0;
        if (pendingCount > 0) {
          if (pendingCount === 1) {
            netState.unblockedWsPending.delete(wsUrl);
          } else {
            netState.unblockedWsPending.set(wsUrl, pendingCount - 1);
          }
          return;
        }
        networkRequests.push({
          url: wsUrl,
          resourceType: 'websocket',
          method: 'WS',
        });
      });
    };

    browserContext.on('request', (req) => {
      networkRequests.push({
        url: req.url(),
        resourceType: req.resourceType(),
        method: req.method(),
      });
    });

    await browserContext.routeWebSocket(/^wss?:/i, (wsRoute) => {
      const wsUrl = wsRoute.url();
      networkRequests.push({
        url: wsUrl,
        resourceType: 'websocket',
        method: 'WS',
      });
      if (netState.blockExternal) {
        wsRoute
          .close({ code: 1008, reason: 'Blocked external WebSocket in offline test' })
          .catch(() => {});
        return;
      }
      netState.unblockedWsPending.set(wsUrl, (netState.unblockedWsPending.get(wsUrl) ?? 0) + 1);
      try {
        wsRoute.connectToServer();
      } catch {
        const prev = netState.unblockedWsPending.get(wsUrl) ?? 0;
        if (prev <= 1) netState.unblockedWsPending.delete(wsUrl);
        else netState.unblockedWsPending.set(wsUrl, prev - 1);
      }
    });

    if (netState.blockExternal) {
      await browserContext.route(/^https?:|^wss?:/i, (route) => route.abort('internetdisconnected'));
    }

    browserContext.on('page', attachPageListeners);

    const page = await app.firstWindow();
    attachPageListeners(page);

    if (opts.reducedMotion === true || opts.reducedMotion === 'reduce') {
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }
    await page.setViewportSize(opts.viewport ?? DEFAULT_VIEWPORT);
    await waitForAppReady(page, opts.timeoutMs ?? DEFAULT_TIMEOUT);

    return {
      app,
      page,
      userDataDir,
      localAppDataDir,
      artifactsDir,
      pageErrors,
      consoleErrors,
      networkRequests,
      close,
    };
  } catch (err) {
    await close().catch(() => {});
    throw err;
  }
}

export async function dismissOnboarding(page) {
  const modal = page.locator('div.fixed.inset-0.z-50').first();
  await modal.waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT });
  await modal.getByRole('button', { name: /^(Omitir|Skip|Pular)$/i }).click();
  await modal.waitFor({ state: 'hidden', timeout: DEFAULT_TIMEOUT });
}

export async function completeOnboarding(page, { language, currency, theme } = {}) {
  const modal = page.locator('div.fixed.inset-0.z-50').first();
  await modal.waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT });

  // Step 1: Language
  if (language) {
    const langRegex = {
      es: /Español/i,
      en: /English/i,
      pt: /Portugu[eê]s/i,
    }[language];
    if (langRegex) {
      await modal.getByRole('button', { name: langRegex }).click();
    }
  }
  await modal.getByRole('button', { name: /(Siguiente|Next|Avan[cç]ar)/i }).click();

  // Step 2: Currency & Theme
  await modal.getByRole('button', { name: /\bCOP\b/i }).waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT });
  if (currency) {
    await modal.getByRole('button', { name: new RegExp(`\\b${currency}\\b`, 'i') }).click();
  }
  if (theme) {
    const themeRegex = {
      dark: /(Modo Oscuro|Dark Mode|Modo Escuro)/i,
      light: /(Modo Claro|Light Mode|Modo Claro)/i,
      system: /(Sistema|System)/i,
    }[theme];
    if (themeRegex) {
      await modal.getByRole('button', { name: themeRegex }).click();
    }
  }
  await modal.getByRole('button', { name: /(Siguiente|Next|Avan[cç]ar)/i }).click();

  // Step 3 -> Step 4 -> Step 5
  await modal.locator('span', { hasText: /Filoteca · 3 \/ 5/ }).waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT });
  await modal.getByRole('button', { name: /(Siguiente|Next|Avan[cç]ar)/i }).click();
  await modal.locator('span', { hasText: /Filoteca · 4 \/ 5/ }).waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT });
  await modal.getByRole('button', { name: /(Siguiente|Next|Avan[cç]ar)/i }).click();
  await modal.locator('span', { hasText: /Filoteca · 5 \/ 5/ }).waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT });

  // Step 5: Finish
  await modal
    .getByRole('button', { name: /(¡Comenzar en el taller!|Get Started!|Come[cç]ar na oficina!)/i })
    .click();
  await modal.waitFor({ state: 'hidden', timeout: DEFAULT_TIMEOUT });
}

export async function skipOnboardingFast(page, opts = {}) {
  await page.evaluate(async (options) => {
    const api = window.filoteca;
    const updates = {
      onboardingCompleted: true,
      companionModeEnabled: options.companionModeEnabled ?? false,
    };
    if (options.language) updates.language = options.language;
    if (options.currency) updates.currency = options.currency;
    if (options.theme) updates.theme = options.theme;
    if (options.seeded !== undefined) updates.seeded = options.seeded;

    for (const [k, v] of Object.entries(updates)) {
      const res = await api.db.setSetting(k, v);
      if (!res?.ok) throw new Error(`setSetting(${k}) failed: ${res?.error ?? 'unknown'}`);
    }
  }, opts);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
}

export async function resetDbState(page, snapshot = {}) {
  await page.evaluate(
    async ({ snap, defaults }) => {
      const api = window.filoteca;
      if (snap.resetSettings !== false) {
        for (const [k, v] of Object.entries(defaults)) {
          const res = await api.db.setSetting(k, v);
          if (!res?.ok) throw new Error(`resetDbState setSetting(${k}) failed: ${res?.error}`);
        }
      }

      const settingsOverrides = {
        ...(snap.settings ?? {}),
        seeded: snap.settings?.seeded ?? true,
      };
      for (const [k, v] of Object.entries(settingsOverrides)) {
        const res = await api.db.setSetting(k, v);
        if (!res?.ok) throw new Error(`resetDbState override(${k}) failed: ${res?.error}`);
      }

      const res = await api.db.replaceAll({
        rolls: snap.rolls ?? [],
        usage: snap.usage ?? [],
        shopping: snap.shopping ?? [],
        orders: snap.orders ?? [],
        gcodeJobs: snap.gcodeJobs ?? [],
      });
      if (!res?.ok) {
        throw new Error(`resetDbState replaceAll failed: ${res?.error ?? 'unknown'}`);
      }
    },
    { snap: snapshot, defaults: CLEAN_SETTINGS_DEFAULTS },
  );

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
}

export async function mockSaveDialog(app, filePath) {
  await app.evaluate(({ dialog }, targetPath) => {
    const store = (globalThis.__filotecaOrigDialogs ??= {});
    if (!store.showSaveDialog) {
      store.showSaveDialog = dialog.showSaveDialog.bind(dialog);
    }
    dialog.showSaveDialog = async () =>
      targetPath ? { canceled: false, filePath: targetPath } : { canceled: true, filePath: '' };
  }, filePath);
}

export async function mockOpenDialog(app, filePaths) {
  const normalized =
    filePaths == null ? [] : Array.isArray(filePaths) ? filePaths : [filePaths];
  await app.evaluate(({ dialog }, paths) => {
    const store = (globalThis.__filotecaOrigDialogs ??= {});
    if (!store.showOpenDialog) {
      store.showOpenDialog = dialog.showOpenDialog.bind(dialog);
    }
    dialog.showOpenDialog = async () =>
      paths.length > 0 ? { canceled: false, filePaths: paths } : { canceled: true, filePaths: [] };
  }, normalized);
}

export async function restoreDialogs(app) {
  await app.evaluate(({ dialog }) => {
    const store = globalThis.__filotecaOrigDialogs;
    if (!store) return;
    if (store.showSaveDialog) {
      dialog.showSaveDialog = store.showSaveDialog;
    }
    if (store.showOpenDialog) {
      dialog.showOpenDialog = store.showOpenDialog;
    }
  });
}

export async function blockExternalNetwork(ctx) {
  const netState = netStateByApp.get(ctx.app);
  if (netState) {
    netState.blockExternal = true;
  } else {
    await ctx.app.context().routeWebSocket(/^wss?:/i, (wsRoute) => {
      ctx.networkRequests?.push({
        url: wsRoute.url(),
        resourceType: 'websocket',
        method: 'WS',
      });
      wsRoute
        .close({ code: 1008, reason: 'Blocked external WebSocket in offline test' })
        .catch(() => {});
    });
  }
  await ctx.app.context().route(/^https?:|^wss?:/i, (route) => route.abort('internetdisconnected'));
}

export function getExternalRequests(ctx) {
  return ctx.networkRequests.filter((r) => /^https?:|^wss?:/i.test(r.url));
}

export function assertNoExternalNetworkRequests(ctx) {
  const external = getExternalRequests(ctx);
  if (external.length > 0) {
    throw new Error(
      `Unexpected external network request(s):\n${external.map((r) => `  ${r.method} ${r.url}`).join('\n')}`,
    );
  }
}

export function assertNoPageErrors(ctx, { checkConsole = false, ignoreConsole = [] } = {}) {
  if (ctx.pageErrors.length > 0) {
    const details = ctx.pageErrors
      .map((err, i) => `  [${i + 1}] ${err?.stack || err?.message || String(err)}`)
      .join('\n');
    throw new Error(`Uncaught pageerror(s) detected:\n${details}`);
  }
  if (checkConsole && ctx.consoleErrors.length > 0) {
    const filtered = ctx.consoleErrors.filter(
      (msg) => !ignoreConsole.some((pat) => (pat instanceof RegExp ? pat.test(msg) : msg.includes(pat))),
    );
    if (filtered.length > 0) {
      throw new Error(
        `Console error(s) detected:\n${filtered.map((msg, i) => `  [${i + 1}] ${msg}`).join('\n')}`,
      );
    }
  }
}
