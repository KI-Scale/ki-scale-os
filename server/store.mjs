// Datenspeicher: eine SQLite-Datei auf dem Server (eingebaut in Node 22, keine Zusatzpakete).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'os.sqlite'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT, updated INTEGER NOT NULL, PRIMARY KEY (coll, id));
    CREATE INDEX IF NOT EXISTS docs_updated ON docs(updated);
    CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS lp_events (ts INTEGER NOT NULL, variant TEXT NOT NULL, ev TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, date TEXT, week TEXT, disposition TEXT, outcome TEXT, user TEXT);
    CREATE TABLE IF NOT EXISTS status_changes (id TEXT PRIMARY KEY, date TEXT, week TEXT, new_status TEXT);
    CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, ts INTEGER, email TEXT, product TEXT, amount REAL, variant TEXT, refunded INTEGER DEFAULT 0, raw TEXT);
  `);
  let clock = 0;
  const now = () => { const t = Date.now(); clock = t > clock ? t : clock + 1; return clock; };

  const q = {
    list: db.prepare('SELECT id, data FROM docs WHERE coll = ? AND data IS NOT NULL'),
    get: db.prepare('SELECT data FROM docs WHERE coll = ? AND id = ?'),
    put: db.prepare('INSERT INTO docs (coll, id, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT(coll, id) DO UPDATE SET data = excluded.data, updated = excluded.updated'),
    changes: db.prepare('SELECT coll, id, data, updated FROM docs WHERE updated > ? ORDER BY updated LIMIT 2000'),
    sget: db.prepare('SELECT v FROM settings WHERE k = ?'),
    sput: db.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'),
    sdel: db.prepare('DELETE FROM settings WHERE k = ?'),
  };

  return {
    db,
    list(coll) { return q.list.all(coll).map(r => ({ id: r.id, ...JSON.parse(r.data) })); },
    get(coll, id) { const r = q.get.get(coll, id); return r && r.data ? JSON.parse(r.data) : null; },
    put(coll, id, data) { const t = now(); q.put.run(coll, id, JSON.stringify(data), t); return t; },
    merge(coll, id, patch) { const cur = this.get(coll, id) || {}; return this.put(coll, id, { ...cur, ...patch }); },
    del(coll, id) { const t = now(); q.put.run(coll, id, null, t); return t; },
    changes(since) { return q.changes.all(Number(since) || 0).map(r => ({ coll: r.coll, id: r.id, data: r.data ? JSON.parse(r.data) : null, updated: r.updated })); },
    setting(k) { const r = q.sget.get(k); return r ? r.v : null; },
    setSetting(k, v) { if (v == null || v === '') q.sdel.run(k); else q.sput.run(k, String(v)); },
  };
}
