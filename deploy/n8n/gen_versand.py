"""Versand-Workflow (rollierend): jeden Tag PRO_TAG neue Leads, jeder mit eigener 24-Std.-Frist.
Platzhalter: __LEADS__, __STATS__, __AWS__ (Credential-ID), __MAILS__ (Vorlagen-JSON), __INLINE__ (Bilder als Anhänge)

Ablauf pro Lead (Zeit ab seiner ersten Mail, im Testmodus Minuten statt Stunden):
  m1  sofort (Variante A/B/C)          m2  nach 8 Std.
  m2b nach Klick ohne Kauf (ab 2 Std.)  m3  3 Std. vor Fristende
  m4  2 Std. nach Fristende (Gesprächsangebot)
Wer kauft oder sich abmeldet, bekommt nichts mehr."""
import json, os
D = os.path.dirname(os.path.abspath(__file__))
from gen import node, code, dt, schema, STATCOLS

EINSTELLUNGEN = r"""
// ===== Einstellungen (Claude passt diese an) =====
const MODUS = 'aus';      // 'aus' | 'test' (nur Test-Leads, Minuten statt Stunden) | 'live'
const PRO_TAG = 1000;     // neue Leads pro Tag
const VON = 8, BIS = 21;  // erste Mails nur zwischen 8 und 21 Uhr (deutsche Zeit)
const FOLGE_VON = 7, FOLGE_BIS = 22; // Folge-Mails zwischen 7 und 22 Uhr
const PRO_LAUF = 150;     // höchstens so viele neue Leads pro 10-Minuten-Lauf
const MAX_MAILS_TAG = __MAXMAILS__; // Obergrenze aller Mails pro Tag (Erst- + Folge-Mails), z. B. Brevo kostenlos: 290
// =================================================
if (MODUS === 'aus') return [];
const test = MODUS === 'test';
const now = new Date();
const h = Number(now.toLocaleString('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }));
const tag = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const sd = $getWorkflowStaticData('global');
if (sd.tag !== tag) { sd.tag = tag; sd.heute = 0; sd.mailsHeute = 0; }
const mailRest = Math.max(0, MAX_MAILS_TAG - (sd.mailsHeute || 0));
if (!mailRest) return [];
const offen = test || (h >= VON && h < BIS);
const folgeOffen = test || (h >= FOLGE_VON && h < FOLGE_BIS);
const restLaeufe = Math.max(1, (BIS - h) * 6 - Math.floor(now.getMinutes() / 10));
let neu = offen ? Math.min(PRO_LAUF, Math.ceil(Math.max(0, PRO_TAG - (sd.heute || 0)) / (test ? 1 : restLaeufe))) : 0;
const status = test ? 'test' : 'aktiv';
return [{ json: { status, neu, neuStatus: neu > 0 ? status : '__keiner__', neuLimit: Math.max(1, neu), faktor: test ? 1 / 60 : 1, folgeOffen, heute: sd.heute || 0, tag, mailRest } }];
"""

BUILD = r"""
const MAILS = __MAILS__;
const INLINE = __INLINE__;
const BASE = 'https://n8n.ki-scale.com/webhook/';
const SITE = 'https://faceless.adrian-lewu.de/';  // Links in der Mail laufen über die eigene Domain
const E = $('Einstellungen').first().json;
const H = 3600e3 * E.faktor, now = Date.now();
const iso = t => t && t !== '-' && t !== 'fehler' ? Date.parse(t) : 0;
const fristText = end => {
  const d = new Date(end), o = { timeZone: 'Europe/Berlin' };
  return d.toLocaleDateString('de-DE', { ...o, weekday: 'long', day: 'numeric', month: 'long' }) + ' um ' + d.toLocaleTimeString('de-DE', { ...o, hour: '2-digit', minute: '2-digit' }) + ' Uhr';
};
const jobs = [];
// 1) Folge-Mails für laufende Leads
if (E.folgeOffen) for (const it of $('Laufende Leads').all()) {
  const L = it.json; if (!L || !L.token) continue;
  const t1 = iso(L.m1); if (!t1) continue;
  const end = t1 + 24 * H;
  const last = Math.max(t1, iso(L.m2), iso(L.m2b), iso(L.m3));
  let phase = null;
  if (now >= end + 2 * H) phase = 'm4';
  else if (now < end && now >= end - 3 * H) { if (L.m3 === '-') phase = 'm3'; }
  else if (now < end - 3 * H && now - last >= 1 * H) {
    if (L.m2 === '-' && now >= t1 + 8 * H) phase = 'm2';
    else if (L.m2b === '-' && L.geklickt && L.geklickt !== '-' && now >= t1 + 2 * H) phase = 'm2b';
  }
  if (phase) jobs.push({ L, phase, end });
}
// 2) Erste Mail für neue Leads
if (E.neu > 0) for (const it of $('Neue Leads').all()) {
  const L = it.json; if (!L || !L.token || L.m1 !== '-') continue;
  jobs.push({ L, phase: 'm1', end: now + 24 * H });
}
const PROVIDER = '__PROVIDER__';  // 'ses' | 'brevo'
const IMG = 'https://cdn.jsdelivr.net/gh/KI-Scale/ki-scale-os@main/public/mail/';
const out = [];
for (const { L, phase, end } of jobs.slice(0, E.mailRest)) {
  const id = phase === 'm1' ? '1' + (['A', 'B', 'C'].includes(L.variante) ? L.variante : 'A') : phase.slice(1);
  const T = MAILS[id]; if (!T) continue;
  const name = String(L.vorname || '').trim().split(' ')[0].replace(/^-$/, '');
  const q = 't=' + L.token + '&m=' + id + '&e=' + end;
  const frist = fristText(end);
  const rep = s => s.split('{{VORNAME_SP}}').join(name ? ' ' + name : '').split('{{VORNAME}}').join(name).split('{{FRIST}}').join(frist)
    .split('{{KLICK}}').join(SITE + 'go/' + L.token + '/' + id + '/' + end).split('{{KLICK_CAL}}').join(SITE + 'termin/' + L.token + '/' + id)
    .split('{{ABMELDEN}}').join(SITE + 'abmelden/' + L.token + '/' + id).split('{{PIXEL}}').join(BASE + 'fp-o?' + q);
  let subject = T.subject;
  if (!name) subject = subject.replace(', {{VORNAME}}', '').replace('{{VORNAME}}', '');
  let html = rep(T.html);
  if (!name) html = html.split('Hey ,').join('Hey,');
  const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, '$2 ($1)').replace(/<br\s*\/?>/g, '\n').replace(/<\/(p|div|tr|h\d)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  const unsub = BASE + 'fp-u?' + q;
  if (PROVIDER === 'brevo') {
    const bhtml = html.split('cid:logo').join(IMG + 'logo.png').split('cid:adrian').join(IMG + 'adrian.jpg');
    out.push({ json: { to: L.email, token: L.token, field: phase, mailId: id,
      body: { sender: { name: 'Adrian Lewu', email: 'adrian@mail.adrian-lewu.de' }, replyTo: { email: 'team@ki-scale.com', name: 'Adrian Lewu' },
        to: [{ email: L.email }], subject: rep(subject), htmlContent: bhtml, textContent: text, tags: ['fp197', id],
        headers: { 'List-Unsubscribe': '<' + unsub + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } } });
    continue;
  }
  out.push({ json: { to: L.email, token: L.token, field: phase, mailId: id,
    body: { FromEmailAddress: 'Adrian Lewu <adrian@mail.adrian-lewu.de>', ReplyToAddresses: ['team@ki-scale.com'], Destination: { ToAddresses: [L.email] },
      Content: { Simple: { Subject: { Data: rep(subject), Charset: 'UTF-8' }, Body: { Html: { Data: html, Charset: 'UTF-8' }, Text: { Data: text, Charset: 'UTF-8' } },
        Attachments: INLINE,
        Headers: [{ Name: 'List-Unsubscribe', Value: '<' + BASE + 'fp-u?' + q + '>' }, { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' }] } } } } });
}
return out;
"""

RESULT = r"""
const sent = $('Mails bauen').all();
const res = $input.all();
const ok = [], fail = [];
res.forEach((r, i) => { const m = sent[i]?.json; if (!m) return; (r.json && (r.json.MessageId || r.json.messageId) ? ok : fail).push({ json: { token: m.token, field: m.field, mailId: m.mailId, fehler: r.json && r.json.error ? JSON.stringify(r.json.error).slice(0, 200) : '' } }); });
const sd = $getWorkflowStaticData('global');
sd.heute = (sd.heute || 0) + ok.filter(o => o.json.field === 'm1').length;
sd.mailsHeute = (sd.mailsHeute || 0) + ok.length;
sd.letzterLauf = { zeit: new Date().toISOString(), ok: ok.length, fehler: fail.length, letzterFehler: fail[0] ? fail[0].json.fehler : '' };
return ok.concat(fail.map(f => ({ json: { ...f.json, failed: true } })));
"""

COUNT = r"""
const stats = {}; for (const r of $('Zähler holen').all()) if (r.json && r.json.key) stats[r.json.key] = Number(r.json.anzahl) || 0;
const add = {}; for (const r of $('Ergebnis').all()) if (!r.json.failed) { const k = r.json.mailId + '|sent'; add[k] = (add[k] || 0) + 1; }
return Object.entries(add).map(([key, n]) => ({ json: { key, mail: key.split('|')[0], typ: 'sent', anzahl: (stats[key] || 0) + n } }));
"""

def cond(k, v, c=None):
    d = {"keyName": k, "keyValue": v}
    if c: d["condition"] = c
    return d

def build(provider):
  einst = EINSTELLUNGEN.replace('__MAXMAILS__', '290' if provider == 'brevo' else '100000')
  if provider == 'brevo':
    send = node('An Brevo senden', 'n8n-nodes-base.httpRequest', 4.2, {"method": "POST", "url": "https://api.brevo.com/v3/smtp/email",
        "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth", "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json.body) }}",
        "options": {"batching": {"batch": {"batchSize": 5, "batchInterval": 1100}}}}, 1100, 300,
        credentials={"httpHeaderAuth": {"id": "__BREVO__", "name": "Brevo"}}, onError="continueRegularOutput")
  else:
    send = node('An Amazon SES senden', 'n8n-nodes-base.httpRequest', 4.2, {"method": "POST", "url": "https://email.eu-central-1.amazonaws.com/v2/email/outbound-emails",
        "authentication": "predefinedCredentialType", "nodeCredentialType": "aws", "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json.body) }}",
        "options": {"batching": {"batch": {"batchSize": 10, "batchInterval": 1100}}}}, 1100, 300,
        credentials={"aws": {"id": "__AWS__", "name": "Amazon SES"}}, onError="continueRegularOutput")
  nodes = [
    node('Alle 10 Minuten', 'n8n-nodes-base.scheduleTrigger', 1.2, {"rule": {"interval": [{"field": "minutes", "minutesInterval": 10}]}}, 0, 300),
    code('Einstellungen', einst, 220, 300),
    node('Laufende Leads', 'n8n-nodes-base.dataTable', 1.1, {"operation": "get", "dataTableId": dt('__LEADS__'), "matchType": "allConditions",
        "filters": {"conditions": [cond("status", "={{ $json.status }}"), cond("m1", "-", "neq"), cond("m4", "-"), cond("gekauft", "-")]}, "returnAll": True},
        440, 300, alwaysOutputData=True, executeOnce=True),
    node('Neue Leads', 'n8n-nodes-base.dataTable', 1.1, {"operation": "get", "dataTableId": dt('__LEADS__'), "matchType": "allConditions",
        "filters": {"conditions": [cond("status", "={{ $('Einstellungen').first().json.neuStatus }}"), cond("m1", "-")]},
        "limit": "={{ $('Einstellungen').first().json.neuLimit }}"}, 660, 300, alwaysOutputData=True, executeOnce=True),
    code('Mails bauen', BUILD.replace('__PROVIDER__', provider), 880, 300, executeOnce=True),
    send,
    code('Ergebnis', RESULT, 1320, 300),
    node('Als gesendet markieren', 'n8n-nodes-base.dataTable', 1.1, {"operation": "update", "dataTableId": dt('__LEADS__'),
        "filters": {"conditions": [cond("token", "={{ $json.token }}")]},
        "columns": {"mappingMode": "defineBelow",
                    "value": {f: "={{ $json.field === '%s' ? ($json.failed ? 'fehler' : $now.toISO()) : undefined }}" % f for f in ['m1', 'm2', 'm2b', 'm3', 'm4']},
                    "matchingColumns": [], "schema": schema(['m1', 'm2', 'm2b', 'm3', 'm4'])}}, 1540, 300),
    node('Zähler holen', 'n8n-nodes-base.dataTable', 1.1, {"operation": "get", "dataTableId": dt('__STATS__'), "returnAll": True}, 1760, 300, alwaysOutputData=True, executeOnce=True),
    code('Zählen', COUNT, 1980, 300, executeOnce=True),
    node('Zähler speichern', 'n8n-nodes-base.dataTable', 1.1, {"operation": "upsert", "dataTableId": dt('__STATS__'), "filters": {"conditions": [cond("key", "={{ $json.key }}")]},
        "columns": {"mappingMode": "defineBelow", "value": {"key": "={{ $json.key }}", "mail": "={{ $json.mail }}", "typ": "={{ $json.typ }}", "anzahl": "={{ $json.anzahl }}"}, "matchingColumns": [], "schema": schema(STATCOLS)}}, 2200, 300),
  ]
  chain = [n['name'] for n in nodes]
  conn = {a: {"main": [[{"node": b, "type": "main", "index": 0}]]} for a, b in zip(chain, chain[1:])}
  name = "Outreach | Versand über Brevo" if provider == 'brevo' else "Outreach | Versand über Amazon SES"
  return {"name": name, "nodes": nodes, "connections": conn, "settings": {"executionOrder": "v1", "saveDataSuccessExecution": "all"}}

for prov, fn in [('ses', 'versand.json'), ('brevo', 'versand_brevo.json')]:
  wf = build(prov)
  json.dump(wf, open(os.path.join(D, fn), 'w'), ensure_ascii=False, indent=1)
  print('ok', fn, len(wf['nodes']))
