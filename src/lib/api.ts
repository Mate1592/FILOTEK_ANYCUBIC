import type { DbSnapshot, FilotecaApi, Result } from '../shared/types';

declare global {
  interface Window {
    filoteca?: FilotecaApi;
  }
}

/**
 * Fallback para ejecutar el renderer en un navegador (vite dev sin Electron):
 * guarda todo en localStorage. La app real usa SQLite vía preload.
 */
function browserApi(): FilotecaApi {
  const KEY = 'filoteca:browser-db';
  const read = (): DbSnapshot => {
    try {
      return {
        rolls: [],
        usage: [],
        shopping: [],
        orders: [],
        gcodeJobs: [],
        settings: {},
        ...JSON.parse(localStorage.getItem(KEY) || '{}'),
      };
    } catch {
      return { rolls: [], usage: [], shopping: [], orders: [], gcodeJobs: [], settings: {} };
    }
  };
  const write = (d: DbSnapshot) => localStorage.setItem(KEY, JSON.stringify(d));
  const ok = <T,>(data: T): Promise<Result<T>> => Promise.resolve({ ok: true, data });
  const mut = (fn: (d: DbSnapshot) => void) => {
    const d = read();
    fn(d);
    write(d);
    return ok(undefined);
  };
  const download = (content: string, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content]));
    a.download = name;
    a.click();
  };
  return {
    isElectron: true,
    platform: 'browser',
    db: {
      load: () => ok(read()),
      upsertRoll: (r) => mut((d) => (d.rolls = [...d.rolls.filter((x) => x.id !== r.id), r])),
      upsertRolls: (rs) =>
        mut((d) => {
          const ids = new Set(rs.map((r) => r.id));
          d.rolls = [...d.rolls.filter((x) => !ids.has(x.id)), ...rs];
        }),
      deleteRoll: (id) => {
        const d = read();
        const removed = d.usage.filter((u) => u.rollId === id);
        d.rolls = d.rolls.filter((r) => r.id !== id);
        d.usage = d.usage.filter((u) => u.rollId !== id);
        write(d);
        return ok(removed);
      },
      restoreRoll: (r, u) => mut((d) => ((d.rolls = [...d.rolls, r]), (d.usage = [...d.usage, ...u]))),
      logUsage: (e, r) =>
        mut((d) => {
          d.usage.push(e);
          d.rolls = d.rolls.map((x) => (x.id === r.id ? r : x));
        }),
      deleteUsage: (id, r) =>
        mut((d) => {
          d.usage = d.usage.filter((u) => u.id !== id);
          d.rolls = d.rolls.map((x) => (x.id === r.id ? r : x));
        }),
      upsertShopping: (s) => mut((d) => (d.shopping = [...d.shopping.filter((x) => x.id !== s.id), s])),
      deleteShopping: (id) => mut((d) => (d.shopping = d.shopping.filter((x) => x.id !== id))),
      upsertOrder: (o) => mut((d) => (d.orders = [...(d.orders || []).filter((x) => x.id !== o.id), o])),
      deleteOrder: (id) => mut((d) => (d.orders = (d.orders || []).filter((x) => x.id !== id))),
      upsertGcodeJob: (j) => mut((d) => (d.gcodeJobs = [...(d.gcodeJobs || []).filter((x) => x.id !== j.id), j])),
      deleteGcodeJob: (id) => mut((d) => (d.gcodeJobs = (d.gcodeJobs || []).filter((x) => x.id !== id))),
      setSetting: (k, v) => mut((d) => (d.settings = { ...d.settings, [k]: v })),
      replaceAll: (data) => mut((d) => Object.assign(d, data)),
      path: () => Promise.resolve('localStorage'),
    },
    backup: {
      create: () => {
        download(localStorage.getItem(KEY) || '{}', 'filoteca-backup.json');
        return ok('descarga');
      },
      restore: () => Promise.resolve({ ok: false, error: 'Restaurar solo está disponible en la app de escritorio.' }),
    },
    file: {
      save: (c, n) => {
        download(c, n);
        return ok(n);
      },
      open: (filters) =>
        new Promise((res) => {
          const i = document.createElement('input');
          i.type = 'file';
          i.accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',');
          i.onchange = async () => {
            const f = i.files?.[0];
            res({ ok: true, data: f ? { name: f.name, content: await f.text() } : null });
          };
          i.click();
        }),
      selectFolder: () => Promise.resolve({ ok: true, data: null }),
      parseGcodePath: () => Promise.resolve({ ok: true, data: null }),
    },
    win: {
      setTheme: () => {},
      setTray: () => {},
      openDataFolder: () => {},
      showNotification: (title: string, body: string) => {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body });
        }
      },
      openExternal: (url: string) => window.open(url, '_blank'),
      onMenuAction: () => () => {},
      onGcodeImported: () => () => {},
    },
    companion: {
      listProcesses: async () => ({ ok: true, data: [] }),
      closeIfFinished: async () => ({ ok: true, data: undefined }),
      onSlicerClosedPrompt: () => () => {},
    },
  };
}

export const api: FilotecaApi = window.filoteca ?? browserApi();
export const isDesktop = !!window.filoteca;
