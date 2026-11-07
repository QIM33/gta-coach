import { h, pageHead, badge, notice, toast, confirmDialog } from '../ui.js';
import { formatDate, formatDateTime, formatGTA, localDateKey } from '../format.js';
import { APP } from '../config.js';
import { LIMITS } from '../store.js';

export function renderSettings(ctx) {
  const state = ctx.store.getState();
  const { available } = ctx.store.status();
  const importError = h('div', { 'aria-live': 'polite' });

  // ----- ekspor -----
  function exportBackup() {
    const payload = ctx.store.exportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `gta-coach-cadangan-${localDateKey()}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const res = ctx.store.markExported();
    toast(res.ok ? 'Cadangan diunduh.' : 'Cadangan diunduh, tetapi tanggalnya gagal dicatat.');
  }

  // ----- impor -----
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden', id: 'import-file', tabindex: '-1' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    importError.replaceChildren();
    if (!file) return;
    if (file.size > LIMITS.importMaxBytes) {
      importError.replaceChildren(notice('danger', 'Cadangan tidak bisa dipulihkan', 'File terlalu besar untuk sebuah cadangan.'));
      return;
    }
    const parsed = ctx.store.parseBackup(await file.text());
    if (!parsed.ok) {
      importError.replaceChildren(notice('danger', 'Cadangan tidak bisa dipulihkan', parsed.error));
      return;
    }
    const s = parsed.state;
    const summary = [
      `File: ${file.name}${parsed.exportedAt ? `, dibuat ${formatDateTime(parsed.exportedAt)}` : ''}.`,
      s.profile ? `Profil: ${s.profile.name || 'tanpa nama'}, saldo ${formatGTA(s.profile.balance)}.` : 'File ini tidak berisi profil.',
      `Riwayat saldo: ${s.balanceHistory.length} catatan.`,
      'Data yang sekarang ada di browser ini akan diganti seluruhnya.',
    ];
    const ok = await confirmDialog({ title: 'Pulihkan cadangan ini?', message: summary, confirmLabel: 'Pulihkan' });
    if (!ok) return;
    const res = ctx.store.replaceState(s);
    toast(res.ok ? 'Cadangan dipulihkan.' : res.error, { tone: res.ok ? 'ok' : 'error' });
  });

  // ----- hapus -----
  async function resetAll() {
    const ok = await confirmDialog({
      title: 'Hapus semua data?',
      message: ['Profil, riwayat saldo, dan progres di browser ini akan dihapus permanen.', 'Unduh cadangan terlebih dahulu jika ingin menyimpannya.'],
      confirmLabel: 'Hapus semua data',
      danger: true,
    });
    if (!ok) return;
    const res = ctx.store.reset();
    toast(res.ok ? 'Semua data dihapus.' : res.error, { tone: res.ok ? 'ok' : 'error' });
  }

  const lastExport = state.meta.lastExportAt;

  return {
    title: 'Cadangan & pengaturan',
    node: h(
      'div',
      {},
      pageHead('Cadangan & pengaturan', 'Progres hanya tersimpan di browser ini. Membersihkan data browser atau berganti perangkat akan menghilangkannya, jadi simpan cadangan secara berkala.'),
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 'backup-title' },
        h('div', { class: 'panel__head' }, h('h2', { class: 'section-title', id: 'backup-title' }, 'Cadangan data'), lastExport ? badge(`Terakhir ${formatDate(lastExport)}`, 'ok') : badge('Belum pernah dicadangkan', 'warn')),
        h(
          'dl',
          { class: 'kv' },
          h('dt', {}, 'Profil'),
          h('dd', {}, state.profile ? 'Tersimpan' : 'Belum diisi'),
          h('dt', {}, 'Riwayat saldo'),
          h('dd', {}, `${state.balanceHistory.length} catatan`),
          h('dt', {}, 'Penyimpanan browser'),
          h('dd', {}, available ? 'Berfungsi' : badge('Tidak tersedia', 'danger')),
        ),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn btn--primary', type: 'button', onclick: exportBackup }, 'Unduh cadangan'),
          h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => fileInput.click() }, 'Pulihkan dari file'),
          fileInput,
        ),
        h('p', { class: 'small muted', style: { marginTop: 'var(--sp-3)' } }, 'Cadangan berupa file .json. Simpan di folder yang mudah ditemukan, misalnya Google Drive.'),
        importError,
      ),
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 'reset-title' },
        h('h2', { class: 'section-title', id: 'reset-title' }, 'Hapus semua data'),
        h('p', { class: 'muted' }, 'Mengembalikan website ke kondisi awal. Tindakan ini tidak bisa dibatalkan.'),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn btn--danger', type: 'button', onclick: resetAll }, 'Hapus semua data')),
      ),
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 'about-title' },
        h('h2', { class: 'section-title', id: 'about-title' }, 'Tentang'),
        h('dl', { class: 'kv' }, h('dt', {}, 'Versi'), h('dd', {}, `${APP.version} (${APP.phase})`)),
        h('p', { class: 'small muted', style: { marginTop: 'var(--sp-3)' } }, 'Proyek penggemar, tidak berafiliasi dengan Rockstar Games atau Take-Two Interactive. Grand Theft Auto dan GTA Online adalah merek dagang milik pemiliknya.'),
      ),
    ),
  };
}
