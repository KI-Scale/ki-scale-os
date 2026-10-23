// KI-Scale Business OS – Server. Keine Zusatzpakete: nur Node 22.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openStore } from './store.mjs';
import { syncAll, rebuildLpAndSales } from './sync.mjs';
import { handleAblefy } from './ablefy.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUB = path.join(ROOT, 'public');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3100);
const store = openStore(DATA);
const log = (...a) => console.log(new Date().toISOString(), ...a);

/* ---------- Passwort & Sitzungen ---------- */
function hashPw(pw, salt = crypto.randomBytes(16).toString('hex')) { return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex'); }
function checkPw(pw, stored) { if (!stored) return false; const [salt, h] = stored.split(':'); const x = crypto.scryptSync(pw, salt, 32).toString('hex'); return crypto.timingSafeEqual(Buffer.from(x), Buffer.from(h)); }
if (!store.setting('ADMIN_HASH')) {
  const pw = process.env.INITIAL_PASSWORD || crypto.randomBytes(9).toString('base64url');
  store.setSetting('ADMIN_HASH', hashPw(pw));
  fs.writeFileSync(path.join(DATA, 'erstes-passwort.txt'), pw + '\n', { mode: 0o600 });
  log('Erstes Passwort gespeichert in', path.join(DATA, 'erstes-passwort.txt'));
}
if (!store.setting('ABLEFY_TOKEN')) store.setSetting('ABLEFY_TOKEN', crypto.randomBytes(16).toString('hex'));
const cookieOf = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const authed = req => { const t = cookieOf(req).kios; return !!(t && store.db.prepare('SELECT 1 FROM sessions WHERE token = ?').get(t)); };
const loginTries = new Map();

/* ---------- Hilfen ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const send = (res, code, body, type = 'application/json', extra = {}) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', ...extra }); res.end(type === 'application/json' && typeof body !== 'string' ? JSON.stringify(body) : body); };
const readBody = (req, max = 2e6) => new Promise((ok, bad) => { let s = ''; req.on('data', c => { s += c; if (s.length > max) { bad(new Error('zu groß')); req.destroy(); } }); req.on('end', () => ok(s)); req.on('error', bad); });
const json = async req => { const s = await readBody(req); return s ? JSON.parse(s) : {}; };
const SAFE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
function serveFile(res, file) {
  fs.readFile(file, (e, buf) => {
    if (e) return send(res, 404, 'Nicht gefunden', 'text/plain; charset=utf-8');
    const ext = path.extname(file);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': /\.(jpg|png|woff2)$/.test(ext) ? 'public, max-age=86400' : 'no-cache' });
    res.end(buf);
  });
}
const PUBLIC_PATHS = ['/login', '/login.html', '/manifest.webmanifest', '/sw.js', '/icons/', '/api/login', '/api/t', '/api/webhooks/', '/api/health'];

/* ---------- Schlüssel, die Adrian auf der Einrichtungsseite einträgt ---------- */
const KEYS = ['CLOSE_API_KEY', 'META_TOKEN', 'META_ACCOUNT', 'CALENDLY_TOKEN', 'ANTHROPIC_API_KEY'];

let syncing = false;
async function runSync() { if (syncing) return; syncing = true; try { await syncAll(store, log); } finally { syncing = false; } }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    /* öffentliche Endpunkte */
    if (p === '/api/health') return send(res, 200, { ok: true });
    if (p === '/api/t') { // Messpunkt der Verkaufsseiten (keine Personendaten)
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
      if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain', cors);
      let v = url.searchParams.get('v'), e = url.searchParams.get('e');
      if (req.method === 'POST') { try { const b = JSON.parse(await readBody(req, 2000) || '{}'); v = b.v || v; e = b.e || e; } catch {} }
      if (/^[a-e]$/.test(v || '') && /^(view|click)$/.test(e || '')) store.db.prepare('INSERT INTO lp_events (ts, variant, ev) VALUES (?,?,?)').run(Date.now(), v, e);
      return send(res, 204, '', 'text/plain', cors);
    }
    if (p.startsWith('/api/webhooks/ablefy/')) {
      if (p.split('/').pop() !== store.setting('ABLEFY_TOKEN')) return send(res, 404, { ok: false });
      if (req.method !== 'POST') return send(res, 200, { ok: true, info: 'ablefy-Webhook aktiv' });
      const r = handleAblefy(store, await readBody(req));
      store.setSetting('ABLEFY_SEEN', '1'); rebuildLpAndSales(store);
      return send(res, 200, { ok: true, result: r });
    }
    if (p === '/api/login' && req.method === 'POST') {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress; const n = (loginTries.get(ip) || 0) + 1; loginTries.set(ip, n);
      if (n > 10) return send(res, 429, { ok: false, error: 'Zu viele Versuche. In 15 Minuten erneut.' });
      setTimeout(() => loginTries.delete(ip), 15 * 60e3);
      const { password } = await json(req);
      if (!checkPw(String(password || ''), store.setting('ADMIN_HASH'))) return send(res, 401, { ok: false, error: 'Passwort falsch' });
      const t = crypto.randomBytes(32).toString('hex'); store.db.prepare('INSERT INTO sessions (token, created) VALUES (?,?)').run(t, Date.now());
      const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
      return send(res, 200, { ok: true }, 'application/json', { 'set-cookie': `kios=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${180 * 864e2}${secure}` });
    }
    const isPublic = PUBLIC_PATHS.some(x => p === x || (x.endsWith('/') && p.startsWith(x)));
    if (!isPublic && !authed(req)) {
      if (p.startsWith('/api/')) return send(res, 401, { error: 'nicht angemeldet' });
      res.writeHead(302, { location: '/login' }); return res.end();
    }

    /* ab hier: angemeldet */
    if (p === '/api/logout') { const t = cookieOf(req).kios; store.db.prepare('DELETE FROM sessions WHERE token = ?').run(t || ''); return send(res, 200, { ok: true }, 'application/json', { 'set-cookie': 'kios=; Path=/; Max-Age=0' }); }
    if (p === '/api/changes') return send(res, 200, { now: Date.now(), changes: store.changes(url.searchParams.get('since')) });
    const m = p.match(/^\/api\/coll\/([^/]+)(?:\/([^/]+))?$/);
    if (m) {
      const [, coll, id] = m;
      if (!SAFE.test(coll) || (id && !SAFE.test(id))) return send(res, 400, { error: 'ungültig' });
      if (req.method === 'GET' && !id) return send(res, 200, store.list(coll));
      if (req.method === 'GET') { const d = store.get(coll, id); return d ? send(res, 200, d) : send(res, 404, { error: 'nicht gefunden' }); }
      if (req.method === 'PUT' && id) { const d = await json(req); delete d.id; return send(res, 200, { ok: true, updated: store.put(coll, id, d) }); }
      if (req.method === 'DELETE' && id) return send(res, 200, { ok: true, updated: store.del(coll, id) });
    }
    if (p === '/api/import' && req.method === 'POST') {
      const items = await json(req); let n = 0;
      for (const it of items || []) if (SAFE.test(it.coll) && SAFE.test(it.id) && it.data) { if (!store.get(it.coll, it.id) || it.overwrite) { store.put(it.coll, it.id, it.data); n++; } }
      return send(res, 200, { ok: true, importiert: n });
    }
    if (p === '/api/settings') {
      if (req.method === 'POST') {
        const b = await json(req);
        for (const k of KEYS) if (typeof b[k] === 'string') store.setSetting(k, b[k].trim());
        if (b.NEW_PASSWORD) { if (String(b.NEW_PASSWORD).length < 10) return send(res, 400, { error: 'Passwort mindestens 10 Zeichen' }); store.setSetting('ADMIN_HASH', hashPw(String(b.NEW_PASSWORD))); }
        runSync();
      }
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      return send(res, 200, {
        keys: Object.fromEntries(KEYS.map(k => [k, !!store.setting(k)])),
        meta_account: store.setting('META_ACCOUNT') || 'act_1761392238625918',
        ablefy_webhook: `https://${host}/api/webhooks/ablefy/${store.setting('ABLEFY_TOKEN')}`,
        tracking: `https://${host}/api/t`,
        last_sync: JSON.parse(store.setting('last_sync') || 'null'),
      });
    }
    if (p === '/api/sync' && req.method === 'POST') { await runSync(); return send(res, 200, JSON.parse(store.setting('last_sync') || '{}')); }
    if (p === '/api/berater' && req.method === 'POST') {
      const key = store.setting('ANTHROPIC_API_KEY');
      if (!key) return send(res, 503, { error: 'Für den Berater fehlt noch der Anthropic-Schlüssel (Einstellungen).' });
      const { messages, system } = await json(req);
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: store.setting('ANTHROPIC_MODEL') || 'claude-sonnet-5-5', max_tokens: 1500, system, messages }) });
      const j = await r.json();
      if (!r.ok) return send(res, 502, { error: (j.error && j.error.message) || 'Fehler beim Berater' });
      return send(res, 200, { text: (j.content || []).map(c => c.text || '').join('') });
    }

    /* Dateien */
    if (p === '/' || p === '/index.html') return serveFile(res, path.join(PUB, 'index.html'));
    if (p === '/login') return serveFile(res, path.join(PUB, 'login.html'));
    if (p === '/einstellungen') return serveFile(res, path.join(PUB, 'einstellungen.html'));
    const file = path.normalize(path.join(PUB, p));
    if (!file.startsWith(PUB)) return send(res, 403, 'verboten', 'text/plain');
    return serveFile(res, file);
  } catch (e) {
    log('Fehler', p, e.message);
    return send(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => log(`Business OS läuft auf 127.0.0.1:${PORT}`));
setInterval(runSync, 15 * 60e3);
setInterval(() => { try { rebuildLpAndSales(store); } catch (e) { log('lp', e.message); } }, 60e3);
setTimeout(runSync, 5e3);
