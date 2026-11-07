import { h, pageHead, badge } from '../ui.js';
import { UPCOMING } from '../config.js';

/** Halaman untuk fitur yang belum dibangun: menjelaskan isinya nanti, tanpa data palsu. */
export function renderUpcoming(ctx, route) {
  const info = UPCOMING[route];
  return {
    title: info.title,
    node: h(
      'div',
      {},
      pageHead(info.title, info.lead),
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 'up-title' },
        h('div', { class: 'panel__head' }, h('h2', { class: 'section-title', id: 'up-title' }, 'Sedang disiapkan'), badge(`Fase ${info.phase}`, 'warn')),
        h('ul', { class: 'upcoming__list' }, info.points.map((p) => h('li', {}, p))),
        h('div', { class: 'btn-row' }, h('a', { class: 'btn btn--ghost', href: '#/dashboard' }, 'Kembali ke dashboard')),
      ),
    ),
  };
}

export function renderNotFound() {
  return {
    title: 'Halaman tidak ditemukan',
    node: h(
      'div',
      {},
      pageHead('Halaman tidak ditemukan', 'Alamat ini tidak ada di website. Gunakan menu untuk berpindah halaman.'),
      h('a', { class: 'btn btn--primary', href: '#/dashboard' }, 'Ke dashboard'),
    ),
  };
}
