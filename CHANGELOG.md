# Catatan perubahan

## 0.6.0 (Fase 3, 7 November 2026)

- Otomatisasi event mingguan: workflow GitHub Actions harian membaca RSS RockstarINTEL, mengarsipkan data lama,
  menulis draf baru, dan membuat Pull Request berisi checklist verifikasi terhadap Rockstar Newswire.
- Parser artikel (`scripts/lib/event-parser.mjs`): bonus, bonus GTA+, bonus penyelesaian pertama, diskon,
  target dijamin, tantangan, podium; baris yang tidak dikenali dilaporkan di Pull Request.
  Pemetaan ke bisnis hanya untuk skenario yang dimodelkan.
- Tes tidak lagi bergantung pada isi event minggu ini (memakai contoh tetap di `tests/fixtures/`), agar workflow
  tidak gagal setelah data diganti. Total 68 pengujian.
- `.nojekyll` untuk GitHub Pages.

## 0.5.0 (Fase 5, 7 November 2026)

- Halaman Panduan: 6 topik ringkas (cara membaca angka, dana cadangan, bisnis produksi, Cayo Perico setelah 1.73,
  event mingguan, solo vs crew), masing-masing dengan sumber. Isi di `data/guides.json`.
- Mode offline (service worker, strategi jaringan dulu) dan manifest untuk dipasang di layar utama.
- Pemberitahuan saat koneksi putus dan kembali.
- Tes memastikan semua file aplikasi tercantum di cache offline; total 61 pengujian.

## 0.4.0 (Fase 4, 7 November 2026)

- Rencana sesi: pilih durasi (30 menit–4 jam atau isi sendiri), lalu dapatkan urutan langkah: pembelian dari
  rekomendasi, isi suplai, aktivitas event, aktivitas terbaik dengan jeda dan batas mingguan, jual stok, catat saldo.
  Perkiraan pendapatan bersih dan target sesi untuk pemain yang sedang menabung.
- Tahapan pemula: 6 tahap dengan langkah otomatis (dari data akun) dan manual (centang), progres dalam persen.
- Pelacak stok tidak dibuat karena produksi hanya berjalan saat online (lihat README).

## 0.3.0 (Fase 2, 7 November 2026)

- Mesin rekomendasi berbasis aturan (`js/engine/recommend.js`) dengan satu Next Best Action, dua pilihan lain,
  perbandingan "optimalkan aset lama vs beli baru", daftar rutinitas, dan daftar bisnis yang belum bisa dinilai.
- Setiap saran menampilkan alasan, biaya, laba per jam, balik modal, syarat, dan tingkat keyakinan.
- Aturan: event terbatas waktu didahulukan; dana cadangan tidak dipakai; aset yang belum bisa menghasilkan
  tanpa upgrade didahulukan upgrade-nya; menabung sebentar dipilih jika total waktunya lebih singkat;
  data kurang pasti diberi penalti; aktivitas terbatas per minggu disebar ke jam bermain mingguan.
- Tombol "Sudah saya beli": mencatat kepemilikan dan upgrade serta memotong saldo dalam satu langkah, dengan konfirmasi.
- Profil: kolom jumlah sesi per minggu dan checklist aset yang tersimpan langsung. Isian profil yang belum disimpan
  tidak hilang saat mencentang aset.
- Lima akun contoh sebagai uji otomatis; total 49 pengujian.

## 0.2.0 (Fase 1, 7 November 2026)

- Database 10 bisnis dan heist (`data/businesses.json`) untuk PC Enhanced, setelah Title Update 1.73:
  Acid Lab, Bunker, Nightclub, Cayo Perico Heist, Auto Shop, Agency, Salvage Yard, Bail Office,
  Hands On Car Wash, Kortz Center Heist. Setiap entri mencantumkan sumber dan status kelengkapan data.
- Halaman Bisnis: kartu per bisnis, saringan (semua, terjangkau, dimiliki), tandai kepemilikan dan upgrade,
  detail syarat, skenario, tips, dan sumber.
- Kalkulator profit: laba bersih per siklus, GTA$ per jam aktif, GTA$ per jam online (produksi/pasif),
  balik modal dalam siklus dan jam, cek keterjangkauan terhadap dana investasi, daftar asumsi.
  Harga beli dan upgrade yang sudah dimiliki tidak dihitung lagi. Ada mode isi sendiri.
- Event mingguan 5–11 November 2026 (Heist Event), dikelompokkan per jenis, dengan catatan tingkat verifikasi sumber.
- Bonus event yang menyasar bisnis tertentu muncul di kartu bisnis dan kalkulator; pengali dipakai otomatis.
- Validasi katalog: entri rusak dilewati dan dilaporkan, bukan menggagalkan halaman.
- Router mendukung alamat seperti `#/kalkulator/acid-lab`.
- 37 pengujian otomatis.

## 0.1.0 (Fase 0, 7 November 2026)

Fondasi website.

- Kerangka halaman dengan tema gelap, responsif untuk HP, tablet, dan desktop.
- Menu samping di desktop; menu laci di HP (bisa ditutup dengan Esc atau ketuk di luar menu).
- Navigasi berbasis `#/alamat`, termasuk halaman "tidak ditemukan".
- Profil pemain: saldo GTA$, rank, versi game (PC Enhanced/Legacy), status GTA+, durasi sesi, gaya bermain, dana cadangan.
  Validasi per kolom dan pratinjau langsung.
- Dashboard: saldo, pembagian dana cadangan vs dana investasi, profil bermain, status data, riwayat saldo harian.
- Event mingguan: pemuat data dengan cadangan offline dan status (belum ada, draf, berlaku, kedaluwarsa).
  Data masih kosong dan ditampilkan apa adanya.
- Cadangan: unduh dan pulihkan file `.json`, dengan validasi dan konfirmasi. Hapus semua data dengan konfirmasi.
- Perlindungan data: data rusak disalin sebelum diganti, peringatan jika penyimpanan browser tidak tersedia,
  sinkron antartab.
- 23 pengujian otomatis (`npm test`).
