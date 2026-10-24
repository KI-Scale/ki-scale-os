"""Erzeugt die n8n-Workflows für das Outreach-System (ohne Geheimnisse).
Platzhalter, die beim Anlegen im Browser ersetzt werden:
  __LEADS__  Datentabelle outreach_leads   __STATS__  Datentabelle outreach_stats
  __KEY__    geheimer Schlüssel fürs Dashboard
"""
import json, os, uuid
D = os.path.dirname(os.path.abspath(__file__))
BASE = 'https://n8n.ki-scale.com/webhook/'
LP = 'https://faceless.adrian-lewu.de/b/'
CAL = 'https://calendly.com/ksbteam/kostenloses-mehrwertgespraech'
KASSE = 'https://myablefy.com/s/happyjobs/faceless-pages-mit-ki-6b2c71e9/payment'
# Test „Verkaufsseite vs. direkt zur Kasse“: Token-Endziffer gerade → Verkaufsseite, ungerade → Kasse.
# Nur Mails vor Fristende (1A/1B/1C/2/2b/3); Mail 4 (nach Ablauf) immer Verkaufsseite.
KLICK_ZIEL = ("={{ (() => { const q = $json.query; const m = String(q.m || '').replace(/[^0-9a-zA-Z]/g,''); "
  "const utm = 'src=mail-' + m + '&utm_source=email&utm_campaign=fp197'; "
  "if (q.z === 'cal') return '" + CAL + "?' + utm; "
  "const t = String(q.t || ''); const kasse = m !== '4' && parseInt(t.slice(-1), 16) % 2 === 1; "
  "return kasse ? '" + KASSE + "?' + utm + '&ziel=kasse' : '" + LP + "?' + utm + '&ziel=lp'; })() }}")
PIX = 'https://cdn.jsdelivr.net/gh/KI-Scale/ki-scale-os@main/public/mail/p.gif'

def dt(table): return {"__rl": True, "value": table, "mode": "id"}
def schema(cols): return [{"id": c, "displayName": c, "required": False, "defaultMatch": False, "display": True, "type": "number" if c == 'anzahl' else "string", "canBeUsedToMatch": True} for c in cols]
LEADCOLS = ['email','vorname','nachname','telefon','land','variante','token','status','m1','m2','m2b','m3','m4','geoeffnet','geklickt','gekauft']
STATCOLS = ['key','mail','typ','anzahl']
_pos = [0]
def node(name, typ, ver, params, x, y, **extra):
    n = {"id": str(uuid.uuid5(uuid.NAMESPACE_URL, 'kios-' + name)), "name": name, "type": typ, "typeVersion": ver, "position": [x, y], "parameters": params}
    n.update(extra); return n
def webhook(name, path, method, x, y):
    return node(name, 'n8n-nodes-base.webhook', 2, {"path": path, "httpMethod": method, "responseMode": "responseNode", "options": {}}, x, y, webhookId=str(uuid.uuid5(uuid.NAMESPACE_URL, 'kios-wh-' + path + method)))
def respond(name, x, y, **p):
    return node(name, 'n8n-nodes-base.respondToWebhook', 1.1, p, x, y)
def code(name, js, x, y, **extra):
    return node(name, 'n8n-nodes-base.code', 2, {"jsCode": js}, x, y, **extra)

# ---------- Tracking ----------
NORMAL = r"""
const q = $input.first().json.query || {};
return [{ json: { token: String(q.t || '').replace(/[^a-z0-9]/gi,'').slice(0,32), mail: String(q.m || 'x').replace(/[^0-9a-zA-Z]/g,'').slice(0,4), typ: '__TYP__' } }];
"""
DECIDE = r"""
const ev = $('Ereignis').first().json;
const lead = $input.first().json || {};
if (!lead.token) return [];
const list = f => String(lead[f] || '').split(',').filter(v => v && v !== '-');
let upd = {}, stat = null;
if (ev.typ === 'open') { const l = list('geoeffnet'); if (!l.includes(ev.mail)) { l.push(ev.mail); upd.geoeffnet = l.join(','); stat = ev.mail + '|open'; } }
if (ev.typ === 'click') { const l = list('geklickt'); if (!l.includes(ev.mail)) { l.push(ev.mail); upd.geklickt = l.join(','); stat = ev.mail + '|click'; } }
if (ev.typ === 'unsub') { if (lead.status !== 'abgemeldet') { upd.status = 'abgemeldet'; stat = ev.mail + '|unsub'; } }
if (!stat) return [];
return [{ json: { token: lead.token, upd, key: stat, mail: stat.split('|')[0], typ: stat.split('|')[1] } }];
"""
INC = r"""
const d = $('Entscheiden').first().json;
const cur = $input.first().json || {};
return [{ json: { key: d.key, mail: d.mail, typ: d.typ, anzahl: (Number(cur.anzahl) || 0) + 1 } }];
"""
UNSUB_FORM = """={{ '<!doctype html><html lang=de><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Abmelden</title><body style="margin:0;background:#f5f7f4;font:16px/1.6 Arial,sans-serif;color:#141a15"><div style="max-width:460px;margin:12vh auto;background:#fff;border:1px solid #e2e7e0;border-radius:16px;padding:28px"><div style="font-size:12px;letter-spacing:3px;color:#5c6a5f;font-weight:bold">KI-SCALE</div><h1 style="font-size:24px;margin:8px 0 10px">Von den Mails abmelden?</h1><p style="margin:0 0 20px;color:#4b5a4e">Du bekommst danach keine Mails mehr von uns zu diesem Angebot.</p><form method=post action="' + '""" + BASE + """fp-u?t=' + ($json.query.t || '').replace(/[^a-z0-9]/gi,'') + '&m=' + ($json.query.m || '').replace(/[^0-9a-zA-Z]/g,'') + '"><button style="background:#141a15;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:16px;cursor:pointer">Ja, abmelden</button></form></div></body></html>' }}"""
UNSUB_DONE = """<!doctype html><html lang=de><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Abgemeldet</title><body style="margin:0;background:#f5f7f4;font:16px/1.6 Arial,sans-serif;color:#141a15"><div style="max-width:460px;margin:12vh auto;background:#fff;border:1px solid #e2e7e0;border-radius:16px;padding:28px"><div style="font-size:12px;letter-spacing:3px;color:#5c6a5f;font-weight:bold">KI-SCALE</div><h1 style="font-size:24px;margin:8px 0 10px">Du bist abgemeldet.</h1><p style="margin:0;color:#4b5a4e">Du bekommst keine Mails mehr zu diesem Angebot. Alles Gute dir!</p></div></body></html>"""
HTML_HDR = {"responseHeaders": {"entries": [{"name": "Content-Type", "value": "text/html; charset=utf-8"}, {"name": "Cache-Control", "value": "no-store"}]}}

nodes, conn = [], {}
def link(a, b, idx=0):
    conn.setdefault(a, {"main": [[]]})["main"][idx].append({"node": b, "type": "main", "index": 0})

y = 0
for name, path, method, typ, resp in [
    ('Öffnen', 'fp-o', 'GET', 'open', dict(respondWith='redirect', redirectURL=PIX, options={})),
    ('Klick', 'fp-c', 'GET', 'click', dict(respondWith='redirect', redirectURL=KLICK_ZIEL, options={})),
    ('Abmelden (Klick im Postfach)', 'fp-u', 'POST', 'unsub', dict(respondWith='text', responseBody=UNSUB_DONE, options=HTML_HDR)),
]:
    w = webhook(name, path, method, 0, y); r = respond(name + ' → Antwort', 260, y, **resp)
    c = code(name + ' → Ereignis', NORMAL.replace('__TYP__', typ), 520, y)
    nodes += [w, r, c]; link(w['name'], r['name']); link(r['name'], c['name']); link(c['name'], 'Ereignis')
    y += 200
# Abmelde-Formular (GET) zeigt nur die Bestätigung
w = webhook('Abmelden (Seite)', 'fp-u', 'GET', 0, y); r = respond('Abmelden (Seite) → Formular', 260, y, respondWith='text', responseBody=UNSUB_FORM, options=HTML_HDR)
nodes += [w, r]; link(w['name'], r['name'])

nodes += [
    node('Ereignis', 'n8n-nodes-base.noOp', 1, {}, 780, 200),
    node('Lead holen', 'n8n-nodes-base.dataTable', 1.1, {"operation": "get", "dataTableId": dt('__LEADS__'), "filters": {"conditions": [{"keyName": "token", "keyValue": "={{ $json.token }}"}]}, "limit": 1}, 1000, 200, alwaysOutputData=True),
    code('Entscheiden', DECIDE, 1220, 200),
    node('Lead aktualisieren', 'n8n-nodes-base.dataTable', 1.1, {"operation": "update", "dataTableId": dt('__LEADS__'), "filters": {"conditions": [{"keyName": "token", "keyValue": "={{ $json.token }}"}]}, "columns": {"mappingMode": "defineBelow", "value": {"geoeffnet": "={{ $json.upd.geoeffnet ?? $('Lead holen').first().json.geoeffnet }}", "geklickt": "={{ $json.upd.geklickt ?? $('Lead holen').first().json.geklickt }}", "status": "={{ $json.upd.status ?? $('Lead holen').first().json.status }}"}, "matchingColumns": [], "schema": schema(['geoeffnet','geklickt','status'])}}, 1440, 200),
    node('Zähler holen', 'n8n-nodes-base.dataTable', 1.1, {"operation": "get", "dataTableId": dt('__STATS__'), "filters": {"conditions": [{"keyName": "key", "keyValue": "={{ $('Entscheiden').first().json.key }}"}]}, "limit": 1}, 1660, 200, alwaysOutputData=True),
    code('Plus eins', INC, 1880, 200),
    node('Zähler speichern', 'n8n-nodes-base.dataTable', 1.1, {"operation": "upsert", "dataTableId": dt('__STATS__'), "filters": {"conditions": [{"keyName": "key", "keyValue": "={{ $json.key }}"}]}, "columns": {"mappingMode": "defineBelow", "value": {"key": "={{ $json.key }}", "mail": "={{ $json.mail }}", "typ": "={{ $json.typ }}", "anzahl": "={{ $json.anzahl }}"}, "matchingColumns": [], "schema": schema(STATCOLS)}}, 2100, 200),
]
for a, b in [('Ereignis','Lead holen'),('Lead holen','Entscheiden'),('Entscheiden','Lead aktualisieren'),('Lead aktualisieren','Zähler holen'),('Zähler holen','Plus eins'),('Plus eins','Zähler speichern')]:
    link(a, b)

# ---------- Dashboard ----------
DASH = open(os.path.join(D, 'dashboard.js')).read()
w = webhook('Dashboard', 'fp-dash', 'GET', 0, 1000)
chk = node('Schlüssel prüfen', 'n8n-nodes-base.if', 2.2, {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2}, "conditions": [{"id": "k1", "leftValue": "={{ $json.query.k }}", "rightValue": "__KEY__", "operator": {"type": "string", "operation": "equals"}}], "combinator": "and"}, "options": {}}, 240, 1000)
g = node('Zahlen holen', 'n8n-nodes-base.dataTable', 1.1, {"operation": "get", "dataTableId": dt('__STATS__'), "returnAll": True}, 480, 940, alwaysOutputData=True)
c = code('Seite bauen', DASH, 720, 940)
r = respond('Seite ausliefern', 960, 940, respondWith='text', responseBody='={{ $json.html }}', options=HTML_HDR)
no = respond('Kein Zugang', 480, 1100, respondWith='text', responseBody='Kein Zugang', options={"responseCode": 403})
nodes += [w, chk, g, c, r, no]
link('Dashboard', 'Schlüssel prüfen'); link('Schlüssel prüfen', 'Zahlen holen', 0)
conn['Schlüssel prüfen']['main'].append([{"node": 'Kein Zugang', "type": "main", "index": 0}])
link('Zahlen holen', 'Seite bauen'); link('Seite bauen', 'Seite ausliefern')

wf = {"name": "Outreach | Tracking & Live-Dashboard", "nodes": nodes, "connections": conn, "settings": {"executionOrder": "v1", "saveDataSuccessExecution": "none"}}
json.dump(wf, open(os.path.join(D, 'tracking.json'), 'w'), ensure_ascii=False, indent=1)
print('ok', len(nodes))
