"""WhatsApp-Tracking + Liste „Heiße Leads“ (ohne Geheimnisse).
Platzhalter: __WA__ (Tabelle whatsapp_leads), __LEADS__, __STATS__, __KEY__ (Zugangsschlüssel der Liste)
  /webhook/fp-w?t=TOKEN   Klick auf den Link in der WhatsApp-Nachricht → Verkaufsseite, zählt den Klick
  /webhook/fp-ws?t=TOKEN  „gesendet“-Signal (Knopf „WhatsApp öffnen“ in der Liste oder automatischer Versand)
  /webhook/fp-heiss?k=KEY Liste aller, die geklickt aber nicht gekauft haben → nachfassen oder anrufen"""
import json, os
D = os.path.dirname(os.path.abspath(__file__))
from gen import node, webhook, respond, code, dt, schema, STATCOLS, HTML_HDR

LP = 'https://faceless.adrian-lewu.de/b/?src=wa&utm_source=whatsapp&utm_campaign=fp197&ziel=lp'
PIX = 'https://cdn.jsdelivr.net/gh/KI-Scale/ki-scale-os@main/public/mail/p.gif'

TOKEN = r"""
const q = $input.first().json.query || {};
return [{ json: { token: String(q.t || '').replace(/[^a-z0-9]/gi, '').slice(0, 32), typ: '__TYP__' } }];
"""
DECIDE = r"""
const ev = $('WA Ereignis').first().json;
const L = $input.first().json || {};
if (!L.token) return [];
const now = new Date().toISOString();
let upd = {}, key = null;
if (ev.typ === 'click') { upd.klicks = String((Number(L.klicks) || 0) + 1); if (!L.geklickt || L.geklickt === '-') { upd.geklickt = now; key = 'wa|click'; } }
if (ev.typ === 'sent') { if (!L.gesendet || L.gesendet === '-') { upd.gesendet = now; key = 'wa|sent'; } }
if (!Object.keys(upd).length) return [];
return [{ json: { token: L.token, upd, key } }];
"""
INC = r"""
const d = $('WA Entscheiden').first().json;
if (!d.key) return [];
const cur = $input.first().json || {};
return [{ json: { key: d.key, mail: 'wa', typ: d.key.split('|')[1], anzahl: (Number(cur.anzahl) || 0) + 1 } }];
"""

HOT = open(os.path.join(D, 'heiss.js')).read()

nodes, conn = [], {}
def link(a, b, idx=0):
    c = conn.setdefault(a, {"main": []})
    while len(c["main"]) <= idx: c["main"].append([])
    c["main"][idx].append({"node": b, "type": "main", "index": 0})

for name, path, typ, resp, y in [
    ('WA Klick', 'fp-w', 'click', dict(respondWith='redirect', redirectURL=LP, options={}), 0),
    ('WA gesendet', 'fp-ws', 'sent', dict(respondWith='redirect', redirectURL=PIX, options={}), 200),
]:
    w = webhook(name, path, 'GET', 0, y); r = respond(name + ' → Antwort', 240, y, **resp)
    c = code(name + ' → Ereignis', TOKEN.replace('__TYP__', typ), 480, y)
    nodes += [w, r, c]; link(w['name'], r['name']); link(r['name'], c['name']); link(c['name'], 'WA Ereignis')

nodes += [
    node('WA Ereignis', 'n8n-nodes-base.noOp', 1, {}, 720, 100),
    node('WA Lead holen', 'n8n-nodes-base.dataTable', 1.1, {"operation": "get", "dataTableId": dt('__WA__'), "filters": {"conditions": [{"keyName": "token", "keyValue": "={{ $json.token }}"}]}, "limit": 1}, 940, 100, alwaysOutputData=True),
    code('WA Entscheiden', DECIDE, 1160, 100),
    node('WA Lead aktualisieren', 'n8n-nodes-base.dataTable', 1.1, {"operation": "update", "dataTableId": dt('__WA__'), "filters": {"conditions": [{"keyName": "token", "keyValue": "={{ $json.token }}"}]},
        "columns": {"mappingMode": "defineBelow", "value": {f: "={{ $json.upd.%s ?? $('WA Lead holen').first().json.%s }}" % (f, f) for f in ['gesendet', 'geklickt', 'klicks']}, "matchingColumns": [], "schema": schema(['gesendet', 'geklickt', 'klicks'])}}, 1380, 100),
    node('WA Zähler holen', 'n8n-nodes-base.dataTable', 1.1, {"operation": "get", "dataTableId": dt('__STATS__'), "filters": {"conditions": [{"keyName": "key", "keyValue": "={{ $('WA Entscheiden').first().json.key || '__keiner__' }}"}]}, "limit": 1}, 1600, 100, alwaysOutputData=True),
    code('WA Plus eins', INC, 1820, 100),
    node('WA Zähler speichern', 'n8n-nodes-base.dataTable', 1.1, {"operation": "upsert", "dataTableId": dt('__STATS__'), "filters": {"conditions": [{"keyName": "key", "keyValue": "={{ $json.key }}"}]},
        "columns": {"mappingMode": "defineBelow", "value": {"key": "={{ $json.key }}", "mail": "={{ $json.mail }}", "typ": "={{ $json.typ }}", "anzahl": "={{ $json.anzahl }}"}, "matchingColumns": [], "schema": schema(STATCOLS)}}, 2040, 100),
]
for a, b in [('WA Ereignis', 'WA Lead holen'), ('WA Lead holen', 'WA Entscheiden'), ('WA Entscheiden', 'WA Lead aktualisieren'), ('WA Lead aktualisieren', 'WA Zähler holen'), ('WA Zähler holen', 'WA Plus eins'), ('WA Plus eins', 'WA Zähler speichern')]:
    link(a, b)

# Liste „Heiße Leads“
w = webhook('Heiße Leads', 'fp-heiss', 'GET', 0, 500)
chk = node('Zugang prüfen', 'n8n-nodes-base.if', 2.2, {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2}, "conditions": [{"id": "k1", "leftValue": "={{ $json.query.k }}", "rightValue": "__KEY__", "operator": {"type": "string", "operation": "equals"}}], "combinator": "and"}, "options": {}}, 240, 500)
g1 = node('WA-Klicker', 'n8n-nodes-base.dataTable', 1.1, {"operation": "get", "dataTableId": dt('__WA__'), "matchType": "allConditions", "filters": {"conditions": [{"keyName": "geklickt", "condition": "neq", "keyValue": "-"}, {"keyName": "gekauft", "keyValue": "-"}]}, "returnAll": True}, 480, 440, alwaysOutputData=True, executeOnce=True)
g2 = node('Mail-Klicker', 'n8n-nodes-base.dataTable', 1.1, {"operation": "get", "dataTableId": dt('__LEADS__'), "matchType": "allConditions", "filters": {"conditions": [{"keyName": "geklickt", "condition": "neq", "keyValue": "-"}, {"keyName": "gekauft", "keyValue": "-"}, {"keyName": "status", "keyValue": "aktiv"}]}, "returnAll": True}, 700, 440, alwaysOutputData=True, executeOnce=True)
c = code('Liste bauen', HOT, 920, 440, executeOnce=True)
r = respond('Liste ausliefern', 1140, 440, respondWith='text', responseBody='={{ $json.html }}', options=HTML_HDR)
no = respond('Kein Zugang (Liste)', 480, 600, respondWith='text', responseBody='Kein Zugang', options={"responseCode": 403})
nodes += [w, chk, g1, g2, c, r, no]
link('Heiße Leads', 'Zugang prüfen'); link('Zugang prüfen', 'WA-Klicker', 0); link('Zugang prüfen', 'Kein Zugang (Liste)', 1)
link('WA-Klicker', 'Mail-Klicker'); link('Mail-Klicker', 'Liste bauen'); link('Liste bauen', 'Liste ausliefern')

wf = {"name": "Outreach | WhatsApp-Tracking & Heiße Leads", "nodes": nodes, "connections": conn, "settings": {"executionOrder": "v1", "saveDataSuccessExecution": "none"}}
json.dump(wf, open(os.path.join(D, 'whatsapp.json'), 'w'), ensure_ascii=False, indent=1)
print('ok', len(nodes))
