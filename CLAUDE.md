# KI-Scale Business OS

Adrian Lewus zentrale Software (Cockpit, Vertrieb, Meta Ads, Creatives, Outreach, Finanzen, Affiliates, Kunden, Aufgaben, Berater, Wochen-Review, Second Brain).

- Läuft auf Adrians Hetzner-Server (178.105.84.107) unter `/opt/ki-scale-os`, Daten in `/var/lib/ki-scale-os/os.sqlite`.
- **Auto-Update:** Der Server holt jede Minute `origin/main` und startet neu. Alles, was auf `main` gepusht wird, ist ~1 Minute später live. Darum vor jedem Push lokal testen (`node server/index.mjs`, Seite laden, keine JS-Fehler).
- Keine npm-Abhängigkeiten. Node ≥ 22.13 (eingebautes `node:sqlite`).
- Keine Geheimnisse und keine Kundendaten ins Repo (Repo kann öffentlich sein). Schlüssel trägt Adrian unter `/einstellungen` ein; sie liegen nur in der SQLite-Tabelle `settings`.
- Daten-API: `GET/PUT/DELETE /api/coll/<sammlung>/<id>`, Änderungen per `GET /api/changes?since=<ms>`. Sammlungen: tasks, buchungen, partner, kunden, outreach, wissen, reviews, links, kpi (meta, close, calendly, ablefy, lp), app (streak).
- Live-Abruf alle 15 Min.: `server/sync.mjs` (Close, Meta, Calendly). ablefy-Webhook: `/api/webhooks/ablefy/<token>`. Seiten-Test-Messpunkt der Verkaufsseiten: `/api/t?v=a|b|c&e=view|click`.
- Design: KI-Scale-Branding (Logo C, Cormorant Garamond + Figtree, metallisches Grün #7ed957 auf #070908). Sprache Deutsch, Du-Form.
