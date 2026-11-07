import { h, pageHead, badge } from '../ui.js';
import { formatGTA, formatDate, formatDateShort, formatInt } from '../format.js';
import { splitBalance, historyWithDelta } from '../engine/finance.js';
import { OPTIONS } from '../store.js';
import { eventStatus, EVENT_STATE_LABEL } from '../data.js';
import { recommendationSection } from './recommendation.js';

export function renderDashboard(ctx) {
  const state = ctx.store.getState();
  if (!state.profile) return { title: 'Mulai', node: welcome(ctx) };

  const p = state.profile;
  const split = splitBalance(p.balance, p.reservePercent);

  return {
    title: 'Dashboard',
    node: h(
      'div',
      { class: 'stack' },
      pageHead(
        p.name ? `Halo, ${p.name}` : 'Dashboard',
        `Ringkasan akun dari profil yang terakhir disimpan${p.updatedAt ? ` pada ${formatDate(p.updatedAt)}` : ''}.`,
      ),
      recommendationSection(ctx),
      balancePanel(ctx, split),
      h('div', { class: 'grid-2' }, profilePanel(p), dataStatusPanel(ctx, state)),
      historyPanel(state.balanceHistory),
    ),
  };
}

function welcome(ctx) {
  return h(
    'div',
    {},
    h(
      'section',
      { class: 'intro' },
      h('h1', { class: 'intro__title', tabindex: '-1', 'data-page-title': true }, 'Tahu apa yang dibeli berikutnya.'),
      h(
        'p',
        { class: 'intro__lead' },
        'Isi kondisi akun GTA Online Anda sekali. Business Coach memakainya untuk menghitung dana yang aman dibelanjakan, lalu memilih satu langkah berikutnya yang paling menguntungkan.',
      ),
      h('div', { class: 'btn-row' }, h('a', { class: 'btn btn--primary', href: '#/profil' }, 'Isi profil pemain')),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', { class: 'section-title' }, 'Cara memulai'),
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, 'Isi saldo GTA$, rank, dan kebiasaan bermain Anda di halaman Profil pemain.'),
        h('li', {}, 'Lihat berapa dana yang disisihkan sebagai cadangan dan berapa yang aman untuk investasi.'),
        h('li', {}, 'Unduh cadangan data secara berkala, karena progres hanya tersimpan di browser ini.'),
      ),
    ),
  );
}

function balancePanel(ctx, split) {
  const reserveWidth = split.balance > 0 ? (split.reserve / split.balance) * 100 : 0;
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'balance-title' },
    h(
      'div',
      { class: 'panel__head' },
      h('h2', { class: 'section-title', id: 'balance-title' }, 'Saldo GTA$'),
      h('a', { href: '#/profil', class: 'small' }, 'Perbarui saldo'),
    ),
    h('p', { class: 'figure money' }, formatGTA(split.balance)),
    h(
      'div',
      { class: 'split' },
      h(
        'div',
        { class: 'split__bar', role: 'img', 'aria-label': `Cadangan ${split.reservePercent}%, dana investasi ${100 - split.reservePercent}%` },
        h('span', { class: 'split__reserve', style: { width: `${reserveWidth}%` } }),
        h('span', { class: 'split__invest', style: { flex: '1' } }),
      ),
      h(
        'div',
        { class: 'split__legend' },
        h(
          'div',
          { class: 'split__item' },
          h('span', { class: 'swatch swatch--reserve', 'aria-hidden': 'true' }),
          h(
            'div',
            {},
            h('div', {}, h('strong', {}, formatGTA(split.reserve)), ` dana cadangan (${split.reservePercent}%)`),
            h('div', { class: 'small muted' }, 'Disisihkan untuk biaya suplai dan kebutuhan mendadak.'),
          ),
        ),
        h(
          'div',
          { class: 'split__item' },
          h('span', { class: 'swatch swatch--invest', 'aria-hidden': 'true' }),
          h(
            'div',
            {},
            h('div', {}, h('strong', { class: 'money' }, formatGTA(split.investable)), ' dana investasi'),
            h('div', { class: 'small muted' }, 'Batas aman untuk membeli bisnis, properti, atau upgrade.'),
          ),
        ),
      ),
    ),
  );
}

function profilePanel(p) {
  const gtaPlusNote = p.gtaPlus === 'yes' ? '' : ' (bonus khusus GTA+ tidak dihitung)';
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'profile-title' },
    h('div', { class: 'panel__head' }, h('h2', { class: 'section-title', id: 'profile-title' }, 'Profil bermain'), h('a', { href: '#/profil', class: 'small' }, 'Ubah')),
    h(
      'dl',
      { class: 'kv' },
      h('dt', {}, 'Rank'),
      h('dd', {}, formatInt(p.rank)),
      h('dt', {}, 'Versi game'),
      h('dd', {}, OPTIONS.platform[p.platform]),
      h('dt', {}, 'GTA+'),
      h('dd', {}, OPTIONS.gtaPlus[p.gtaPlus] + gtaPlusNote),
      h('dt', {}, 'Waktu bermain'),
      h('dd', {}, `${p.sessionsPerWeek} sesi × ${p.sessionMinutes} menit per minggu`),
      h('dt', {}, 'Gaya bermain'),
      h('dd', {}, OPTIONS.playstyle[p.playstyle]),
    ),
  );
}

function dataStatusPanel(ctx, state) {
  const eventSlot = h('dd', {}, badge('Memeriksa…'));
  ctx.getEvents().then((result) => {
    const status = eventStatus(result.data);
    const label = EVENT_STATE_LABEL[status.state];
    const parts = [badge(label.text, label.tone)];
    if (result.source === 'cache') parts.push(' ', h('span', { class: 'small muted' }, 'salinan tersimpan'));
    if (result.source === 'none') parts.push(' ', h('span', { class: 'small muted' }, 'gagal dimuat'));
    eventSlot.replaceChildren(...parts);
  });

  const lastExport = state.meta.lastExportAt;
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'status-title' },
    h('h2', { class: 'section-title', id: 'status-title' }, 'Status data'),
    h(
      'dl',
      { class: 'kv' },
      h('dt', {}, h('a', { href: '#/event' }, 'Event mingguan')),
      eventSlot,
      h('dt', {}, h('a', { href: '#/bisnis' }, 'Bisnis dimiliki')),
      h('dd', {}, `${Object.keys(state.owned).length} bisnis`),
      h('dt', {}, h('a', { href: '#/pengaturan' }, 'Cadangan terakhir')),
      h('dd', {}, lastExport ? formatDate(lastExport) : badge('Belum pernah', 'warn')),
    ),
  );
}

function historyPanel(history) {
  const rows = historyWithDelta(history).slice(0, 10);
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'history-title' },
    h('h2', { class: 'section-title', id: 'history-title' }, 'Riwayat saldo'),
    h('p', { class: 'small muted' }, 'Satu catatan per hari, diperbarui setiap kali Anda menyimpan profil. Menampilkan 10 catatan terakhir.'),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Tanggal'), h('th', { scope: 'col', class: 'num' }, 'Saldo'), h('th', { scope: 'col', class: 'num' }, 'Perubahan'))),
        h(
          'tbody',
          {},
          rows.map((r) =>
            h(
              'tr',
              {},
              h('td', {}, formatDateShort(r.date)),
              h('td', { class: 'num money' }, formatGTA(r.balance)),
              h('td', { class: `num ${r.delta > 0 ? 'delta-up' : r.delta < 0 ? 'delta-down' : 'muted'}` }, r.delta == null ? '—' : (r.delta > 0 ? '+' : '') + formatGTA(r.delta)),
            ),
          ),
        ),
      ),
    ),
  );
}
