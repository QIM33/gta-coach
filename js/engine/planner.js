// Penyusun rencana sesi: mengubah aset, rekomendasi, dan durasi bermain
// menjadi urutan langkah dengan perkiraan waktu dan pendapatan.
// Fungsi murni; semua durasi yang bukan dari sumber ditandai sebagai perkiraan.

import { evaluateScenario } from './recommend.js';
import { eventMultiplierFor, eventEffectsFor } from '../data.js';
import { formatGTA } from '../format.js';

// Perkiraan durasi langkah administratif (bukan dari sumber; ditampilkan sebagai perkiraan).
export const PLANNER_ESTIMATES = Object.freeze({
  buyMinutes: 5, // membeli properti atau upgrade lewat situs di ponsel game
  resupplyMinutes: 2, // membeli suplai lewat telepon/laptop
  wrapUpMinutes: 2, // mencatat saldo di website
});

const midRange = (r) => (r.min + r.max) / 2;

function usableScenario(entry, ownedUpgrades) {
  return entry.scenarios.find((s) => s.useForRanking && s.upgrades.every((u) => ownedUpgrades.has(u))) ?? null;
}

/**
 * input: { profile, owned, catalog, events: { data, status }, minutes, nba }
 * nba: aksi utama dari recommend() (boleh null). Pembelian yang terjangkau dijadwalkan di awal.
 */
export function planSession({ profile, owned = {}, catalog = [], events = null, minutes, nba = null }) {
  const total = Math.max(0, Math.floor(minutes));
  const steps = [];
  const notes = [];
  let t = 0;
  let balance = profile.balance;
  const earn = { min: 0, max: 0 };
  const evStatus = events?.status ?? { state: 'none' };
  const eventActive = evStatus.state === 'active';

  const push = (step, duration) => {
    steps.push({ ...step, start: t, end: t + duration });
    t += duration;
  };
  const fits = (d) => t + d <= total;

  // 1. Pembelian dari rekomendasi utama (jika terjangkau).
  if (nba?.purchase && nba.purchase.cost <= balance && fits(PLANNER_ESTIMATES.buyMinutes)) {
    push({ kind: 'buy', title: nba.title, detail: 'Rekomendasi utama dari dashboard. Catat dengan tombol "Sudah saya beli" setelah membeli.', cost: nba.purchase.cost, estimated: true }, PLANNER_ESTIMATES.buyMinutes);
    balance -= nba.purchase.cost;
  }

  // 2. Isi suplai bisnis produksi di awal, agar produksi berjalan selama sesi.
  const production = [];
  for (const entry of catalog) {
    const ownedInfo = owned[entry.id];
    if (!ownedInfo) continue;
    const scenario = usableScenario(entry, new Set(ownedInfo.upgrades));
    if (!scenario || !scenario.productionMinutes) continue;
    production.push({ entry, scenario, ownedInfo });
  }
  for (const p of production) {
    const cost = p.scenario.costPerCycle ?? 0;
    if (!fits(PLANNER_ESTIMATES.resupplyMinutes)) break;
    if (cost > balance) {
      notes.push(`Saldo tidak cukup untuk suplai ${p.entry.name} (${formatGTA(cost)}).`);
      continue;
    }
    push({ kind: 'resupply', entryId: p.entry.id, title: `Isi suplai ${p.entry.name}`, detail: `Produksi berjalan selama Anda online; stok penuh setelah sekitar ${p.scenario.productionMinutes} menit.`, cost, estimated: true }, PLANNER_ESTIMATES.resupplyMinutes);
    balance -= cost;
    p.readyAt = t + p.scenario.productionMinutes;
  }

  // 3. Peluang event pada aset sendiri didahulukan.
  const eventDone = new Set();
  if (eventActive) {
    for (const entry of catalog) {
      if (!owned[entry.id]) continue;
      const effects = eventEffectsFor(events.data, evStatus, entry.id);
      if (!effects.length) continue;
      const scenario = usableScenario(entry, new Set(owned[entry.id].upgrades));
      const dur = scenario?.activeMinutes ? Math.round(midRange(scenario.activeMinutes)) : null;
      if (!dur || !fits(dur)) {
        notes.push(`${entry.name}: ada bonus event, tetapi tidak muat dalam sesi ini.`);
        continue;
      }
      push({ kind: 'event', entryId: entry.id, title: `${entry.name} (bonus event)`, detail: effects.map((e) => e.label).join('; '), estimated: scenario.estimates.includes('activeMinutes') }, dur);
      eventDone.add(entry.id);
    }
  }

  // 4. Isi sisa waktu dengan aktivitas terbaik dari aset sendiri.
  const runs = [];
  for (const entry of catalog) {
    const ownedInfo = owned[entry.id];
    if (!ownedInfo) continue;
    const scenario = usableScenario(entry, new Set(ownedInfo.upgrades));
    if (!scenario || scenario.productionMinutes || scenario.passive || !scenario.activeMinutes) continue;
    const mult = eventActive ? eventMultiplierFor(events.data, evStatus, entry.id) : 1;
    const ev = evaluateScenario(entry, scenario, ownedInfo, mult, profile);
    if (!ev.quantified) continue;
    runs.push({
      entry,
      scenario,
      net: ev.result.net,
      perHour: ev.perHour,
      duration: Math.round(midRange(scenario.activeMinutes)),
      cooldown: scenario.cooldownMinutes ?? 0,
      maxCount: scenario.limitPerWeek ?? Infinity,
      count: eventDone.has(entry.id) ? 1 : 0,
      availableAt: eventDone.has(entry.id) ? t + (scenario.cooldownMinutes ?? 0) : 0,
    });
  }
  runs.sort((a, b) => midRange(b.perHour) - midRange(a.perHour));

  let guard = 0;
  while (guard++ < 50) {
    const candidates = runs.filter((r) => r.count < r.maxCount && r.availableAt <= t && fits(r.duration));
    if (!candidates.length) {
      // Semua aktivitas sedang jeda: sisipkan waktu luang jika aktivitas berikutnya masih muat dalam sesi.
      const next = runs
        .filter((r) => r.count < r.maxCount && r.availableAt > t && r.availableAt + r.duration <= total)
        .sort((a, b) => a.availableAt - b.availableAt)[0];
      if (!next) break;
      push({ kind: 'wait', title: `Jeda ${next.entry.name}`, detail: 'Waktu luang sampai aktivitas ini bisa diulang. Bisa dipakai untuk aktivitas tanpa modal atau menjual stok.' }, next.availableAt - t);
      continue;
    }
    const r = candidates[0];
    push(
      {
        kind: 'run',
        entryId: r.entry.id,
        title: `${r.entry.name}: ${r.scenario.label}`,
        detail: r.scenario.limitPerWeek ? `Terbatas ${r.scenario.limitPerWeek} kali per minggu; lewati jika jatahnya sudah habis.` : r.cooldown ? `Jeda ${r.cooldown} menit sebelum bisa diulang.` : '',
        earn: { min: r.net.min, max: r.net.max },
        estimated: r.scenario.estimates.includes('activeMinutes'),
      },
      r.duration,
    );
    earn.min += r.net.min;
    earn.max += r.net.max;
    r.count += 1;
    r.availableAt = t + r.cooldown;
  }

  // 5. Jual stok produksi yang penuh sebelum sesi berakhir.
  for (const p of production) {
    if (p.readyAt == null) continue;
    const sellDur = p.scenario.activeMinutes ? Math.round(midRange(p.scenario.activeMinutes)) : 10;
    if (p.readyAt <= total - sellDur - PLANNER_ESTIMATES.wrapUpMinutes) {
      if (p.readyAt > t) {
        push({ kind: 'wait', title: `Tunggu stok ${p.entry.name} penuh`, detail: 'Tetap online agar produksi berjalan. Waktu ini bisa dipakai untuk aktivitas lain.' }, p.readyAt - t);
      }
      if (!fits(sellDur)) continue;
      const net = { min: p.scenario.payout.min - (p.scenario.costPerCycle ?? 0), max: p.scenario.payout.max - (p.scenario.costPerCycle ?? 0) };
      push({ kind: 'sell', entryId: p.entry.id, title: `Jual stok ${p.entry.name}`, detail: 'Stok penuh pada titik ini jika Anda online sepanjang sesi.', earn: net, estimated: true }, sellDur);
      earn.min += net.min;
      earn.max += net.max;
    } else {
      const remaining = p.readyAt - total;
      notes.push(`${p.entry.name} belum penuh di akhir sesi (kurang sekitar ${Math.max(remaining, 1)} menit online). Produksi berlanjut di sesi berikutnya.`);
    }
  }

  // 6. Penutup: catat saldo agar rekomendasi berikutnya akurat.
  if (fits(PLANNER_ESTIMATES.wrapUpMinutes)) {
    push({ kind: 'wrap', title: 'Perbarui saldo di Profil pemain', detail: 'Rekomendasi berikutnya dihitung dari saldo ini.', estimated: true }, PLANNER_ESTIMATES.wrapUpMinutes);
  }

  if (!runs.length && !production.length) {
    notes.push('Belum ada aktivitas terhitung dari aset Anda. Ikuti Langkah berikutnya di dashboard untuk mendapatkan bisnis pertama.');
  }

  return {
    steps,
    total,
    used: t,
    idle: Math.max(0, total - t),
    earn: earn.max > 0 ? earn : null,
    notes,
  };
}
