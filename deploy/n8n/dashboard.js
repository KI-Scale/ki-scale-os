// Baut die Live-Outreach-Zentrale aus der Tabelle outreach_stats (key = "mail|typ", anzahl)
const rows = $input.all().map(i => i.json).filter(r => r && r.key);
const S = {};
for (const r of rows) S[r.key] = Number(r.anzahl) || 0;
const g = (m, t) => S[m + '|' + t] || 0;
const CDN = 'https://cdn.jsdelivr.net/gh/KI-Scale/ki-scale-os@main/public/mail/';
const MAILS = [
  { id: '1A', name: 'Mail 1 · Variante A „Geschichte“', when: 'sofort', who: '⅓ der Leads', th: 'th1.jpg', ab: 1 },
  { id: '1B', name: 'Mail 1 · Variante B „Kurz & direkt“', when: 'sofort', who: '⅓ der Leads', th: 'th1b.jpg', ab: 1 },
  { id: '1C', name: 'Mail 1 · Variante C „Coaching-Falle“', when: 'sofort', who: '⅓ der Leads', th: 'th1c.jpg', ab: 1 },
  { id: '2', name: 'Mail 2 · Fragen & Antworten', when: 'nach ca. 8 Std.', who: 'Nicht-Käufer', th: 'th2.jpg' },
  { id: '2b', name: 'Mail 2b · Klick ohne Kauf', when: 'ab 2 Std., nach Klick', who: 'Klicker ohne Kauf', th: 'th2b.jpg' },
  { id: '3', name: 'Mail 3 · Letzte Stunden', when: '3 Std. vor Ende', who: 'Nicht-Käufer', th: 'th3.jpg' },
  { id: '4', name: 'Mail 4 · Nach Ablauf', when: '2 Std. nach Fristende', who: 'Nicht-Käufer', th: 'th4.jpg' },
];
const PRICE = 197;
const fmt = n => n.toLocaleString('de-DE');
const pct = (a, b) => b ? (a / b * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %' : '–';
const eur = n => n.toLocaleString('de-DE') + ' €';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let T = { sent: 0, open: 0, click: 0, buy: 0, unsub: 0, bounce: 0, complaint: 0 };
for (const m of MAILS) for (const k in T) T[k] += g(m.id, k);
T.bounce += g('all', 'bounce'); T.complaint += g('all', 'complaint'); T.buy += g('ohne', 'buy');
const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' });
const kpi = (l, v, s) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
const bar = (l, v, base) => `<div class="frow"><span>${l}</span><div class="bar"><i style="width:${base ? Math.max(.4, v / base * 100) : 0}%"></i></div><span class="n">${fmt(v)}<small>${pct(v, base)}</small></span></div>`;
const rate = m => g(m.id, 'sent') ? g(m.id, 'buy') / g(m.id, 'sent') * 1000 : 0;
const abs = MAILS.filter(m => m.ab);
const best = abs.some(m => g(m.id, 'buy') > 0) ? abs.reduce((a, b) => rate(b) > rate(a) ? b : a) : null;
const pill = (v, w, b, has) => !has ? '<span class="pill g">–</span>' : v >= b ? '<span class="pill b">kritisch</span>' : v >= w ? '<span class="pill w">beobachten</span>' : '<span class="pill g">gut</span>';
const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="60"><title>Outreach-Zentrale · live</title>
<style>
:root{--bg:#f5f7f4;--panel:#fff;--line:#e2e7e0;--fg:#121812;--muted:#5d6a60;--dim:#8a958c;--accent:#3c9d20;--soft:#ecf6e6;--warn:#b7791f;--wsoft:#fdf3e2;--bad:#c2410c;--bsoft:#fdece4}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 "Helvetica Neue",Arial,sans-serif}
.wrap{max-width:1320px;margin:0 auto;padding:22px max(16px,env(safe-area-inset-left)) 60px;display:grid;gap:16px}
.top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:10px}.eyebrow{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);font-weight:700}
h1{font:600 36px/1.1 Georgia,serif;margin:2px 0 0}h2{font:600 22px Georgia,serif;margin:0}.live{font-size:13px;color:var(--muted)}.live b{color:var(--accent)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;display:grid;gap:14px;min-width:0}.head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline}.note{color:var(--muted);font-size:13px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.kpi{border:1px solid var(--line);border-radius:12px;padding:12px 14px}.kpi .l{font-size:12px;color:var(--muted);font-weight:600}.kpi .v{font:700 26px Arial;margin-top:2px}.kpi .s{font-size:12px;color:var(--dim)}
.funnel{display:grid;gap:8px}.frow{display:grid;grid-template-columns:150px 1fr 100px;gap:10px;align-items:center;font-size:14px}.bar{height:24px;background:var(--soft);border-radius:7px;overflow:hidden}.bar i{display:block;height:100%;background:var(--accent);border-radius:7px}.n{text-align:right;font-weight:600}.n small{display:block;color:var(--dim);font-weight:500}
.ab{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}.var{border:1px solid var(--line);border-radius:14px;overflow:hidden}.var.lead{border-color:var(--accent);box-shadow:0 0 0 2px var(--soft)}
.var a.th{display:block;height:220px;overflow:hidden;border-bottom:1px solid var(--line);background:#fff}.var img{width:100%;display:block}.vb{padding:12px 14px;display:grid;gap:8px}.badge{font-size:11px;font-weight:700;border-radius:999px;padding:3px 9px;background:var(--soft);color:var(--accent)}
.mini{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.mini div{background:var(--bg);border-radius:8px;padding:6px 8px}.mini span{display:block;font-size:11px;color:var(--muted)}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px;min-width:760px}th{text-align:left;font-size:12px;color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--line)}td{padding:10px;border-bottom:1px solid var(--line)}td.r,th.r{text-align:right}.tm{width:50px;height:50px;border-radius:8px;overflow:hidden;border:1px solid var(--line);display:block}
.health{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}.h{border:1px solid var(--line);border-radius:12px;padding:12px 14px}.h .v{font:700 22px Arial}.pill{font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;margin-left:6px}.pill.g{background:var(--soft);color:var(--accent)}.pill.w{background:var(--wsoft);color:var(--warn)}.pill.b{background:var(--bsoft);color:var(--bad)}
@media(max-width:560px){.frow{grid-template-columns:100px 1fr 80px;font-size:13px}.mini{grid-template-columns:repeat(2,1fr)}}
</style></head><body><div class="wrap">
<div class="top"><div><div class="eyebrow">KI-Scale · Faceless Pages mit KI · 1.000 Leads pro Tag · jeder mit eigener 24-Std.-Frist</div><h1>Outreach-Zentrale</h1></div><div class="live"><b>● live</b> · Stand ${now} · aktualisiert sich jede Minute</div></div>
<div class="card"><div class="head"><h2>Überblick E-Mail</h2></div><div class="kpis">
${kpi('Versendet', fmt(T.sent), 'Mails gesamt')}${kpi('Öffnungsrate', pct(T.open, T.sent), 'Richtwert (Apple zählt mit)')}${kpi('Klickrate', pct(T.click, T.sent), 'auf den Kauf-Knopf')}${kpi('Käufe', fmt(T.buy), pct(T.buy, T.sent) + ' der Mails')}${kpi('Umsatz', eur(T.buy * PRICE), 'à 197 €')}${kpi('Abgemeldet', fmt(T.unsub), pct(T.unsub, T.sent))}
</div></div>
<div class="card"><div class="head"><h2>Vom Versand bis zum Kauf</h2><span class="note">Alle Mails zusammen</span></div><div class="funnel">
${bar('Versendet', T.sent, T.sent)}${bar('Zugestellt', Math.max(0, T.sent - T.bounce), T.sent)}${bar('Geöffnet', T.open, T.sent)}${bar('Geklickt', T.click, T.sent)}${bar('Gekauft', T.buy, T.sent)}
</div></div>
<div class="card"><div class="head"><h2>A/B/C-Test · Mail 1</h2><span class="note">Gewinner = meiste Käufe pro 1.000 Mails</span></div><div class="ab">
${abs.map(m => `<article class="var ${best === m ? 'lead' : ''}"><a class="th" href="${CDN}${m.th}" target="_blank"><img src="${CDN}${m.th}" alt=""></a><div class="vb"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(m.name)}</b>${best === m ? '<span class="badge">führt</span>' : ''}</div><div class="mini"><div><span>Versendet</span><b>${fmt(g(m.id, 'sent'))}</b></div><div><span>Öffnung</span><b>${pct(g(m.id, 'open'), g(m.id, 'sent'))}</b></div><div><span>Klicks</span><b>${pct(g(m.id, 'click'), g(m.id, 'sent'))}</b></div><div><span>Käufe</span><b>${fmt(g(m.id, 'buy'))}</b></div></div></div></article>`).join('')}
</div></div>
<div class="card"><div class="head"><h2>Test · Verkaufsseite oder direkt zur Kasse?</h2><span class="note">Je die Hälfte der Leads · gleiche Mails, anderes Ziel hinter dem Knopf</span></div><div class="ab">
${[['lp','Erst auf die Verkaufsseite'],['kasse','Direkt zur Kasse (ablefy)']].map(([k,n]) => { const b = g('ziel-' + k, 'buy'), o = g('ziel-' + (k === 'lp' ? 'kasse' : 'lp'), 'buy'); return `<article class="var ${b > o ? 'lead' : ''}"><div class="vb"><div style="display:flex;justify-content:space-between;gap:8px"><b>${n}</b>${b > o ? '<span class="badge">führt</span>' : ''}</div><div class="mini" style="grid-template-columns:repeat(2,1fr)"><div><span>Käufe</span><b>${fmt(b)}</b></div><div><span>Umsatz</span><b>${eur(b * PRICE)}</b></div></div></div></article>`; }).join('')}
</div></div>
<div class="card"><div class="head"><h2>Sequenz · alle Mails</h2><span class="note">Follow-ups gehen nur an Nicht-Käufer</span></div><div class="tw"><table><thead><tr><th>Mail</th><th></th><th>Wann · an wen</th><th class="r">Versendet</th><th class="r">Geöffnet</th><th class="r">Geklickt</th><th class="r">Abgemeldet</th><th class="r">Käufe</th><th class="r">Umsatz</th></tr></thead><tbody>
${MAILS.map(m => `<tr><td><b>${esc(m.name)}</b></td><td><a class="tm" href="${CDN}${m.th}" target="_blank"><img src="${CDN}${m.th}" style="width:100%"></a></td><td>${m.when}<div class="note">${m.who}</div></td><td class="r">${fmt(g(m.id, 'sent'))}</td><td class="r">${pct(g(m.id, 'open'), g(m.id, 'sent'))}</td><td class="r">${pct(g(m.id, 'click'), g(m.id, 'sent'))}</td><td class="r">${fmt(g(m.id, 'unsub'))}</td><td class="r">${fmt(g(m.id, 'buy'))}</td><td class="r">${eur(g(m.id, 'buy') * PRICE)}</td></tr>`).join('')}
</tbody></table></div></div>
<div class="card"><div class="head"><h2>Versand-Gesundheit</h2><span class="note">Amazon sperrt ab ca. 10 % Bounces oder 0,5 % Beschwerden</span></div><div class="health">
<div class="h"><div class="note">Bounces${pill(T.sent ? T.bounce / T.sent * 100 : 0, 2, 5, T.sent)}</div><div class="v">${fmt(T.bounce)} <small class="note">${pct(T.bounce, T.sent)}</small></div></div>
<div class="h"><div class="note">Spam-Beschwerden${pill(T.sent ? T.complaint / T.sent * 100 : 0, .08, .3, T.sent)}</div><div class="v">${fmt(T.complaint)} <small class="note">${pct(T.complaint, T.sent)}</small></div></div>
<div class="h"><div class="note">Abmeldungen${pill(T.sent ? T.unsub / T.sent * 100 : 0, 1, 2, T.sent)}</div><div class="v">${fmt(T.unsub)} <small class="note">${pct(T.unsub, T.sent)}</small></div></div>
</div></div>
<div class="card"><div class="head"><h2>Überblick WhatsApp</h2><span class="note">Warme Leads aus Close · Klick = Link in der Nachricht geöffnet</span></div><div class="kpis">
${kpi('Gesendet', fmt(g('wa', 'sent')), 'Nachrichten')}${kpi('Geklickt', fmt(g('wa', 'click')), pct(g('wa', 'click'), g('wa', 'sent')) + ' der Gesendeten')}${kpi('Käufe', fmt(g('wa', 'buy')), pct(g('wa', 'buy'), g('wa', 'sent')) + ' der Gesendeten')}${kpi('Umsatz', eur(g('wa', 'buy') * PRICE), 'à 197 €')}
</div><p class="note">Wer geklickt, aber nicht gekauft hat, steht in der Liste „Heiße Leads“ zum Nachfassen oder Anrufen.</p></div>
</div></body></html>`;
return [{ json: { html } }];
