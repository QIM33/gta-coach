import { h, pageHead, notice, toast } from '../ui.js';
import { evaluateProgression } from '../engine/progression.js';

export function renderProgression(ctx) {
  const slot = h('div', {}, h('p', { class: 'muted' }, 'Memuat tahapan…'));
  const fill = (res) => slot.replaceChildren(build(ctx, res));
  const cached = ctx.peekProgression();
  if (cached) fill(cached);
  else ctx.getProgression().then(fill);

  return {
    title: 'Tahapan pemula',
    node: h('div', {}, pageHead('Tahapan pemula', 'Jalur bertahap dari pemain baru sampai punya beberapa bisnis. Langkah yang bisa dicek dari data akun tercentang otomatis.'), slot),
  };
}

function build(ctx, res) {
  if (!res.data) return notice('danger', 'Tahapan gagal dimuat', `Detail: ${res.error}.`);
  const p = evaluateProgression(res.data, ctx.store.getState());

  return h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'prog-sum' },
      h('h2', { class: 'section-title', id: 'prog-sum' }, `Progres ${p.percent}%`),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': p.percent, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-labelledby': 'prog-sum' }, h('span', { style: { width: `${p.percent}%` } })),
      p.note ? h('p', { class: 'small muted', style: { marginTop: 'var(--sp-3)' } }, p.note) : null,
    ),
    ...p.stages.map((stage, i) =>
      h(
        'section',
        { class: `panel stage${stage.id === p.current ? ' stage--current' : ''}`, 'aria-labelledby': `st-${stage.id}` },
        h(
          'div',
          { class: 'panel__head' },
          h('h2', { class: 'section-title', id: `st-${stage.id}` }, `${i + 1}. ${stage.title}`),
          h('span', { class: `badge${stage.complete ? ' badge--ok' : stage.id === p.current ? ' badge--warn' : ''}` }, stage.complete ? 'Selesai' : stage.id === p.current ? 'Sedang dijalani' : `${stage.done}/${stage.total}`),
        ),
        stage.goal ? h('p', { class: 'muted' }, stage.goal) : null,
        h(
          'ul',
          { class: 'upgrade-list' },
          stage.steps.map((step) => {
            const id = `step-${step.id}`;
            return h(
              'li',
              {},
              h(
                'label',
                { class: 'check', for: id },
                h('input', {
                  type: 'checkbox',
                  id,
                  checked: step.done,
                  disabled: step.auto,
                  onchange: (e) => {
                    const r = ctx.store.setStepDone(step.id, e.target.checked);
                    if (!r.ok) toast(r.error, { tone: 'error' });
                  },
                }),
                h('span', {}, step.text, step.auto ? h('span', { class: 'small muted' }, ' (otomatis dari data akun)') : null),
              ),
            );
          }),
        ),
      ),
    ),
  );
}
