// Pemformatan angka dan tanggal. Fungsi murni, bisa diuji tanpa browser.

const intFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Format uang seperti di dalam game: GTA$1,250,000 */
export function formatGTA(value) {
  const n = Math.round(Number(value) || 0);
  const sign = n < 0 ? '-' : '';
  return `${sign}GTA$${intFormat.format(Math.abs(n))}`;
}

/** Format bilangan bulat dengan pemisah ribuan koma (gaya game). */
export function formatInt(value) {
  return intFormat.format(Math.round(Number(value) || 0));
}

/** Kunci tanggal lokal YYYY-MM-DD (bukan UTC, agar sesuai hari pemain). */
export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return Number.isFinite(value) ? new Date(value) : null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t) : null;
}

const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "7 November 2026" */
export function formatDate(value) {
  const d = toDate(value);
  return d ? dateFormat.format(d) : '—';
}

const shortDateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

/** "7 Nov 2026" — untuk tabel di layar sempit */
export function formatDateShort(value) {
  const d = toDate(value);
  return d ? shortDateFormat.format(d) : '—';
}

/** "7 November 2026 pukul 12.58" */
export function formatDateTime(value) {
  const d = toDate(value);
  return d ? dateTimeFormat.format(d) : '—';
}

/** Mengubah teks input uang ("1,250,000" / "1.250.000" / "GTA$ 500000") menjadi bilangan bulat. */
export function parseMoneyInput(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : NaN;
  if (typeof text !== 'string') return NaN;
  const cleaned = text.replace(/gta\$?/gi, '').replace(/[\s,.]/g, '');
  if (cleaned === '' || !/^\d+$/.test(cleaned)) return NaN;
  return Number(cleaned);
}
