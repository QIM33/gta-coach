// Lima akun contoh untuk menguji mesin rekomendasi (syarat lanjut Fase 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateCatalog } from '../js/engine/catalog.js';
import { recommend } from '../js/engine/recommend.js';
import { eventStatus } from '../js/data.js';
import { validateProfile } from '../js/store.js';

const catalog = validateCatalog(JSON.parse(fs.readFileSync(new URL('../data/businesses.json', import.meta.url), 'utf8'))).entries;
const evData = JSON.parse(fs.readFileSync(new URL('./fixtures/event-heist-week.json', import.meta.url), 'utf8'));
const DURING = new Date('2026-11-07T06:00:00Z');
const AFTER = new Date('2026-11-20T06:00:00Z');
const events = (now) => ({ data: evData, status: eventStatus(evData, now) });

function profile(over) {
  const r = validateProfile({ name: '', balance: 0, rank: 10, platform: 'pc-enhanced', gtaPlus: 'unknown', sessionMinutes: 60, sessionsPerWeek: 5, playstyle: 'solo', reservePercent: 15, ...over });
  assert.ok(r.ok, JSON.stringify(r.errors));
  return r.value;
}

test('tanpa profil: rekomendasi belum siap', () => {
  assert.equal(recommend({ profile: null, catalog }).ready, false);
});

test('Akun 1 — pemula GTA$200,000 tanpa aset: menabung untuk Acid Lab', () => {
  const r = recommend({ profile: profile({ balance: 200000 }), owned: {}, catalog, events: events(DURING) });
  assert.equal(r.nba.kind, 'save');
  assert.equal(r.nba.entryId, 'acid-lab');
  // Acid Lab tanpa upgrade (GTA$750,000) adalah target termurah yang terhitung
  assert.ok(r.nba.title.includes('GTA$580,000'), r.nba.title); // 750,000 − 170,000
  assert.ok(r.nba.requirements.length > 0, 'syarat First Dose harus ditampilkan');
});

test('Akun 2 — GTA$1,250,000 tanpa aset: beli Acid Lab dengan upgrade', () => {
  const r = recommend({ profile: profile({ balance: 1250000 }), owned: {}, catalog, events: events(DURING) });
  assert.equal(r.nba.kind, 'buy');
  assert.equal(r.nba.entryId, 'acid-lab');
  assert.equal(r.nba.cost, 1000000);
  assert.ok(r.money.investable >= r.nba.cost, 'tidak boleh memakai dana cadangan');
});

test('Akun 3 — punya Acid Lab tanpa upgrade, saldo GTA$400,000: optimalkan aset lama', () => {
  const r = recommend({ profile: profile({ balance: 400000 }), owned: { 'acid-lab': { upgrades: [] } }, catalog, events: events(DURING) });
  assert.equal(r.nba.kind, 'upgrade');
  assert.equal(r.nba.entryId, 'acid-lab');
  assert.equal(r.nba.cost, 250000);
  // tambahan laba per jam = upgrade (35,800–39,960) − tanpa upgrade (7,600–9,573)
  assert.ok(r.nba.perHour.min > 28000 && r.nba.perHour.max < 31000);
  assert.ok(r.routine.some((x) => x.entry.id === 'acid-lab'));
});

test('Akun 4 — punya Acid Lab + Kosatka saat Heist Event: manfaatkan Panther Statue', () => {
  const owned = { 'acid-lab': { upgrades: ['equipment'] }, 'cayo-perico-heist': { upgrades: [] } };
  const r = recommend({ profile: profile({ balance: 500000 }), owned, catalog, events: events(DURING) });
  assert.equal(r.nba.kind, 'event');
  assert.equal(r.nba.entryId, 'cayo-perico-heist');
  // setelah event berakhir, rekomendasi tidak lagi memakai event
  const later = recommend({ profile: profile({ balance: 500000 }), owned, catalog, events: events(AFTER) });
  assert.notEqual(later.nba.kind, 'event');
  assert.equal(later.nba.entryId, 'cayo-perico-heist');
  assert.equal(later.nba.kind, 'run');
});

test('Akun 5 — punya Acid Lab + Auto Shop, saldo GTA$2,500,000: menabung sebentar untuk Kosatka lebih baik daripada beli Salvage Yard sekarang', () => {
  const owned = { 'acid-lab': { upgrades: ['equipment'] }, 'auto-shop': { upgrades: [] } };
  const r = recommend({ profile: profile({ balance: 2500000 }), owned, catalog, events: events(AFTER) });
  // Dana investasi GTA$2,125,000; Kosatka GTA$2,200,000 → kurang GTA$75,000, tertutup < 1 jam kontrak Auto Shop
  assert.equal(r.nba.kind, 'save');
  assert.equal(r.nba.entryId, 'cayo-perico-heist');
  assert.ok(r.nba.details.some((d) => d.includes('Salvage Yard')));
  assert.ok(r.alternatives.some((a) => a.entryId === 'salvage-yard' && a.kind === 'buy'));
});

test('Akun 5b — saldo GTA$3,000,000: Kosatka terjangkau dan langsung dibeli', () => {
  const owned = { 'acid-lab': { upgrades: ['equipment'] }, 'auto-shop': { upgrades: [] } };
  const r = recommend({ profile: profile({ balance: 3000000 }), owned, catalog, events: events(AFTER) });
  assert.equal(r.nba.kind, 'buy');
  assert.equal(r.nba.entryId, 'cayo-perico-heist');
  assert.ok(r.nba.cost <= r.money.investable);
});

test('dana cadangan tidak pernah dipakai: saldo pas-pasan tidak memicu pembelian', () => {
  // Saldo 1,100,000 → dana investasi 935,000 < 1,000,000 (Acid Lab + upgrade), tapi ≥ 750,000 (tanpa upgrade)
  const r = recommend({ profile: profile({ balance: 1100000 }), owned: {}, catalog, events: events(AFTER) });
  assert.equal(r.nba.kind, 'buy');
  assert.equal(r.nba.cost, 750000);
});

test('bunker tanpa upgrade: upgrade disarankan tetapi ditandai keyakinan rendah', () => {
  const r = recommend({ profile: profile({ balance: 3000000 }), owned: { bunker: { upgrades: [] } }, catalog, events: events(AFTER) });
  const all = [r.nba, ...r.alternatives];
  const up = all.find((a) => a.kind === 'upgrade' && a.entryId === 'bunker');
  assert.ok(up, 'upgrade bunker harus muncul');
  assert.equal(up.confidence, 'rendah');
});

test('aktivitas yang tidak muat dalam satu sesi diberi catatan', () => {
  const owned = { 'kortz-center-heist': { upgrades: [] } };
  const r = recommend({ profile: profile({ balance: 0, sessionMinutes: 30 }), owned, catalog, events: events(AFTER) });
  assert.equal(r.nba.kind, 'run');
  assert.ok(r.nba.details.some((d) => d.includes('lebih lama dari durasi sesi')));
});
