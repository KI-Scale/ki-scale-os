// n8n Code-Knoten „Tagesliste bauen“: WhatsApp-Arbeitsliste für heute (live aus der Tabelle whatsapp_leads).
const ALLE = $('WA alle').all().map(i => i.json).filter(r => r && r.token);
const PRO_TAG = 100;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clean = v => (v && v !== '-') ? v : '';
const digits = p => String(p || '').replace(/\D/g, '');
const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const amTag = iso => iso && iso !== '-' && new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }) === heute;
const SEG = { geld: '\n\nDamals hat es bei dir finanziell nicht gepasst. Genau deshalb soll Geld diesmal nicht der Grund sein, warum du nicht startest.',
  zeit: '\n\nDamals war bei dir einfach zu viel los. Deshalb geht das hier mit ein paar Minuten am Tag, am Handy.',
  noshow: '\n\nEuer Termin hat damals nicht geklappt – kein Ding, manchmal kommt das Leben dazwischen.', standard: '' };
const GRUPPE = { geld: 'Geld war das Thema', zeit: 'Keine Zeit', noshow: 'Termin geplatzt', standard: 'Sonstige' };
const msg = r => { const f = clean(r.vorname).split(' ')[0];
  return `${f ? 'Hey ' + f : 'Hey'}, Adrian hier 👋\n\nDu hattest dich vor einer Weile bei uns eingetragen und mit jemandem aus meinem Team telefoniert. Ich musste gerade an dich denken, weil du ja auch etwas Eigenes aufbauen wolltest.\n\nIch kenne das Gefühl gut. Ich war selbst lange angestellt, und jeden Morgen war da derselbe Gedanke: Ich arbeite für den Traum von jemand anderem. Und wenn man dann nach einem Weg sucht, landet man bei Coachings für 5.000 oder 15.000 € und weiß irgendwann nicht mehr, wem man noch glauben soll.${SEG[r.gruppe] || ''}\n\nIch habe deshalb etwas gebaut, das ich mir damals selbst gewünscht hätte: Wie du mit KI eine anonyme Instagram-Seite aufbaust, ganz ohne dein Gesicht zu zeigen, und darüber mit Kooperationen mit Firmen dein Nebeneinkommen startest.\n\nIn 72 Stunden verkaufe ich das Ganze für 2.400 €. Weil wir schon mal gesprochen haben, hast du jetzt die einmalige Möglichkeit, es für 197 € zu bekommen. Einmalig, kein Abo. Auf Wunsch zahlst du auch ganz entspannt in Raten über PayPal.\n\nHier sicherst du dir deinen Zugang: https://faceless.adrian-lewu.de/start/${r.token}\n\nWenn du vorher noch eine Frage hast, schreib mir einfach hier – ich antworte dir persönlich 🙂`; };
const nachfass = r => { const f = clean(r.vorname).split(' ')[0];
  return `Hey${f ? ' ' + f : ''}, Adrian hier nochmal 🙂 Ich hab gesehen, dass du dir die Seite zu „Faceless Pages mit KI“ angeschaut hast. Gibt es noch eine Frage, bei der ich dir helfen kann? Wenn du magst, ruf ich dich auch kurz an – wann passt es dir?`; };
const offen = ALLE.filter(r => r.status === 'aktiv' && r.gesendet === '-' && r.gekauft === '-');
const heuteGesendet = ALLE.filter(r => amTag(r.gesendet)).length;
const liste = offen.slice(0, Math.max(0, PRO_TAG - heuteGesendet));
const heiss = ALLE.filter(r => r.geklickt !== '-' && r.gekauft === '-').sort((a, b) => Date.parse(b.geklickt) - Date.parse(a.geklickt));
const gekauft = ALLE.filter(r => r.gekauft !== '-' && !String(r.gekauft).includes('test')).length;
const gesendetAlle = ALLE.filter(r => r.gesendet !== '-').length;
const card = (r, text, label) => `<article class="card" data-t="${esc(r.token)}"><div class="who"><b>${esc(clean(r.name) || clean(r.vorname))}</b>
<div class="meta"><span class="pill">${esc(clean(r.close_status))}</span><span class="pill s">${GRUPPE[r.gruppe] || ''}</span>${r.geklickt !== '-' ? `<span class="pill hot">${Number(r.klicks) || 1}× geklickt</span>` : ''}</div>
<div class="tel">${esc(r.telefon)}</div><a class="btn ghost" target="_blank" rel="noopener" href="https://app.close.com/lead/${esc(r.lead_id)}/">In Close öffnen</a></div>
<div class="act"><textarea>${esc(text)}</textarea><div class="btns"><a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${digits(r.telefon)}?text=${encodeURIComponent(text)}">${label}</a><a class="btn" href="tel:${esc(r.telefon)}">Anrufen</a></div></div></article>`;
const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'full', timeStyle: 'short' });
const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>WhatsApp heute</title>
<style>:root{--bg:#f6f8f5;--panel:#fff;--line:#e1e7de;--fg:#141a15;--muted:#5b675d;--accent:#2f8a14;--soft:#eaf5e3;--wa:#1f9d55;--hot:#c2410c;--hsoft:#fdece4}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 "Helvetica Neue",Arial,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:22px max(16px,env(safe-area-inset-left)) 60px;display:grid;gap:14px}
.eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:700}h1{font:600 34px/1.1 Georgia,serif;margin:2px 0 4px}h2{font:600 22px Georgia,serif;margin:12px 0 0}.sub{color:var(--muted);font-size:13px}
.stats{display:flex;gap:10px;flex-wrap:wrap}.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 14px;min-width:140px}.stat b{display:block;font-size:24px;font-variant-numeric:tabular-nums}
.bar{height:10px;background:var(--soft);border-radius:6px;overflow:hidden}.bar i{display:block;height:100%;background:var(--accent)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);gap:14px}.card.done{opacity:.45}
.who{display:grid;gap:6px;align-content:start}.meta{display:flex;flex-wrap:wrap;gap:6px}.pill{font-size:11px;font-weight:700;border-radius:999px;padding:2px 9px;background:var(--soft);color:var(--accent)}.pill.s{background:transparent;border:1px solid var(--line);color:var(--muted)}.pill.hot{background:var(--hsoft);color:var(--hot)}
.tel{font-weight:600;font-variant-numeric:tabular-nums;user-select:all}textarea{width:100%;min-height:150px;border:1px solid var(--line);border-radius:10px;padding:10px;font:14px/1.5 inherit;background:var(--bg);color:var(--fg);resize:vertical}
.act{display:grid;gap:8px;min-width:0}.btns{display:flex;gap:8px;flex-wrap:wrap}.btn{border:1px solid var(--line);background:var(--panel);color:var(--fg);border-radius:10px;padding:8px 12px;font-weight:600;font-size:13px;text-decoration:none;justify-self:start}.btn.wa{background:var(--wa);border-color:var(--wa);color:#fff}.btn.ghost{font-weight:500}
.empty{background:var(--panel);border:1px dashed var(--line);border-radius:12px;padding:16px;color:var(--muted)}
@media(max-width:720px){.card{grid-template-columns:1fr}}</style></head><body><div class="wrap">
<div><div class="eyebrow">KI-Scale · Faceless Pages mit KI · ${now}</div><h1>WhatsApp heute</h1><div class="sub">Deine tägliche Liste: oben die heißen Leads zum Nachfassen, darunter die nächsten warmen Leads zum Anschreiben. „WhatsApp öffnen“ → kurz lesen → Senden. Gesendete verschwinden beim nächsten Laden automatisch.</div></div>
<div class="stats"><div class="stat"><b>${heuteGesendet} / ${PRO_TAG}</b><span class="sub">heute gesendet</span></div><div class="stat"><b>${heiss.length}</b><span class="sub">heiße Leads (geklickt)</span></div><div class="stat"><b>${gekauft}</b><span class="sub">Käufe über WhatsApp</span></div><div class="stat"><b>${offen.length}</b><span class="sub">noch nie angeschrieben</span></div><div class="stat"><b>${gesendetAlle}</b><span class="sub">insgesamt angeschrieben</span></div></div>
<div class="bar"><i style="width:${Math.min(100, heuteGesendet / PRO_TAG * 100)}%"></i></div>
<h2>🔥 Nachfassen: haben geklickt, noch nicht gekauft</h2>${heiss.map(r => card(r, nachfass(r), 'Nachfassen per WhatsApp')).join('') || '<div class="empty">Noch niemand. Sobald jemand auf seinen Link tippt, steht er hier ganz oben.</div>'}
<h2>Heute anschreiben</h2>${liste.map(r => card(r, msg(r), 'WhatsApp öffnen')).join('') || '<div class="empty">Für heute ist alles erledigt. 💪</div>'}
</div><script>
document.addEventListener('input',e=>{if(e.target.tagName!=='TEXTAREA')return;const c=e.target.closest('.card');const a=c.querySelector('.wa');a.href=a.href.split('?')[0]+'?text='+encodeURIComponent(e.target.value)});
document.addEventListener('click',e=>{const a=e.target.closest('.wa');if(!a)return;const c=a.closest('.card');if(a.textContent.includes('öffnen')){new Image().src='https://n8n.ki-scale.com/webhook/fp-ws?t='+c.dataset.t}c.classList.add('done')});
</script></body></html>`;
return [{ json: { html } }];
