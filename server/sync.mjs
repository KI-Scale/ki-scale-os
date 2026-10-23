// Holt die Live-Zahlen aus Close, Meta und Calendly und schreibt sie als Dokumente in den Speicher.
// Jede Quelle läuft unabhängig: fehlt ein Schlüssel oder fällt ein Dienst aus, laufen die anderen weiter.

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url, headers, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers });
    if (r.status === 429) { await sleep((Number(r.headers.get('retry-after')) || 5) * 1000); continue; }
    const txt = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${url.split('?')[0]}: ${txt.slice(0, 200)}`);
    return txt ? JSON.parse(txt) : {};
  }
  throw new Error('zu viele Anfragen: ' + url.split('?')[0]);
}

/* Montag der Woche (Zeitzone Berlin) als JJJJ-MM-TT – wie die Wochen in Close */
export function weekKey(iso) {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(d);
  const g = t => p.find(x => x.type === t).value;
  const local = new Date(Date.UTC(+g('year'), +g('month') - 1, +g('day')));
  const dow = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - dow);
  return local.toISOString().slice(0, 10);
}
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString();

/* ---------------- Close ---------------- */
export async function syncClose(store) {
  const key = store.setting('CLOSE_API_KEY');
  if (!key) return 'Close: kein Schlüssel';
  const H = { Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64') };
  const B = 'https://api.close.com/api/v1/';
  const page = async (p, params, cb) => {
    for (let skip = 0; skip < 50000; skip += 100) {
      const qs = new URLSearchParams({ ...params, _limit: '100', _skip: String(skip) });
      const j = await getJson(B + p + '?' + qs, H);
      (j.data || []).forEach(cb);
      if (!j.has_more) break;
    }
  };

  const users = {};
  await page('user/', { _fields: 'id,first_name,last_name' }, u => { users[u.id] = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.id; });

  // Anrufe: beim ersten Mal 12 Wochen, danach immer die letzten 21 Tage neu (Ergebnisse werden oft später gesetzt)
  const first = !store.setting('close_backfilled');
  const since = first ? daysAgo(84) : daysAgo(21);
  const upCall = store.db.prepare('INSERT INTO calls (id, date, week, disposition, outcome, user) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET disposition=excluded.disposition, outcome=excluded.outcome, user=excluded.user');
  await page('activity/call/', { date_created__gte: since, _fields: 'id,date_created,disposition,outcome_id,user_id' }, c => {
    upCall.run(c.id, c.date_created, weekKey(c.date_created), c.disposition || '', c.outcome_id || '', users[c.user_id] || c.user_id || '');
  });
  const upSt = store.db.prepare('INSERT INTO status_changes (id, date, week, new_status) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING');
  await page('activity/status_change/lead/', { date_created__gte: since, _fields: 'id,date_created,new_status_id' }, s => {
    upSt.run(s.id, s.date_created, weekKey(s.date_created), s.new_status_id || '');
  });
  if (first) store.setSetting('close_backfilled', '1');

  // Wochen zusammenfassen (letzte 12 Wochen)
  const weeks = {};
  const wk = k => (weeks[k] = weeks[k] || { disp: {}, out: {}, st: {}, users: {} });
  const from = weekKey(daysAgo(84));
  for (const r of store.db.prepare('SELECT week, disposition, COUNT(*) n FROM calls WHERE week >= ? GROUP BY week, disposition').all(from)) wk(r.week).disp[r.disposition || 'unbekannt'] = r.n;
  for (const r of store.db.prepare("SELECT week, outcome, COUNT(*) n FROM calls WHERE week >= ? AND outcome <> '' GROUP BY week, outcome").all(from)) wk(r.week).out[r.outcome] = r.n;
  for (const r of store.db.prepare('SELECT week, user, COUNT(*) n FROM calls WHERE week >= ? GROUP BY week, user').all(from)) wk(r.week).users[r.user] = r.n;
  for (const r of store.db.prepare('SELECT week, new_status, COUNT(*) n FROM status_changes WHERE week >= ? GROUP BY week, new_status').all(from)) wk(r.week).st[r.new_status] = r.n;

  // Leads pro Status (jetzt)
  const status = {}; let leads = 0;
  const sts = await getJson(B + 'status/lead/', H);
  for (const s of sts.data || []) {
    const j = await getJson(B + 'lead/?' + new URLSearchParams({ query: `lead_status:"${s.label}"`, _limit: '1', _fields: 'id' }), H);
    const n = Number(j.total_results || 0); status[s.label] = n; leads += n;
  }
  const opp = async t => { try { return Number((await getJson(B + 'opportunity/?' + new URLSearchParams({ status_type: t, _limit: '1', _fields: 'id' }), H)).total_results || 0); } catch { return null; } };
  const doc = { weeks, status, leads, active: await opp('active'), won: await opp('won'), at: new Date().toISOString() };
  store.put('kpi', 'close', doc);
  return `Close: ${leads} Leads, ${Object.keys(weeks).length} Wochen`;
}

/* ---------------- Meta ---------------- */
const STATUS_DE = { ACTIVE: 'Aktiv', PENDING_REVIEW: 'In Prüfung', IN_PROCESS: 'Wird vorbereitet', PREAPPROVED: 'Freigegeben', DISAPPROVED: 'Abgelehnt', WITH_ISSUES: 'Probleme', PAUSED: 'Pausiert', CAMPAIGN_PAUSED: 'Pausiert', ADSET_PAUSED: 'Pausiert', ARCHIVED: 'Archiviert', DELETED: 'Gelöscht' };
const act = (arr, ...types) => { let n = 0; for (const a of arr || []) if (types.includes(a.action_type)) n = Math.max(n, Number(a.value) || 0); return n; };
const LPV = ['landing_page_view', 'omni_landing_page_view'];
const IC = ['initiate_checkout', 'omni_initiated_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'];
const PUR = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'];

export async function syncMeta(store) {
  const token = store.setting('META_TOKEN');
  if (!token) return 'Meta: kein Schlüssel';
  const acct = store.setting('META_ACCOUNT') || 'act_1761392238625918';
  const G = 'https://graph.facebook.com/v21.0/';
  const T = '&access_token=' + encodeURIComponent(token);
  const ads = await getJson(`${G}${acct}/ads?fields=id,name,effective_status,ad_review_feedback&limit=100${T}`, {});
  const ins = await getJson(`${G}${acct}/insights?level=ad&date_preset=maximum&limit=100&fields=ad_id,spend,impressions,reach,inline_link_clicks,cpc,actions,action_values${T}`, {});
  const days = await getJson(`${G}${acct}/insights?date_preset=last_14d&time_increment=1&limit=50&fields=spend,inline_link_clicks,actions${T}`, {});
  const byId = {}; for (const r of ins.data || []) byId[r.ad_id] = r;
  const list = (ads.data || []).map(a => {
    const r = byId[a.id] || {};
    const [kurz, ...rest] = String(a.name || '').split('|');
    const name = kurz.trim();
    let status = STATUS_DE[a.effective_status] || a.effective_status;
    if (a.effective_status === 'DISAPPROVED' && a.ad_review_feedback) {
      const g = a.ad_review_feedback.global || {}; const why = Object.keys(g)[0];
      if (why) status = 'Abgelehnt: ' + why.replace(/_/g, ' ').toLowerCase();
    }
    const imp = Number(r.impressions || 0), kl = Number(r.inline_link_clicks || 0);
    return { name, titel: rest.join('|').trim(), batch: name.slice(0, 1), status, ausgaben: Number(r.spend || 0), impressionen: imp, klicks: kl,
      ctr: imp ? Math.round(kl / imp * 10000) / 100 : null, cpc: kl ? Math.round(Number(r.spend || 0) / kl * 100) / 100 : null,
      lpv: act(r.actions, ...LPV), checkouts: act(r.actions, ...IC), kaeufe: act(r.actions, ...PUR), umsatz: act(r.action_values, ...PUR) };
  }).sort((x, y) => x.name.localeCompare(y.name));
  const sum = k => list.reduce((s, a) => s + (Number(a[k]) || 0), 0);
  const order = ['Aktiv', 'Abgelehnt', 'Probleme', 'In Prüfung', 'Wird vorbereitet', 'Freigegeben', 'Pausiert'];
  const status = order.find(s => list.some(a => String(a.status).startsWith(s))) || (list[0] && list[0].status) || 'Keine Anzeigen';
  const tage = (days.data || []).map(d => ({ d: d.date_start, ausgaben: Number(d.spend || 0), klicks: Number(d.inline_link_clicks || 0), checkouts: act(d.actions, ...IC), kaeufe: act(d.actions, ...PUR) }));
  store.merge('kpi', 'meta', { status, ausgaben: Math.round(sum('ausgaben') * 100) / 100, impressionen: sum('impressionen'), klicks: sum('klicks'), lpv: sum('lpv'), checkouts: sum('checkouts'), kaeufe: sum('kaeufe'), umsatz: sum('umsatz'), ads: list, tage, stand: new Date().toISOString(), quelle: 'Meta Marketing API' });
  return `Meta: ${list.length} Anzeigen, ${sum('ausgaben').toFixed(2)} €`;
}

/* ---------------- Calendly ---------------- */
export async function syncCalendly(store) {
  const token = store.setting('CALENDLY_TOKEN');
  if (!token) return 'Calendly: kein Schlüssel';
  const H = { Authorization: 'Bearer ' + token };
  const me = await getJson('https://api.calendly.com/users/me', H);
  const org = me.resource.current_organization;
  const events = [];
  let url = 'https://api.calendly.com/scheduled_events?' + new URLSearchParams({ organization: org, min_start_time: daysAgo(84), max_start_time: new Date(Date.now() + 30 * 864e5).toISOString(), count: '100', sort: 'start_time:asc' });
  for (let i = 0; url && i < 30; i++) { const j = await getJson(url, H); events.push(...(j.collection || [])); url = j.pagination && j.pagination.next_page; }
  const weeks = {}; const w = k => (weeks[k] = weeks[k] || { gebucht: 0, stattgefunden: 0, abgesagt: 0, noshow: 0 });
  const now = Date.now(); const heute = []; let kommend = 0;
  const cache = JSON.parse(store.setting('calendly_noshow') || '{}');
  for (const e of events) {
    w(weekKey(e.created_at)).gebucht++;
    const start = new Date(e.start_time).getTime();
    const sw = w(weekKey(e.start_time));
    if (e.status === 'canceled') { sw.abgesagt++; continue; }
    if (start < now) {
      sw.stattgefunden++;
      if (start > now - 21 * 864e5 && cache[e.uri] === undefined) {
        try { const inv = await getJson(e.uri + '/invitees?count=10', H); cache[e.uri] = (inv.collection || []).some(i => i.no_show) ? 1 : 0; } catch { cache[e.uri] = 0; }
      }
      if (cache[e.uri]) sw.noshow++;
    } else {
      if (start < now + 7 * 864e5) kommend++;
      const day = new Date(e.start_time).toLocaleDateString('sv-SE', { timeZone: 'Asia/Makassar' });
      if (day === new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Makassar' })) heute.push({ start: e.start_time, name: e.name });
    }
  }
  store.setSetting('calendly_noshow', JSON.stringify(cache));
  store.put('kpi', 'calendly', { weeks, kommend, heute, at: new Date().toISOString() });
  return `Calendly: ${events.length} Termine`;
}

/* ---------------- Seiten-Test + Verkäufe (aus eigenen Daten) ---------------- */
export function rebuildLpAndSales(store) {
  const v = { a: {}, b: {}, c: {} };
  for (const r of store.db.prepare('SELECT variant, ev, COUNT(*) n FROM lp_events GROUP BY variant, ev').all()) {
    if (!v[r.variant]) continue;
    if (r.ev === 'view') v[r.variant].besucher = r.n;
    if (r.ev === 'click') v[r.variant].klicks = r.n;
  }
  for (const r of store.db.prepare("SELECT variant, COUNT(*) n FROM sales WHERE refunded = 0 AND product = '538088' GROUP BY variant").all()) if (v[r.variant]) v[r.variant].verkaeufe = r.n;
  store.put('kpi', 'lp', { varianten: v, stand: new Date().toISOString(), quelle: 'eigene Messung (Seite) + ablefy-Webhook' });
  const s = store.db.prepare("SELECT COUNT(*) n, COALESCE(SUM(amount),0) u FROM sales WHERE refunded = 0 AND product = '538088'").get();
  const ref = store.db.prepare("SELECT COUNT(*) n FROM sales WHERE refunded = 1 AND product = '538088'").get();
  if (s.n || ref.n || store.setting('ABLEFY_SEEN')) store.put('kpi', 'ablefy', { verkaeufe: s.n, umsatz: Math.round(s.u * 100) / 100, erstattungen: ref.n, stand: new Date().toISOString(), verbunden: true });
}

export async function syncAll(store, log = console.log) {
  const out = [];
  for (const fn of [syncClose, syncMeta, syncCalendly]) {
    try { out.push(await fn(store)); } catch (e) { out.push(fn.name + ' Fehler: ' + e.message); }
  }
  try { rebuildLpAndSales(store); } catch (e) { out.push('LP: ' + e.message); }
  store.setSetting('last_sync', JSON.stringify({ at: new Date().toISOString(), out }));
  log('[sync] ' + out.join(' | '));
  return out;
}
