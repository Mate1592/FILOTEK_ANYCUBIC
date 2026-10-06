import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  net,
  protocol,
  screen,
  shell,
  Tray,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { FilotecaDb } from './db';
import { parseGcodeFileFromDisk } from './gcode';
import type { Result } from '../src/shared/types';

protocol.registerSchemesAsPrivileged([
  { scheme: 'filoteca-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

app.setName('Filoteca');
if (process.env.FILOTECA_USERDATA) app.setPath('userData', process.env.FILOTECA_USERDATA);
app.setAppUserModelId('app.filoteca.desktop');

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const TITLEBAR_HEIGHT = 44;
const MIN_W = 960;
const MIN_H = 620;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let closeToTray = false;
let quitting = false;
let db: FilotecaDb;

// ---------------------------------------------------------------- recursos
function resource(...p: string[]) {
  // build/ se copia como extraResources en producción
  return app.isPackaged
    ? path.join(process.resourcesPath, ...p)
    : path.join(__dirname, '..', '..', 'build', ...p);
}

function appIcon() {
  const ico = resource('icon.ico');
  const png = resource('icon.png');
  return nativeImage.createFromPath(fs.existsSync(ico) ? ico : png);
}

// ---------------------------------------------------------- estado ventana
interface WinState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function readWinState(): WinState {
  const def: WinState = { width: 1360, height: 860, maximized: false };
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as WinState;
    // Asegura que la ventana caiga dentro de algún monitor visible.
    if (s.x !== undefined && s.y !== undefined) {
      const visible = screen.getAllDisplays().some((d) => {
        const b = d.workArea;
        return s.x! < b.x + b.width - 80 && s.x! + s.width > b.x + 80 && s.y! >= b.y - 10 && s.y! < b.y + b.height - 60;
      });
      if (!visible) {
        delete s.x;
        delete s.y;
      }
    }
    return { ...def, ...s, width: Math.max(MIN_W, s.width), height: Math.max(MIN_H, s.height) };
  } catch {
    return def;
  }
}

function saveWinState() {
  if (!win) return;
  const maximized = win.isMaximized();
  const b = maximized ? win.getNormalBounds() : win.getBounds();
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized }));
  } catch {
    /* no crítico */
  }
}

// ------------------------------------------------------------------ ventana
function overlayColors(dark: boolean) {
  return dark
    ? { color: '#00000000', symbolColor: '#c9ccd1', height: TITLEBAR_HEIGHT }
    : { color: '#00000000', symbolColor: '#3a3d42', height: TITLEBAR_HEIGHT };
}

function createWindow() {
  const st = readWinState();
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    x: st.x,
    y: st.y,
    width: st.width,
    height: st.height,
    minWidth: MIN_W,
    minHeight: MIN_H,
    show: false,
    title: 'Filoteca',
    icon: appIcon(),
    backgroundColor: dark ? '#0d0e10' : '#f4f3ef',
    titleBarStyle: 'hidden',
    titleBarOverlay: overlayColors(dark),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  if (st.maximized) win.maximize();
  win.once('ready-to-show', () => win?.show());

  let saveT: NodeJS.Timeout | null = null;
  const queueSave = () => {
    if (saveT) clearTimeout(saveT);
    saveT = setTimeout(saveWinState, 400);
  };
  win.on('resize', queueSave);
  win.on('move', queueSave);
  win.on('close', (e) => {
    saveWinState();
    if (closeToTray && tray && !quitting) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.on('closed', () => (win = null));

  // Enlaces externos → navegador del sistema; nunca navegar la ventana.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isDev || !url.startsWith(process.env.VITE_DEV_SERVER_URL!)) e.preventDefault();
  });

  if (isDev) win.loadURL(process.env.VITE_DEV_SERVER_URL!);
  else win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
}

// --------------------------------------------------------------------- tray
function setTray(enabled: boolean, toTray: boolean) {
  closeToTray = enabled && toTray;
  if (!enabled) {
    tray?.destroy();
    tray = null;
    return;
  }
  if (tray) return;
  const img = appIcon().resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('Filoteca');
  const show = () => {
    if (!win) createWindow();
    win?.show();
    win?.focus();
  };
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Filoteca', click: show },
      {
        label: 'Nuevo rollo…',
        click: () => {
          show();
          win?.webContents.send('menu-action', 'new-roll');
        },
      },
      {
        label: 'Lista de compras',
        click: () => {
          show();
          win?.webContents.send('menu-action', 'view-shopping');
        },
      },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', show);
}

// ---------------------------------------------------------------------- IPC
function handle<T>(channel: string, fn: (...args: any[]) => T | Promise<T>) {
  ipcMain.handle(channel, async (_e, ...args): Promise<Result<T>> => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      console.error(`[ipc] ${channel}`, err);
      return { ok: false, error: (err as Error).message || String(err) };
    }
  });
}

const getThumbnailsDir = () => path.join(app.getPath('userData'), 'thumbnails');

function getAnycubicTempDir(): string {
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  return path.join(localAppData, 'Temp', 'anycubicslicer_model');
}

let tempWatcher: fs.FSWatcher | null = null;
let customWatcher: fs.FSWatcher | null = null;
const processedGcodeKeys = new Set<string>();
const recentIngestTimestamps = new Map<string, number>();

let slicerRunning = false;
let openedByCompanion = false;
let companionSessionCount = 0;
let companionCheckInterval: NodeJS.Timeout | null = null;

function handleIncomingGcodeFile(fullPath: string) {
  if (!fullPath) return;
  const lower = path.basename(fullPath).toLowerCase();
  if (lower.endsWith('.tmp') || lower.endsWith('.crdownload') || lower.endsWith('.part')) return;
  if (!lower.endsWith('.metadata') && !lower.endsWith('.gcode')) return;

  const now = Date.now();
  const lastTime = recentIngestTimestamps.get(fullPath) || 0;
  if (now - lastTime < 1500) return;
  recentIngestTimestamps.set(fullPath, now);

  setTimeout(() => {
    try {
      if (!fs.existsSync(fullPath)) return;
      const stat = fs.statSync(fullPath);
      const key = `${fullPath}:${stat.size}:${stat.mtimeMs}`;
      if (processedGcodeKeys.has(key)) return;
      processedGcodeKeys.add(key);

      const snapshot = db.load();
      const job = parseGcodeFileFromDisk(
        fullPath,
        getThumbnailsDir(),
        snapshot.rolls,
        snapshot.settings.rememberedMappings,
      );
      if (job) {
        db.upsertGcodeJob(job);
        companionSessionCount++;
        if (win) {
          win.webContents.send('gcode-imported', job);
          if (Notification.isSupported()) {
            new Notification({
              title: 'Laminado detectado',
              body: `${job.jobName} (${job.totalGrams} g) listo en Bandeja.`,
              icon: appIcon(),
            }).show();
          }
        }
      }
    } catch (e) {
      console.error('[handleIncomingGcodeFile] Error parsing', fullPath, e);
    }
  }, 800);
}

function setupWatchedFolder(folderPath: string) {
  if (customWatcher) {
    try {
      customWatcher.close();
    } catch {
      /* ignore */
    }
    customWatcher = null;
  }
  if (!folderPath || !fs.existsSync(folderPath)) return;
  try {
    customWatcher = fs.watch(folderPath, { recursive: true, persistent: false }, (_event, filename) => {
      if (!filename) return;
      handleIncomingGcodeFile(path.join(folderPath, filename));
    });
  } catch (err) {
    console.error('[watch] Error al observar carpeta personalizada:', err);
  }
}

function startTempDirWatcher() {
  const tempDir = getAnycubicTempDir();
  if (!fs.existsSync(tempDir)) {
    try {
      fs.mkdirSync(tempDir, { recursive: true });
    } catch {
      /* ignore */
    }
  }
  if (fs.existsSync(tempDir)) {
    try {
      tempWatcher = fs.watch(tempDir, { recursive: true, persistent: false }, (_event, filename) => {
        if (!filename) return;
        handleIncomingGcodeFile(path.join(tempDir, filename));
      });
    } catch (err) {
      console.warn('[watch] Error al observar carpeta temporal de Anycubic:', err);
    }
  }
}

function scanRecentTempSlices() {
  const tempDir = getAnycubicTempDir();
  if (!fs.existsSync(tempDir)) return;
  try {
    const files: string[] = [];
    function walk(dir: string, depth = 0) {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) {
            walk(full, depth + 1);
          } else if (ent.isFile()) {
            const l = ent.name.toLowerCase();
            if (l.endsWith('.gcode.metadata') || (l.endsWith('.gcode') && !l.endsWith('.tmp'))) {
              files.push(full);
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
    walk(tempDir);

    const snapshot = db.load();
    const existingJobHashes = new Set(snapshot.gcodeJobs.map((j) => j.fileHash || j.filepath));

    for (const file of files) {
      try {
        const stat = fs.statSync(file);
        // Filtrar archivos de las últimas 24 horas
        if (Date.now() - stat.mtimeMs < 24 * 3600 * 1000) {
          const job = parseGcodeFileFromDisk(
            file,
            getThumbnailsDir(),
            snapshot.rolls,
            snapshot.settings.rememberedMappings,
          );
          if (job && !existingJobHashes.has(job.fileHash) && !existingJobHashes.has(job.filepath)) {
            existingJobHashes.add(job.fileHash);
            db.upsertGcodeJob(job);
          }
        }
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.error('[scanRecentTempSlices] Error:', err);
  }
}

function checkSlicerRunning(targetExe: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false);
    const cleanExe = (targetExe || 'AnycubicSlicerNext.exe').trim().replace(/^"|"$/g, '');
    exec(`tasklist /fo csv /nh /fi "IMAGENAME eq ${cleanExe}"`, (err, stdout) => {
      if (err || !stdout) return resolve(false);
      const isRunning = stdout.toLowerCase().includes(cleanExe.toLowerCase());
      resolve(isRunning);
    });
  });
}

function startCompanionWatcher() {
  if (companionCheckInterval) clearInterval(companionCheckInterval);

  companionCheckInterval = setInterval(async () => {
    try {
      const snapshot = db.load();
      const settings = snapshot.settings;
      if (settings.companionModeEnabled === false) return;

      const targetExe = settings.companionSlicerExe || 'AnycubicSlicerNext.exe';
      const isNowRunning = await checkSlicerRunning(targetExe);

      if (!slicerRunning && isNowRunning) {
        // Slicer acaba de abrirse
        slicerRunning = true;
        companionSessionCount = 0;

        if (settings.companionAutoOpen !== false) {
          if (!win) {
            createWindow();
          }
          const w = win as BrowserWindow | null;
          if (w) {
            if (!w.isVisible() || w.isMinimized()) {
              w.showInactive();
              openedByCompanion = true;
            }
          }
        }
      } else if (slicerRunning && !isNowRunning) {
        // Slicer acaba de cerrarse
        slicerRunning = false;

        const unreviewed = db.load().gcodeJobs.filter((j) => j.status === 'unreviewed');
        if (unreviewed.length > 0 && settings.companionPromptOnExit !== false) {
          if (win) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
            win.webContents.send('slicer-closed-prompt', {
              unreviewedCount: unreviewed.length,
              sessionJobsCount: companionSessionCount,
            });
          }
        } else if (openedByCompanion && settings.companionAutoClose && unreviewed.length === 0) {
          quitting = true;
          app.quit();
        }
      }
    } catch {
      /* ignore */
    }
  }, 2500);
}

function registerIpc() {
  handle('db:load', () => db.load());
  handle('db:upsertRoll', (r) => db.upsertRoll(r));
  handle('db:upsertRolls', (r) => db.upsertRolls(r));
  handle('db:deleteRoll', (id) => db.deleteRoll(id));
  handle('db:restoreRoll', (r, u) => db.restoreRoll(r, u));
  handle('db:logUsage', (e, r) => db.logUsage(e, r));
  handle('db:deleteUsage', (id, r) => db.deleteUsage(id, r));
  handle('db:upsertShopping', (s) => db.upsertShopping(s));
  handle('db:deleteShopping', (id) => db.deleteShopping(id));
  handle('db:upsertOrder', (o) => db.upsertOrder(o));
  handle('db:deleteOrder', (id) => db.deleteOrder(id));
  handle('db:upsertGcodeJob', (j) => db.upsertGcodeJob(j));
  handle('db:deleteGcodeJob', (id) => db.deleteGcodeJob(id));
  handle('db:setSetting', (k, v) => {
    db.setSetting(k, v);
    if (k === 'watchedGcodeFolder') {
      setupWatchedFolder(String(v || ''));
    }
  });
  handle('db:replaceAll', (d) => db.replaceAll(d));
  handle('db:path', () => db.file);

  handle('backup:create', async () => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const r = await dialog.showSaveDialog(win!, {
      title: 'Guardar copia de seguridad',
      defaultPath: path.join(app.getPath('documents'), `filoteca-backup-${stamp}.db`),
      filters: [{ name: 'Backup de Filoteca', extensions: ['db'] }],
    });
    if (r.canceled || !r.filePath) return null;
    db.backupTo(r.filePath);
    return r.filePath;
  });

  handle('backup:restore', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Restaurar copia de seguridad',
      properties: ['openFile'],
      filters: [{ name: 'Backup de Filoteca', extensions: ['db'] }],
    });
    if (r.canceled || !r.filePaths[0]) return false;
    db.restoreFrom(r.filePaths[0]);
    return true;
  });

  handle('file:save', async (content: string, defaultName: string, filters) => {
    const r = await dialog.showSaveDialog(win!, {
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters,
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, content, 'utf8');
    return r.filePath;
  });

  handle('file:open', async (filters) => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    const stat = fs.statSync(p);
    if (stat.size > 25 * 1024 * 1024) throw new Error('El archivo es demasiado grande (máx. 25 MB).');
    return { name: path.basename(p), content: fs.readFileSync(p, 'utf8') };
  });

  handle('file:selectFolder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return r.filePaths[0];
  });

  handle('file:parseGcodePath', async (filepath: string) => {
    const snapshot = db.load();
    return parseGcodeFileFromDisk(filepath, getThumbnailsDir(), snapshot.rolls, snapshot.settings.rememberedMappings);
  });

  handle('companion:listProcesses', async () => {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') return resolve([]);
      exec('tasklist /fo csv /nh', (_err, stdout) => {
        if (!stdout) return resolve([]);
        const lines = stdout.split(/\r?\n/);
        const matches: string[] = [];
        const keywords = ['anycubic', 'orca', 'bambu', 'prusa', 'cura', 'slicer'];
        for (const line of lines) {
          const parts = line.split(',');
          if (parts.length > 0) {
            const exe = parts[0].replace(/"/g, '').trim();
            if (exe && keywords.some((k) => exe.toLowerCase().includes(k)) && !matches.includes(exe)) {
              matches.push(exe);
            }
          }
        }
        resolve(matches);
      });
    });
  });

  handle('companion:closeIfFinished', async () => {
    const snapshot = db.load();
    const unreviewed = snapshot.gcodeJobs.filter((j) => j.status === 'unreviewed').length;
    if (openedByCompanion && unreviewed === 0 && snapshot.settings.companionAutoClose) {
      quitting = true;
      app.quit();
    }
  });

  ipcMain.on('win:setTheme', (_e, dark: boolean) => {
    if (!win) return;
    win.setBackgroundColor(dark ? '#0d0e10' : '#f4f3ef');
    try {
      win.setTitleBarOverlay(overlayColors(dark));
    } catch {
      /* plataformas sin overlay */
    }
  });
  ipcMain.on('win:setTray', (_e, enabled: boolean, toTray: boolean) => setTray(enabled, toTray));
  ipcMain.on('win:openDataFolder', () => shell.openPath(app.getPath('userData')));
  ipcMain.on('win:showNotification', (_e, title: string, body: string) => {
    if (Notification.isSupported()) {
      new Notification({ title, body, icon: appIcon() }).show();
    }
  });
  ipcMain.on('win:openExternal', (_e, url: string) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
}

// --------------------------------------------------------------------- boot
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();

    // Comprueba argumento CLI: --importar-gcode <ruta> o archivo .gcode/.3mf
    const idx = argv.indexOf('--importar-gcode');
    let target = '';
    if (idx !== -1 && argv[idx + 1]) {
      target = argv[idx + 1];
    } else {
      const cand = argv.find((a) => a.toLowerCase().endsWith('.gcode') || a.toLowerCase().endsWith('.3mf'));
      if (cand) target = cand;
    }
    if (target && fs.existsSync(target)) {
      const snapshot = db.load();
      const job = parseGcodeFileFromDisk(target, getThumbnailsDir(), snapshot.rolls, snapshot.settings.rememberedMappings);
      if (job) {
        db.upsertGcodeJob(job);
        win.webContents.send('gcode-imported', job);
      }
    }
  });

  app.whenReady().then(async () => {
    try {
      protocol.handle('filoteca-media', (request) => {
        try {
          const urlObj = new URL(request.url);
          let targetPath = urlObj.searchParams.get('path');
          if (!targetPath) {
            let raw = request.url.replace(/^filoteca-media:\/\//, '');
            if (raw.startsWith('local/')) raw = raw.slice(6);
            targetPath = decodeURIComponent(raw);
            if (/^\/[a-zA-Z]:/.test(targetPath)) targetPath = targetPath.slice(1);
          }
          if (targetPath && fs.existsSync(targetPath)) {
            const buf = fs.readFileSync(targetPath);
            return new Response(buf, {
              headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=86400',
              },
            });
          }
        } catch {
          /* ignore */
        }
        return new Response('Not found', { status: 404 });
      });
    } catch (e) {
      console.warn('[protocol] Could not register filoteca-media:', e);
    }

    Menu.setApplicationMenu(null);
    db = new FilotecaDb(app.getPath('userData'));
    try {
      await db.init();
    } catch (err) {
      dialog.showErrorBox('Filoteca', `No se pudo abrir la base de datos:\n${(err as Error).message}`);
    }
    registerIpc();
    createWindow();

    // Activa carpeta vigilada si está configurada
    try {
      const snapshot = db.load();
      if (snapshot.settings.watchedGcodeFolder) {
        setupWatchedFolder(snapshot.settings.watchedGcodeFolder);
      }
    } catch {
      /* ignore */
    }

    // Iniciar watchers e ingestión automática
    startTempDirWatcher();
    scanRecentTempSlices();
    startCompanionWatcher();

    // Comprueba argumento CLI en el primer arranque
    const idx = process.argv.indexOf('--importar-gcode');
    let initialTarget = '';
    if (idx !== -1 && process.argv[idx + 1]) {
      initialTarget = process.argv[idx + 1];
    } else {
      const cand = process.argv.find((a) => a.toLowerCase().endsWith('.gcode') || a.toLowerCase().endsWith('.3mf'));
      if (cand) initialTarget = cand;
    }
    if (initialTarget && fs.existsSync(initialTarget)) {
      setTimeout(() => {
        const snapshot = db.load();
        const job = parseGcodeFileFromDisk(initialTarget, getThumbnailsDir(), snapshot.rolls, snapshot.settings.rememberedMappings);
        if (job && win) {
          db.upsertGcodeJob(job);
          win.webContents.send('gcode-imported', job);
        }
      }, 1200);
    }
  });

  app.on('before-quit', () => {
    quitting = true;
    try {
      db?.flushNow();
    } catch {
      /* ignore */
    }
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
