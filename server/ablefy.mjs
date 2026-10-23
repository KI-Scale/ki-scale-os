// Verarbeitet den ablefy-Webhook: jeder Kauf und jede Erstattung landet in der Tabelle „sales“.
import crypto from 'node:crypto';

const PRODUCTS = ['538088', '538091'];
function flat(obj, prefix = '', out = {}) {
  if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) flat(v, prefix ? `${prefix}.${k}` : k, out);
  else out[prefix] = obj == null ? '' : String(obj);
  return out;
}
function pick(f, keys) {
  for (const k of Object.keys(f)) {
    const lk = k.toLowerCase().replace(/\[|\]/g, '.').replace(/\.+/g, '.').replace(/\.$/, '');
    if (keys.some(x => lk === x || lk.endsWith('.' + x)) && f[k]) return f[k];
  }
  return '';
}
const num = s => { s = String(s || '').replace(/[^\d,.-]/g, ''); if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); return parseFloat(s) || 0; };

export function handleAblefy(store, raw) {
  let data = {};
  try { data = JSON.parse(raw); } catch { for (const [k, v] of new URLSearchParams(raw)) data[k] = v; }
  const f = flat(data);
  const hit = Object.values(f).find(v => PRODUCTS.includes(String(v).trim()));
  if (!hit) return 'nicht unser Produkt';
  const event = (pick(f, ['event', 'type', 'action']) + ' ' + pick(f, ['payment_state', 'state', 'status', 'payment.state'])).toLowerCase();
  const isRefund = /refund|chargeback|storn|cancel|revoke/.test(event);
  const email = pick(f, ['payer.email', 'payer_email', 'email', 'buyer.email', 'customer.email']).trim().toLowerCase();
  const order = pick(f, ['order_id', 'order.id', 'payment_id', 'payment.id', 'transaction_id']) || crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
  const amount = num(pick(f, ['amount', 'payment.amount', 'gross', 'amount_gross', 'total', 'price', 'payment.total'])) || (hit === '538088' ? 197 : 5);
  const camp = Object.values(f).find(v => /^lp_[a-e]$/.test(String(v)));
  const variant = camp ? camp.slice(3) : '';
  const isTest = /test/.test(event) || hit === '538091';
  const id = String(order);
  if (isRefund) {
    store.db.prepare('UPDATE sales SET refunded = 1 WHERE id = ? OR (email = ? AND product = ?)').run(id, email, hit);
    return 'Erstattung vermerkt';
  }
  store.db.prepare('INSERT INTO sales (id, ts, email, product, amount, variant, refunded, raw) VALUES (?,?,?,?,?,?,0,?) ON CONFLICT(id) DO NOTHING')
    .run(id, Date.now(), email, isTest ? '538091' : hit, amount, variant, raw.slice(0, 4000));
  return 'Kauf vermerkt' + (variant ? ' (Seite ' + variant.toUpperCase() + ')' : '');
}
