// Kalkulator profit. Semua hasil berupa rentang: batas bawah memakai
// pendapatan terendah dan waktu terlama, batas atas sebaliknya.
// Fungsi murni: tidak menyentuh DOM atau penyimpanan.

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Menyusun isian awal kalkulator dari satu skenario katalog.
 * Harga beli dan upgrade yang sudah dimiliki pemain tidak dihitung sebagai modal.
 */
export function scenarioInput(entry, scenario, ownedInfo = null, multiplier = 1) {
  const owned = Boolean(ownedInfo);
  const ownedUpgrades = new Set(ownedInfo?.upgrades ?? []);
  const needed = scenario.upgrades
    .filter((id) => !ownedUpgrades.has(id))
    .map((id) => entry.upgrades.find((u) => u.id === id))
    .filter(Boolean);
  const upgradeCost = needed.reduce((sum, u) => sum + u.price, 0);
  const purchase = owned ? 0 : entry.purchase.price;

  return {
    investment: purchase === null ? null : purchase + upgradeCost,
    investmentParts: { purchase, owned, upgrades: needed.map((u) => ({ name: u.name, price: u.price })) },
    payoutMin: scenario.payout.min,
    payoutMax: scenario.payout.max,
    costPerCycle: scenario.costPerCycle ?? 0,
    costKnown: scenario.costPerCycle !== null,
    activeMin: scenario.activeMinutes?.min ?? null,
    activeMax: scenario.activeMinutes?.max ?? null,
    productionMinutes: scenario.productionMinutes,
    cycleMinutes: scenario.cycleMinutes,
    multiplier,
  };
}

function cyclesToRecover(investment, net) {
  if (!finite(investment)) return null;
  if (investment === 0) return 0;
  if (!finite(net) || net <= 0) return null;
  return Math.ceil(investment / net);
}

/**
 * Menghitung laba dan balik modal.
 * input: { investment, payoutMin (boleh null), payoutMax, costPerCycle, activeMin, activeMax,
 *          productionMinutes, cycleMinutes, multiplier }
 */
export function calculate(input) {
  const mult = finite(input.multiplier) && input.multiplier > 0 ? input.multiplier : 1;
  const cost = finite(input.costPerCycle) ? input.costPerCycle : 0;
  const hasMin = finite(input.payoutMin);

  const grossMax = input.payoutMax * mult;
  const grossMin = hasMin ? input.payoutMin * mult : null;
  const netMax = grossMax - cost;
  const netMin = hasMin ? grossMin - cost : null;

  const hasActive = finite(input.activeMin) && finite(input.activeMax) && input.activeMin > 0 && input.activeMax >= input.activeMin;
  const perActiveHour = hasActive
    ? { min: hasMin ? netMin / (input.activeMax / 60) : null, max: netMax / (input.activeMin / 60) }
    : null;

  // Untuk bisnis produksi: laba dibagi lama produksi (waktu online yang dibutuhkan per siklus).
  const hasProduction = finite(input.productionMinutes) && input.productionMinutes > 0;
  const perProductionHour = hasProduction
    ? { min: hasMin ? netMin / (input.productionMinutes / 60) : null, max: netMax / (input.productionMinutes / 60) }
    : null;

  const hasCycle = finite(input.cycleMinutes) && input.cycleMinutes > 0;
  const perOnlineHour = hasCycle
    ? { min: hasMin ? netMin / (input.cycleMinutes / 60) : null, max: netMax / (input.cycleMinutes / 60) }
    : null;

  // Balik modal tercepat memakai laba tertinggi; terlama memakai laba terendah.
  const cyclesFast = cyclesToRecover(input.investment, netMax);
  const cyclesSlow = hasMin ? cyclesToRecover(input.investment, netMin) : null;

  const payback = {
    cycles: { min: cyclesFast, max: cyclesSlow },
    activeHours:
      hasActive && cyclesFast !== null
        ? { min: (cyclesFast * input.activeMin) / 60, max: cyclesSlow !== null ? (cyclesSlow * input.activeMax) / 60 : null }
        : null,
    productionHours:
      finite(input.productionMinutes) && cyclesFast !== null
        ? { min: (cyclesFast * input.productionMinutes) / 60, max: cyclesSlow !== null ? (cyclesSlow * input.productionMinutes) / 60 : null }
        : null,
    onlineHours:
      hasCycle && cyclesFast !== null
        ? { min: (cyclesFast * input.cycleMinutes) / 60, max: cyclesSlow !== null ? (cyclesSlow * input.cycleMinutes) / 60 : null }
        : null,
  };

  const warnings = [];
  if (netMax <= 0) warnings.push('Laba per siklus tidak positif: biaya sama dengan atau melebihi pendapatan.');
  else if (hasMin && netMin <= 0) warnings.push('Pada skenario terburuk, laba per siklus tidak positif.');
  if (!finite(input.investment)) warnings.push('Modal belum diisi, jadi balik modal tidak dihitung.');

  return {
    gross: { min: grossMin, max: grossMax },
    net: { min: netMin, max: netMax },
    perActiveHour,
    perProductionHour,
    perOnlineHour,
    payback,
    warnings,
  };
}

/** Membandingkan modal dengan dana investasi pemain. */
export function affordability(investment, investable) {
  if (!finite(investment) || !finite(investable)) return { state: 'unknown' };
  if (investment <= investable) return { state: 'ok', remaining: investable - investment };
  return { state: 'short', shortfall: investment - investable };
}
