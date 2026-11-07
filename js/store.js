// Penyimpanan progres pemain di LocalStorage.
// - Data selalu divalidasi saat dimuat, disimpan, dan diimpor.
// - schemaVersion dipakai untuk migrasi jika struktur berubah di versi berikutnya.
// - Data rusak tidak ditimpa diam-diam: salinannya disimpan dengan kunci terpisah.
// Modul ini tidak menyentuh DOM, sehingga bisa diuji di Node.js.

import { localDateKey, parseMoneyInput } from './format.js';

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'gtacoach.v1';
export const CORRUPT_KEY = 'gtacoach.v1.rusak';
export const BACKUP_APP_ID = 'gta-online-business-coach';

export const LIMITS = Object.freeze({
  balanceMax: 10_000_000_000,
  rankMin: 1,
  rankMax: 8000,
  sessionMin: 15,
  sessionMax: 720,
  sessionsPerWeekMin: 1,
  sessionsPerWeekMax: 28,
  reserveMin: 0,
  reserveMax: 50,
  nameMax: 24,
  historyMax: 365,
  importMaxBytes: 1_000_000,
});

export const OPTIONS = Object.freeze({
  platform: { 'pc-enhanced': 'PC (Enhanced)', 'pc-legacy': 'PC (Legacy)' },
  gtaPlus: { unknown: 'Belum dikonfirmasi', yes: 'Berlangganan', no: 'Tidak berlangganan' },
  playstyle: { solo: 'Solo', group: 'Bersama teman/crew', mixed: 'Campuran' },
});

export const DEFAULT_PROFILE = Object.freeze({
  name: '',
  balance: 0,
  rank: 1,
  platform: 'pc-enhanced',
  gtaPlus: 'unknown',
  sessionMinutes: 60,
  sessionsPerWeek: 5,
  playstyle: 'solo',
  reservePercent: 15,
});

const has = (obj, key) => typeof key === 'string' && Object.hasOwn(obj, key);

const ID_PATTERN = /^[a-z0-9-]{1,48}$/;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function defaultState(now = new Date()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: null,
    owned: {},
    progress: { completedSteps: [] },
    balanceHistory: [],
    meta: { createdAt: now.toISOString(), lastExportAt: null },
  };
}

function toInt(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : NaN;
  if (typeof value === 'string' && /^\s*-?\d+\s*$/.test(value)) return Number(value.trim());
  return NaN;
}

function isIsoDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/**
 * Memeriksa dan membersihkan isian profil.
 * Mengembalikan { ok, value, errors } — errors berisi pesan per kolom.
 */
export function validateProfile(input) {
  const src = input && typeof input === 'object' ? input : {};
  const errors = {};

  const name = typeof src.name === 'string' ? src.name.trim() : '';
  if (name.length > LIMITS.nameMax) errors.name = `Nama maksimal ${LIMITS.nameMax} karakter.`;

  const balance = parseMoneyInput(typeof src.balance === 'number' ? src.balance : String(src.balance ?? ''));
  if (!Number.isFinite(balance)) errors.balance = 'Isi saldo dengan angka, misalnya 1,250,000.';
  else if (balance < 0 || balance > LIMITS.balanceMax) errors.balance = 'Saldo di luar batas yang wajar.';

  const rank = toInt(src.rank);
  if (!Number.isFinite(rank) || rank < LIMITS.rankMin || rank > LIMITS.rankMax) {
    errors.rank = `Isi rank antara ${LIMITS.rankMin} dan ${LIMITS.rankMax}.`;
  }

  const platform = has(OPTIONS.platform, src.platform) ? src.platform : null;
  if (!platform) errors.platform = 'Pilih versi PC yang Anda mainkan.';

  const gtaPlus = has(OPTIONS.gtaPlus, src.gtaPlus) ? src.gtaPlus : null;
  if (!gtaPlus) errors.gtaPlus = 'Pilih status GTA+.';

  const sessionMinutes = toInt(src.sessionMinutes);
  if (!Number.isFinite(sessionMinutes) || sessionMinutes < LIMITS.sessionMin || sessionMinutes > LIMITS.sessionMax) {
    errors.sessionMinutes = `Isi durasi antara ${LIMITS.sessionMin} dan ${LIMITS.sessionMax} menit.`;
  }

  // Kolom baru di versi 0.3.0: data lama tanpa kolom ini memakai nilai bawaan.
  const sessionsPerWeek = src.sessionsPerWeek === undefined ? DEFAULT_PROFILE.sessionsPerWeek : toInt(src.sessionsPerWeek);
  if (!Number.isFinite(sessionsPerWeek) || sessionsPerWeek < LIMITS.sessionsPerWeekMin || sessionsPerWeek > LIMITS.sessionsPerWeekMax) {
    errors.sessionsPerWeek = `Isi jumlah sesi antara ${LIMITS.sessionsPerWeekMin} dan ${LIMITS.sessionsPerWeekMax} per minggu.`;
  }

  const playstyle = has(OPTIONS.playstyle, src.playstyle) ? src.playstyle : null;
  if (!playstyle) errors.playstyle = 'Pilih gaya bermain.';

  const reservePercent = toInt(src.reservePercent);
  if (!Number.isFinite(reservePercent) || reservePercent < LIMITS.reserveMin || reservePercent > LIMITS.reserveMax) {
    errors.reservePercent = `Isi dana cadangan antara ${LIMITS.reserveMin}% dan ${LIMITS.reserveMax}%.`;
  }

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value: ok ? { name, balance, rank, platform, gtaPlus, sessionMinutes, sessionsPerWeek, playstyle, reservePercent } : null,
  };
}

/**
 * Membangun state bersih dari data yang tidak tepercaya (LocalStorage atau file impor).
 * Kolom yang tidak dikenal dibuang. Melempar Error jika profil ada tetapi tidak valid.
 */
export function sanitizeState(raw, now = new Date()) {
  const base = defaultState(now);
  if (!raw || typeof raw !== 'object') return base;

  if (raw.profile != null) {
    const check = validateProfile(raw.profile);
    if (!check.ok) throw new Error('Data profil tidak valid: ' + Object.values(check.errors)[0]);
    base.profile = { ...check.value, updatedAt: isIsoDate(raw.profile.updatedAt) ? raw.profile.updatedAt : null };
  }

  if (raw.owned && typeof raw.owned === 'object' && !Array.isArray(raw.owned)) {
    for (const [id, entry] of Object.entries(raw.owned)) {
      if (!ID_PATTERN.test(id)) continue;
      const upgrades = Array.isArray(entry?.upgrades) ? entry.upgrades.filter((u) => typeof u === 'string' && ID_PATTERN.test(u)) : [];
      base.owned[id] = { upgrades: [...new Set(upgrades)] };
    }
  }

  if (Array.isArray(raw.progress?.completedSteps)) {
    base.progress.completedSteps = [...new Set(raw.progress.completedSteps.filter((s) => typeof s === 'string' && ID_PATTERN.test(s)))];
  }

  if (Array.isArray(raw.balanceHistory)) {
    const byDate = new Map();
    for (const entry of raw.balanceHistory) {
      const balance = toInt(entry?.balance);
      if (!DATE_KEY_PATTERN.test(entry?.date ?? '') || !Number.isFinite(balance)) continue;
      if (balance < 0 || balance > LIMITS.balanceMax) continue;
      byDate.set(entry.date, { date: entry.date, balance });
    }
    base.balanceHistory = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-LIMITS.historyMax);
  }

  if (raw.meta && typeof raw.meta === 'object') {
    if (isIsoDate(raw.meta.createdAt)) base.meta.createdAt = raw.meta.createdAt;
    if (isIsoDate(raw.meta.lastExportAt)) base.meta.lastExportAt = raw.meta.lastExportAt;
  }

  return base;
}

/**
 * Menaikkan data versi lama ke SCHEMA_VERSION.
 * Tambahkan langkah migrasi di sini setiap kali struktur berubah.
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Format data tidak dikenali.');
  const version = raw.schemaVersion;
  if (!Number.isInteger(version) || version < 1) throw new Error('Versi data tidak dikenali.');
  if (version > SCHEMA_VERSION) {
    throw new Error('Data ini dibuat oleh versi website yang lebih baru. Perbarui website terlebih dahulu.');
  }
  const data = { ...raw };
  // Contoh langkah migrasi berikutnya:
  // if (data.schemaVersion === 1) { ...ubah struktur...; data.schemaVersion = 2; }
  return data;
}

/** Mengecek apakah penyimpanan benar-benar bisa ditulis (mode privat bisa menolak). */
export function isStorageUsable(storage) {
  if (!storage) return false;
  try {
    const probe = '__gtacoach_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Membuat store. `storage` mengikuti antarmuka Web Storage (getItem/setItem/removeItem).
 * `now` bisa diganti saat pengujian.
 */
export function createStore({ storage, now = () => new Date() } = {}) {
  const available = isStorageUsable(storage);
  const listeners = new Set();
  let loadWarning = null;
  let state = read();

  function read() {
    if (!available) return defaultState(now());
    let text = null;
    try {
      text = storage.getItem(STORAGE_KEY);
      if (!text) return defaultState(now());
      return sanitizeState(migrate(JSON.parse(text)), now());
    } catch (err) {
      // Simpan salinan data rusak agar masih bisa diselamatkan secara manual.
      try {
        if (text) storage.setItem(CORRUPT_KEY, text);
      } catch {
        /* abaikan: penyimpanan penuh */
      }
      loadWarning = `Data tersimpan tidak bisa dibaca (${err.message}) dan diganti dengan data kosong. Salinan data lama disimpan dengan kunci "${CORRUPT_KEY}".`;
      return defaultState(now());
    }
  }

  function persist(next) {
    if (!available) {
      state = next;
      notify();
      return { ok: false, error: 'Penyimpanan browser tidak tersedia. Perubahan hanya bertahan sampai halaman ditutup.' };
    }
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
      state = next;
      notify();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Gagal menyimpan: penyimpanan browser penuh atau diblokir.' };
    }
  }

  function notify() {
    for (const fn of listeners) fn(getState());
  }

  function getState() {
    return structuredClone(state);
  }

  function saveProfile(input) {
    const check = validateProfile(input);
    if (!check.ok) return { ok: false, errors: check.errors };
    const time = now();
    const next = structuredClone(state);
    next.profile = { ...check.value, updatedAt: time.toISOString() };

    // Satu entri riwayat per hari; simpan ulang di hari yang sama memperbarui entri tersebut.
    const key = localDateKey(time);
    const history = next.balanceHistory.filter((e) => e.date !== key);
    history.push({ date: key, balance: check.value.balance });
    history.sort((a, b) => (a.date < b.date ? -1 : 1));
    next.balanceHistory = history.slice(-LIMITS.historyMax);

    const result = persist(next);
    return result.ok ? { ok: true, errors: {} } : { ok: false, errors: {}, error: result.error };
  }

  /** Menandai bisnis dimiliki atau tidak. Upgrade ikut terhapus saat kepemilikan dicabut. */
  function setOwned(id, owned) {
    if (!ID_PATTERN.test(id)) return { ok: false, error: 'ID bisnis tidak valid.' };
    const next = structuredClone(state);
    if (owned) next.owned[id] = next.owned[id] ?? { upgrades: [] };
    else delete next.owned[id];
    return persist(next);
  }

  function setOwnedUpgrade(id, upgradeId, on) {
    if (!ID_PATTERN.test(id) || !ID_PATTERN.test(upgradeId)) return { ok: false, error: 'ID tidak valid.' };
    if (!state.owned[id]) return { ok: false, error: 'Tandai bisnis sebagai dimiliki terlebih dahulu.' };
    const next = structuredClone(state);
    const set = new Set(next.owned[id].upgrades);
    if (on) set.add(upgradeId);
    else set.delete(upgradeId);
    next.owned[id].upgrades = [...set];
    return persist(next);
  }

  /**
   * Mencatat pembelian dalam satu langkah: bisnis ditandai dimiliki, upgrade ditambahkan,
   * dan saldo dikurangi. Gagal jika saldo tidak cukup atau profil belum ada.
   */
  function applyPurchase({ id, upgrades = [], cost }) {
    if (!state.profile) return { ok: false, error: 'Isi profil pemain terlebih dahulu.' };
    if (!ID_PATTERN.test(id) || !upgrades.every((u) => ID_PATTERN.test(u))) return { ok: false, error: 'ID tidak valid.' };
    if (!Number.isInteger(cost) || cost < 0) return { ok: false, error: 'Biaya tidak valid.' };
    if (cost > state.profile.balance) return { ok: false, error: 'Saldo di profil lebih kecil dari biaya pembelian.' };
    const time = now();
    const next = structuredClone(state);
    const current = new Set(next.owned[id]?.upgrades ?? []);
    for (const u of upgrades) current.add(u);
    next.owned[id] = { upgrades: [...current] };
    next.profile.balance -= cost;
    next.profile.updatedAt = time.toISOString();
    const key = localDateKey(time);
    next.balanceHistory = next.balanceHistory.filter((e) => e.date !== key);
    next.balanceHistory.push({ date: key, balance: next.profile.balance });
    next.balanceHistory.sort((a, b) => (a.date < b.date ? -1 : 1));
    next.balanceHistory = next.balanceHistory.slice(-LIMITS.historyMax);
    return persist(next);
  }

  /** Mencentang atau menghapus centang langkah manual di Tahapan pemula. */
  function setStepDone(stepId, done) {
    if (!ID_PATTERN.test(stepId)) return { ok: false, error: 'ID langkah tidak valid.' };
    const next = structuredClone(state);
    const set = new Set(next.progress.completedSteps);
    if (done) set.add(stepId);
    else set.delete(stepId);
    next.progress.completedSteps = [...set];
    return persist(next);
  }

  function exportPayload() {
    return {
      app: BACKUP_APP_ID,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: now().toISOString(),
      data: getState(),
    };
  }

  function markExported(at = now()) {
    const next = structuredClone(state);
    next.meta.lastExportAt = at.toISOString();
    return persist(next);
  }

  /** Membaca teks file cadangan tanpa mengubah data. Panggil replaceState() setelah pengguna setuju. */
  function parseBackup(text) {
    if (typeof text !== 'string' || text.length === 0) return { ok: false, error: 'File kosong.' };
    if (text.length > LIMITS.importMaxBytes) return { ok: false, error: 'File terlalu besar untuk sebuah cadangan.' };
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'File bukan JSON yang valid.' };
    }
    if (!parsed || parsed.app !== BACKUP_APP_ID || !parsed.data) {
      return { ok: false, error: 'File ini bukan cadangan dari Business Coach.' };
    }
    try {
      const clean = sanitizeState(migrate(parsed.data), now());
      return { ok: true, state: clean, exportedAt: isIsoDate(parsed.exportedAt) ? parsed.exportedAt : null };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  function replaceState(nextState) {
    return persist(sanitizeState(nextState, now()));
  }

  function reset() {
    return persist(defaultState(now()));
  }

  /** Muat ulang dari penyimpanan, misalnya saat tab lain mengubah data. */
  function reload() {
    state = read();
    notify();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function status() {
    return { available, loadWarning };
  }

  function dismissLoadWarning() {
    loadWarning = null;
  }

  return {
    getState,
    saveProfile,
    setOwned,
    setOwnedUpgrade,
    applyPurchase,
    setStepDone,
    exportPayload,
    markExported,
    parseBackup,
    replaceState,
    reset,
    reload,
    subscribe,
    status,
    dismissLoadWarning,
  };
}
