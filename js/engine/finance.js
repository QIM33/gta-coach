// Perhitungan keuangan dasar. Fungsi murni tanpa akses DOM atau penyimpanan.

/**
 * Membagi saldo menjadi dana cadangan dan dana investasi.
 * Cadangan dibulatkan ke atas agar pemain tidak kekurangan dana suplai.
 */
export function splitBalance(balance, reservePercent) {
  const safeBalance = Math.max(0, Math.floor(Number(balance) || 0));
  const pct = Math.min(100, Math.max(0, Number(reservePercent) || 0));
  const reserve = Math.min(safeBalance, Math.ceil((safeBalance * pct) / 100));
  return { balance: safeBalance, reserve, investable: safeBalance - reserve, reservePercent: pct };
}

/** Selisih saldo antarentri riwayat (entri terbaru di depan). */
export function historyWithDelta(history) {
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
  return sorted.map((entry, i) => {
    const prev = sorted[i + 1];
    return { ...entry, delta: prev ? entry.balance - prev.balance : null };
  });
}
