// Alat bantu antarmuka: pembuat elemen, toast, dan dialog konfirmasi.
// Semua teks dimasukkan lewat textContent (tidak lewat innerHTML) agar
// isian pemain atau file impor tidak bisa menyisipkan kode.

/**
 * h('p', { class: 'muted' }, 'teks', anakLain)
 * Atribut on* menjadi event listener; true menjadi atribut kosong; null/false diabaikan.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') el.value = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
}

/** Kepala halaman standar. Judul diberi tabindex agar fokus pindah ke sana saat ganti halaman. */
export function pageHead(title, lead) {
  return h(
    'header',
    { class: 'page-head' },
    h('h1', { class: 'page-title', tabindex: '-1', 'data-page-title': true }, title),
    lead ? h('p', { class: 'page-lead' }, lead) : null,
  );
}

export function badge(text, tone = 'neutral') {
  const cls = { ok: 'badge badge--ok', warn: 'badge badge--warn', danger: 'badge badge--danger' }[tone] || 'badge';
  return h('span', { class: cls }, text);
}

export function notice(tone, title, ...body) {
  const cls = { warn: 'notice notice--warn', danger: 'notice notice--danger' }[tone] || 'notice';
  return h(
    'div',
    { class: cls, role: tone === 'danger' ? 'alert' : null },
    title ? h('p', { class: 'notice__title' }, title) : null,
    ...body.map((b) => (typeof b === 'string' ? h('p', {}, b) : b)),
  );
}

let toastRoot = null;

export function toast(message, { tone = 'ok', duration = 3200 } = {}) {
  toastRoot ||= document.getElementById('toasts');
  if (!toastRoot) return;
  if (tone !== 'error') toastRoot.querySelectorAll('.toast--error').forEach((t) => t.remove());
  const el = h('div', { class: tone === 'error' ? 'toast toast--error' : 'toast' }, message);
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), tone === 'error' ? duration * 1.6 : duration);
}

/**
 * Dialog konfirmasi berbasis <dialog>. Mengembalikan Promise<boolean>.
 * message boleh berupa string atau array paragraf.
 */
export function confirmDialog({ title, message, confirmLabel = 'Lanjutkan', danger = false }) {
  const dialog = document.getElementById('confirm-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') {
    return Promise.resolve(window.confirm(`${title}\n\n${[].concat(message).join('\n')}`));
  }
  dialog.querySelector('#confirm-title').textContent = title;
  const body = dialog.querySelector('#confirm-message');
  body.replaceChildren(...[].concat(message).map((m) => h('p', {}, m)));
  const ok = dialog.querySelector('#confirm-ok');
  ok.textContent = confirmLabel;
  ok.className = danger ? 'btn btn--danger-solid' : 'btn btn--primary';

  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.returnValue = 'cancel';
    dialog.showModal();
    dialog.querySelector('button[value="cancel"]').focus();
  });
}

/**
 * Merender bagian halaman yang butuh data katalog dan event.
 * Jika data sudah dimuat, langsung dirender (tanpa kedipan atau lompatan scroll);
 * jika belum, tampilkan teks memuat lalu ganti setelah data tiba.
 */
export function withData(ctx, build) {
  const catalog = ctx.peekCatalog();
  const events = ctx.peekEvents();
  if (catalog && events) return build(catalog, events);
  const slot = h('div', {}, h('p', { class: 'muted' }, 'Memuat data…'));
  Promise.all([ctx.getCatalog(), ctx.getEvents()]).then(([c, e]) => slot.replaceWith(build(c, e)));
  return slot;
}

/** "GTA$100" / "GTA$100 – GTA$200" / "hingga GTA$200" untuk rentang angka. */
export function rangeText(min, max, fmt) {
  if (min == null && max == null) return '—';
  if (min == null) return `hingga ${fmt(max)}`;
  if (max == null || min === max) return fmt(min);
  return `${fmt(min)} – ${fmt(max)}`;
}
