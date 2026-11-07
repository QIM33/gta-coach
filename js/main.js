// Titik masuk aplikasi: menyiapkan penyimpanan, menu, router, dan merender halaman.

import { APP, NAV, DATA_SOURCES, UPCOMING } from './config.js';
import { createStore, STORAGE_KEY } from './store.js';
import { loadJSON } from './data.js';
import { validateCatalog } from './engine/catalog.js';
import { createRouter } from './router.js';
import { h, notice, toast } from './ui.js';
import { renderDashboard } from './views/dashboard.js';
import { renderProfile } from './views/profile.js';
import { renderEvents } from './views/events.js';
import { renderSettings } from './views/settings.js';
import { renderBusinesses } from './views/businesses.js';
import { renderCalculator } from './views/calculator.js';
import { renderPlan } from './views/plan.js';
import { renderProgression } from './views/progression.js';
import { renderGuides } from './views/guides.js';
import { renderUpcoming, renderNotFound } from './views/upcoming.js';

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null; // sebagian browser melempar error saat cookie/penyimpanan diblokir
  }
}

const storage = getStorage();
const store = createStore({ storage });

// Data event dimuat sekali per sesi; tombol "Muat ulang" memaksa pemuatan baru.
// Hasil terakhir disimpan agar halaman bisa langsung dirender tanpa menunggu.
let eventsPromise = null;
let lastEvents = null;
function getEvents(force = false) {
  if (!eventsPromise || force) {
    eventsPromise = loadJSON(DATA_SOURCES.events, { cacheKey: 'events', storage }).then((r) => (lastEvents = r));
  }
  return eventsPromise;
}

// Katalog bisnis divalidasi sebelum dipakai; entri rusak dibuang dan dilaporkan.
let catalogPromise = null;
let lastCatalog = null;
function getCatalog(force = false) {
  if (!catalogPromise || force) {
    catalogPromise = loadJSON(DATA_SOURCES.businesses, { cacheKey: 'businesses', storage }).then((result) => {
      const checked = validateCatalog(result.data);
      if (checked.warnings.length) console.warn('Katalog bisnis:', checked.warnings);
      return (lastCatalog = { ...result, ...checked });
    });
  }
  return catalogPromise;
}

let progressionPromise = null;
let lastProgression = null;
function getProgression() {
  progressionPromise ||= loadJSON(DATA_SOURCES.progression, { cacheKey: 'progression', storage }).then((r) => (lastProgression = r));
  return progressionPromise;
}

let guidesPromise = null;
let lastGuides = null;
function getGuides() {
  guidesPromise ||= loadJSON(DATA_SOURCES.guides, { cacheKey: 'guides', storage }).then((r) => (lastGuides = r));
  return guidesPromise;
}

const VIEWS = {
  dashboard: renderDashboard,
  profil: renderProfile,
  event: renderEvents,
  bisnis: renderBusinesses,
  kalkulator: renderCalculator,
  rencana: renderPlan,
  tahapan: renderProgression,
  panduan: renderGuides,
  pengaturan: renderSettings,
};

const mainEl = document.getElementById('main');
const navEl = document.getElementById('nav');
const navList = document.getElementById('nav-list');
const menuBtn = document.getElementById('menu-btn');
const scrim = document.getElementById('scrim');

let currentRoute = null;
let currentParam = null;
let firstRender = true;

const router = createRouter((route, param) => {
  const changed = route !== currentRoute || param !== currentParam;
  currentRoute = route;
  currentParam = param;
  render({ focus: changed && !firstRender });
  closeNav();
  if (changed) window.scrollTo(0, 0);
  firstRender = false;
});

const ctx = {
  store,
  router,
  getEvents,
  getCatalog,
  peekEvents: () => lastEvents,
  peekCatalog: () => lastCatalog,
  getProgression,
  peekProgression: () => lastProgression,
  getGuides,
  peekGuides: () => lastGuides,
  rerender: () => render(),
};

// ---------- Menu ----------
function buildNav() {
  navList.replaceChildren(
    ...NAV.map((item) =>
      h(
        'li',
        {},
        h(
          'a',
          { class: 'nav__link', href: `#/${item.route}`, dataset: { route: item.route } },
          h('span', {}, item.label),
          item.phase ? h('span', { class: 'nav__phase' }, `Fase ${item.phase}`) : null,
        ),
      ),
    ),
  );
  document.getElementById('nav-foot').textContent = `Versi ${APP.version}, ${APP.phase}`;
}

function markActive() {
  for (const link of navList.querySelectorAll('.nav__link')) {
    if (link.dataset.route === currentRoute) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

const desktop = window.matchMedia('(min-width: 900px)');

function openNav() {
  navEl.classList.add('is-open');
  scrim.hidden = false;
  menuBtn.setAttribute('aria-expanded', 'true');
  const target = navList.querySelector('[aria-current="page"]') || navList.querySelector('a');
  target?.focus();
}

function closeNav({ restoreFocus = false } = {}) {
  if (!navEl.classList.contains('is-open')) return;
  navEl.classList.remove('is-open');
  scrim.hidden = true;
  menuBtn.setAttribute('aria-expanded', 'false');
  if (restoreFocus) menuBtn.focus();
}

menuBtn.addEventListener('click', () => (navEl.classList.contains('is-open') ? closeNav() : openNav()));
scrim.addEventListener('click', () => closeNav({ restoreFocus: true }));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && navEl.classList.contains('is-open')) closeNav({ restoreFocus: true });
});
desktop.addEventListener('change', () => closeNav());

// ---------- Render ----------
function globalNotices() {
  const { available, loadWarning } = store.status();
  const items = [];
  if (!available) {
    items.push(notice('warn', 'Penyimpanan browser tidak tersedia', 'Isian Anda tidak akan tersimpan setelah halaman ditutup. Biasanya terjadi di mode penyamaran atau jika penyimpanan situs diblokir.'));
  }
  if (loadWarning) {
    items.push(
      notice(
        'danger',
        'Data lama tidak bisa dibaca',
        loadWarning,
        h('p', {}, h('button', { class: 'link-btn', type: 'button', onclick: () => { store.dismissLoadWarning(); render(); } }, 'Tutup pemberitahuan ini')),
      ),
    );
  }
  return items;
}

function render({ focus = false } = {}) {
  let view;
  try {
    if (VIEWS[currentRoute]) view = VIEWS[currentRoute](ctx, currentParam);
    else if (UPCOMING[currentRoute]) view = renderUpcoming(ctx, currentRoute);
    else view = renderNotFound();
  } catch (err) {
    console.error(err);
    view = {
      title: 'Terjadi kesalahan',
      node: notice('danger', 'Halaman gagal ditampilkan', `Detail: ${err.message}`, 'Muat ulang halaman. Jika masalah berulang, pulihkan cadangan terakhir dari halaman Cadangan & pengaturan.'),
    };
  }
  mainEl.replaceChildren(...globalNotices(), view.node);
  document.title = `${view.title} | ${APP.name}`;
  markActive();
  if (focus) mainEl.querySelector('[data-page-title]')?.focus({ preventScroll: true });
}

// Perubahan data (simpan, impor, hapus) langsung memperbarui halaman.
store.subscribe(() => render());

// Sinkron jika data diubah dari tab lain.
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY || e.key === null) store.reload();
});

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast('Terjadi kesalahan saat memproses data. Coba muat ulang halaman.', { tone: 'error' });
});

// Mode offline: hanya aktif lewat http(s) (Live Server atau GitHub Pages), bukan file://.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Mode offline tidak aktif:', err.message));
  });
}

window.addEventListener('offline', () => toast('Anda sedang offline. Website memakai data terakhir yang tersimpan.', { tone: 'error' }));
window.addEventListener('online', () => toast('Kembali online.'));

buildNav();
document.getElementById('boot')?.remove();
router.start();
