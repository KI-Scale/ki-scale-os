// n8n Code-Knoten „Liste bauen“: alle, die auf den Link geklickt, aber noch nicht gekauft haben.
const wa = $('WA-Klicker').all().map(i => i.json).filter(r => r && r.token);
const ml = $('Mail-Klicker').all().map(i => i.json).filter(r => r && r.token);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clean = v => (v && v !== '-') ? v : '';
const when = iso => { const t = Date.parse(iso); if (!t) return ''; const m = Math.round((Date.now() - t) / 60000);
  return m < 60 ? `vor ${m} Min.` : m < 1440 ? `vor ${Math.round(m / 60)} Std.` : new Date(t).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'short' }); };
const first = r => (clean(r.vorname) || '').split(' ')[0];
const nachfass = r => `Hey${first(r) ? ' ' + first(r) : ''}, Adrian hier nochmal 🙂 Ich hab gesehen, dass du dir die Seite zu „Faceless Pages mit KI“ angeschaut hast. Gibt es noch eine Frage, bei der ich dir helfen kann? Wenn du magst, ruf ich dich auch kurz an – wann passt es dir?`;
const digits = p => String(p || '').replace(/\D/g, '');
const row = (r, src) => {
  const tel = clean(r.telefon);
  const name = clean(r.name) || [clean(r.vorname), clean(r.nachname)].filter(Boolean).join(' ') || clean(r.email);
  const info = src === 'wa' ? `${esc(clean(r.close_status))} · ${Number(r.klicks) || 1}× geklickt` : `Mail ${esc(String(r.geklickt).split(',').join(', '))} geklickt`;
  const t = src === 'wa' ? r.geklickt : (r.m4 !== '-' ? r.m4 : r.m3 !== '-' ? r.m3 : r.m2 !== '-' ? r.m2 : r.m1);
  return `<article class="row"><div class="who"><b>${esc(name)}</b><span class="tag ${src}">${src === 'wa' ? 'WhatsApp' : 'E-Mail'}</span><div class="sub">${info}${t && src === 'wa' ? ' · ' + when(t) : ''}</div></div>
  <div class="tel">${tel ? esc(tel) : '<span class="sub">keine Nummer</span>'}${clean(r.email) ? `<div class="sub">${esc(r.email)}</div>` : ''}</div>
  <div class="btns">${tel ? `<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${digits(tel)}?text=${encodeURIComponent(nachfass(r))}">Nachfassen per WhatsApp</a><a class="btn" href="tel:${esc(tel)}">Anrufen</a>` : ''}${clean(r.lead_id) ? `<a class="btn" target="_blank" rel="noopener" href="https://app.close.com/lead/${esc(r.lead_id)}/">Close</a>` : ''}</div></article>`;
};
wa.sort((a, b) => Date.parse(b.geklickt) - Date.parse(a.geklickt));
const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' });
const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="120"><meta name="robots" content="noindex"><title>Heiße Leads</title>
<style>:root{--bg:#f6f8f5;--panel:#fff;--line:#e1e7de;--fg:#141a15;--muted:#5b675d;--accent:#2f8a14;--soft:#eaf5e3;--wa:#1f9d55;--mail:#2d5fa8;--msoft:#e8eef8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 "Helvetica Neue",Arial,sans-serif}
.wrap{max-width:1000px;margin:0 auto;padding:22px max(16px,env(safe-area-inset-left)) 60px;display:grid;gap:14px}
.eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:700}h1{font:600 34px/1.1 Georgia,serif;margin:2px 0 4px}.sub{color:var(--muted);font-size:13px}
.stats{display:flex;gap:10px;flex-wrap:wrap}.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 14px;min-width:140px}.stat b{display:block;font-size:24px}
h2{font:600 20px Georgia,serif;margin:10px 0 0}.list{display:grid;gap:8px}
.row{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) auto;gap:12px;align-items:center}
.who b{margin-right:8px}.tag{font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px}.tag.wa{background:var(--soft);color:var(--accent)}.tag.mail{background:var(--msoft);color:var(--mail)}
.tel{font-weight:600;font-variant-numeric:tabular-nums;min-width:0;overflow-wrap:anywhere}.btns{display:flex;gap:6px;flex-wrap:wrap}
.btn{border:1px solid var(--line);background:var(--panel);color:var(--fg);border-radius:9px;padding:7px 11px;font-weight:600;font-size:13px;text-decoration:none}.btn.wa{background:var(--wa);border-color:var(--wa);color:#fff}
.empty{background:var(--panel);border:1px dashed var(--line);border-radius:12px;padding:16px;color:var(--muted)}
@media(max-width:720px){.row{grid-template-columns:1fr}}</style></head><body><div class="wrap">
<div><div class="eyebrow">KI-Scale · Faceless Pages mit KI</div><h1>Heiße Leads</h1><div class="sub">Haben auf den Link geklickt, aber noch nicht gekauft. Jetzt nachfassen oder anrufen. Stand ${now}, aktualisiert sich alle 2 Minuten.</div></div>
<div class="stats"><div class="stat"><b>${wa.length}</b><span class="sub">aus WhatsApp</span></div><div class="stat"><b>${ml.length}</b><span class="sub">aus E-Mail</span></div></div>
<h2>Aus WhatsApp</h2><div class="list">${wa.map(r => row(r, 'wa')).join('') || '<div class="empty">Noch niemand. Sobald jemand auf den Link in der WhatsApp-Nachricht tippt, steht er hier.</div>'}</div>
<h2>Aus E-Mail</h2><div class="list">${ml.slice(0, 500).map(r => row(r, 'mail')).join('') || '<div class="empty">Noch niemand. Sobald jemand in einer Mail auf den Knopf klickt, steht er hier.</div>'}</div>
</div></body></html>`;
return [{ json: { html } }];
