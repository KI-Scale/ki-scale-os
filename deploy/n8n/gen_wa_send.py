"""Automatischer WhatsApp-Versand über die offizielle WhatsApp Cloud API (Meta).
Platzhalter: __WA__ (Tabelle whatsapp_leads), __STATS__
Noch einzutragen, wenn die Nummer steht: PHONE_ID (in „Einstellungen“) und die Zugangsdaten „WhatsApp (Meta)“ (Header Auth: Authorization = Bearer …).
Vorlagen bei Meta (Kategorie Marketing, Sprache de): fp_geld, fp_zeit, fp_termin, fp_standard
  Text: {{1}} = Vorname · Knopf „Alle Infos ansehen“ mit dynamischer URL https://n8n.ki-scale.com/webhook/fp-w?t={{1}}"""
import json, os
D = os.path.dirname(os.path.abspath(__file__))
from gen import node, code, dt, schema, STATCOLS

EINST = r"""
// ===== Einstellungen =====
const MODUS = 'aus';          // 'aus' | 'live'
const PRO_TAG = 100;          // Nachrichten pro Tag
const VON = 9, BIS = 20;      // nur zwischen 9 und 20 Uhr (deutsche Zeit)
const PHONE_ID = '__PHONE_ID__';
const PLAETZE = 20;           // nur 20 Plätze zu 197 € – danach stoppt der Versand automatisch
// =========================
if (MODUS === 'aus' || PHONE_ID.startsWith('__')) return [];
const verkauft = Number(($('Plätze prüfen').first().json || {}).anzahl) || 0;
if (verkauft >= PLAETZE) return [];
const now = new Date();
const h = Number(now.toLocaleString('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }));
if (h < VON || h >= BIS) return [];
const tag = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const sd = $getWorkflowStaticData('global'); if (sd.tag !== tag) { sd.tag = tag; sd.heute = 0; }
const rest = Math.max(0, PRO_TAG - (sd.heute || 0)); if (!rest) return [];
const laeufe = Math.max(1, BIS - h);
return [{ json: { limit: Math.max(1, Math.ceil(rest / laeufe)), phoneId: PHONE_ID } }];
"""
BAUEN = r"""
const E = $('Einstellungen').first().json;
const T = { geld: 'fp_geld', zeit: 'fp_zeit', noshow: 'fp_termin', standard: 'fp_standard' };
return $input.all().map(i => i.json).filter(L => L && L.token && L.telefon).map(L => {
  const name = (L.vorname && L.vorname !== '-') ? L.vorname.split(' ')[0] : 'du';
  return { json: { token: L.token, url: 'https://graph.facebook.com/v21.0/' + E.phoneId + '/messages', body: {
    messaging_product: 'whatsapp', to: String(L.telefon).replace(/\D/g, ''), type: 'template',
    template: { name: T[L.gruppe] || 'fp_standard', language: { code: 'de' }, components: [
      { type: 'body', parameters: [{ type: 'text', text: name }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: L.token }] }] } } } };
});
"""
ERG = r"""
const sent = $('Nachrichten bauen').all(); const out = [];
$input.all().forEach((r, i) => { const m = sent[i]?.json; if (!m) return; const ok = !!(r.json && r.json.messages);
  out.push({ json: { token: m.token, gesendet: ok ? new Date().toISOString() : 'fehler', ok, fehler: ok ? '' : JSON.stringify(r.json?.error || r.json).slice(0, 200) } }); });
const sd = $getWorkflowStaticData('global'); sd.heute = (sd.heute || 0) + out.filter(o => o.json.ok).length;
sd.letzterLauf = { zeit: new Date().toISOString(), ok: out.filter(o => o.json.ok).length, fehler: out.filter(o => !o.json.ok).length };
return out;
"""
ZAEHL = r"""
const S = {}; for (const r of $input.all()) if (r.json && r.json.key) S[r.json.key] = Number(r.json.anzahl) || 0;
const n = $('Ergebnis').all().filter(r => r.json.ok).length; if (!n) return [];
return [{ json: { key: 'wa|sent', mail: 'wa', typ: 'sent', anzahl: (S['wa|sent'] || 0) + n } }];
"""
nodes = [
    node('Stündlich', 'n8n-nodes-base.scheduleTrigger', 1.2, {"rule": {"interval": [{"field": "hours", "hoursInterval": 1}]}}, 0, 300),
    node('Plätze prüfen', 'n8n-nodes-base.dataTable', 1.1, {"operation": "get", "dataTableId": dt('__STATS__'), "filters": {"conditions": [{"keyName": "key", "keyValue": "wa|buy"}]}, "limit": 1}, 110, 300, alwaysOutputData=True),
    code('Einstellungen', EINST, 220, 300),
    node('Nächste Leads', 'n8n-nodes-base.dataTable', 1.1, {"operation": "get", "dataTableId": dt('__WA__'), "matchType": "allConditions",
        "filters": {"conditions": [{"keyName": "status", "keyValue": "aktiv"}, {"keyName": "gesendet", "keyValue": "-"}, {"keyName": "gekauft", "keyValue": "-"}]},
        "limit": "={{ $json.limit }}"}, 440, 300),
    code('Nachrichten bauen', BAUEN, 660, 300),
    node('An WhatsApp senden', 'n8n-nodes-base.httpRequest', 4.2, {"method": "POST", "url": "={{ $json.url }}", "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
        "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json.body) }}", "options": {"batching": {"batch": {"batchSize": 1, "batchInterval": 1500}}}}, 880, 300, onError="continueRegularOutput"),
    code('Ergebnis', ERG, 1100, 300),
    node('Als gesendet markieren', 'n8n-nodes-base.dataTable', 1.1, {"operation": "update", "dataTableId": dt('__WA__'), "filters": {"conditions": [{"keyName": "token", "keyValue": "={{ $json.token }}"}]},
        "columns": {"mappingMode": "defineBelow", "value": {"gesendet": "={{ $json.gesendet }}"}, "matchingColumns": [], "schema": schema(['gesendet'])}}, 1320, 300),
    node('Zähler holen', 'n8n-nodes-base.dataTable', 1.1, {"operation": "get", "dataTableId": dt('__STATS__'), "filters": {"conditions": [{"keyName": "key", "keyValue": "wa|sent"}]}, "limit": 1}, 1540, 300, alwaysOutputData=True, executeOnce=True),
    code('Zählen', ZAEHL, 1760, 300, executeOnce=True),
    node('Zähler speichern', 'n8n-nodes-base.dataTable', 1.1, {"operation": "upsert", "dataTableId": dt('__STATS__'), "filters": {"conditions": [{"keyName": "key", "keyValue": "={{ $json.key }}"}]},
        "columns": {"mappingMode": "defineBelow", "value": {"key": "={{ $json.key }}", "mail": "={{ $json.mail }}", "typ": "={{ $json.typ }}", "anzahl": "={{ $json.anzahl }}"}, "matchingColumns": [], "schema": schema(STATCOLS)}}, 1980, 300),
]
chain = [n['name'] for n in nodes]
conn = {a: {"main": [[{"node": b, "type": "main", "index": 0}]]} for a, b in zip(chain, chain[1:])}
wf = {"name": "Outreach | WhatsApp-Versand (Meta)", "nodes": nodes, "connections": conn, "settings": {"executionOrder": "v1", "saveDataSuccessExecution": "all"}}
json.dump(wf, open(os.path.join(D, 'whatsapp_versand.json'), 'w'), ensure_ascii=False, indent=1)
print('ok', len(nodes))
