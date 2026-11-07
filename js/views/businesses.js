import { h, pageHead, badge, notice, toast, withData, rangeText } from '../ui.js';
import { formatGTA, formatDate } from '../format.js';
import { CATEGORY_LABEL } from '../engine/catalog.js';
import { scenarioInput, affordability } from '../engine/calculator.js';
import { splitBalance } from '../engine/finance.js';
import { eventStatus, eventEffectsFor } from '../data.js';

// Disimpan di luar render agar filter dan detail yang terbuka tidak hilang
// saat halaman dirender ulang setelah pemain mencentang sesuatu.
const viewState = { filter: 'semua', open: new Set() };

const FILTERS = [
  { id: 'semua', label: 'Semua' },
  { id: 'terjangkau', label: 'Terjangkau sekarang' },
  { id: 'dimiliki', label: 'Sudah dimiliki' },
];

const SOLO_LABEL = { ya: 'Bisa solo', sebagian: 'Sebagian bisa solo', tidak: 'Butuh pemain lain' };

export function renderBusinesses(ctx) {
  return {
    title: 'Bisnis',
    node: h(
      'div',
      {},
      pageHead('Bisnis', 'Bisnis dan heist yang paling relevan untuk pemula. Centang yang sudah Anda miliki agar kalkulator dan rekomendasi tidak menghitung harga belinya lagi.'),
      withData(ctx, (catalog, events) => buildList(ctx, catalog, events)),
    ),
  };
}

function buildList(ctx, catalog, events) {
  const state = ctx.store.getState();
  const profile = state.profile;
  const investable = profile ? splitBalance(profile.balance, profile.reservePercent).investable : null;
  const evStatus = eventStatus(events.data);

  const head = [];
  if (catalog.source === 'none') {
    return notice('danger', 'Data bisnis gagal dimuat', `Detail: ${catalog.error}. Muat ulang halaman; jika berulang, pastikan website dibuka lewat Live Server.`);
  }
  if (catalog.source === 'cache') {
    head.push(notice('warn', 'Memakai salinan data tersimpan', `Data terbaru gagal dimuat (${catalog.error}). Angka di bawah berasal dari salinan ${formatDate(catalog.fetchedAt)}.`));
  }
  if (catalog.warnings.length) {
    head.push(notice('warn', `${catalog.warnings.length} entri data dilewati karena tidak valid`, ...catalog.warnings));
  }
  if (profile && profile.platform !== 'pc-enhanced') {
    head.push(notice('warn', 'Data dicek untuk PC Enhanced', 'Anda memilih PC Legacy di profil. Sebagian konten mungkin berbeda atau tidak tersedia di versi Legacy.'));
  }

  const rows = catalog.entries.map((entry) => {
    const ownedInfo = state.owned[entry.id] ?? null;
    const main = entry.scenarios[0];
    const input = scenarioInput(entry, main, ownedInfo);
    return { entry, ownedInfo, main, input, afford: affordability(input.investment, investable) };
  });

  const visible = rows.filter((r) => {
    if (viewState.filter === 'dimiliki') return Boolean(r.ownedInfo);
    if (viewState.filter === 'terjangkau') return r.afford.state === 'ok' && !r.ownedInfo;
    return true;
  });

  const filterBar = h(
    'div',
    { class: 'choices filter-bar', role: 'group', 'aria-label': 'Saring daftar bisnis' },
    FILTERS.map((f) =>
      h(
        'button',
        {
          type: 'button',
          class: 'chip',
          'aria-pressed': String(viewState.filter === f.id),
          onclick: () => {
            viewState.filter = f.id;
            ctx.rerender();
          },
        },
        f.label,
        f.id === 'dimiliki' ? ` (${rows.filter((r) => r.ownedInfo).length})` : null,
      ),
    ),
  );

  let emptyText = null;
  if (visible.length === 0) {
    emptyText =
      viewState.filter === 'terjangkau'
        ? profile
          ? `Belum ada bisnis yang modalnya muat di dana investasi Anda (${formatGTA(investable)}).`
          : 'Isi profil pemain dulu agar website tahu dana investasi Anda.'
        : 'Belum ada bisnis yang ditandai dimiliki. Centang "Saya sudah memiliki ini" pada kartu bisnis.';
  }

  return h(
    'div',
    {},
    ...head,
    h(
      'p',
      { class: 'small muted' },
      `Data dicek ${catalog.meta.verifiedAt ? formatDate(catalog.meta.verifiedAt) : '—'}. ${catalog.meta.platformNote}`,
    ),
    filterBar,
    profile ? h('p', { class: 'small muted' }, 'Dana investasi Anda: ', h('strong', { class: 'money' }, formatGTA(investable)), '.') : null,
    emptyText ? h('div', { class: 'panel' }, h('p', {}, emptyText)) : null,
    h('div', { class: 'biz-list' }, visible.map((r) => card(ctx, r, events, evStatus))),
  );
}

function card(ctx, { entry, ownedInfo, main, input, afford }, events, evStatus) {
  const effects = eventEffectsFor(events.data, evStatus, entry.id);
  const recommendedTotal = entry.upgrades.filter((u) => u.recommended).reduce((s, u) => s + u.price, 0);

  const affordBadge = ownedInfo
    ? badge('Dimiliki', 'ok')
    : afford.state === 'ok'
      ? badge('Terjangkau', 'ok')
      : afford.state === 'short'
        ? badge(`Kurang ${formatGTA(afford.shortfall)}`, 'warn')
        : null;

  const details = h(
    'details',
    {
      class: 'biz__details',
      open: viewState.open.has(entry.id),
      ontoggle: (e) => (e.currentTarget.open ? viewState.open.add(entry.id) : viewState.open.delete(entry.id)),
    },
    h('summary', {}, 'Detail, syarat, dan sumber'),
    section('Syarat', entry.requirements),
    entry.upgrades.length ? upgradeList(ctx, entry, ownedInfo) : null,
    h(
      'div',
      { class: 'biz__block' },
      h('h4', { class: 'biz__subtitle' }, 'Skenario pendapatan'),
      h(
        'ul',
        { class: 'upcoming__list' },
        entry.scenarios.map((s) =>
          h(
            'li',
            {},
            h('strong', {}, s.label),
            `: ${rangeText(s.payout.min, s.payout.max, formatGTA)} per ${s.passive ? `${s.cycleMinutes} menit online` : 'siklus'}`,
            s.limit ? ` (${s.limit})` : '',
            s.notes.length ? h('ul', { class: 'biz__notes' }, s.notes.map((n) => h('li', {}, n))) : null,
          ),
        ),
      ),
    ),
    section('Tips', entry.tips),
    section('Perhatian', entry.cautions),
    h(
      'div',
      { class: 'biz__block' },
      h('h4', { class: 'biz__subtitle' }, 'Sumber'),
      h('ul', { class: 'upcoming__list' }, entry.sources.map((s) => h('li', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.title)))),
    ),
  );

  const ownedId = `own-${entry.id}`;
  return h(
    'article',
    { class: 'panel biz', 'aria-labelledby': `t-${entry.id}` },
    h(
      'div',
      { class: 'panel__head' },
      h('h2', { class: 'section-title', id: `t-${entry.id}` }, entry.name),
      h('div', { class: 'badges' }, badge(CATEGORY_LABEL[entry.category]), entry.dataStatus === 'sebagian' ? badge('Data sebagian', 'warn') : null, affordBadge),
    ),
    h('p', {}, entry.summary),
    effects.length ? notice('', 'Event minggu ini', ...effects.map((e) => `${e.label}${e.note ? ` (${e.note})` : ''}`)) : null,
    h(
      'dl',
      { class: 'kv' },
      h('dt', {}, 'Harga beli'),
      h('dd', {}, entry.purchase.price === null ? 'Lihat catatan' : formatGTA(entry.purchase.price)),
      recommendedTotal ? h('dt', {}, 'Upgrade disarankan') : null,
      recommendedTotal ? h('dd', {}, formatGTA(recommendedTotal)) : null,
      h('dt', {}, main.passive ? 'Pendapatan pasif' : 'Pendapatan per siklus'),
      h('dd', { class: 'money' }, rangeText(main.payout.min, main.payout.max, formatGTA), main.passive ? ` / ${main.cycleMinutes} menit` : ''),
      h('dt', {}, 'Bermain'),
      h('dd', {}, SOLO_LABEL[entry.solo]),
    ),
    entry.purchase.note ? h('p', { class: 'small muted biz__note' }, entry.purchase.note) : null,
    h(
      'div',
      { class: 'biz__actions' },
      h(
        'label',
        { class: 'check', for: ownedId },
        h('input', {
          type: 'checkbox',
          id: ownedId,
          checked: Boolean(ownedInfo),
          onchange: (e) => {
            const res = ctx.store.setOwned(entry.id, e.target.checked);
            if (!res.ok) toast(res.error, { tone: 'error' });
            else toast(e.target.checked ? `${entry.name} ditandai dimiliki.` : `${entry.name} dihapus dari aset Anda.`);
          },
        }),
        h('span', {}, 'Saya sudah memiliki ini'),
      ),
      h('a', { class: 'btn btn--ghost', href: `#/kalkulator/${entry.id}` }, 'Hitung di kalkulator'),
    ),
    details,
  );
}

function section(title, items) {
  if (!items.length) return null;
  return h('div', { class: 'biz__block' }, h('h4', { class: 'biz__subtitle' }, title), h('ul', { class: 'upcoming__list' }, items.map((t) => h('li', {}, t))));
}

function upgradeList(ctx, entry, ownedInfo) {
  const owned = new Set(ownedInfo?.upgrades ?? []);
  return h(
    'div',
    { class: 'biz__block' },
    h('h4', { class: 'biz__subtitle' }, 'Upgrade'),
    ownedInfo ? null : h('p', { class: 'small muted' }, 'Tandai bisnis sebagai dimiliki untuk mencatat upgrade yang sudah dipasang.'),
    h(
      'ul',
      { class: 'upgrade-list' },
      entry.upgrades.map((u) => {
        const id = `up-${entry.id}-${u.id}`;
        return h(
          'li',
          {},
          h(
            'label',
            { class: 'check', for: id },
            h('input', {
              type: 'checkbox',
              id,
              checked: owned.has(u.id),
              disabled: !ownedInfo,
              onchange: (e) => {
                const res = ctx.store.setOwnedUpgrade(entry.id, u.id, e.target.checked);
                if (!res.ok) toast(res.error, { tone: 'error' });
              },
            }),
            h('span', {}, h('strong', {}, u.name), ` ${formatGTA(u.price)}`, u.recommended ? ' (disarankan)' : ''),
          ),
          h('p', { class: 'small muted upgrade-list__effect' }, u.effect),
        );
      }),
    ),
  );
}
