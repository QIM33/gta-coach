// Mesin rekomendasi berbasis aturan.
// Prinsip:
// 1. Setiap saran harus bisa dijelaskan: alasan, angka, asumsi, dan tingkat keyakinan.
// 2. Dana cadangan tidak pernah dipakai untuk investasi.
// 3. Data yang belum bisa dihitung tidak diberi peringkat; ditampilkan terpisah.
// Urutan prioritas Next Best Action:
//   A. Peluang event terbatas waktu pada aset yang sudah dimiliki
//   B. Investasi terjangkau (upgrade aset lama atau beli baru) dengan balik modal tercepat
//   C. Menjalankan aktivitas yang sudah dimiliki dengan GTA$/jam tertinggi
//   D. Target tabungan untuk investasi terbaik berikutnya

import { scenarioInput, calculate } from './calculator.js';
import { splitBalance } from './finance.js';
import { eventEffectsFor, eventMultiplierFor } from '../data.js';
import { formatGTA } from '../format.js';

const mid = (r) => (r && r.min != null && r.max != null ? (r.min + r.max) / 2 : null);
const sum = (list) => list.reduce((a, b) => a + b, 0);

const decimal = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const hoursText = (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} menit` : `${decimal.format(h)} jam`);

// Penalti perbandingan untuk data yang kurang pasti: balik modal dianggap lebih lama.
const CONFIDENCE_PENALTY = { tinggi: 1, sedang: 1.15, rendah: 1.3 };
const rankPayback = (c) => mid(c.payback) * (CONFIDENCE_PENALTY[c.confidence] ?? 1.3);

function confidenceOf(entry, scenario) {
  if (entry.dataStatus !== 'lengkap') return 'rendah';
  if (scenario.estimates.length) return 'sedang';
  return 'tinggi';
}

/** Skenario yang bisa dijalankan dengan upgrade yang dimiliki (urutan data = skenario utama dulu). */
function usableScenario(entry, ownedUpgrades) {
  return entry.scenarios.find((s) => s.useForRanking && s.upgrades.every((u) => ownedUpgrades.has(u))) ?? null;
}

/**
 * Menilai satu skenario: laba per jam dan sifatnya.
 * Untuk aktivitas dengan batas mingguan, laba per jam dibatasi oleh berapa jam Anda bermain per minggu.
 */
export function evaluateScenario(entry, scenario, ownedInfo, mult, profile) {
  const input = scenarioInput(entry, scenario, ownedInfo, mult);
  const result = calculate(input);
  const kind = scenario.passive ? 'pasif' : scenario.productionMinutes ? 'produksi' : 'aktif';
  const base = { input, result, kind, perHour: null, quantified: false, limited: false, fitsSession: true, notes: [] };

  if (scenario.payout.min == null) {
    base.notes.push('Pendapatan terendah belum diketahui.');
    return base;
  }

  if (kind === 'produksi') {
    base.perHour = result.perProductionHour;
  } else if (kind === 'pasif') {
    base.perHour = result.perOnlineHour;
  } else {
    const a = scenario.activeMinutes;
    if (!a) {
      base.notes.push('Durasi pengerjaan belum diketahui.');
      return base;
    }
    const cooldown = scenario.cooldownMinutes ?? 0;
    const fast = Math.max(a.min, cooldown);
    const slow = Math.max(a.max, cooldown);
    base.perHour = { min: result.net.min / (slow / 60), max: result.net.max / (fast / 60) };
    if (cooldown > a.max) base.notes.push(`Dihitung dengan jeda ${cooldown} menit antar-run.`);
    base.fitsSession = a.min <= profile.sessionMinutes;
    if (!base.fitsSession) base.notes.push(`Satu siklus (minimal ${a.min} menit) lebih lama dari durasi sesi Anda.`);

    if (scenario.limitPerWeek) {
      base.limited = true;
      const weeklyHours = (profile.sessionMinutes * profile.sessionsPerWeek) / 60;
      const weeklyCap = { min: (scenario.limitPerWeek * result.net.min) / weeklyHours, max: (scenario.limitPerWeek * result.net.max) / weeklyHours };
      base.perHour = { min: Math.min(base.perHour.min, weeklyCap.min), max: Math.min(base.perHour.max, weeklyCap.max) };
      base.notes.push(`Terbatas ${scenario.limitPerWeek} kali per minggu; laba per jam disebar ke ${decimal.format(weeklyHours)} jam bermain Anda per minggu.`);
    }
  }

  base.quantified = Boolean(base.perHour) && base.perHour.min > 0;
  if (base.perHour && !(base.perHour.min > 0)) base.notes.push('Laba per siklus tidak positif pada skenario terburuk.');
  return base;
}

function payback(cost, perHour) {
  if (!perHour || !(perHour.min > 0) || cost == null) return null;
  return { min: cost / perHour.max, max: cost / perHour.min };
}

/**
 * Membuat rekomendasi lengkap.
 * input: { profile, owned, catalog (entri tervalidasi), events: { data, status } }
 */
export function recommend({ profile, owned = {}, catalog = [], events = null }) {
  if (!profile) return { ready: false, reason: 'profile' };
  if (!catalog.length) return { ready: false, reason: 'catalog' };

  const money = splitBalance(profile.balance, profile.reservePercent);
  const evData = events?.data ?? null;
  const evStatus = events?.status ?? { state: 'none' };
  const eventUsable = evStatus.state === 'active';

  const eventActions = [];
  const investments = [];
  const pendingUpgrades = [];
  const runs = [];
  const routine = [];
  const unassessed = [];

  for (const entry of catalog) {
    if (entry.solo === 'tidak' && profile.playstyle === 'solo') continue;
    const ownedInfo = owned[entry.id] ?? null;
    const mult = eventUsable ? eventMultiplierFor(evData, evStatus, entry.id) : 1;
    const effects = eventUsable ? eventEffectsFor(evData, evStatus, entry.id) : [];

    if (!ownedInfo) {
      // ----- kandidat beli -----
      let best = null;
      for (const scenario of entry.scenarios.filter((s) => s.useForRanking)) {
        const ev = evaluateScenario(entry, scenario, null, mult, profile);
        const cost = ev.input.investment;
        if (cost == null || !ev.quantified) continue;
        const pb = payback(cost, ev.perHour);
        const cand = {
          kind: 'buy',
          entry,
          scenario,
          cost,
          perHour: ev.perHour,
          payback: pb,
          affordable: cost <= money.investable,
          usesReserve: cost > money.investable && cost <= money.balance,
          limited: ev.limited,
          evalNotes: ev.notes,
          confidence: confidenceOf(entry, scenario),
          effects,
        };
        // Pilih skenario terjangkau dengan balik modal tercepat; jika tidak ada yang terjangkau, yang termurah.
        const better =
          !best ||
          (cand.affordable && !best.affordable) ||
          (cand.affordable === best.affordable && (cand.affordable ? mid(cand.payback) < mid(best.payback) : cand.cost < best.cost));
        if (better) best = cand;
      }
      if (best) investments.push(best);
      else unassessed.push({ entry, why: entry.purchase.price == null ? 'Harga beli belum terverifikasi.' : 'Durasi atau pendapatannya belum lengkap.' });
      continue;
    }

    // ----- aset yang dimiliki -----
    const ownedUpgrades = new Set(ownedInfo.upgrades);
    const current = usableScenario(entry, ownedUpgrades);
    const currentEval = current ? evaluateScenario(entry, current, ownedInfo, mult, profile) : null;

    // Peluang event pada aset sendiri
    for (const effect of effects) {
      eventActions.push({ kind: 'event', entry, effect, confidence: 'tinggi', cost: 0 });
    }

    // Upgrade yang disarankan tetapi belum dipasang
    const missing = entry.upgrades.filter((u) => u.recommended && !ownedUpgrades.has(u.id));
    if (missing.length) {
      const target = entry.scenarios.find((s) => s.useForRanking && s.upgrades.some((u) => !ownedUpgrades.has(u)));
      const targetEval = target ? evaluateScenario(entry, target, ownedInfo, mult, profile) : null;
      const cost = targetEval ? targetEval.input.investment : sum(missing.map((u) => u.price));
      const missingObjs = target ? target.upgrades.filter((u) => !ownedUpgrades.has(u)).map((id) => entry.upgrades.find((u) => u.id === id)) : missing;
      const names = missingObjs.map((u) => u.name);
      const upgradeIds = missingObjs.map((u) => u.id);
      if (targetEval?.quantified && currentEval?.quantified) {
        const gain = { min: targetEval.perHour.min - currentEval.perHour.min, max: targetEval.perHour.max - currentEval.perHour.max };
        if (gain.min > 0) {
          investments.push({
            kind: 'upgrade',
            entry,
            scenario: target,
            upgradeNames: names,
            upgradeIds,
            cost,
            perHour: gain,
            payback: payback(cost, gain),
            affordable: cost <= money.investable,
            usesReserve: cost > money.investable && cost <= money.balance,
            limited: false,
            evalNotes: [],
            confidence: confidenceOf(entry, target),
            effects: [],
          });
        }
      } else {
        pendingUpgrades.push({
          kind: 'upgrade',
          // Aset yang belum bisa menghasilkan tanpa upgrade ini didahulukan.
          blocking: !current,
          entry,
          upgradeNames: names,
          upgradeIds,
          cost,
          perHour: null,
          payback: null,
          affordable: cost <= money.investable,
          usesReserve: cost > money.investable && cost <= money.balance,
          confidence: 'rendah',
          evalNotes: ['Sumber menyarankan upgrade ini, tetapi data tanpa upgrade belum lengkap sehingga dampaknya belum bisa dihitung.'],
          effects: [],
        });
      }
    }

    // Menjalankan aset
    if (!current) {
      routine.push({ entry, text: `${entry.name}: pasang upgrade yang dibutuhkan agar skenario pendapatannya bisa dihitung.` });
    } else if (currentEval.kind === 'produksi' || currentEval.kind === 'pasif') {
      routine.push({
        entry,
        text:
          currentEval.kind === 'produksi'
            ? `${entry.name}: jaga produksi tetap jalan${current.costPerCycle ? ` (suplai ${formatGTA(current.costPerCycle)} per stok penuh)` : ''}, jual saat penuh.`
            : `${entry.name}: kosongkan brankas secara berkala dan jaga popularitas.`,
        perHour: currentEval.quantified ? currentEval.perHour : null,
        supplyWarning: current.costPerCycle && current.costPerCycle > profile.balance ? `Saldo belum cukup untuk membeli suplai (${formatGTA(current.costPerCycle)}).` : null,
      });
    } else if (currentEval.quantified) {
      runs.push({
        kind: 'run',
        entry,
        scenario: current,
        cost: current.costPerCycle ?? 0,
        perHour: currentEval.perHour,
        fitsSession: currentEval.fitsSession,
        limited: currentEval.limited,
        evalNotes: currentEval.notes,
        confidence: confidenceOf(entry, current),
        effects,
      });
    } else {
      unassessed.push({ entry, why: currentEval.notes[0] ?? 'Data belum lengkap.', owned: true });
    }
  }

  // ----- urutkan -----
  const byPayback = (a, b) => rankPayback(a) - rankPayback(b);
  const affordableInv = investments.filter((c) => c.affordable).sort(byPayback);
  const affordablePending = pendingUpgrades.filter((c) => c.affordable).sort((a, b) => a.cost - b.cost);
  const blockingPending = affordablePending.filter((c) => c.blocking);
  const otherPending = affordablePending.filter((c) => !c.blocking);
  const sortedRuns = runs.sort((a, b) => Number(b.fitsSession) - Number(a.fitsSession) || mid(b.perHour) - mid(a.perHour));
  const notAffordable = investments.filter((c) => !c.affordable).sort(byPayback);

  const bestRun = sortedRuns.find((r) => r.fitsSession && !r.limited) ?? sortedRuns[0] ?? null;
  const bestIncome = bestRun?.perHour ?? routine.find((r) => r.perHour)?.perHour ?? null;

  // Target tabungan: total waktu = waktu mengumpulkan kekurangan + waktu balik modal.
  // Tanpa sumber pendapatan yang terhitung, pilih kekurangan terkecil agar target cepat tercapai.
  let saveTarget = null;
  if (notAffordable.length) {
    const incomeMid = bestIncome ? mid(bestIncome) : null;
    const totalTime = (c) => (c.cost - money.investable) / incomeMid + rankPayback(c);
    const t = [...notAffordable].sort((a, b) => (incomeMid > 0 ? totalTime(a) - totalTime(b) : a.cost - b.cost))[0];
    const need = t.cost - money.investable;
    saveTarget = {
      kind: 'save',
      entry: t.entry,
      scenario: t.scenario,
      target: t,
      cost: t.cost,
      need,
      hoursEstimate: bestIncome && mid(bestIncome) > 0 ? need / mid(bestIncome) : null,
      confidence: t.confidence,
      effects: [],
    };
    // Menabung sebentar untuk target yang lebih baik bisa lebih cepat daripada membeli sekarang.
    const bestNow = affordableInv[0];
    if (bestNow && saveTarget.hoursEstimate != null) {
      const waitTotal = saveTarget.hoursEstimate + rankPayback(t);
      saveTarget.beatsBuyNow = waitTotal < rankPayback(bestNow);
      if (saveTarget.beatsBuyNow) saveTarget.versus = bestNow;
    }
  }

  const saveFirst = saveTarget?.beatsBuyNow ? [{ ...saveTarget, tier: 'B' }] : [];
  const ordered = [
    ...eventActions.map((a) => ({ ...a, tier: 'A' })),
    ...saveFirst,
    ...blockingPending.map((a) => ({ ...a, tier: 'B' })),
    ...affordableInv.map((a) => ({ ...a, tier: 'B' })),
    ...otherPending.map((a) => ({ ...a, tier: 'B' })),
    ...sortedRuns.map((a) => ({ ...a, tier: 'C' })),
    ...(saveTarget && !saveTarget.beatsBuyNow ? [{ ...saveTarget, tier: 'D' }] : []),
  ];

  const nba = ordered[0] ? describe(ordered[0], money, { bestRun }) : null;
  const alternatives = [];
  for (const cand of ordered.slice(1)) {
    if (alternatives.length === 2) break;
    if (nba && cand.entry.id === nba.entryId && cand.kind === ordered[0].kind) continue;
    alternatives.push(describe(cand, money, { bestRun }));
  }

  return {
    ready: true,
    money,
    nba,
    alternatives,
    comparison: compareOptimizeVsBuy(affordableInv),
    routine,
    unassessed,
    eventState: evStatus.state,
    assumptions: [
      'Dana cadangan tidak dipakai untuk investasi.',
      `Jam bermain per minggu dihitung dari profil: ${profile.sessionsPerWeek} sesi × ${profile.sessionMinutes} menit.`,
      'Balik modal bisnis produksi dihitung dalam jam online, karena produksi berjalan selama Anda berada di sesi.',
      'Data berkeyakinan sedang atau rendah diberi penalti 15% atau 30% saat dibandingkan, agar angka yang kurang pasti tidak mengalahkan angka yang pasti.',
      'Target tabungan dipilih dari waktu terpendek untuk mengumpulkan kekurangan ditambah waktu balik modal; tanpa sumber pendapatan terhitung, dipilih kekurangan terkecil.',
    ],
  };
}

function compareOptimizeVsBuy(affordable) {
  const up = affordable.find((c) => c.kind === 'upgrade');
  const buy = affordable.find((c) => c.kind === 'buy');
  if (!up || !buy) return null;
  const a = mid(up.payback);
  const b = mid(buy.payback);
  const upText = `Upgrade ${up.entry.name} balik modal sekitar ${hoursText(a)}`;
  const buyText = `membeli ${buy.entry.name} (sekitar ${hoursText(b)})`;
  return a <= b ? `${upText}, lebih cepat daripada ${buyText}. Optimalkan aset lama dulu.` : `${upText}, lebih lambat daripada ${buyText}. Membeli bisnis baru lebih menguntungkan saat ini.`;
}

/** Mengubah kandidat menjadi aksi yang siap ditampilkan. */
function describe(c, money, { bestRun }) {
  const base = {
    kind: c.kind,
    tier: c.tier,
    entryId: c.entry.id,
    entryName: c.entry.name,
    confidence: c.confidence,
    link: `#/kalkulator/${c.entry.id}`,
    cost: c.cost ?? null,
    perHour: c.perHour ?? null,
    payback: c.payback ?? null,
    details: [...(c.evalNotes ?? [])],
    requirements: c.kind === 'buy' || c.kind === 'save' ? c.entry.requirements : [],
  };

  switch (c.kind) {
    case 'event':
      return {
        ...base,
        title: `Manfaatkan event di ${c.entry.name}`,
        reason: `${c.effect.label}.${c.effect.note ? ` ${c.effect.note}.` : ''} Bonus ini hanya berlaku sampai reset Kamis.`,
        link: '#/event',
      };
    case 'upgrade':
      return {
        ...base,
        purchase: { id: c.entry.id, upgrades: c.upgradeIds, cost: c.cost },
        title: `Pasang ${c.upgradeNames.join(' + ')} di ${c.entry.name}`,
        reason: c.payback
          ? `Menambah laba sekitar ${formatGTA(Math.round(mid(c.perHour) / 100) * 100)} per jam online dan balik modal sekitar ${hoursText(mid(c.payback))}.`
          : 'Upgrade ini disarankan sumber untuk bisnis yang sudah Anda miliki.',
        details: [...base.details, `Sisa dana investasi setelah membeli: ${formatGTA(money.investable - c.cost)}.`],
      };
    case 'buy':
      return {
        ...base,
        purchase: { id: c.entry.id, upgrades: [...c.scenario.upgrades], cost: c.cost },
        title: `Beli ${c.entry.name}`,
        reason: `Investasi terjangkau dengan balik modal tercepat: sekitar ${hoursText(mid(c.payback))} ${c.scenario.productionMinutes ? 'online' : 'bermain'}.`,
        details: [
          ...base.details,
          `Modal ${formatGTA(c.cost)} untuk skenario "${c.scenario.label}"; sisa dana investasi ${formatGTA(money.investable - c.cost)}.`,
        ],
      };
    case 'run':
      return {
        ...base,
        title: `Kerjakan ${c.entry.name}: ${c.scenario.label}`,
        reason: `Aktivitas dengan GTA$ per jam tertinggi dari aset Anda: sekitar ${formatGTA(Math.round(mid(c.perHour) / 100) * 100)} per jam.`,
        cost: null,
      };
    case 'save': {
      const t = c.target;
      const how = c.hoursEstimate
        ? ` Dengan ${bestRun ? `menjalankan ${bestRun.entry.name}` : 'produksi bisnis Anda'}, perkiraan sekitar ${hoursText(c.hoursEstimate)}.`
        : '';
      return {
        ...base,
        title: `Kumpulkan ${formatGTA(c.need)} lagi untuk ${c.entry.name}`,
        reason: `Investasi berikutnya dengan balik modal tercepat (${hoursText(mid(t.payback))}) butuh modal ${formatGTA(c.cost)}, sedangkan dana investasi Anda ${formatGTA(money.investable)}.${how}`,
        perHour: t.perHour,
        payback: t.payback,
        details: [
          ...(c.versus ? [`Lebih cepat secara total daripada langsung membeli ${c.versus.entry.name} (balik modal sekitar ${hoursText(mid(c.versus.payback))}).`] : []),
          ...(t.usesReserve ? ['Saldo total sebenarnya cukup, tetapi pembelian akan memakai dana cadangan. Tidak disarankan.'] : []),
        ],
      };
    }
    default:
      return { ...base, title: c.entry.name, reason: '' };
  }
}
