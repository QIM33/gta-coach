import { h, pageHead, notice, withData, rangeText } from '../ui.js';
import { formatGTA } from '../format.js';
import { recommend } from '../engine/recommend.js';
import { planSession, PLANNER_ESTIMATES } from '../engine/planner.js';
import { eventStatus } from '../data.js';

const PRESETS = [30, 60, 90, 120, 180, 240];
const viewState = { minutes: null };

const KIND_LABEL = {
  buy: 'Beli',
  resupply: 'Suplai',
  event: 'Event',
  run: 'Aktivitas',
  sell: 'Jual',
  wait: 'Waktu luang',
  wrap: 'Penutup',
};

export function renderPlan(ctx) {
  const state = ctx.store.getState();
  if (!state.profile) {
    return {
      title: 'Rencana sesi',
      node: h('div', {}, pageHead('Rencana sesi', 'Susunan aktivitas untuk satu sesi bermain.'), notice('', 'Isi profil dulu', h('p', {}, 'Rencana disusun dari saldo dan aset Anda. ', h('a', { href: '#/profil' }, 'Isi profil pemain'), '.'))),
    };
  }
  if (viewState.minutes == null) viewState.minutes = state.profile.sessionMinutes;

  return {
    title: 'Rencana sesi',
    node: h(
      'div',
      {},
      pageHead('Rencana sesi', 'Urutan aktivitas untuk satu sesi bermain, disusun dari aset Anda, rekomendasi utama, dan event yang sedang berlaku.'),
      withData(ctx, (catalog, events) => build(ctx, state, catalog, events)),
    ),
  };
}

function build(ctx, state, catalog, events) {
  const evs = { data: events.data, status: eventStatus(events.data) };
  const rec = recommend({ profile: state.profile, owned: state.owned, catalog: catalog.entries, events: evs });
  const result = planSession({ profile: state.profile, owned: state.owned, catalog: catalog.entries, events: evs, minutes: viewState.minutes, nba: rec.nba });

  const custom = h('input', {
    class: 'input input--short',
    id: 'plan-minutes',
    type: 'number',
    inputmode: 'numeric',
    min: 15,
    max: 720,
    step: 5,
    value: viewState.minutes,
    onchange: (e) => {
      const v = Math.round(Number(e.target.value));
      if (Number.isFinite(v) && v >= 15 && v <= 720) {
        viewState.minutes = v;
        ctx.rerender();
      }
    },
  });

  const picker = h(
    'div',
    { class: 'panel' },
    h('h2', { class: 'section-title' }, 'Berapa lama Anda bermain?'),
    h(
      'div',
      { class: 'choices', role: 'group', 'aria-label': 'Pilih durasi sesi' },
      PRESETS.map((m) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip',
            'aria-pressed': String(viewState.minutes === m),
            onclick: () => {
              viewState.minutes = m;
              ctx.rerender();
            },
          },
          m < 60 ? `${m} menit` : `${String(m / 60).replace('.', ',')} jam`,
        ),
      ),
    ),
    h('div', { class: 'field field--inline' }, h('label', { class: 'field__label', for: 'plan-minutes' }, 'Atau isi sendiri (menit)'), custom),
  );

  const summary = h(
    'section',
    { class: 'panel', 'aria-labelledby': 'plan-sum' },
    h('h2', { class: 'section-title', id: 'plan-sum' }, 'Ringkasan'),
    h(
      'dl',
      { class: 'kv' },
      h('dt', {}, 'Perkiraan pendapatan bersih'),
      h('dd', { class: result.earn ? 'money' : 'muted' }, result.earn ? rangeText(result.earn.min, result.earn.max, formatGTA) : 'Belum ada yang terhitung'),
      h('dt', {}, 'Waktu terpakai'),
      h('dd', {}, `${result.used} dari ${result.total} menit`),
    ),
    rec.nba?.kind === 'save'
      ? h(
          'div',
          { class: 'biz__block' },
          h('h3', { class: 'biz__subtitle' }, 'Target sesi ini'),
          h('p', {}, rec.nba.title, '.'),
          rec.nba.requirements.length
            ? h('div', {}, h('p', { class: 'small muted' }, 'Sambil mengumpulkan dana, selesaikan syaratnya:'), h('ul', { class: 'upcoming__list small' }, rec.nba.requirements.map((t) => h('li', {}, t))))
            : null,
        )
      : null,
    events.data && evs.status.state !== 'active' ? h('p', { class: 'small muted' }, 'Tanpa bonus event: data event minggu ini belum terverifikasi atau sudah kedaluwarsa.') : null,
  );

  const timeline = h(
    'ol',
    { class: 'timeline' },
    result.steps.map((s) =>
      h(
        'li',
        { class: `timeline__item timeline__item--${s.kind}` },
        h('span', { class: 'timeline__time' }, `${s.start}–${s.end} mnt`),
        h(
          'div',
          { class: 'timeline__body' },
          h('span', { class: 'timeline__kind' }, KIND_LABEL[s.kind] ?? ''),
          h('p', { class: 'timeline__title' }, s.title),
          s.detail ? h('p', { class: 'small muted' }, s.detail) : null,
          s.cost ? h('p', { class: 'small' }, `Biaya ${formatGTA(s.cost)}`) : null,
          s.earn ? h('p', { class: 'small money' }, `Laba ${rangeText(s.earn.min, s.earn.max, formatGTA)}`) : null,
          s.estimated ? h('p', { class: 'small field__tag' }, 'Durasi perkiraan') : null,
        ),
      ),
    ),
  );

  return h(
    'div',
    { class: 'stack' },
    picker,
    summary,
    h('section', { class: 'panel', 'aria-labelledby': 'plan-steps' }, h('h2', { class: 'section-title', id: 'plan-steps' }, 'Urutan langkah'), timeline),
    result.notes.length ? notice('warn', 'Catatan', ...result.notes) : null,
    h(
      'details',
      { class: 'panel how' },
      h('summary', {}, 'Cara rencana disusun'),
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, 'Pembelian dari Langkah berikutnya di dashboard, jika saldo cukup.'),
        h('li', {}, 'Isi suplai bisnis produksi di awal, agar produksi berjalan selama sesi.'),
        h('li', {}, 'Aktivitas dengan bonus event pada aset Anda.'),
        h('li', {}, 'Aktivitas dengan GTA$ per jam tertinggi, mengikuti jeda dan batas mingguan.'),
        h('li', {}, 'Jual stok produksi yang penuh sebelum sesi berakhir.'),
      ),
      h(
        'p',
        { class: 'small muted' },
        `Durasi administratif adalah perkiraan: membeli properti ${PLANNER_ESTIMATES.buyMinutes} menit, membeli suplai ${PLANNER_ESTIMATES.resupplyMinutes} menit, mencatat saldo ${PLANNER_ESTIMATES.wrapUpMinutes} menit. Pendapatan memakai data dan asumsi yang sama dengan kalkulator.`,
      ),
    ),
  );
}
