// n8n Code-Knoten „Meta: Kauf melden“ (Workflow „Academy | Willkommens-Mail nach Kauf“)
// Baut ein Purchase-Event für die Meta Conversions API (serverseitig, unabhängig von Cookies/Browser).
// Kundendaten werden vor dem Senden mit SHA-256 gehasht, so wie Meta es verlangt.
const kauf = $('Kauf von ablefy (über Worker)').first().json.body || {};
const PRODUKTE = { '538088': 197 };          // echtes Produkt → Wert in €
const TEST = { '538091': true };              // Testprodukt → geht nur in „Events testen“
const produkt = String(kauf.product || '');
if (!PRODUKTE[produkt] && !TEST[produkt]) return [];
const email = String(kauf.email || '').trim().toLowerCase();
if (!email) return [];

function sha256(str) {
  const b = unescape(encodeURIComponent(str)), K = [], H = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
  const rot = (x, n) => (x >>> n) | (x << (32 - n));
  for (let i = 0, p = 2; i < 64; p++) { let ok = true; for (let d = 2; d * d <= p; d++) if (p % d === 0) { ok = false; break; } if (ok) K[i++] = (Math.pow(p, 1 / 3) % 1) * 4294967296 | 0; }
  const w = [], l = b.length * 8; let m = [];
  for (let i = 0; i < b.length; i++) m[i >> 2] |= b.charCodeAt(i) << (24 - (i % 4) * 8);
  m[l >> 5] |= 0x80 << (24 - l % 32); m[(((l + 64) >> 9) << 4) + 15] = l;
  for (let j = 0; j < m.length; j += 16) {
    let [a, bb, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      if (i < 16) w[i] = m[j + i] | 0;
      else w[i] = (rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10)) + w[i - 7] + (rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3)) + w[i - 16] | 0;
      const t1 = h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i] | 0;
      const t2 = (rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c)) | 0;
      h = g; g = f; f = e; e = d + t1 | 0; d = c; c = bb; bb = a; a = t1 + t2 | 0;
    }
    H[0] = H[0] + a | 0; H[1] = H[1] + bb | 0; H[2] = H[2] + c | 0; H[3] = H[3] + d | 0; H[4] = H[4] + e | 0; H[5] = H[5] + f | 0; H[6] = H[6] + g | 0; H[7] = H[7] + h | 0;
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

const teile = String(kauf.name || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
const user_data = { em: [sha256(email)], country: [sha256('de')] };
if (teile[0]) user_data.fn = [sha256(teile[0])];
if (teile.length > 1) user_data.ln = [sha256(teile[teile.length - 1])];

const body = {
  data: [{
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: 'ablefy-' + String(kauf.order || email),
    action_source: 'website',
    event_source_url: 'https://faceless.adrian-lewu.de/',
    user_data,
    custom_data: { currency: 'EUR', value: PRODUKTE[produkt] || 197, content_name: 'Faceless Pages mit KI', content_ids: [produkt], content_type: 'product' },
  }],
};
if (TEST[produkt]) body.test_event_code = 'TEST' + '24117';
return [{ json: { body } }];
