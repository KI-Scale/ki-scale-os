"""Versand-Workflow: alle 5 Minuten die nächste Etappe über Amazon SES.
Platzhalter: __LEADS__, __STATS__, __AWS__ (Credential-ID), __MAILS__ (Vorlagen-JSON)"""
import json, os, uuid
D = os.path.dirname(os.path.abspath(__file__))
from gen import node, code, dt, schema, STATCOLS

PLAN = r"""
// ===== Einstellungen (Claude passt diese an) =====
const MODUS = 'aus';                       // 'aus' | 'test' (nur Test-Leads) | 'live'
const START = '2026-10-26T17:00:00Z';      // Beginn der 24 Stunden (UTC)
const STUNDEN = 24;
const PRO_LAUF = 600;                      // Mails pro 5-Minuten-Lauf
// =================================================
if (MODUS === 'aus') return [];
const now = Date.now(), s = Date.parse(START), e = s + STUNDEN * 3600e3;
const status = MODUS === 'test' ? 'test' : 'aktiv';
const fristTxt = new Date(e).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + ' Uhr';
let phase = null;
if (now >= e + 2 * 3600e3) phase = 'm4';
else if (now >= e - 3 * 3600e3 && now < e) phase = 'm3';
else if (now >= s + 8 * 3600e3 && now < e) phase = 'm2';
else if (now >= s && now < e) phase = 'm1';
if (MODUS === 'test') phase = $getWorkflowStaticData('global').testPhase || 'm1';
const out = [];
if (phase) out.push({ json: { phase, status, limit: PRO_LAUF, frist: fristTxt, endet: e } });
if (now >= s && now < e) out.push({ json: { phase: 'm2b', status, limit: 200, frist: fristTxt, endet: e } });
return out;
"""

BUILD = r"""
const MAILS = __MAILS__;
const BASE = 'https://n8n.ki-scale.com/webhook/';
const out = [];
for (const it of $input.all()) {
  const L = it.json; if (!L || !L.token) continue;
  const P = $('Plan').all().find(p => p.json.phase === L._phase)?.json || $('Plan').first().json;
  const field = L._phase;
  let id = field === 'm1' ? '1' + (L.variante || 'A') : field.slice(1);
  if (field === 'm2b') {   // nur, wenn der Klick mindestens 1 Std. her ist (grob über m1/m2-Zeit)
    const last = Date.parse(L.m2 !== '-' ? L.m2 : L.m1); if (!last || Date.now() - last < 3600e3) continue;
  }
  const T = MAILS[id]; if (!T) continue;
  const name = String(L.vorname || '').trim().split(' ')[0];
  const q = 't=' + L.token + '&m=' + id;
  const rep = s => s.split('{{VORNAME_SP}}').join(name ? ' ' + name : '').split('{{VORNAME}}').join(name).split('{{FRIST}}').join(P.frist)
    .split('{{KLICK}}').join(BASE + 'fp-c?' + q + '&z=lp').split('{{KLICK_CAL}}').join(BASE + 'fp-c?' + q + '&z=cal')
    .split('{{ABMELDEN}}').join(BASE + 'fp-u?' + q).split('{{PIXEL}}').join(BASE + 'fp-o?' + q);
  let subject = T.subject; if (!name) subject = subject.replace(', {{VORNAME}}', '');
  const html = rep(T.html);
  const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, '$2 ($1)').replace(/<br\s*\/?>/g, '\n').replace(/<\/(p|div|tr|h\d)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  out.push({ json: { to: L.email, token: L.token, field, mailId: id,
    body: { FromEmailAddress: 'Adrian Lewu <adrian@mail.adrian-lewu.de>', ReplyToAddresses: ['team@ki-scale.com'], Destination: { ToAddresses: [L.email] },
      Content: { Simple: { Subject: { Data: rep(subject), Charset: 'UTF-8' }, Body: { Html: { Data: html, Charset: 'UTF-8' }, Text: { Data: text, Charset: 'UTF-8' } },
        Headers: [{ Name: 'List-Unsubscribe', Value: '<' + BASE + 'fp-u?' + q + '>' }, { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' }] } } } } });
}
return out;
"""

RESULT = r"""
const sent = $('Mails bauen').all();
const res = $input.all();
const ok = [], fail = [];
res.forEach((r, i) => { const m = sent[i]?.json; if (!m) return; (r.json && r.json.MessageId ? ok : fail).push({ json: { token: m.token, field: m.field, mailId: m.mailId, fehler: r.json && r.json.error ? JSON.stringify(r.json.error).slice(0, 200) : '' } }); });
$getWorkflowStaticData('global').letzterLauf = { zeit: new Date().toISOString(), ok: ok.length, fehler: fail.length };
return ok.concat(fail.map(f => ({ json: { ...f.json, failed: true } })));
"""

COUNT = r"""
const stats = {}; for (const r of $('Zähler holen').all()) if (r.json && r.json.key) stats[r.json.key] = Number(r.json.anzahl) || 0;
const add = {}; for (const r of $('Ergebnis').all()) if (!r.json.failed) { const k = r.json.mailId + '|sent'; add[k] = (add[k] || 0) + 1; }
return Object.entries(add).map(([key, n]) => ({ json: { key, mail: key.split('|')[0], typ: 'sent', anzahl: (stats[key] || 0) + n } }));
"""

def get_leads(name, field, extra, x, y):
    conds = [{"keyName": "status", "keyValue": "={{ $json.status }}"}, {"keyName": field, "keyValue": "-"}] + extra
    return node(name, 'n8n-nodes-base.dataTable', 1.1, {"operation": "get", "dataTableId": dt('__LEADS__'), "matchType": "allConditions",
        "filters": {"conditions": conds}, "limit": "={{ $json.limit }}"}, x, y)

nodes = [
    node('Alle 5 Minuten', 'n8n-nodes-base.scheduleTrigger', 1.2, {"rule": {"interval": [{"field": "minutes", "minutesInterval": 5}]}}, 0, 300),
    code('Plan', PLAN, 220, 300),
    node('Welche Mail?', 'n8n-nodes-base.switch', 3.2, {"rules": {"values": [
        {"conditions": {"options": {"caseSensitive": True, "typeValidation": "strict", "version": 2}, "conditions": [{"leftValue": "={{ $json.phase }}", "rightValue": p, "operator": {"type": "string", "operation": "equals"}}], "combinator": "and"}, "renameOutput": True, "outputKey": p}
        for p in ['m1', 'm2', 'm2b', 'm3', 'm4']]}, "options": {}}, 440, 300),
    get_leads('Leads Mail 1', 'm1', [], 680, 60),
    get_leads('Leads Mail 2', 'm2', [{"keyName": "m1", "condition": "neq", "keyValue": "-"}, {"keyName": "gekauft", "keyValue": "-"}], 680, 200),
    get_leads('Leads Mail 2b', 'm2b', [{"keyName": "geklickt", "condition": "neq", "keyValue": "-"}, {"keyName": "gekauft", "keyValue": "-"}], 680, 340),
    get_leads('Leads Mail 3', 'm3', [{"keyName": "m1", "condition": "neq", "keyValue": "-"}, {"keyName": "gekauft", "keyValue": "-"}], 680, 480),
    get_leads('Leads Mail 4', 'm4', [{"keyName": "m1", "condition": "neq", "keyValue": "-"}, {"keyName": "gekauft", "keyValue": "-"}], 680, 620),
]
tag = [code(f'Phase {p}', "return $input.all().map(i => ({ json: { ...i.json, _phase: '%s' } }));" % p, 900, 60 + 140 * k) for k, p in enumerate(['m1', 'm2', 'm2b', 'm3', 'm4'])]
nodes += tag
nodes += [
    code('Mails bauen', BUILD, 1120, 300),
    node('An Amazon SES senden', 'n8n-nodes-base.httpRequest', 4.2, {"method": "POST", "url": "https://email.eu-central-1.amazonaws.com/v2/email/outbound-emails",
        "authentication": "predefinedCredentialType", "nodeCredentialType": "aws", "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json.body) }}",
        "options": {"batching": {"batch": {"batchSize": 10, "batchInterval": 1000}}}}, 1340, 300,
        credentials={"aws": {"id": "__AWS__", "name": "Amazon SES"}}, onError="continueRegularOutput"),
    code('Ergebnis', RESULT, 1560, 300),
    node('Als gesendet markieren', 'n8n-nodes-base.dataTable', 1.1, {"operation": "update", "dataTableId": dt('__LEADS__'),
        "filters": {"conditions": [{"keyName": "token", "keyValue": "={{ $json.token }}"}]},
        "columns": {"mappingMode": "defineBelow", "value": {f: "={{ $json.field === '%s' && !$json.failed ? $now.toISO() : $('Leads holen nach Token').item ? '-' : undefined }}" % f for f in []}, "matchingColumns": [], "schema": []}}, 1780, 300),
]
# Markieren: pro Feld ein eigener Wert über Ausdruck
mark = nodes[-1]
mark['parameters']['columns']['value'] = {f: "={{ $json.field === '%s' ? ($json.failed ? 'fehler' : $now.toISO()) : undefined }}" % f for f in ['m1', 'm2', 'm2b', 'm3', 'm4']}
mark['parameters']['columns']['schema'] = schema(['m1', 'm2', 'm2b', 'm3', 'm4'])
nodes += [
    node('Zähler holen', 'n8n-nodes-base.dataTable', 1.1, {"operation": "get", "dataTableId": dt('__STATS__'), "returnAll": True}, 2000, 300, alwaysOutputData=True, executeOnce=True),
    code('Zählen', COUNT, 2220, 300),
    node('Zähler speichern', 'n8n-nodes-base.dataTable', 1.1, {"operation": "upsert", "dataTableId": dt('__STATS__'), "filters": {"conditions": [{"keyName": "key", "keyValue": "={{ $json.key }}"}]},
        "columns": {"mappingMode": "defineBelow", "value": {"key": "={{ $json.key }}", "mail": "={{ $json.mail }}", "typ": "={{ $json.typ }}", "anzahl": "={{ $json.anzahl }}"}, "matchingColumns": [], "schema": schema(STATCOLS)}}, 2440, 300),
]
conn = {}
def link(a, b, idx=0):
    c = conn.setdefault(a, {"main": []})
    while len(c["main"]) <= idx: c["main"].append([])
    c["main"][idx].append({"node": b, "type": "main", "index": 0})
link('Alle 5 Minuten', 'Plan'); link('Plan', 'Welche Mail?')
for k, p in enumerate(['m1', 'm2', 'm2b', 'm3', 'm4']):
    getn = ['Leads Mail 1', 'Leads Mail 2', 'Leads Mail 2b', 'Leads Mail 3', 'Leads Mail 4'][k]
    link('Welche Mail?', getn, k); link(getn, f'Phase {p}'); link(f'Phase {p}', 'Mails bauen')
for a, b in [('Mails bauen', 'An Amazon SES senden'), ('An Amazon SES senden', 'Ergebnis'), ('Ergebnis', 'Als gesendet markieren'), ('Als gesendet markieren', 'Zähler holen'), ('Zähler holen', 'Zählen'), ('Zählen', 'Zähler speichern')]:
    link(a, b)
wf = {"name": "Outreach | Versand über Amazon SES", "nodes": nodes, "connections": conn, "settings": {"executionOrder": "v1", "saveDataSuccessExecution": "all"}}
json.dump(wf, open(os.path.join(D, 'versand.json'), 'w'), ensure_ascii=False, indent=1)
print('ok', len(nodes))
