# Business Coach untuk GTA Online

Website mentor untuk pemain GTA Online pemula: mengelola saldo GTA$, bisnis, dan strategi keuntungan.
Dibangun dengan HTML, CSS, dan JavaScript murni, tanpa framework dan tanpa proses build.

Status: **semua fase selesai**, versi 0.7.0. Event mingguan diambil otomatis setelah repo dipublikasikan di GitHub.

## Menjalankan di PC (Windows)

1. Ekstrak file zip ke folder yang mudah ditemukan, misalnya `Documents\gta-coach`.
2. Buka VS Code, pilih **File > Open Folder**, lalu pilih folder `gta-coach`.
3. VS Code akan menawarkan ekstensi yang disarankan. Pilih **Install** untuk **Live Server** (pembuat: Ritwick Dey).
   Jika tawaran tidak muncul, buka tab Extensions (Ctrl+Shift+X), cari "Live Server", lalu Install.
4. Klik kanan `index.html` di panel kiri, pilih **Open with Live Server**.
   Browser akan terbuka di alamat seperti `http://127.0.0.1:5500/index.html`.

Jangan membuka `index.html` dengan klik dua kali. Alamatnya akan diawali `file://`, dan browser memblokir
modul JavaScript serta pemuatan data dari alamat seperti itu. Website akan berhenti di tulisan "Memuat…".

Selama Live Server berjalan, halaman otomatis dimuat ulang setiap kali file disimpan.

## Menjalankan pengujian (opsional)

Pengujian memakai fitur bawaan Node.js, tanpa paket tambahan.

1. Pasang Node.js versi LTS dari nodejs.org.
2. Di VS Code, buka terminal (Ctrl+`), lalu jalankan:

```
npm test
```

Hasil yang diharapkan: `# fail 0`.

## Menyimpan riwayat kode dengan Git (disarankan)

Git mencatat setiap perubahan kode, jadi versi yang rusak bisa dikembalikan. Akun GitHub belum diperlukan.

1. Pasang Git for Windows dari git-scm.com (pengaturan bawaan sudah cukup).
2. Di terminal VS Code, jalankan sekali:

```
git init
git add .
git commit -m "Fase 0: fondasi website"
```

## Struktur folder

```
gta-coach/
├── index.html            kerangka halaman
├── css/
│   ├── tokens.css        warna, huruf, jarak (ubah tampilan dari sini)
│   ├── layout.css        kerangka halaman dan menu
│   └── components.css    tombol, panel, formulir, dll.
├── js/
│   ├── main.js           titik masuk: menu, router, render halaman
│   ├── config.js         menu, versi, alamat sumber data
│   ├── store.js          penyimpanan LocalStorage, validasi, cadangan
│   ├── data.js           pemuat data JSON + cadangan offline + status event
│   ├── format.js         format GTA$ dan tanggal
│   ├── router.js         navigasi berbasis #/alamat
│   ├── ui.js             pembuat elemen, toast, dialog
│   ├── engine/
│   │   ├── finance.js    pembagian saldo, riwayat
│   │   ├── calculator.js laba, GTA$/jam, balik modal
│   │   ├── recommend.js  mesin rekomendasi (Next Best Action)
│   │   ├── planner.js    penyusun rencana sesi
│   │   ├── progression.js tahapan pemula
│   │   └── catalog.js    validasi data bisnis
│   └── views/            satu file per halaman
├── data/
│   ├── businesses.json       database bisnis + sumber
│   ├── progression.json      tahapan pemula
│   ├── guides.json           isi halaman Panduan + sumber
│   ├── gtaplus.json          bonus GTA+ siklus bulanan (diisi manual)
│   └── events/current.json   event mingguan yang sedang berlaku
├── scripts/
│   ├── fetch-events.mjs      pengambil draf event mingguan (GitHub Actions)
│   └── lib/event-parser.mjs  parser RSS dan artikel event
├── .github/workflows/weekly-events.yml   jadwal harian + Pull Request
├── .nojekyll             agar GitHub Pages menyajikan file apa adanya
├── sw.js                 service worker untuk mode offline
├── manifest.webmanifest  data aplikasi untuk dipasang di layar utama
├── icons/                ikon aplikasi
├── tests/                pengujian otomatis (node --test)
└── package.json          hanya untuk perintah npm test
```

Prinsip pemisahan: `data/` berisi data, `js/engine/` berisi perhitungan, `js/views/` berisi tampilan.
Mengubah harga bisnis atau event cukup mengubah file JSON, tanpa menyentuh kode.

## Mode offline dan pasang di layar utama

- Saat dibuka lewat Live Server atau GitHub Pages, website menyimpan salinan dirinya. Jika internet putus, halaman dan data terakhir tetap bisa dibuka, dengan label "salinan tersimpan".
- Saat online, website selalu memakai versi terbaru dari server ("jaringan dulu"), jadi perubahan kode langsung terlihat.
- Setiap rilis, naikkan `CACHE_VERSION` di `sw.js` dan tambahkan file baru ke daftar `APP_SHELL`. Tes `npm test` akan gagal jika ada file JS yang lupa dicantumkan.
- Di Chrome HP, menu ⋮ > "Tambahkan ke layar utama" memasang website seperti aplikasi.

## Penyimpanan data pemain

- Data disimpan di LocalStorage browser dengan kunci `gtacoach.v1`.
- Data hanya ada di browser dan perangkat yang dipakai. Membersihkan data browser akan menghapusnya.
- Gunakan **Cadangan & pengaturan > Unduh cadangan** secara berkala. File `.json` bisa dipulihkan kapan saja.
- Jika data tersimpan rusak, website tidak menimpanya diam-diam: salinannya disimpan dengan kunci `gtacoach.v1.rusak`.

## Event mingguan otomatis (GitHub Actions)

Setelah repo ada di GitHub, `.github/workflows/weekly-events.yml` berjalan setiap hari pukul 11.30 UTC (18.30 WIB):

1. `scripts/fetch-events.mjs` membaca RSS RockstarINTEL dan mencari artikel event GTA Online terbaru.
2. Jika minggunya baru, data lama diarsipkan ke `data/events/archive/` dan draf baru ditulis ke `data/events/current.json`.
3. Workflow membuat Pull Request berisi daftar item dan checklist. Anda mencocokkannya dengan Rockstar Newswire, lalu Merge.
4. GitHub Pages memperbarui website dalam 1–2 menit.

Jika sumber tidak bisa dibaca atau formatnya berubah, workflow gagal dan GitHub mengirim email. Data lama otomatis
ditandai kedaluwarsa oleh website, dan Anda bisa mengisi data secara manual (di bawah).
Parser diuji dengan contoh di `tests/fixtures/`. Jalankan workflow manual dari tab Actions → Event mingguan → Run workflow.

## Memperbarui event mingguan secara manual

Jika otomatisasi gagal, data event diisi manual di `data/events/current.json` (bisa lewat ikon pensil di GitHub):

1. Buka artikel event terbaru di Rockstar Newswire.
2. Ubah `week.startsAt` dan `week.endsAt` (format UTC, reset sekitar `T10:00:00Z` hari Kamis).
3. Ganti isi `items`. Jenis yang dikenali: `multiplier` (isi `value`, misal 2), `first-completion`,
   `guaranteed-target`, `discount` (isi `percent`), `challenge` (isi `reward`), `reward`, `podium`.
   Isi `target` dengan id bisnis (misal `"acid-lab"`) agar bonusnya dipakai kalkulator.
4. Isi `verifiedAt` dengan waktu Anda mengecek, `sourceLevel` dengan `"official"` jika dicek langsung dari Newswire.
5. Simpan, lalu buka halaman Event mingguan untuk memastikan statusnya "Terverifikasi, sedang berlaku".

Jika tanggal `endsAt` sudah lewat, website otomatis menandai event sebagai kedaluwarsa dan tidak memakai bonusnya.

## Cara mesin rekomendasi memilih

Urutan prioritas (lihat `js/engine/recommend.js`):

1. Peluang event terbatas waktu pada aset yang sudah dimiliki.
2. Investasi terjangkau dengan balik modal tercepat. Upgrade aset lama dibandingkan langsung dengan membeli bisnis baru.
   Menabung sebentar untuk target yang lebih baik dipilih jika total waktunya lebih singkat.
3. Aktivitas dari aset sendiri dengan GTA$ per jam tertinggi.
4. Target tabungan berikutnya.

Dana cadangan tidak pernah dipakai. Data berkeyakinan sedang/rendah diberi penalti 15%/30% saat dibandingkan.
Pengujian dengan lima akun contoh ada di `tests/recommend.test.mjs`.

## Memperbarui data bisnis

Ubah angka di `data/businesses.json`, perbarui `verifiedAt`, dan cantumkan sumbernya di `sources`.
Jalankan `npm test`: salah satu tes memastikan file ini valid. Entri yang rusak akan dilewati website dan dilaporkan di halaman Bisnis.

## Batasan saat ini

- Rekomendasi hanya sebaik datanya: 5 dari 10 entri masih "Data sebagian", dan bisnis yang durasi atau bayarannya belum diketahui tidak diberi peringkat.
- Waktu aktif sebagian bisnis adalah perkiraan; ubah di kalkulator jika pengalaman Anda berbeda.
- Database berisi 13 bisnis dan heist untuk PC Enhanced. Sebagian entri ditandai "Data sebagian" karena durasi atau bayarannya belum bisa dicek dari dua sumber.
- Data event diisi manual. Event minggu 5–11 November 2026 dicek silang dari tiga sumber sekunder, belum langsung dari Newswire.
- Pelacak stok bisnis sengaja tidak dibuat: produksi hanya berjalan saat Anda online, sehingga pengatur waktu di website tidak bisa menebak isi stok dengan jujur.
- Data GTA+ (`data/gtaplus.json`) diisi manual setiap siklus bulanan dan belum dipakai dalam perhitungan.
- Otomatisasi event bergantung pada RSS RockstarINTEL. Hasilnya tetap draf dari sumber sekunder sampai Anda mencocokkannya dengan Newswire.

Proyek penggemar, tidak berafiliasi dengan Rockstar Games atau Take-Two Interactive.
