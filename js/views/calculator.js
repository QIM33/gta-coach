import { h, pageHead, badge, notice, withData, rangeText } from '../ui.js';
import { formatGTA, formatInt, parseMoneyInput } from '../format.js';
import { scenarioInput, calculate, affordability } from '../engine/calculator.js';
import { splitBalance } from '../engine/finance.js';
import { eventStatus, eventEffectsFor, eventMultiplierFor } from '../data.js';

const CUSTOM = 'isi-sendiri';

// Pilihan terakhir diingat selama sesi agar tidak hilang saat halaman dirender ulang.
const calcState = { entryId: null, scenarioId: null };

const FIELDS = [
  { key: 'investment', label: 'Modal investasi', money: true, hint: 'Harga beli + upgrade yang belum dimiliki.' },
  { key: 'payoutMin', label: 'Pendapatan per siklus (terendah)', money: true, optional: true },
  { key: 'payoutMax', label: 'Pendapatan per siklus (tertinggi)', money: true },
  { key: 'costPerCycle', label: 'Biaya per siklus', money: true, hint: 'Suplai, biaya setup, atau biaya lain setiap siklus.' },
  { key: 'activeMin', label: 'Waktu aktif per siklus, tercepat (menit)', optional: true },
  { key: 'activeMax', label: 'Waktu aktif per siklus, terlama (menit)', optional: true },
  { key: 'productionMinutes', label: 'Waktu produksi sampai penuh (menit)', optional: true, hint: 'Khusus bisnis produksi. Berjalan selama Anda online.' },
  { key: 'cycleMinutes', label: 'Lama satu siklus pasif (menit)', optional: true, hint: 'Khusus pendapatan pasif berkala.' },
  { key: 'multiplier', label: 'Pengali event', hint: 'Isi 2 jika ada bonus 2X untuk aktivitas ini.' },
];

export function renderCalculator(ctx, param) {
  return {
    title: 'Kalkulator profit',
    node: h(
      'div',
      {},
      pageHead('Kalkulator profit', 'Hitung laba per siklus, GTA$ per jam, dan berapa lama modal kembali. Semua hasil berupa rentang perkiraan, bukan angka pasti.'),
      withData(ctx, (catalog, events) => build(ctx, param, catalog, events)),
    ),
  };
}

function build(ctx, param, catalog, events) {
  if (catalog.source === 'none') {
    return notice('danger', 'Data bisnis gagal dimuat', `Detail: ${catalog.error}. Anda masih bisa memakai mode "Isi sendiri".`);
  }
  const entries = catalog.entries;
  if (param && (entries.some((e) => e.id === param) || param === CUSTOM)) {
    if (calcState.entryId !== param) calcState.scenarioId = null;
    calcState.entryId = param;
  }
  if (!calcState.entryId) calcState.entryId = entries[0]?.id ?? CUSTOM;

  const state = ctx.store.getState();
  const profile = state.profile;
  const investable = profile ? splitBalance(profile.balance, profile.reservePercent).investable : null;
  const evStatus = eventStatus(events.data);

  const entry = entries.find((e) => e.id === calcState.entryId) ?? null;
  const scenario = entry ? (entry.scenarios.find((s) => s.id === calcState.scenarioId) ?? entry.scenarios[0]) : null;
  if (scenario) calcState.scenarioId = scenario.id;

  const ownedInfo = entry ? (state.owned[entry.id] ?? null) : null;
  const eventMult = entry ? eventMultiplierFor(events.data, evStatus, entry.id) : 1;
  const base = entry
    ? scenarioInput(entry, scenario, ownedInfo, eventMult)
    : { investment: null, payoutMin: null, payoutMax: null, costPerCycle: 0, costKnown: true, activeMin: null, activeMax: null, productionMinutes: null, cycleMinutes: null, multiplier: 1, investmentParts: null };

  // ----- pemilihan bisnis dan skenario -----
  const entrySelect = h(
    'select',
    {
      class: 'select',
      id: 'c-entry',
      onchange: (e) => {
        calcState.scenarioId = null;
        ctx.router.go('kalkulator', e.target.value);
      },
    },
    entries.map((e) => h('option', { value: e.id, selected: e.id === calcState.entryId }, e.name)),
    h('option', { value: CUSTOM, selected: calcState.entryId === CUSTOM }, 'Isi sendiri (bisnis lain)'),
  );

  const scenarioSelect = entry
    ? h(
        'select',
        {
          class: 'select',
          id: 'c-scenario',
          onchange: (e) => {
            calcState.scenarioId = e.target.value;
            ctx.rerender();
          },
        },
        entry.scenarios.map((s) => h('option', { value: s.id, selected: s.id === scenario.id }, s.label)),
      )
    : null;

  // ----- kolom isian -----
  const inputs = {};
  const fieldEls = FIELDS.filter((f) => {
    // Sembunyikan kolom yang tidak relevan untuk skenario terpilih (tetap tampil di mode isi sendiri).
    if (!entry) return true;
    if (f.key === 'productionMinutes') return base.productionMinutes != null;
    if (f.key === 'cycleMinutes') return base.cycleMinutes != null;
    if (f.key === 'activeMin' || f.key === 'activeMax') return !scenario.passive;
    return true;
  }).map((f) => {
    const value = base[f.key];
    const input = h('input', {
      class: f.money ? 'input input--money' : 'input',
      id: `c-${f.key}`,
      name: f.key,
      type: f.money ? 'text' : 'number',
      inputmode: f.money ? 'numeric' : 'decimal',
      min: f.money ? null : '0',
      step: f.key === 'multiplier' ? '0.5' : f.money ? null : '1',
      value: value == null ? '' : f.money ? formatInt(value) : String(value),
      placeholder: f.optional ? 'tidak diketahui' : '',
      'aria-describedby': f.hint ? `ch-${f.key}` : null,
    });
    inputs[f.key] = input;
    const estimated = scenario?.estimates.includes('activeMinutes') && (f.key === 'activeMin' || f.key === 'activeMax');
    return h(
      'div',
      { class: 'field' },
      h('label', { class: 'field__label', for: `c-${f.key}` }, f.label, estimated ? h('span', { class: 'field__tag' }, ' perkiraan') : null),
      f.hint ? h('p', { class: 'field__hint', id: `ch-${f.key}` }, f.hint) : null,
      input,
    );
  });

  const resultSlot = h('div', { 'aria-live': 'polite' });

  function readInputs() {
    const read = (key, money) => {
      const el = inputs[key];
      if (!el) return base[key] ?? null;
      const raw = el.value.trim();
      if (raw === '') return null;
      const n = money ? parseMoneyInput(raw) : Number(raw.replace(',', '.'));
      return Number.isFinite(n) && n >= 0 ? n : NaN;
    };
    const values = {};
    const invalid = [];
    for (const f of FIELDS) {
      const v = read(f.key, f.money);
      if (Number.isNaN(v)) invalid.push(f.label);
      values[f.key] = Number.isNaN(v) ? null : v;
    }
    if (values.multiplier == null || values.multiplier <= 0) values.multiplier = 1;
    if (values.costPerCycle == null) values.costPerCycle = 0;
    return { values, invalid };
  }

  function update() {
    const { values, invalid } = readInputs();
    resultSlot.replaceChildren(results(values, invalid));
  }

  function results(v, invalid) {
    if (invalid.length) return notice('danger', 'Periksa isian', `Kolom berikut harus berisi angka positif: ${invalid.join(', ')}.`);
    if (v.payoutMax == null) return notice('', 'Isi pendapatan per siklus', 'Minimal isi pendapatan tertinggi per siklus untuk mulai menghitung.');
    if (v.payoutMin != null && v.payoutMin > v.payoutMax) return notice('danger', 'Rentang pendapatan terbalik', 'Pendapatan terendah lebih besar dari pendapatan tertinggi.');
    if (v.activeMin != null && v.activeMax != null && v.activeMin > v.activeMax) return notice('danger', 'Rentang waktu terbalik', 'Waktu tercepat lebih lama dari waktu terlama.');

    const r = calculate(v);
    const afford = affordability(v.investment, investable);
    const money = (n) => formatGTA(n);
    const perHour = (range) => (range ? `${rangeText(round(range.min), round(range.max), money)} per jam` : null);

    const rows = [
      ['Laba bersih per siklus', h('span', { class: 'money' }, rangeText(r.net.min, r.net.max, money))],
    ];
    if (r.perActiveHour) rows.push(['GTA$ per jam aktif', perHour(r.perActiveHour)]);
    else if (!r.perOnlineHour) rows.push(['GTA$ per jam aktif', h('span', { class: 'muted' }, 'Tidak dihitung: waktu aktif belum diketahui')]);
    if (r.perProductionHour) rows.push(['GTA$ per jam online (produksi)', perHour(r.perProductionHour)]);
    if (r.perOnlineHour) rows.push(['GTA$ per jam online (pasif)', perHour(r.perOnlineHour)]);

    const pb = r.payback;
    if (pb.cycles.min === 0) rows.push(['Balik modal', 'Tidak ada modal yang perlu dikembalikan']);
    else if (pb.cycles.min != null) {
      rows.push(['Balik modal', cyclesText(pb.cycles)]);
      if (pb.activeHours) rows.push(['Waktu bermain aktif sampai balik modal', hoursText(pb.activeHours)]);
      if (pb.productionHours) rows.push(['Waktu produksi sampai balik modal', hoursText(pb.productionHours, 'online')]);
      if (pb.onlineHours) rows.push(['Waktu online sampai balik modal', hoursText(pb.onlineHours)]);
    } else if (v.investment != null) {
      rows.push(['Balik modal', h('span', { class: 'muted' }, 'Tidak tercapai dengan laba ini')]);
    }

    const affordNode =
      afford.state === 'ok'
        ? notice('', 'Modal muat di dana investasi Anda', `Sisa dana investasi setelah membeli: ${money(afford.remaining)}. Dana cadangan tetap utuh.`)
        : afford.state === 'short'
          ? notice('warn', 'Dana investasi belum cukup', `Kurang ${money(afford.shortfall)} dari dana investasi Anda (${money(investable)}). Jangan memakai dana cadangan untuk menutupnya.`)
          : profile
            ? null
            : notice('', 'Isi profil untuk cek keterjangkauan', 'Website akan membandingkan modal dengan dana investasi Anda.');

    const assumptions = [];
    if (v.multiplier !== 1) assumptions.push(`Pendapatan dikalikan ${v.multiplier} karena bonus event.`);
    if (entry && !base.costKnown) assumptions.push('Biaya per siklus tidak tercatat di sumber, jadi dihitung GTA$0.');
    if (r.perProductionHour && r.perActiveHour) {
      assumptions.push('GTA$ per jam aktif hanya menghitung waktu Anda bekerja (beli suplai, jual). Untuk membandingkan dengan misi atau heist, pakai GTA$ per jam online (produksi), karena stok baru penuh setelah waktu produksi berjalan.');
    }
    if (scenario?.estimates.includes('activeMinutes')) assumptions.push('Waktu aktif adalah perkiraan, bukan angka dari sumber. Ubah sesuai pengalaman Anda.');
    if (r.net.min == null) assumptions.push('Pendapatan terendah tidak diketahui, jadi hanya batas atas yang dihitung.');
    if (scenario?.cooldownMinutes) assumptions.push(`Ada jeda ${scenario.cooldownMinutes} menit sebelum siklus berikutnya; jeda ini tidak dihitung dalam GTA$ per jam aktif.`);
    assumptions.push('Hasil nyata bisa berbeda karena kerusakan barang, gagal misi, atau perubahan dari Rockstar.');

    return h(
      'div',
      { class: 'stack' },
      ...r.warnings.map((w) => notice('warn', null, w)),
      h(
        'section',
        { class: 'panel result', 'aria-labelledby': 'res-title' },
        h('h2', { class: 'section-title', id: 'res-title' }, 'Hasil perhitungan'),
        h('dl', { class: 'kv kv--result' }, rows.flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, val)])),
      ),
      affordNode,
      h('section', { class: 'panel', 'aria-labelledby': 'asm-title' }, h('h2', { class: 'section-title', id: 'asm-title' }, 'Asumsi'), h('ul', { class: 'upcoming__list' }, assumptions.map((a) => h('li', {}, a)))),
    );
  }

  const form = h(
    'form',
    { class: 'panel', novalidate: true, 'aria-label': 'Isian kalkulator', oninput: update, onsubmit: (e) => e.preventDefault() },
    h(
      'div',
      { class: 'form-grid' },
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'c-entry' }, 'Bisnis atau aktivitas'), entrySelect),
      scenarioSelect ? h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'c-scenario' }, 'Skenario'), scenarioSelect) : h('div'),
      ...fieldEls,
    ),
    entry
      ? h(
          'div',
          { class: 'btn-row' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn--ghost',
              onclick: () => {
                ctx.rerender();
              },
            },
            'Kembalikan ke data sumber',
          ),
        )
      : null,
  );

  const context = entry ? entryContext(entry, scenario, base, ownedInfo, events, evStatus) : notice('', 'Mode isi sendiri', 'Isi semua angka secara manual, misalnya untuk bisnis yang belum ada di daftar.');

  update();
  return h('div', { class: 'calc' }, context, form, resultSlot);
}

function entryContext(entry, scenario, base, ownedInfo, events, evStatus) {
  const parts = base.investmentParts;
  const breakdown = [];
  if (parts.owned) breakdown.push('Harga beli tidak dihitung karena Anda menandai bisnis ini sebagai dimiliki.');
  else if (parts.purchase === null) breakdown.push(`Harga beli belum terverifikasi. ${entry.purchase.note} Isi modal secara manual.`);
  else breakdown.push(`Harga beli ${formatGTA(parts.purchase)}.`);
  for (const u of parts.upgrades) breakdown.push(`${u.name} ${formatGTA(u.price)}.`);

  const effects = eventEffectsFor(events.data, evStatus, entry.id);

  return h(
    'div',
    { class: 'panel calc__context' },
    h(
      'div',
      { class: 'panel__head' },
      h('h2', { class: 'section-title' }, entry.name),
      h('div', { class: 'badges' }, entry.dataStatus === 'sebagian' ? badge('Data sebagian', 'warn') : badge('Data lengkap', 'ok'), ownedInfo ? badge('Dimiliki', 'ok') : null),
    ),
    h('p', { class: 'small' }, `Modal: ${breakdown.join(' ')}`),
    scenario.notes.length ? h('ul', { class: 'upcoming__list small' }, scenario.notes.map((n) => h('li', {}, n))) : null,
    effects.length ? notice('', 'Event minggu ini', ...effects.map((e) => `${e.label}${e.note ? ` (${e.note})` : ''}`)) : null,
    h(
      'p',
      { class: 'small muted' },
      'Sumber: ',
      ...entry.sources.flatMap((s, i) => [i ? ', ' : '', h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.title)]),
      '.',
    ),
  );
}

function round(n) {
  return n == null ? null : Math.round(n / 100) * 100;
}

const decimal = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

function cyclesText(c) {
  const one = (n) => `${formatInt(n)} siklus`;
  if (c.max == null) return `minimal ${one(c.min)}`;
  return c.min === c.max ? one(c.min) : `${formatInt(c.min)} – ${one(c.max)}`;
}

function hoursText(range, suffix = '') {
  const fmt = (x) => {
    const text = `${decimal.format(x)} jam${suffix ? ` ${suffix}` : ''}`;
    return x >= 24 ? `${text} (≈ ${decimal.format(x / 24)} hari)` : text;
  };
  if (range.max == null) return `minimal ${fmt(range.min)}`;
  return Math.abs(range.max - range.min) < 0.05 ? fmt(range.min) : `${fmt(range.min)} – ${fmt(range.max)}`;
}

