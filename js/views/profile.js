import { h, pageHead, toast, withData } from '../ui.js';
import { CATEGORY_LABEL } from '../engine/catalog.js';
import { formatGTA, formatInt, parseMoneyInput } from '../format.js';
import { splitBalance } from '../engine/finance.js';
import { DEFAULT_PROFILE, LIMITS, OPTIONS } from '../store.js';

const PLATFORM_HINT = {
  'pc-enhanced': "Punya Hao's Special Works, Career Progress, dan opsi GTA+.",
  'pc-legacy': "Tidak punya Hao's Special Works, Career Progress, dan GTA+.",
};

// Isian yang belum disimpan dipertahankan saat halaman dirender ulang
// (misalnya setelah mencentang aset), lalu dihapus setelah berhasil disimpan.
let draft = null;

export function renderProfile(ctx) {
  const state = ctx.store.getState();
  const isNew = !state.profile;
  const p = state.profile ?? DEFAULT_PROFILE;

  const errorEls = {};
  const errorFor = (name) => (errorEls[name] = h('p', { class: 'field__error', id: `err-${name}` }));

  // ----- kolom isian -----
  const nameInput = h('input', { class: 'input', id: 'f-name', name: 'name', type: 'text', maxlength: LIMITS.nameMax, autocomplete: 'nickname', value: p.name, 'aria-describedby': 'err-name' });

  const balanceInput = h('input', {
    class: 'input input--money',
    id: 'f-balance',
    name: 'balance',
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    value: isNew ? '' : formatInt(p.balance),
    placeholder: 'contoh: 1,250,000',
    'aria-describedby': 'hint-balance preview-balance err-balance',
  });
  const balancePreview = h('p', { class: 'preview', id: 'preview-balance', 'aria-live': 'polite' });

  const rankInput = h('input', { class: 'input', id: 'f-rank', name: 'rank', type: 'number', inputmode: 'numeric', min: LIMITS.rankMin, max: LIMITS.rankMax, step: 1, value: p.rank, 'aria-describedby': 'err-rank' });

  const platformSelect = h(
    'select',
    { class: 'select', id: 'f-platform', name: 'platform', 'aria-describedby': 'hint-platform err-platform' },
    Object.entries(OPTIONS.platform).map(([v, label]) => h('option', { value: v, selected: v === p.platform }, label)),
  );
  const platformHint = h('p', { class: 'field__hint', id: 'hint-platform' }, PLATFORM_HINT[p.platform]);

  const sessionInput = h('input', { class: 'input', id: 'f-session', name: 'sessionMinutes', type: 'number', inputmode: 'numeric', min: LIMITS.sessionMin, max: LIMITS.sessionMax, step: 5, value: p.sessionMinutes, 'aria-describedby': 'hint-session err-sessionMinutes' });

  const sessionsWeekInput = h('input', { class: 'input', id: 'f-sessions-week', name: 'sessionsPerWeek', type: 'number', inputmode: 'numeric', min: LIMITS.sessionsPerWeekMin, max: LIMITS.sessionsPerWeekMax, step: 1, value: p.sessionsPerWeek ?? DEFAULT_PROFILE.sessionsPerWeek, 'aria-describedby': 'hint-sessions-week err-sessionsPerWeek' });

  const reserveInput = h('input', { class: 'input', id: 'f-reserve', name: 'reservePercent', type: 'number', inputmode: 'numeric', min: LIMITS.reserveMin, max: LIMITS.reserveMax, step: 1, value: p.reservePercent, 'aria-describedby': 'hint-reserve preview-reserve err-reservePercent' });
  const reservePreview = h('p', { class: 'preview', id: 'preview-reserve', 'aria-live': 'polite' });

  const choiceGroup = (name, legend, current, hint) =>
    h(
      'fieldset',
      { class: 'field', 'aria-describedby': `err-${name}` },
      h('legend', { class: 'field__label' }, legend),
      hint ? h('p', { class: 'field__hint' }, hint) : null,
      h(
        'div',
        { class: 'choices' },
        Object.entries(OPTIONS[name]).map(([v, label]) =>
          h('label', { class: 'choice' }, h('input', { type: 'radio', name, value: v, checked: v === current }), h('span', {}, label)),
        ),
      ),
      errorFor(name),
    );

  // ----- pratinjau langsung -----
  function updatePreviews() {
    const balance = parseMoneyInput(balanceInput.value);
    balancePreview.textContent = Number.isFinite(balance) ? `Terbaca sebagai ${formatGTA(balance)}` : '';
    const pct = Number(reserveInput.value);
    if (Number.isFinite(balance) && Number.isFinite(pct) && pct >= LIMITS.reserveMin && pct <= LIMITS.reserveMax) {
      const s = splitBalance(balance, pct);
      reservePreview.textContent = `${formatGTA(s.reserve)} disisihkan, ${formatGTA(s.investable)} bisa diinvestasikan.`;
    } else {
      reservePreview.textContent = '';
    }
  }
  balanceInput.addEventListener('input', updatePreviews);
  balanceInput.addEventListener('blur', () => {
    const balance = parseMoneyInput(balanceInput.value);
    if (Number.isFinite(balance)) balanceInput.value = formatInt(balance);
  });
  reserveInput.addEventListener('input', updatePreviews);
  platformSelect.addEventListener('change', () => {
    platformHint.textContent = PLATFORM_HINT[platformSelect.value] ?? '';
  });

  // ----- simpan -----
  const form = h(
    'form',
    { class: 'panel', novalidate: true, 'aria-label': 'Profil pemain' },
    h(
      'div',
      { class: 'form-grid' },
      h('div', { class: 'field field--wide' },
        h('label', { class: 'field__label', for: 'f-balance' }, 'Saldo GTA$ (bank + tunai)'),
        h('p', { class: 'field__hint', id: 'hint-balance' }, 'Lihat di menu interaksi atau aplikasi Maze Bank di ponsel karakter.'),
        balanceInput, balancePreview, errorFor('balance')),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'f-name' }, 'Nama karakter (opsional)'),
        nameInput, errorFor('name')),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'f-rank' }, 'Rank'),
        rankInput, errorFor('rank')),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'f-platform' }, 'Versi game'),
        platformHint, platformSelect, errorFor('platform')),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'f-session' }, 'Durasi satu sesi bermain (menit)'),
        h('p', { class: 'field__hint', id: 'hint-session' }, 'Perkiraan rata-rata. Dipakai untuk menyusun rencana sesi.'),
        sessionInput, errorFor('sessionMinutes')),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'f-sessions-week' }, 'Jumlah sesi per minggu'),
        h('p', { class: 'field__hint', id: 'hint-sessions-week' }, 'Dipakai untuk aktivitas yang dibatasi per minggu, misalnya perampokan Salvage Yard.'),
        sessionsWeekInput, errorFor('sessionsPerWeek')),
      h('div', { class: 'field field--wide' }, choiceGroup('gtaPlus', 'Langganan GTA+', p.gtaPlus, 'Selama belum dikonfirmasi, bonus khusus anggota GTA+ tidak dihitung.')),
      h('div', { class: 'field field--wide' }, choiceGroup('playstyle', 'Gaya bermain', p.playstyle, 'Memengaruhi pilihan aktivitas: sebagian lebih menguntungkan jika dikerjakan bersama.')),
      h('div', { class: 'field field--wide' },
        h('label', { class: 'field__label', for: 'f-reserve' }, 'Dana cadangan (% dari saldo)'),
        h('p', { class: 'field__hint', id: 'hint-reserve' }, `Bagian saldo yang tidak dipakai untuk membeli aset. Bawaan ${DEFAULT_PROFILE.reservePercent}%, maksimal ${LIMITS.reserveMax}%.`),
        reserveInput, reservePreview, errorFor('reservePercent')),
    ),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn btn--primary', type: 'submit' }, isNew ? 'Simpan profil' : 'Simpan perubahan')),
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const input = Object.fromEntries(data.entries());
    const result = ctx.store.saveProfile(input);

    for (const [name, el] of Object.entries(errorEls)) {
      el.textContent = result.errors?.[name] ?? '';
      const control = form.querySelector(`[name="${name}"]`);
      if (control && control.type !== 'radio') control.setAttribute('aria-invalid', result.errors?.[name] ? 'true' : 'false');
    }

    if (!result.ok) {
      if (result.error) {
        toast(result.error, { tone: 'error' });
        return;
      }
      const firstName = Object.keys(result.errors)[0];
      form.querySelector(`[name="${firstName}"]`)?.focus();
      toast('Periksa kembali kolom yang ditandai.', { tone: 'error' });
      return;
    }

    draft = null;
    toast(isNew ? 'Profil tersimpan.' : 'Perubahan tersimpan.');
    if (isNew) ctx.router.go('dashboard');
  });

  // Pulihkan isian yang belum disimpan.
  if (draft) {
    for (const [name, value] of Object.entries(draft)) {
      for (const el of form.querySelectorAll(`[name="${name}"]`)) {
        if (el.type === 'radio') el.checked = el.value === value;
        else el.value = value;
      }
    }
    platformHint.textContent = PLATFORM_HINT[platformSelect.value] ?? '';
  }
  form.addEventListener('input', () => {
    draft = Object.fromEntries(new FormData(form).entries());
  });

  // Pesan error suatu kolom hilang begitu kolom itu diubah.
  form.addEventListener('input', (event) => {
    const name = event.target.name;
    if (!name || !errorEls[name]) return;
    errorEls[name].textContent = '';
    if (event.target.type !== 'radio') event.target.setAttribute('aria-invalid', 'false');
  });

  updatePreviews();

  return {
    title: 'Profil pemain',
    node: h(
      'div',
      {},
      pageHead('Profil pemain', 'Kondisi akun Anda saat ini. Semakin akurat isiannya, semakin tepat perhitungan dan rekomendasinya.'),
      form,
      assetPanel(ctx),
    ),
  };
}

/** Checklist aset: cara cepat menandai bisnis yang sudah dimiliki tanpa membuka halaman Bisnis. */
function assetPanel(ctx) {
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'assets-title', style: { marginTop: 'var(--sp-4)' } },
    h('h2', { class: 'section-title', id: 'assets-title' }, 'Aset yang sudah dimiliki'),
    h('p', { class: 'small muted' }, 'Centang bisnis yang sudah Anda beli. Tersimpan langsung. Upgrade bisa dicatat di halaman Bisnis.'),
    withData(ctx, (catalog) => {
      const owned = ctx.store.getState().owned;
      return h(
        'ul',
        { class: 'asset-list' },
        catalog.entries.map((e) => {
          const id = `asset-${e.id}`;
          return h(
            'li',
            {},
            h(
              'label',
              { class: 'check', for: id },
              h('input', {
                type: 'checkbox',
                id,
                checked: Boolean(owned[e.id]),
                onchange: (ev) => {
                  const res = ctx.store.setOwned(e.id, ev.target.checked);
                  if (!res.ok) toast(res.error, { tone: 'error' });
                },
              }),
              h('span', {}, e.name, h('span', { class: 'small muted' }, ` ${CATEGORY_LABEL[e.category]}`)),
            ),
          );
        }),
      );
    }),
  );
}
