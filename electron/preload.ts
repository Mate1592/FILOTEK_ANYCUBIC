import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { FilotecaApi } from '../src/shared/types';

const inv = (ch: string, ...args: unknown[]) => ipcRenderer.invoke(ch, ...args);

const api: FilotecaApi = {
  isElectron: true,
  platform: process.platform,
  db: {
    load: () => inv('db:load'),
    upsertRoll: (r) => inv('db:upsertRoll', r),
    upsertRolls: (r) => inv('db:upsertRolls', r),
    deleteRoll: (id) => inv('db:deleteRoll', id),
    restoreRoll: (r, u) => inv('db:restoreRoll', r, u),
    logUsage: (e, r) => inv('db:logUsage', e, r),
    deleteUsage: (id, r) => inv('db:deleteUsage', id, r),
    upsertShopping: (s) => inv('db:upsertShopping', s),
    deleteShopping: (id) => inv('db:deleteShopping', id),
    upsertOrder: (o) => inv('db:upsertOrder', o),
    deleteOrder: (id) => inv('db:deleteOrder', id),
    upsertGcodeJob: (j) => inv('db:upsertGcodeJob', j),
    deleteGcodeJob: (id) => inv('db:deleteGcodeJob', id),
    setSetting: (k, v) => inv('db:setSetting', k, v),
    replaceAll: (d) => inv('db:replaceAll', d),
    path: () => ipcRenderer.invoke('db:path').then((r) => (r.ok ? r.data : '')),
  },
  backup: {
    create: () => inv('backup:create'),
    restore: () => inv('backup:restore'),
  },
  file: {
    save: (c, n, f) => inv('file:save', c, n, f),
    open: (f) => inv('file:open', f),
    openMultiple: async (filters) => {
      const r = await inv('file:openMultiple', filters);
      if (Array.isArray(r)) return r;
      return r?.ok && Array.isArray(r.data) ? r.data : [];
    },
    saveTextFile: async (opts) => {
      const r = await inv('file:saveTextFile', opts);
      if (r && typeof r === 'object') {
        if ('data' in r && r.data !== undefined) {
          return r.ok && r.data
            ? { ok: true, path: String(r.data) }
            : { ok: false, error: r.error };
        }
        if ('filePath' in r) {
          return {
            ok: Boolean(r.ok && r.filePath),
            path: r.filePath || undefined,
            error: r.error,
          };
        }
        if ('path' in r) {
          return {
            ok: Boolean(r.ok && r.path),
            path: r.path || undefined,
            error: r.error,
          };
        }
        return { ok: Boolean(r.ok), error: r.error };
      }
      return { ok: false };
    },
    getPathForFile: (file: File) => {
      try {
        const p = webUtils.getPathForFile(file);
        if (typeof p === 'string' && p.length > 0) return p;
      } catch {
        /* fallback below */
      }
      const fallback = (file as unknown as { path?: unknown })?.path;
      return typeof fallback === 'string' ? fallback : '';
    },
    selectFolder: () => inv('file:selectFolder'),
    parseGcodePath: (fp) => inv('file:parseGcodePath', fp),
  },
  win: {
    setTheme: (dark) => ipcRenderer.send('win:setTheme', dark),
    setTray: (e, t) => ipcRenderer.send('win:setTray', e, t),
    openDataFolder: () => ipcRenderer.send('win:openDataFolder'),
    showNotification: (title, body) => ipcRenderer.send('win:showNotification', title, body),
    openExternal: (url) => ipcRenderer.send('win:openExternal', url),
    onMenuAction: (cb) => {
      const fn = (_: unknown, a: string) => cb(a);
      ipcRenderer.on('menu-action', fn);
      return () => ipcRenderer.removeListener('menu-action', fn);
    },
    onGcodeImported: (cb) => {
      const fn = (_: unknown, job: any) => cb(job);
      ipcRenderer.on('gcode-imported', fn);
      return () => ipcRenderer.removeListener('gcode-imported', fn);
    },
  },
  companion: {
    listProcesses: () => inv('companion:listProcesses'),
    closeIfFinished: () => inv('companion:closeIfFinished'),
    onSlicerClosedPrompt: (cb: (data: any) => void) => {
      const fn = (_: unknown, d: any) => cb(d);
      ipcRenderer.on('slicer-closed-prompt', fn);
      return () => ipcRenderer.removeListener('slicer-closed-prompt', fn);
    },
  },
};

contextBridge.exposeInMainWorld('filoteca', api);
