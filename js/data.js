// Pemuat data (event, bisnis) dengan cadangan offline.
// Semua data dari luar masuk lewat modul ini. Jika nanti sumbernya pindah
// ke API, cukup modul ini dan DATA_SOURCES di config.js yang diubah.

const CACHE_PREFIX = 'gtacoach.cache.';

/**
 * Memuat JSON dari jaringan. Jika gagal, memakai salinan terakhir yang tersimpan.
 * Hasil: { data, source: 'network' | 'cache' | 'none', fetchedAt, error }
 */
export async function loadJSON(url, { cacheKey, storage, fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const key = cacheKey ? CACHE_PREFIX + cacheKey : null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetchImpl(url, { cache: 'no-cache', signal: controller?.signal });
    if (!res.ok) throw new Error(`Server membalas ${res.status}`);
    const data = await res.json();
    const fetchedAt = new Date().toISOString();
    if (key && storage) {
      try {
        storage.setItem(key, JSON.stringify({ savedAt: fetchedAt, data }));
      } catch {
        /* cache gagal ditulis tidak menghentikan aplikasi */
      }
    }
    return { data, source: 'network', fetchedAt, error: null };
  } catch (err) {
    const message = err?.name === 'AbortError' ? 'Waktu tunggu habis' : err?.message || 'Gagal memuat data';
    const cached = readCache(key, storage);
    if (cached) return { data: cached.data, source: 'cache', fetchedAt: cached.savedAt, error: message };
    return { data: null, source: 'none', fetchedAt: null, error: message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readCache(key, storage) {
  if (!key || !storage) return null;
  try {
    const text = storage.getItem(key);
    if (!text) return null;
    const parsed = JSON.parse(text);
    return parsed && parsed.data !== undefined ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Menentukan status data event mingguan pada waktu `now`.
 * Hanya status 'active' yang boleh dipakai dalam perhitungan rekomendasi.
 *  none     : belum ada data event
 *  invalid  : data rusak atau tanggal tidak masuk akal
 *  draft    : hasil parsing yang belum diverifikasi
 *  upcoming : terverifikasi, tetapi minggunya belum mulai
 *  active   : terverifikasi dan sedang berlaku
 *  expired  : terverifikasi, tetapi minggunya sudah berakhir
 */
export function eventStatus(data, now = new Date()) {
  if (!data || typeof data !== 'object') return { state: 'none' };
  if (data.status === 'none' || !Array.isArray(data.items) || data.items.length === 0) return { state: 'none' };

  const start = Date.parse(data.week?.startsAt);
  const end = Date.parse(data.week?.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { state: 'invalid' };
  if (data.status !== 'verified') return { state: 'draft', start, end };

  const t = now.getTime();
  if (t < start) return { state: 'upcoming', start, end };
  if (t >= end) return { state: 'expired', start, end };
  return { state: 'active', start, end };
}

/** Teks dan gaya lencana untuk setiap status event. */
export const EVENT_STATE_LABEL = Object.freeze({
  none: { text: 'Belum ada data', tone: 'neutral' },
  invalid: { text: 'Data tidak valid', tone: 'danger' },
  draft: { text: 'Menunggu verifikasi', tone: 'warn' },
  upcoming: { text: 'Belum dimulai', tone: 'neutral' },
  active: { text: 'Terverifikasi, sedang berlaku', tone: 'ok' },
  expired: { text: 'Kedaluwarsa', tone: 'danger' },
});

/** Item event yang berlaku untuk satu bisnis. Kosong jika event tidak aktif. */
export function eventEffectsFor(data, status, businessId) {
  if (status?.state !== 'active' || !Array.isArray(data?.items)) return [];
  return data.items.filter((item) => item && item.target === businessId);
}

/** Pengali pendapatan dari event aktif untuk satu bisnis (1 jika tidak ada). */
export function eventMultiplierFor(data, status, businessId) {
  return eventEffectsFor(data, status, businessId)
    .filter((item) => item.type === 'multiplier' && Number.isFinite(item.value) && item.value > 0)
    .reduce((m, item) => m * item.value, 1);
}
