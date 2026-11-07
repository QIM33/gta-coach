import { h, pageHead, notice } from '../ui.js';
import { formatDate } from '../format.js';

const ID = /^[a-z0-9-]{1,48}$/;

/** Membuang panduan yang strukturnya rusak, agar satu salah ketik tidak menggagalkan halaman. */
function validGuides(raw) {
  if (!raw || !Array.isArray(raw.guides)) return [];
  return raw.guides.filter((g) => ID.test(g?.id ?? '') && typeof g.title === 'string' && Array.isArray(g.sections));
}

export function renderGuides(ctx, param) {
  const slot = h('div', {}, h('p', { class: 'muted' }, 'Memuat panduan…'));
  const headSlot = h('div');
  let title = 'Panduan';

  const fill = (res) => {
    if (!res.data) {
      headSlot.replaceChildren(pageHead('Panduan'));
      slot.replaceChildren(notice('danger', 'Panduan gagal dimuat', `Detail: ${res.error}.`));
      return;
    }
    const guides = validGuides(res.data);
    const guide = param ? guides.find((g) => g.id === param) : null;
    if (param && !guide) {
      headSlot.replaceChildren(pageHead('Panduan tidak ditemukan', 'Topik ini tidak ada. Pilih dari daftar panduan.'));
      slot.replaceChildren(h('a', { class: 'btn btn--ghost', href: '#/panduan' }, 'Ke daftar panduan'));
      return;
    }
    if (guide) {
      title = guide.title;
      document.title = document.title.replace(/^[^|]+/, `${guide.title} `);
      headSlot.replaceChildren(pageHead(guide.title, guide.summary));
      slot.replaceChildren(detail(guide, res));
    } else {
      headSlot.replaceChildren(pageHead('Panduan', 'Ringkasan singkat mekanisme bisnis, heist, dan event. Ditulis ulang dari sumber yang tercantum di setiap topik.'));
      slot.replaceChildren(list(guides, res));
    }
  };

  const cached = ctx.peekGuides();
  if (cached) fill(cached);
  else ctx.getGuides().then(fill);

  return { title, node: h('div', {}, headSlot, slot) };
}

function list(guides, res) {
  return h(
    'div',
    {},
    res.data.updatedAt ? h('p', { class: 'small muted' }, `Diperbarui ${formatDate(res.data.updatedAt)}.`) : null,
    h(
      'ul',
      { class: 'guide-list' },
      guides.map((g) =>
        h('li', { class: 'panel' }, h('h2', { class: 'section-title' }, h('a', { href: `#/panduan/${g.id}` }, g.title)), h('p', { class: 'muted' }, g.summary ?? '')),
      ),
    ),
  );
}

function detail(guide) {
  return h(
    'div',
    { class: 'stack' },
    ...guide.sections.map((s) =>
      h(
        'section',
        { class: 'panel' },
        h('h2', { class: 'section-title' }, s.heading ?? ''),
        h('ul', { class: 'upcoming__list' }, (s.points ?? []).map((p) => h('li', {}, p))),
      ),
    ),
    Array.isArray(guide.sources) && guide.sources.length
      ? h(
          'section',
          { class: 'panel' },
          h('h2', { class: 'section-title' }, 'Sumber'),
          h('ul', { class: 'upcoming__list' }, guide.sources.map((src) => h('li', {}, h('a', { href: src.url, target: '_blank', rel: 'noopener noreferrer' }, src.title)))),
        )
      : h('p', { class: 'small muted' }, 'Topik ini menjelaskan cara kerja website, jadi tidak memerlukan sumber luar.'),
    h('a', { class: 'btn btn--ghost', href: '#/panduan' }, 'Kembali ke daftar panduan'),
  );
}
