import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatGTA, parseMoneyInput, localDateKey, formatDateTime } from '../js/format.js';
import { splitBalance, historyWithDelta } from '../js/engine/finance.js';
import { eventStatus, loadJSON } from '../js/data.js';

test('formatGTA mengikuti format di dalam game', () => {
  assert.equal(formatGTA(1250000), 'GTA$1,250,000');
  assert.equal(formatGTA(0), 'GTA$0');
  assert.equal(formatGTA(-5000), '-GTA$5,000');
});

test('parseMoneyInput', () => {
  assert.equal(parseMoneyInput('1,250,000'), 1250000);
  assert.equal(parseMoneyInput('1.250.000'), 1250000);
  assert.ok(Number.isNaN(parseMoneyInput('12a')));
  assert.ok(Number.isNaN(parseMoneyInput('')));
});

test('localDateKey memakai tanggal lokal', () => {
  assert.equal(localDateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('splitBalance membulatkan cadangan ke atas dan tidak melebihi saldo', () => {
  assert.deepEqual(splitBalance(1_000_001, 15), { balance: 1_000_001, reserve: 150_001, investable: 850_000, reservePercent: 15 });
  assert.equal(splitBalance(0, 15).investable, 0);
  assert.equal(splitBalance(100, 0).reserve, 0);
});

test('historyWithDelta mengurutkan terbaru dulu dengan selisih', () => {
  const rows = historyWithDelta([
    { date: '2026-11-05', balance: 100 },
    { date: '2026-11-07', balance: 250 },
    { date: '2026-11-06', balance: 300 },
  ]);
  assert.deepEqual(rows.map((r) => [r.date, r.delta]), [
    ['2026-11-07', -50],
    ['2026-11-06', 200],
    ['2026-11-05', null],
  ]);
});

const week = { startsAt: '2026-11-05T10:00:00Z', endsAt: '2026-11-12T10:00:00Z' };
const items = [{ type: 'multiplier', target: 'x', value: 2 }];

test('eventStatus: hanya data terverifikasi dalam periode yang aktif', () => {
  assert.equal(eventStatus(null).state, 'none');
  assert.equal(eventStatus({ status: 'none', items: [] }).state, 'none');
  assert.equal(eventStatus({ status: 'verified', week: { startsAt: 'x', endsAt: 'y' }, items }).state, 'invalid');
  assert.equal(eventStatus({ status: 'draft', week, items }, new Date('2026-11-07T00:00:00Z')).state, 'draft');
  assert.equal(eventStatus({ status: 'verified', week, items }, new Date('2026-11-04T00:00:00Z')).state, 'upcoming');
  assert.equal(eventStatus({ status: 'verified', week, items }, new Date('2026-11-07T00:00:00Z')).state, 'active');
  assert.equal(eventStatus({ status: 'verified', week, items }, new Date('2026-11-12T10:00:00Z')).state, 'expired');
});

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

test('loadJSON memakai salinan tersimpan saat jaringan gagal', async () => {
  const storage = memoryStorage();
  const ok = async () => ({ ok: true, json: async () => ({ hello: 1 }) });
  const fail = async () => {
    throw new Error('offline');
  };

  const first = await loadJSON('/x.json', { cacheKey: 'x', storage, fetchImpl: ok });
  assert.equal(first.source, 'network');

  const second = await loadJSON('/x.json', { cacheKey: 'x', storage, fetchImpl: fail });
  assert.equal(second.source, 'cache');
  assert.deepEqual(second.data, { hello: 1 });
  assert.equal(second.error, 'offline');

  const third = await loadJSON('/y.json', { cacheKey: 'y', storage, fetchImpl: fail });
  assert.equal(third.source, 'none');
  assert.equal(third.data, null);
});

test('loadJSON menganggap status HTTP gagal sebagai error', async () => {
  const res = await loadJSON('/z.json', { fetchImpl: async () => ({ ok: false, status: 404 }) });
  assert.equal(res.source, 'none');
  assert.match(res.error, /404/);
});

test('formatDateTime menerima timestamp angka', () => {
  assert.notEqual(formatDateTime(Date.parse('2026-11-05T10:00:00Z')), '—');
  assert.equal(formatDateTime(NaN), '—');
});
