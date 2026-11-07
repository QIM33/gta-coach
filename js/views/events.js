import { h, pageHead, badge, toast, notice } from '../ui.js';
import { formatDate, formatDateTime, formatGTA } from '../format.js';
import { eventStatus, EVENT_STATE_LABEL } from '../data.js';
import { APP } from '../config.js';

const STATE_TEXT = {
  none: 'Belum ada data event yang diverifikasi. Pengisian data event mingguan dimulai di Fase 1.',
  invalid: 'File data event rusak atau tanggalnya tidak masuk akal, jadi tidak dipakai.',
  draft: 'Data minggu ini sudah diambil, tetapi belum diverifikasi. Bonusnya belum dipakai dalam perhitungan.',
  upcoming: 'Data sudah diverifikasi, tetapi minggu event-nya belum dimulai.',
  active: 'Data sudah diverifikasi dan sedang berlaku. Bonus di bawah dipakai dalam perhitungan.',
  expired: 'Event minggu ini sudah berakhir dan data minggu baru belum diverifikasi. Bonus lama tidak dipakai.',
};

export function renderEvents(ctx) {
  const statusBody = h('div', {}, h('p', { class: 'muted' }, 'Memuat data event…'));
  const itemsSlot = h('div');

  async function load(force) {
    const result = await ctx.getEvents(force);
    const status = eventStatus(result.data);
    const label = EVENT_STATE_LABEL[status.state];

    const sourceLine =
      result.source === 'network'
        ? `Dimuat dari server pada ${formatDateTime(result.fetchedAt)}.`
        : result.source === 'cache'
          ? `Gagal memuat data terbaru (${result.error}). Menampilkan salinan tersimpan dari ${formatDateTime(result.fetchedAt)}, mungkin tidak terkini.`
          : `Gagal memuat data (${result.error}) dan belum ada salinan tersimpan.`;

    const d = result.data ?? {};
    statusBody.replaceChildren(
      h('div', { class: 'panel__head' }, h('h2', { class: 'section-title', id: 'ev-status' }, 'Status data'), badge(label.text, label.tone)),
      h('p', {}, STATE_TEXT[status.state]),
      status.start ? h('p', {}, `Periode: ${formatDateTime(status.start)} sampai reset ${formatDateTime(status.end)} (waktu perangkat Anda).`) : null,
      d.verifiedAt ? h('p', {}, `Diverifikasi: ${formatDateTime(d.verifiedAt)}.`) : null,
      d.timeNote ? h('p', { class: 'small muted' }, d.timeNote) : null,
      d.sourceLevel === 'secondary'
        ? notice('warn', 'Diverifikasi dari sumber sekunder', d.verificationNote || 'Data belum dicek langsung ke Rockstar Newswire.')
        : null,
      Array.isArray(d.sources) && d.sources.length
        ? h('div', {}, h('p', { class: 'small' }, 'Sumber:'), h('ul', { class: 'upcoming__list small' }, d.sources.map((src) => h('li', {}, h('a', { href: src.url, target: '_blank', rel: 'noopener noreferrer' }, src.title)))))
        : null,
      h('p', { class: `small ${result.source === 'network' ? 'muted' : ''}` }, sourceLine),
      h(
        'div',
        { class: 'btn-row' },
        h(
          'button',
          {
            class: 'btn btn--ghost',
            type: 'button',
            onclick: async () => {
              await load(true);
              toast('Data event dimuat ulang.');
            },
          },
          'Muat ulang data',
        ),
        h('a', { class: 'btn btn--ghost', href: APP.newswireUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Buka Rockstar Newswire'),
      ),
    );

    itemsSlot.replaceChildren(...(Array.isArray(d.items) && d.items.length && status.state !== 'invalid' ? [itemsPanel(d, status)] : []));
  }

  load(false);

  return {
    title: 'Event mingguan',
    node: h(
      'div',
      {},
      pageHead('Event mingguan', 'Bonus GTA$ dan RP, diskon, serta aktivitas unggulan dari Rockstar Newswire. Hanya data yang sudah diverifikasi dan masih berlaku yang dipakai untuk rekomendasi.'),
      h('section', { class: 'panel', 'aria-labelledby': 'ev-status' }, statusBody),
      itemsSlot,
    ),
  };
}

function describeItem(item) {
  const name = item.label || item.target || 'Aktivitas';
  switch (item.type) {
    case 'multiplier':
      return `${item.value}x ${item.note || 'GTA$ dan RP'}: ${name}`;
    case 'discount':
      return `Diskon ${item.percent}%: ${name}`;
    case 'free':
      return `Gratis: ${name}`;
    case 'first-completion':
      return `${item.value}x ${name}`;
    case 'challenge':
      return item.reward ? `${name} (hadiah ${formatGTA(item.reward)})` : name;
    case 'guaranteed-target':
      return item.note ? `${name}. ${item.note}` : name;
    default:
      return item.text || name;
  }
}

function itemsPanel(data, status) {
  const usable = status.state === 'active';
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'ev-items' },
    h('div', { class: 'panel__head' }, h('h2', { class: 'section-title', id: 'ev-items' }, 'Isi event'), usable ? null : badge('Tidak dipakai dalam perhitungan', 'warn')),
    data.week?.startsAt ? h('p', { class: 'small muted' }, `Minggu ${formatDate(data.week.startsAt)} sampai reset ${formatDate(data.week.endsAt)}`) : null,
    ...groupItems(data.items).map(([title, items]) =>
      h('div', { class: 'biz__block' }, h('h3', { class: 'biz__subtitle' }, title), h('ul', { class: 'upcoming__list' }, items.map((item) => h('li', {}, describeItem(item))))),
    ),
  );
}

const GROUPS = [
  ['Bonus GTA$ dan RP', ['multiplier', 'first-completion']],
  ['Heist', ['guaranteed-target']],
  ['Diskon', ['discount', 'free']],
  ['Tantangan dan hadiah', ['challenge', 'reward', 'podium']],
];

function groupItems(items) {
  const known = new Set(GROUPS.flatMap(([, types]) => types));
  const groups = GROUPS.map(([title, types]) => [title, items.filter((i) => types.includes(i.type))]);
  groups.push(['Lainnya', items.filter((i) => !known.has(i.type))]);
  return groups.filter(([, list]) => list.length);
}
