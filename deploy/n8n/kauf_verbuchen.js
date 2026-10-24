// n8n Code-Knoten „Outreach: Kauf verbuchen“ (im Workflow „Academy | Willkommens-Mail nach Kauf“)
// Markiert den Lead als Käufer (keine weiteren Verkaufsmails) und zählt den Kauf
// für die Mail, die ihn zuletzt erreicht hat, und für die Testgruppe Verkaufsseite/Kasse.
const kauf = $('Kauf von ablefy (über Worker)').first().json.body || {};
const L = $input.first().json || {};
if (!L.token || (L.gekauft && L.gekauft !== '-')) return [];
const echt = String(kauf.product) === '538088';
const geklickt = String(L.geklickt || '').split(',').filter(v => v && v !== '-');
let mail = geklickt[geklickt.length - 1] || '';
if (!mail) {
  const t = f => (L[f] && L[f] !== '-' && L[f] !== 'fehler') ? Date.parse(L[f]) : 0;
  const ids = { m1: '1' + (L.variante || 'A'), m2: '2', m2b: '2b', m3: '3', m4: '4' };
  const last = Object.keys(ids).filter(f => t(f)).sort((a, b) => t(b) - t(a))[0];
  mail = last ? ids[last] : 'ohne';
}
const ziel = parseInt(String(L.token).slice(-1), 16) % 2 === 1 ? 'kasse' : 'lp';
const keys = echt ? [mail + '|buy', 'ziel-' + ziel + '|buy'] : ['test|buy'];
return [{ json: { token: L.token, gekauft: new Date().toISOString() + (echt ? '' : ' test'), keys } }];
