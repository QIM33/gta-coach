import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateCatalog } from '../js/engine/catalog.js';
import { planSession } from '../js/engine/planner.js';
import { evaluateProgression } from '../js/engine/progression.js';
import { recommend } from '../js/engine/recommend.js';
import { eventStatus } from '../js/data.js';
import { validateProfile, defaultState } from '../js/store.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const catalog = validateCatalog(read('../data/businesses.json')).entries;
const evData = read('./fixtures/event-heist-week.json');
const progressionRaw = read('../data/progression.json');
const AFTER = new Date('2026-11-20T06:00:00Z');
const DURING = new Date('2026-11-07T06:00:00Z');
const ev = (now) => ({ data: evData, status: eventStatus(evData, now) });

const profile = (over) =>
  validateProfile({ balance: 0, rank: 10, platform: 'pc-enhanced', gtaPlus: 'unknown', sessionMinutes: 60, sessionsPerWeek: 5, playstyle: 'solo', reservePercent: 15, ...over }).value;

function plan(p, owned, minutes, now = AFTER) {
  const events = ev(now);
  const r = recommend({ profile: p, owned, catalog, events });
  return planSession({ profile: p, owned, catalog, events, minutes, nba: r.nba });
}

test('rencana tidak pernah melebihi durasi sesi dan langkah tidak tumpang tindih', () => {
  const owned = { 'acid-lab': { upgrades: ['equipment'] }, 'auto-shop': { upgrades: [] }, 'cayo-perico-heist': { upgrades: [] } };
  for (const minutes of [15, 30, 60, 120, 300]) {
    const r = plan(profile({ balance: 5000000 }), owned, minutes);
    assert.ok(r.used <= minutes, `${minutes}: ${r.used}`);
    for (let i = 1; i < r.steps.length; i++) assert.equal(r.steps[i].start, r.steps[i - 1].end);
  }
});

test('Acid Lab: suplai di awal, jual saat penuh jika sesi cukup panjang (≥ 4 jam)', () => {
  const owned = { 'acid-lab': { upgrades: ['equipment'] } };
  const long = plan(profile({ balance: 500000 }), owned, 270);
  assert.equal(long.steps[0].kind, 'resupply');
  assert.ok(long.steps.some((s) => s.kind === 'sell'));
  assert.equal(long.earn.min, 335200 - 192000);
  const short = plan(profile({ balance: 500000 }), owned, 60);
  assert.ok(!short.steps.some((s) => s.kind === 'sell'));
  assert.ok(short.notes.some((n) => n.includes('belum penuh')));
});

test('Cayo Perico tidak dijadwalkan dua kali dalam jeda 144 menit', () => {
  const owned = { 'cayo-perico-heist': { upgrades: [] } };
  const r = plan(profile({ balance: 500000 }), owned, 200);
  assert.equal(r.steps.filter((s) => s.entryId === 'cayo-perico-heist').length, 1);
  const longer = plan(profile({ balance: 500000 }), owned, 400);
  assert.equal(longer.steps.filter((s) => s.entryId === 'cayo-perico-heist').length, 2);
});

test('saat event aktif, aktivitas event didahulukan', () => {
  const owned = { 'cayo-perico-heist': { upgrades: [] }, 'auto-shop': { upgrades: [] } };
  const r = plan(profile({ balance: 0 }), owned, 120, DURING);
  const first = r.steps.find((s) => s.kind !== 'buy' && s.kind !== 'resupply');
  assert.equal(first.kind, 'event');
  assert.equal(first.entryId, 'cayo-perico-heist');
});

test('pembelian dari rekomendasi utama dijadwalkan di awal jika terjangkau', () => {
  const r = plan(profile({ balance: 1250000 }), {}, 60);
  assert.equal(r.steps[0].kind, 'buy');
  assert.ok(r.steps[0].title.includes('Acid Lab'));
});

test('tanpa aset: rencana memberi catatan, bukan aktivitas karangan', () => {
  const r = plan(profile({ balance: 100000 }), {}, 60);
  assert.ok(r.steps.every((s) => s.kind === 'wrap'));
  assert.ok(r.notes.length > 0);
  assert.equal(r.earn, null);
});

test('tahapan: langkah otomatis mengikuti data akun, manual mengikuti centang', () => {
  const state = defaultState();
  let p = evaluateProgression(progressionRaw, state);
  assert.equal(p.current, 'fondasi');
  assert.equal(p.percent, 0);

  state.profile = profile({ balance: 1 });
  state.meta.lastExportAt = new Date().toISOString();
  state.owned = { 'acid-lab': { upgrades: ['equipment'] } };
  state.progress.completedSteps = ['misi-first-dose', 'fooligan-10'];
  p = evaluateProgression(progressionRaw, state);
  assert.equal(p.stages.find((s) => s.id === 'bisnis-pertama').complete, true);
  assert.equal(p.current, 'pendapatan-aktif');
  assert.ok(p.percent > 0 && p.percent < 100);
});

test('tahapan: data rusak tidak menggagalkan', () => {
  assert.deepEqual(evaluateProgression(null, defaultState()).stages, []);
  const r = evaluateProgression({ stages: [{ id: 'X X', steps: [] }, { id: 'ok', title: 'Ok', steps: [{ id: 'a', text: 'A' }] }] }, defaultState());
  assert.equal(r.stages.length, 1);
});
