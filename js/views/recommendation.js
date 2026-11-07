// Panel Next Best Action di dashboard.
import { h, badge, notice, toast, confirmDialog, withData, rangeText } from '../ui.js';
import { formatGTA } from '../format.js';
import { recommend } from '../engine/recommend.js';
import { eventStatus } from '../data.js';

const CONFIDENCE = {
  tinggi: { text: 'Keyakinan tinggi', tone: 'ok' },
  sedang: { text: 'Keyakinan sedang', tone: 'warn' },
  rendah: { text: 'Keyakinan rendah', tone: 'danger' },
};

const decimal = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const hours = (x) => (x < 1 ? `${Math.max(1, Math.round(x * 60))} menit` : `${decimal.format(x)} jam`);
const round100 = (n) => (n == null ? null : Math.round(n / 100) * 100);

export function recommendationSection(ctx) {
  return withData(ctx, (catalog, events) => {
    const state = ctx.store.getState();
    const result = recommend({
      profile: state.profile,
      owned: state.owned,
      catalog: catalog.entries,
      events: { data: events.data, status: eventStatus(events.data) },
    });
    if (!result.ready) {
      return result.reason === 'catalog'
        ? notice('warn', 'Rekomendasi belum tersedia', 'Data bisnis gagal dimuat. Muat ulang halaman.')
        : null;
    }
    return h('div', { class: 'stack' }, nbaPanel(ctx, result), sidePanels(result));
  });
}

function nbaPanel(ctx, r) {
  const a = r.nba;
  if (!a) {
    return h(
      'section',
      { class: 'panel nba', 'aria-labelledby': 'nba-title' },
      h('h2', { class: 'section-title', id: 'nba-title' }, 'Langkah berikutnya'),
      h('p', {}, 'Belum ada langkah yang bisa dihitung dari data saat ini. Tandai aset yang Anda miliki di halaman Profil atau Bisnis.'),
    );
  }

  const conf = CONFIDENCE[a.confidence] ?? CONFIDENCE.rendah;
  const facts = [];
  if (a.cost) facts.push(['Biaya', formatGTA(a.cost)]);
  if (a.perHour) facts.push([a.kind === 'upgrade' ? 'Tambahan laba' : 'Laba', `${rangeText(round100(a.perHour.min), round100(a.perHour.max), formatGTA)} per jam`]);
  if (a.payback) facts.push(['Balik modal', a.payback.max - a.payback.min < 0.05 ? hours(a.payback.min) : `${hours(a.payback.min)} – ${hours(a.payback.max)}`]);

  const actions = [h('a', { class: 'btn btn--primary', href: a.link }, a.kind === 'event' ? 'Lihat event minggu ini' : 'Lihat perhitungan')];
  if (a.purchase) {
    actions.push(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--ghost',
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'Catat pembelian ini?',
              message: [
                `${a.entryName} akan ditandai dimiliki${a.purchase.upgrades.length ? ' beserta upgrade-nya' : ''}.`,
                `Saldo di profil dikurangi ${formatGTA(a.purchase.cost)}.`,
                'Lakukan ini setelah Anda benar-benar membelinya di dalam game.',
              ],
              confirmLabel: 'Catat pembelian',
            });
            if (!ok) return;
            const res = ctx.store.applyPurchase(a.purchase);
            toast(res.ok ? `Pembelian ${a.entryName} dicatat.` : res.error, { tone: res.ok ? 'ok' : 'error' });
          },
        },
        'Sudah saya beli',
      ),
    );
  }

  return h(
    'section',
    { class: 'panel nba', 'aria-labelledby': 'nba-title' },
    h('div', { class: 'panel__head' }, h('h2', { class: 'section-title', id: 'nba-title' }, 'Langkah berikutnya'), badge(conf.text, conf.tone)),
    h('p', { class: 'nba__action' }, a.title),
    h('p', {}, a.reason),
    facts.length ? h('dl', { class: 'kv nba__facts' }, facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : null,
    a.requirements.length ? h('div', { class: 'biz__block' }, h('h3', { class: 'biz__subtitle' }, 'Syarat'), h('ul', { class: 'upcoming__list' }, a.requirements.map((t) => h('li', {}, t)))) : null,
    a.details.length ? h('ul', { class: 'upcoming__list small muted nba__details' }, a.details.map((t) => h('li', {}, t))) : null,
    h('div', { class: 'btn-row' }, actions),
  );
}

function sidePanels(r) {
  const panels = [];

  if (r.eventState !== 'active') {
    panels.push(
      notice(
        'warn',
        'Rekomendasi tanpa bonus event',
        r.eventState === 'expired' ? 'Data event minggu lalu sudah kedaluwarsa dan data minggu ini belum diperbarui.' : 'Belum ada data event terverifikasi untuk minggu ini.',
      ),
    );
  }

  if (r.alternatives.length || r.comparison) {
    panels.push(
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 'alt-title' },
        h('h2', { class: 'section-title', id: 'alt-title' }, 'Pilihan lain'),
        r.comparison ? h('p', {}, r.comparison) : null,
        h(
          'ul',
          { class: 'alt-list' },
          r.alternatives.map((alt) =>
            h(
              'li',
              {},
              h('a', { href: alt.link, class: 'alt-list__title' }, alt.title),
              ' ',
              badge(CONFIDENCE[alt.confidence]?.text ?? '', CONFIDENCE[alt.confidence]?.tone),
              h('p', { class: 'small muted' }, alt.reason),
            ),
          ),
        ),
      ),
    );
  }

  if (r.routine.length) {
    panels.push(
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 'routine-title' },
        h('h2', { class: 'section-title', id: 'routine-title' }, 'Tetap jalankan setiap sesi'),
        h('p', { class: 'small muted' }, 'Bisnis ini menghasilkan sambil Anda mengerjakan hal lain.'),
        h(
          'ul',
          { class: 'upcoming__list' },
          r.routine.map((x) =>
            h(
              'li',
              {},
              x.text,
              x.perHour ? h('span', { class: 'small muted' }, ` Sekitar ${rangeText(round100(x.perHour.min), round100(x.perHour.max), formatGTA)} per jam online.`) : null,
              x.supplyWarning ? h('div', { class: 'small', style: { color: 'var(--c-amber)' } }, x.supplyWarning) : null,
            ),
          ),
        ),
      ),
    );
  }

  panels.push(
    h(
      'details',
      { class: 'panel how' },
      h('summary', {}, 'Cara rekomendasi dihitung'),
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, 'Peluang event terbatas waktu pada aset yang Anda miliki.'),
        h('li', {}, 'Investasi terjangkau dengan balik modal tercepat: upgrade aset lama dibandingkan langsung dengan membeli bisnis baru.'),
        h('li', {}, 'Jika belum ada investasi yang terjangkau: aktivitas dengan GTA$ per jam tertinggi dari aset Anda.'),
        h('li', {}, 'Target tabungan untuk investasi terbaik berikutnya.'),
      ),
      h('h3', { class: 'biz__subtitle', style: { marginTop: 'var(--sp-4)' } }, 'Asumsi'),
      h('ul', { class: 'upcoming__list small' }, r.assumptions.map((t) => h('li', {}, t))),
      r.unassessed.length
        ? h(
            'div',
            {},
            h('h3', { class: 'biz__subtitle', style: { marginTop: 'var(--sp-4)' } }, 'Belum bisa dinilai'),
            h('ul', { class: 'upcoming__list small muted' }, r.unassessed.map((u) => h('li', {}, `${u.entry.name}: ${u.why}`))),
          )
        : null,
    ),
  );

  return h('div', { class: 'stack' }, ...panels);
}
