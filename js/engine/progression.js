// Tahapan pemula: menghitung langkah yang selesai dari data akun (otomatis)
// dan dari centang manual pemain (progress.completedSteps).

const ID = /^[a-z0-9-]{1,48}$/;

function autoDone(auto, state) {
  switch (auto?.type) {
    case 'profile':
      return Boolean(state.profile);
    case 'backup':
      return Boolean(state.meta?.lastExportAt);
    case 'owned':
      return Boolean(state.owned[auto.id]);
    case 'ownedAny':
      return (auto.ids ?? []).some((id) => state.owned[id]);
    case 'ownedCount':
      return Object.keys(state.owned).length >= (auto.min ?? Infinity);
    case 'upgrade':
      return Boolean(state.owned[auto.id]?.upgrades.includes(auto.upgrade));
    default:
      return false;
  }
}

/** Mengembalikan tahapan dengan status tiap langkah, persentase, dan tahap yang sedang dijalani. */
export function evaluateProgression(raw, state) {
  if (!raw || !Array.isArray(raw.stages)) return { stages: [], current: null, percent: 0, note: '' };
  const manual = new Set(state.progress?.completedSteps ?? []);
  const stages = raw.stages
    .filter((s) => ID.test(s?.id ?? '') && Array.isArray(s.steps))
    .map((s) => {
      const steps = s.steps
        .filter((st) => ID.test(st?.id ?? '') && typeof st.text === 'string')
        .map((st) => {
          const auto = Boolean(st.auto);
          const done = auto ? autoDone(st.auto, state) : manual.has(st.id);
          return { id: st.id, text: st.text, auto, done };
        });
      const done = steps.filter((x) => x.done).length;
      return { id: s.id, title: s.title, goal: s.goal ?? '', steps, done, total: steps.length, complete: steps.length > 0 && done === steps.length };
    });
  const allSteps = stages.flatMap((s) => s.steps);
  const percent = allSteps.length ? Math.round((allSteps.filter((x) => x.done).length / allSteps.length) * 100) : 0;
  const current = stages.find((s) => !s.complete)?.id ?? null;
  return { stages, current, percent, note: raw.note ?? '' };
}
