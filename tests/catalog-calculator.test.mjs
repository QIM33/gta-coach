import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateCatalog, validateEntry } from '../js/engine/catalog.js';
import { calculate, scenarioInput, affordability } from '../js/engine/calculator.js';
import { eventStatus, eventMultiplierFor, eventEffectsFor, gtaPlusStatus } from '../js/data.js';

const catalogRaw = JSON.parse(fs.readFileSync(new URL('../data/businesses.json', import.meta.url), 'utf8'));
const eventsRaw = JSON.parse(fs.readFileSync(new URL('./fixtures/event-heist-week.json', import.meta.url), 'utf8'));

test('data/businesses.json lolos validasi tanpa entri yang dibuang', () => {
  const { entries, warnings } = validateCatalog(catalogRaw);
  assert.deepEqual(warnings, []);
  assert.equal(entries.length, catalogRaw.entries.length);
});

test('setiap entri katalog punya sumber dan setiap skenario upgrade-nya dikenal', () => {
  for (const e of validateCatalog(catalogRaw).entries) {
    assert.ok(e.sources.length > 0, e.id);
    for (const s of e.scenarios) for (const u of s.upgrades) assert.ok(e.upgrades.some((x) => x.id === u), `${e.id}/${u}`);
  }
});

test('data/events/current.json (isi apa pun minggu ini) berstruktur valid', () => {
  const live = JSON.parse(fs.readFileSync(new URL('../data/events/current.json', import.meta.url), 'utf8'));
  assert.notEqual(eventStatus(live).state, 'invalid');
  for (const item of live.items ?? []) assert.ok(typeof item.type === 'string' && typeof item.label === 'string');
});

test('contoh event Heist Week berstruktur valid', () => {
  const st = eventStatus(eventsRaw, new Date('2026-11-07T06:00:00Z'));
  assert.equal(st.state, 'active');
  assert.equal(eventStatus(eventsRaw, new Date('2026-11-12T10:00:00Z')).state, 'expired');
});

test('validateEntry menolak entri rusak dengan alasan', () => {
  const r = validateEntry({ id: 'X X', name: '', category: 'aneh', purchase: { price: -1 }, scenarios: [], sources: [] });
  assert.equal(r.ok, false);
  assert.ok(r.problems.length >= 5);
});

test('validateCatalog membuang entri ganda dan rusak tanpa menggagalkan yang lain', () => {
  const good = catalogRaw.entries[0];
  const res = validateCatalog({ entries: [good, good, { id: 'rusak' }] });
  assert.equal(res.entries.length, 1);
  assert.equal(res.warnings.length, 2);
});

test('Acid Lab dengan upgrade: laba, GTA$/jam, dan balik modal sesuai perhitungan manual', () => {
  const { entries } = validateCatalog(catalogRaw);
  const acid = entries.find((e) => e.id === 'acid-lab');
  const sc = acid.scenarios.find((s) => s.id === 'upgraded');
  const input = scenarioInput(acid, sc, null);
  assert.equal(input.investment, 750000 + 250000);
  const r = calculate(input);
  assert.equal(r.net.min, 335200 - 192000); // 143,200
  assert.equal(r.net.max, 351840 - 192000); // 159,840
  // laba terendah / waktu terlama (20 menit)
  assert.equal(Math.round(r.perActiveHour.min), 429600);
  // balik modal: ceil(1,000,000 / 159,840) = 7, ceil(1,000,000 / 143,200) = 7
  assert.deepEqual(r.payback.cycles, { min: 7, max: 7 });
  assert.deepEqual(r.payback.productionHours, { min: 28, max: 28 });
  // laba per jam produksi: 143,200 / 4 jam = 35,800 (cocok dengan angka GTA Boss)
  assert.equal(r.perProductionHour.min, 35800);
});

test('bisnis yang dimiliki tidak menghitung harga beli dan upgrade yang sudah dipasang', () => {
  const { entries } = validateCatalog(catalogRaw);
  const bunker = entries.find((e) => e.id === 'bunker');
  const sc = bunker.scenarios[0];
  assert.equal(scenarioInput(bunker, sc, null).investment, 1165000 + 1155000 + 598500);
  assert.equal(scenarioInput(bunker, sc, { upgrades: [] }).investment, 1155000 + 598500);
  assert.equal(scenarioInput(bunker, sc, { upgrades: ['equipment', 'staff'] }).investment, 0);
});

test('harga beli yang belum diketahui menghasilkan modal null dan peringatan', () => {
  const { entries } = validateCatalog(catalogRaw);
  const kortz = entries.find((e) => e.id === 'kortz-center-heist');
  const input = scenarioInput(kortz, kortz.scenarios[0], null);
  assert.equal(input.investment, null);
  const r = calculate(input);
  assert.equal(r.payback.cycles.min, null);
  assert.ok(r.warnings.some((w) => w.includes('Modal')));
});

test('pendapatan pasif dengan batas bawah tidak diketahui hanya menghitung batas atas', () => {
  const r = calculate({ investment: 1080000, payoutMin: null, payoutMax: 50000, costPerCycle: 0, cycleMinutes: 48, multiplier: 1 });
  assert.equal(r.net.min, null);
  assert.equal(r.perOnlineHour.max, 62500);
  assert.deepEqual(r.payback.cycles, { min: 22, max: null });
});

test('pengali event menaikkan pendapatan, bukan biaya', () => {
  const r = calculate({ investment: 0, payoutMin: 100, payoutMax: 100, costPerCycle: 50, multiplier: 2 });
  assert.deepEqual(r.net, { min: 150, max: 150 });
});

test('laba negatif memunculkan peringatan dan balik modal tidak tercapai', () => {
  const r = calculate({ investment: 1000, payoutMin: 100, payoutMax: 100, costPerCycle: 200, multiplier: 1 });
  assert.equal(r.payback.cycles.min, null);
  assert.ok(r.warnings.length > 0);
});

test('affordability', () => {
  assert.deepEqual(affordability(100, 150), { state: 'ok', remaining: 50 });
  assert.deepEqual(affordability(200, 150), { state: 'short', shortfall: 50 });
  assert.equal(affordability(null, 150).state, 'unknown');
});

test('efek event hanya berlaku saat event aktif', () => {
  const active = eventStatus(eventsRaw, new Date('2026-11-07T06:00:00Z'));
  const expired = eventStatus(eventsRaw, new Date('2026-11-20T00:00:00Z'));
  assert.equal(eventEffectsFor(eventsRaw, active, 'cayo-perico-heist').length, 1);
  assert.equal(eventEffectsFor(eventsRaw, expired, 'cayo-perico-heist').length, 0);
  assert.equal(eventMultiplierFor(eventsRaw, active, 'acid-lab'), 1);
  const fake = { ...eventsRaw, items: [{ type: 'multiplier', target: 'acid-lab', value: 2 }] };
  assert.equal(eventMultiplierFor(fake, active, 'acid-lab'), 2);
});

test('bisnis MC: laba per stok penuh sesuai angka sumber dan skenario pembanding tidak diberi peringkat', () => {
  const { entries } = validateCatalog(catalogRaw);
  const net = (id, sc) => {
    const e = entries.find((x) => x.id === id);
    return calculate(scenarioInput(e, e.scenarios.find((s) => s.id === sc), { upgrades: ['equipment', 'staff'] })).net;
  };
  assert.deepEqual(net('weed-farm', 'full'), { min: 195000, max: 195000 });
  assert.deepEqual(net('meth-lab', 'full'), { min: 258750, max: 258750 });
  assert.deepEqual(net('cocaine-lockup', 'full'), { min: 337500, max: 337500 });
  for (const id of ['weed-farm', 'meth-lab', 'cocaine-lockup']) {
    const e = entries.find((x) => x.id === id);
    assert.equal(e.scenarios.find((s) => s.id === 'base').useForRanking, false, id);
    assert.ok(e.requirements.some((r) => r.includes('Clubhouse')), id);
  }
});

test('gudang Nightclub: GTA$/jam per barang dan total gudang penuh cocok dengan sumber', () => {
  const { entries } = validateCatalog(catalogRaw);
  const nc = entries.find((e) => e.id === 'nightclub');
  const goods = nc.scenarios.filter((s) => s.id.startsWith('goods-'));
  assert.equal(goods.length, 7);
  assert.equal(goods.reduce((sum, s) => sum + s.payout.max, 0), 1931500); // total sumber: GTA$1,931,500
  const perHour = Object.fromEntries(goods.map((s) => [s.id, Math.round(calculate(scenarioInput(nc, s, { upgrades: ['equipment'] })).perOnlineHour.max)]));
  assert.deepEqual(perHour, {
    'goods-sa-imports': 13500,
    'goods-pharma': 11475,
    'goods-cash': 9450,
    'goods-cargo': 8571,
    'goods-sporting': 7500,
    'goods-organic': 6075,
    'goods-printing': 5400,
  });
  assert.ok(goods.every((s) => s.useForRanking === false));
});

test('data GTA+: struktur valid, status mengikuti siklus, dan draf tidak dipakai', () => {
  const plus = JSON.parse(fs.readFileSync(new URL('../data/gtaplus.json', import.meta.url), 'utf8'));
  assert.equal(gtaPlusStatus(plus, new Date('2026-11-08T00:00:00Z')).state, 'draft'); // satu sumber sekunder
  const verified = { ...plus, status: 'verified' };
  assert.equal(gtaPlusStatus(verified, new Date('2026-11-08T00:00:00Z')).state, 'active');
  assert.equal(gtaPlusStatus(verified, new Date('2026-12-03T10:00:00Z')).state, 'expired');
  assert.equal(gtaPlusStatus(verified, new Date('2026-11-01T00:00:00Z')).state, 'upcoming');
  assert.equal(gtaPlusStatus(null).state, 'none');
  for (const item of plus.items) assert.ok(typeof item.type === 'string' && typeof item.label === 'string');
});
