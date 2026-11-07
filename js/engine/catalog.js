// Validasi katalog bisnis (data/businesses.json).
// Entri yang rusak dibuang dan dilaporkan, sehingga satu kesalahan ketik
// di file data tidak membuat seluruh halaman gagal.

const ID = /^[a-z0-9-]{1,48}$/;
const CATEGORIES = ['produksi', 'pasif', 'misi', 'heist'];

const isMoney = (v) => Number.isInteger(v) && v >= 0;
const isMoneyOrNull = (v) => v === null || isMoney(v);
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const textList = (v) => (Array.isArray(v) ? v.filter(isText) : []);

function checkRange(range, { allowNullMin = false } = {}) {
  if (!range || typeof range !== 'object') return false;
  if (!isMoney(range.max)) return false;
  if (range.min === null) return allowNullMin;
  return isMoney(range.min) && range.min <= range.max;
}

function checkMinutes(range) {
  if (range === null || range === undefined) return true;
  return Number.isFinite(range.min) && Number.isFinite(range.max) && range.min > 0 && range.min <= range.max;
}

function validateScenario(s, upgradeIds) {
  const problems = [];
  if (!ID.test(s?.id ?? '')) problems.push('id skenario tidak valid');
  if (!isText(s?.label)) problems.push('label skenario kosong');
  if (!checkRange(s?.payout, { allowNullMin: true })) problems.push('rentang payout tidak valid');
  if (!(s?.costPerCycle === undefined || isMoneyOrNull(s.costPerCycle))) problems.push('costPerCycle tidak valid');
  if (!checkMinutes(s?.activeMinutes)) problems.push('activeMinutes tidak valid');
  if (s?.productionMinutes != null && !(s.productionMinutes > 0)) problems.push('productionMinutes tidak valid');
  if (s?.cycleMinutes != null && !(s.cycleMinutes > 0)) problems.push('cycleMinutes tidak valid');
  const unknownUpgrades = (s?.upgrades ?? []).filter((u) => !upgradeIds.has(u));
  if (unknownUpgrades.length) problems.push(`upgrade tidak dikenal: ${unknownUpgrades.join(', ')}`);
  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    value: {
      id: s.id,
      label: s.label,
      upgrades: [...(s.upgrades ?? [])],
      payout: { min: s.payout.min, max: s.payout.max },
      costPerCycle: s.costPerCycle ?? null,
      activeMinutes: s.activeMinutes ? { min: s.activeMinutes.min, max: s.activeMinutes.max } : null,
      productionMinutes: s.productionMinutes ?? null,
      cycleMinutes: s.cycleMinutes ?? null,
      cooldownMinutes: s.cooldownMinutes ?? null,
      passive: s.passive === true,
      limit: isText(s.limit) ? s.limit : null,
      limitPerWeek: Number.isInteger(s.limitPerWeek) && s.limitPerWeek > 0 ? s.limitPerWeek : null,
      useForRanking: s.useForRanking !== false,
      estimates: textList(s.estimates),
      notes: textList(s.notes),
    },
  };
}

export function validateEntry(e) {
  const problems = [];
  if (!ID.test(e?.id ?? '')) problems.push('id tidak valid');
  if (!isText(e?.name)) problems.push('nama kosong');
  if (!CATEGORIES.includes(e?.category)) problems.push('kategori tidak dikenal');
  if (!isMoneyOrNull(e?.purchase?.price)) problems.push('harga beli tidak valid');
  if (!Array.isArray(e?.scenarios) || e.scenarios.length === 0) problems.push('tidak ada skenario');
  if (!Array.isArray(e?.sources) || !e.sources.some((s) => isText(s?.url))) problems.push('tidak ada sumber');

  const upgrades = [];
  for (const u of Array.isArray(e?.upgrades) ? e.upgrades : []) {
    if (ID.test(u?.id ?? '') && isText(u?.name) && isMoney(u?.price)) {
      upgrades.push({ id: u.id, name: u.name, price: u.price, recommended: u.recommended === true, effect: isText(u.effect) ? u.effect : '' });
    } else {
      problems.push(`upgrade tidak valid: ${u?.id ?? '?'}`);
    }
  }
  const upgradeIds = new Set(upgrades.map((u) => u.id));

  const scenarios = [];
  for (const s of Array.isArray(e?.scenarios) ? e.scenarios : []) {
    const r = validateScenario(s, upgradeIds);
    if (r.ok) scenarios.push(r.value);
    else problems.push(`skenario ${s?.id ?? '?'}: ${r.problems.join(', ')}`);
  }

  if (problems.length) return { ok: false, id: e?.id ?? '?', problems };
  return {
    ok: true,
    value: {
      id: e.id,
      name: e.name,
      category: e.category,
      summary: isText(e.summary) ? e.summary : '',
      platforms: textList(e.platforms),
      solo: ['ya', 'sebagian', 'tidak'].includes(e.solo) ? e.solo : 'sebagian',
      dataStatus: e.dataStatus === 'lengkap' ? 'lengkap' : 'sebagian',
      purchase: { price: e.purchase.price, note: isText(e.purchase.note) ? e.purchase.note : '' },
      requirements: textList(e.requirements),
      upgrades,
      scenarios,
      tips: textList(e.tips),
      cautions: textList(e.cautions),
      sources: e.sources.filter((s) => isText(s?.url)).map((s) => ({ title: isText(s.title) ? s.title : s.url, url: s.url })),
    },
  };
}

/** Mengembalikan { entries, warnings, meta } dari isi businesses.json yang belum tepercaya. */
export function validateCatalog(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) {
    return { entries: [], warnings: ['File data bisnis tidak berisi daftar entri.'], meta: {} };
  }
  const entries = [];
  const warnings = [];
  const seen = new Set();
  for (const e of raw.entries) {
    const r = validateEntry(e);
    if (!r.ok) {
      warnings.push(`Entri "${r.id}" dilewati: ${r.problems.join('; ')}.`);
      continue;
    }
    if (seen.has(r.value.id)) {
      warnings.push(`Entri "${r.value.id}" ganda dan dilewati.`);
      continue;
    }
    seen.add(r.value.id);
    entries.push(r.value);
  }
  return {
    entries,
    warnings,
    meta: {
      verifiedAt: typeof raw.verifiedAt === 'string' ? raw.verifiedAt : null,
      platformNote: isText(raw.platformNote) ? raw.platformNote : '',
    },
  };
}

export const CATEGORY_LABEL = Object.freeze({
  produksi: 'Produksi',
  pasif: 'Pasif',
  misi: 'Misi',
  heist: 'Heist',
});
