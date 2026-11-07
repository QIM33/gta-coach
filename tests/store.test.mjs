// Jalankan: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore,
  validateProfile,
  sanitizeState,
  migrate,
  STORAGE_KEY,
  CORRUPT_KEY,
  SCHEMA_VERSION,
  BACKUP_APP_ID,
} from '../js/store.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    dump: () => Object.fromEntries(data),
  };
}

const validInput = {
  name: 'LH',
  balance: '1,250,000',
  rank: '42',
  platform: 'pc-enhanced',
  gtaPlus: 'unknown',
  sessionMinutes: '60',
  playstyle: 'solo',
  reservePercent: '15',
};

test('validateProfile menerima isian valid dan membaca format uang', () => {
  const r = validateProfile(validInput);
  assert.equal(r.ok, true);
  assert.equal(r.value.balance, 1_250_000);
  assert.equal(r.value.rank, 42);
});

test('validateProfile menerima saldo dengan titik dan awalan GTA$', () => {
  assert.equal(validateProfile({ ...validInput, balance: 'GTA$ 2.500.000' }).value.balance, 2_500_000);
});

test('validateProfile menolak isian di luar batas dengan pesan per kolom', () => {
  const r = validateProfile({ ...validInput, balance: '-5', rank: '0', reservePercent: '80', sessionMinutes: '5', platform: 'ps4', gtaPlus: 'toString' });
  assert.equal(r.ok, false);
  for (const key of ['balance', 'rank', 'reservePercent', 'sessionMinutes', 'platform', 'gtaPlus']) {
    assert.ok(r.errors[key], `harus ada error untuk ${key}`);
  }
});

test('validateProfile menolak rank desimal', () => {
  assert.equal(validateProfile({ ...validInput, rank: '4.5' }).ok, false);
});

test('saveProfile menyimpan, mencatat riwayat, dan bertahan setelah dimuat ulang', () => {
  const storage = memoryStorage();
  const store = createStore({ storage, now: () => new Date(2026, 10, 7, 13, 0) });
  const res = store.saveProfile(validInput);
  assert.equal(res.ok, true);

  const reloaded = createStore({ storage });
  const s = reloaded.getState();
  assert.equal(s.profile.balance, 1_250_000);
  assert.deepEqual(s.balanceHistory, [{ date: '2026-11-07', balance: 1_250_000 }]);
});

test('saveProfile di hari yang sama memperbarui entri riwayat, hari berbeda menambah entri', () => {
  const storage = memoryStorage();
  let clock = new Date(2026, 10, 7, 9, 0);
  const store = createStore({ storage, now: () => clock });
  store.saveProfile(validInput);
  store.saveProfile({ ...validInput, balance: '1,300,000' });
  assert.equal(store.getState().balanceHistory.length, 1);
  assert.equal(store.getState().balanceHistory[0].balance, 1_300_000);

  clock = new Date(2026, 10, 8, 9, 0);
  store.saveProfile({ ...validInput, balance: '2,000,000' });
  assert.deepEqual(
    store.getState().balanceHistory.map((e) => e.date),
    ['2026-11-07', '2026-11-08'],
  );
});

test('saveProfile gagal tidak mengubah data', () => {
  const storage = memoryStorage();
  const store = createStore({ storage });
  store.saveProfile(validInput);
  const before = storage.getItem(STORAGE_KEY);
  const res = store.saveProfile({ ...validInput, balance: 'abc' });
  assert.equal(res.ok, false);
  assert.equal(storage.getItem(STORAGE_KEY), before);
});

test('getState mengembalikan salinan, bukan referensi internal', () => {
  const store = createStore({ storage: memoryStorage() });
  store.saveProfile(validInput);
  const s = store.getState();
  s.profile.balance = 999;
  assert.equal(store.getState().profile.balance, 1_250_000);
});

test('data rusak tidak ditimpa diam-diam: salinan disimpan dan peringatan muncul', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: '{bukan json' });
  const store = createStore({ storage });
  assert.equal(store.getState().profile, null);
  assert.ok(store.status().loadWarning);
  assert.equal(storage.getItem(CORRUPT_KEY), '{bukan json');
});

test('penyimpanan yang menolak tulis ditandai tidak tersedia', () => {
  const broken = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceeded');
    },
    removeItem: () => {},
  };
  const store = createStore({ storage: broken });
  assert.equal(store.status().available, false);
  const res = store.saveProfile(validInput);
  assert.equal(res.ok, false);
  assert.ok(res.error);
});

test('ekspor lalu impor menghasilkan data yang sama', () => {
  const a = createStore({ storage: memoryStorage(), now: () => new Date(2026, 10, 7) });
  a.saveProfile(validInput);
  const text = JSON.stringify(a.exportPayload());

  const b = createStore({ storage: memoryStorage() });
  const parsed = b.parseBackup(text);
  assert.equal(parsed.ok, true);
  b.replaceState(parsed.state);
  assert.deepEqual(b.getState().profile, a.getState().profile);
  assert.deepEqual(b.getState().balanceHistory, a.getState().balanceHistory);
});

test('parseBackup menolak file yang bukan cadangan, versi lebih baru, atau profil rusak', () => {
  const store = createStore({ storage: memoryStorage() });
  assert.equal(store.parseBackup('').ok, false);
  assert.equal(store.parseBackup('halo').ok, false);
  assert.equal(store.parseBackup(JSON.stringify({ foo: 1 })).ok, false);

  const newer = { app: BACKUP_APP_ID, data: { schemaVersion: SCHEMA_VERSION + 1 } };
  const r1 = store.parseBackup(JSON.stringify(newer));
  assert.equal(r1.ok, false);
  assert.match(r1.error, /lebih baru/);

  const badProfile = { app: BACKUP_APP_ID, data: { schemaVersion: 1, profile: { balance: 'banyak' } } };
  assert.equal(store.parseBackup(JSON.stringify(badProfile)).ok, false);
});

test('sanitizeState membuang kolom asing dan entri riwayat tidak valid', () => {
  const s = sanitizeState({
    schemaVersion: 1,
    hacked: '<script>',
    owned: { 'acid-lab': { upgrades: ['equipment', 'equipment', '<x>'] }, 'BAD ID': {} },
    balanceHistory: [
      { date: '2026-11-07', balance: 100 },
      { date: 'kemarin', balance: 5 },
      { date: '2026-11-06', balance: -1 },
      { date: '2026-11-05', balance: 50 },
    ],
  });
  assert.equal(s.hacked, undefined);
  assert.deepEqual(s.owned, { 'acid-lab': { upgrades: ['equipment'] } });
  assert.deepEqual(s.balanceHistory.map((e) => e.date), ['2026-11-05', '2026-11-07']);
});

test('migrate menolak data tanpa versi', () => {
  assert.throws(() => migrate({}), /Versi data/);
});

test('reset mengosongkan data dan memberi tahu pendengar', () => {
  const store = createStore({ storage: memoryStorage() });
  store.saveProfile(validInput);
  let calls = 0;
  store.subscribe(() => calls++);
  store.reset();
  assert.equal(store.getState().profile, null);
  assert.equal(calls, 1);
});

test('setOwned dan setOwnedUpgrade menyimpan kepemilikan dan upgrade', () => {
  const store = createStore({ storage: memoryStorage() });
  assert.equal(store.setOwnedUpgrade('bunker', 'staff', true).ok, false); // belum dimiliki
  assert.equal(store.setOwned('bunker', true).ok, true);
  store.setOwnedUpgrade('bunker', 'staff', true);
  store.setOwnedUpgrade('bunker', 'staff', true);
  assert.deepEqual(store.getState().owned, { bunker: { upgrades: ['staff'] } });
  store.setOwned('bunker', false);
  assert.deepEqual(store.getState().owned, {});
  assert.equal(store.setOwned('<script>', true).ok, false);
});

test('applyPurchase mencatat kepemilikan, upgrade, dan memotong saldo', () => {
  const store = createStore({ storage: memoryStorage(), now: () => new Date(2026, 10, 7, 10) });
  assert.equal(store.applyPurchase({ id: 'acid-lab', upgrades: [], cost: 1 }).ok, false); // tanpa profil
  store.saveProfile(validInput); // saldo 1,250,000
  assert.equal(store.applyPurchase({ id: 'acid-lab', upgrades: ['equipment'], cost: 2_000_000 }).ok, false);
  assert.equal(store.applyPurchase({ id: 'acid-lab', upgrades: ['equipment'], cost: 1_000_000 }).ok, true);
  const s = store.getState();
  assert.equal(s.profile.balance, 250_000);
  assert.deepEqual(s.owned['acid-lab'].upgrades, ['equipment']);
  assert.equal(s.balanceHistory.at(-1).balance, 250_000);
});
