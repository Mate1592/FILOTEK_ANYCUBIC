import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type { DbSnapshot, GcodeJob, ProductOrder, Roll, Settings, ShoppingItem, UsageEntry } from '../src/shared/types';

const SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rolls (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage (
  id TEXT PRIMARY KEY,
  roll_id TEXT NOT NULL,
  grams REAL NOT NULL,
  at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  origin TEXT DEFAULT 'manual',
  job_name TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS usage_roll ON usage(roll_id);
CREATE INDEX IF NOT EXISTS usage_at ON usage(at);
CREATE TABLE IF NOT EXISTS shopping (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gcode_jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/**
 * Almacén SQLite (sql.js / WASM). La BD vive en memoria y se vuelca a disco
 * de forma atómica (archivo temporal + rename) tras cada cambio, con un
 * pequeño debounce para agrupar ráfagas.
 */
export class FilotecaDb {
  private SQL!: SqlJsStatic;
  private db!: Database;
  private flushTimer: NodeJS.Timeout | null = null;
  readonly file: string;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'filoteca.db');
  }

  async init(): Promise<void> {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    const wasmBinary = fs.readFileSync(wasmPath);
    this.SQL = await initSqlJs({ wasmBinary: wasmBinary.buffer.slice(wasmBinary.byteOffset, wasmBinary.byteOffset + wasmBinary.byteLength) as ArrayBuffer });
    if (fs.existsSync(this.file)) {
      try {
        this.db = new this.SQL.Database(fs.readFileSync(this.file));
        this.db.exec('SELECT count(*) FROM sqlite_master');
      } catch (err) {
        // BD corrupta: la apartamos y empezamos limpia, sin cerrar la app.
        const broken = `${this.file}.corrupt-${Date.now()}`;
        fs.renameSync(this.file, broken);
        console.error('[db] BD corrupta, movida a', broken, err);
        this.db = new this.SQL.Database();
      }
    } else {
      this.db = new this.SQL.Database();
    }
    this.db.exec(SCHEMA);
    try {
      this.db.exec("ALTER TABLE usage ADD COLUMN origin TEXT DEFAULT 'manual'");
    } catch {
      /* columna ya existe */
    }
    try {
      this.db.exec("ALTER TABLE usage ADD COLUMN job_name TEXT DEFAULT ''");
    } catch {
      /* columna ya existe */
    }
    this.db.run('INSERT OR REPLACE INTO meta(key,value) VALUES (?,?)', ['schema', String(SCHEMA_VERSION)]);
    this.flushNow();
  }

  // ---------- persistencia ----------
  private scheduleFlush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flushNow(), 150);
  }

  flushNow() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const data = this.db.export();
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(data));
    fs.renameSync(tmp, this.file);
  }

  private tx(fn: () => void) {
    this.db.exec('BEGIN');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    this.scheduleFlush();
  }

  private all<T>(sql: string, params: (string | number)[] = []): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const out: T[] = [];
    while (stmt.step()) out.push(stmt.getAsObject() as T);
    stmt.free();
    return out;
  }

  // ---------- lectura ----------
  load(): DbSnapshot {
    const rolls = this.all<{ data: string }>('SELECT data FROM rolls').map((r) => JSON.parse(r.data) as Roll);
    const usage = this.all<{ id: string; roll_id: string; grams: number; at: string; note: string; origin?: string; job_name?: string }>(
      'SELECT id, roll_id, grams, at, note, origin, job_name FROM usage ORDER BY at ASC',
    ).map((u) => ({
      id: u.id,
      rollId: u.roll_id,
      grams: u.grams,
      at: u.at,
      note: u.note,
      origin: (u.origin as 'manual' | 'gcode') || 'manual',
      jobName: u.job_name || undefined,
    }));
    const shopping = this.all<{ data: string }>('SELECT data FROM shopping').map(
      (r) => JSON.parse(r.data) as ShoppingItem,
    );
    const orders = this.all<{ data: string }>('SELECT data FROM orders').map(
      (r) => JSON.parse(r.data) as ProductOrder,
    );
    const gcodeJobs = this.all<{ data: string }>('SELECT data FROM gcode_jobs')
      .map((r) => JSON.parse(r.data) as GcodeJob)
      .filter((j) => !(j.totalLayersCount === 0 && j.printTimeSeconds === 0 && !j.thumbnailSmallPath));
    const settings: Partial<Settings> = {};
    for (const s of this.all<{ key: string; value: string }>('SELECT key, value FROM settings')) {
      try {
        (settings as Record<string, unknown>)[s.key] = JSON.parse(s.value);
      } catch {
        /* ignorar valor corrupto */
      }
    }
    return { rolls, usage, shopping, orders, gcodeJobs, settings };
  }

  // ---------- escritura ----------
  private putRoll(roll: Roll) {
    this.db.run('INSERT OR REPLACE INTO rolls(id, data, updated_at) VALUES (?,?,?)', [
      roll.id,
      JSON.stringify(roll),
      roll.updatedAt,
    ]);
  }

  private putUsage(u: UsageEntry) {
    this.db.run('INSERT OR REPLACE INTO usage(id, roll_id, grams, at, note, origin, job_name) VALUES (?,?,?,?,?,?,?)', [
      u.id,
      u.rollId,
      u.grams,
      u.at,
      u.note ?? '',
      u.origin ?? 'manual',
      u.jobName ?? '',
    ]);
  }

  upsertRoll(roll: Roll) {
    this.tx(() => this.putRoll(roll));
  }

  upsertRolls(rolls: Roll[]) {
    this.tx(() => rolls.forEach((r) => this.putRoll(r)));
  }

  deleteRoll(id: string): UsageEntry[] {
    const removed = this.all<{ id: string; roll_id: string; grams: number; at: string; note: string }>(
      'SELECT id, roll_id, grams, at, note FROM usage WHERE roll_id = ?',
      [id],
    ).map((u) => ({ id: u.id, rollId: u.roll_id, grams: u.grams, at: u.at, note: u.note }));
    this.tx(() => {
      this.db.run('DELETE FROM rolls WHERE id = ?', [id]);
      this.db.run('DELETE FROM usage WHERE roll_id = ?', [id]);
    });
    return removed;
  }

  restoreRoll(roll: Roll, usage: UsageEntry[]) {
    this.tx(() => {
      this.putRoll(roll);
      usage.forEach((u) => this.putUsage(u));
    });
  }

  logUsage(entry: UsageEntry, roll: Roll) {
    this.tx(() => {
      this.putUsage(entry);
      this.putRoll(roll);
    });
  }

  deleteUsage(id: string, roll: Roll) {
    this.tx(() => {
      this.db.run('DELETE FROM usage WHERE id = ?', [id]);
      this.putRoll(roll);
    });
  }

  upsertShopping(item: ShoppingItem) {
    this.tx(() => this.db.run('INSERT OR REPLACE INTO shopping(id, data) VALUES (?,?)', [item.id, JSON.stringify(item)]));
  }

  deleteShopping(id: string) {
    this.tx(() => this.db.run('DELETE FROM shopping WHERE id = ?', [id]));
  }

  upsertOrder(order: ProductOrder) {
    this.tx(() => this.db.run('INSERT OR REPLACE INTO orders(id, data) VALUES (?,?)', [order.id, JSON.stringify(order)]));
  }

  deleteOrder(id: string) {
    this.tx(() => this.db.run('DELETE FROM orders WHERE id = ?', [id]));
  }

  upsertGcodeJob(job: GcodeJob) {
    this.tx(() => this.db.run('INSERT OR REPLACE INTO gcode_jobs(id, data) VALUES (?,?)', [job.id, JSON.stringify(job)]));
  }

  deleteGcodeJob(id: string) {
    this.tx(() => this.db.run('DELETE FROM gcode_jobs WHERE id = ?', [id]));
  }

  setSetting(key: string, value: unknown) {
    this.tx(() => this.db.run('INSERT OR REPLACE INTO settings(key, value) VALUES (?,?)', [key, JSON.stringify(value)]));
  }

  replaceAll(data: Omit<DbSnapshot, 'settings'>) {
    this.tx(() => {
      this.db.run('DELETE FROM rolls');
      this.db.run('DELETE FROM usage');
      this.db.run('DELETE FROM shopping');
      this.db.run('DELETE FROM orders');
      this.db.run('DELETE FROM gcode_jobs');
      data.rolls.forEach((r) => this.putRoll(r));
      data.usage.forEach((u) => this.putUsage(u));
      data.shopping.forEach((s) => this.db.run('INSERT OR REPLACE INTO shopping(id, data) VALUES (?,?)', [s.id, JSON.stringify(s)]));
      (data.orders || []).forEach((o) => this.db.run('INSERT OR REPLACE INTO orders(id, data) VALUES (?,?)', [o.id, JSON.stringify(o)]));
      (data.gcodeJobs || []).forEach((g) => this.db.run('INSERT OR REPLACE INTO gcode_jobs(id, data) VALUES (?,?)', [g.id, JSON.stringify(g)]));
    });
  }

  // ---------- backup ----------
  backupTo(target: string) {
    this.flushNow();
    fs.copyFileSync(this.file, target);
  }

  /** Valida un archivo de backup y, si es correcto, sustituye la BD actual. */
  restoreFrom(source: string) {
    const buf = fs.readFileSync(source);
    let candidate: Database;
    try {
      candidate = new this.SQL.Database(buf);
      const tables = candidate
        .exec("SELECT name FROM sqlite_master WHERE type='table'")[0]
        ?.values.map((v) => String(v[0])) ?? [];
      for (const t of ['rolls', 'usage', 'settings']) {
        if (!tables.includes(t)) throw new Error(`falta la tabla "${t}"`);
      }
      candidate.exec(SCHEMA);
    } catch (e) {
      throw new Error(`El archivo no es un backup válido de Filoteca (${(e as Error).message}).`);
    }
    // Guardamos copia de seguridad de lo actual antes de sustituir.
    this.flushNow();
    fs.copyFileSync(this.file, `${this.file}.before-restore`);
    this.db.close();
    this.db = candidate;
    this.flushNow();
  }
}
