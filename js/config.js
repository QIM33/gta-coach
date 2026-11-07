// Konfigurasi aplikasi: identitas, menu, dan alamat sumber data.
// Semua alamat data dibaca dari sini, sehingga pindah ke API nanti
// cukup mengubah nilai di DATA_SOURCES.

export const APP = Object.freeze({
  name: 'Business Coach untuk GTA Online',
  version: '0.7.0',
  phase: 'Fase 6',
  newswireUrl: 'https://www.rockstargames.com/newswire',
});

export const DATA_SOURCES = Object.freeze({
  events: './data/events/current.json',
  gtaplus: './data/gtaplus.json',
  businesses: './data/businesses.json',
  progression: './data/progression.json',
  guides: './data/guides.json',
});

// Halaman yang belum dibangun tetap tampil di menu dengan label fasenya,
// supaya pemain tahu fitur apa yang sedang disiapkan.
export const NAV = Object.freeze([
  { route: 'dashboard', label: 'Dashboard' },
  { route: 'profil', label: 'Profil pemain' },
  { route: 'event', label: 'Event mingguan' },
  { route: 'bisnis', label: 'Bisnis' },
  { route: 'kalkulator', label: 'Kalkulator profit' },
  { route: 'rencana', label: 'Rencana sesi' },
  { route: 'tahapan', label: 'Tahapan pemula' },
  { route: 'panduan', label: 'Panduan' },
  { route: 'pengaturan', label: 'Cadangan & pengaturan' },
]);

// Halaman fitur yang belum dibangun (kosong: semua fitur rencana sudah tersedia).
export const UPCOMING = Object.freeze({});
