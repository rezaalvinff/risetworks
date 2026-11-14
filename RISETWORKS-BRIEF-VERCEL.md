# RISETWORKS v2: Brief Migrasi ke Vercel + Supabase

Dokumen ini adalah instruksi kerja untuk Claude Code. Taruh file ini di root repo bersama kode RISETWORKS v1 (folder `public`, `functions`, `lib`, `README.md`), lalu minta Claude Code: "baca RISETWORKS-BRIEF-VERCEL.md dan kerjakan dari Tahap 0 sampai selesai."

---

## 1. Konteks

RISETWORKS adalah web cek format skripsi/makalah/artikel. Mahasiswa upload .docx, web mengecek format sesuai pedoman kampus, lalu muncul laporan temuan, skor, dan tombol WhatsApp untuk order jasa rapikan format. Ada fitur premium file bercatatan (komentar Word) yang dibuka pakai kode.

v1 dibuat untuk Cloudflare Pages + Cloudflare KV. v2 dipindah ke **GitHub + Vercel (Hobby) + Supabase (Free) + Gemini API (free tier)**.

Skala: kurang dari 50 pengguna per bulan. Ini tahap uji pasar. Kalau ramai, baru pindah ke paket berbayar.

## 2. Prinsip wajib

1. **Rp0.** Jangan pakai layanan atau fitur yang butuh kartu kredit atau paket berbayar.
2. **Otomatis maksimal.** Pemilik (A.J.) tidak mau klik-klik dashboard. Semua yang bisa dikerjakan lewat CLI (Vercel CLI, Supabase CLI, gh CLI) dikerjakan Claude Code. Langkah manual hanya untuk hal yang memang tidak bisa diotomasi (bikin akun, login pertama kali, bikin API key Gemini).
3. **Semudah mungkin untuk pengguna.** Target pengguna mahasiswa, mayoritas buka dari HP. Tidak ada daftar akun, tidak ada login.
4. **File skripsi tidak pernah dikirim ke server.** Pengecekan .docx dan pembuatan file bercatatan tetap jalan di browser. Ini janji di kebijakan privasi, jangan dilanggar.
5. **Jangan ubah logika `public/js/checker.js`, `annotate.js`, `pagemap.js`** kecuali untuk memperbaiki bug yang ditemukan saat tes. Mesin cek sudah dites abang A.J. Fokus migrasi di server, database, otomasi, dan UX.

## 3. Arsitektur target

```
Browser pengguna
  ├─ cek format .docx (checker.js)          → lokal, tanpa server
  ├─ cocokkan halaman dari PDF (pagemap.js) → lokal, tanpa server
  ├─ ekstrak teks PDF pedoman (PDF.js)      → lokal, lalu teksnya dikirim ke API
  └─ buat file bercatatan (annotate.js)     → lokal, setelah kode premium valid

Vercel (Hobby)
  ├─ hosting folder public/
  ├─ /api/baca-pedoman   → Gemini → simpan ke Supabase
  ├─ /api/preset         → daftar & detail preset dari Supabase
  ├─ /api/kode           → tebus kode premium (atomik di Supabase)
  ├─ /api/admin/kode     → buat kode (password admin + batas percobaan)
  ├─ /api/admin/preset   → sembunyikan/tampilkan preset
  ├─ /api/lapor-preset   → pengguna melaporkan preset yang salah
  └─ /api/cron/harian    → Vercel Cron 1x sehari: jaga Supabase tidak pause + bersih data kedaluwarsa

Supabase (Free)
  └─ tabel: preset, cache_pedoman, kode_premium, rate_limit
```

Struktur folder akhir:

```
api/
  baca-pedoman.js
  preset.js
  kode.js
  lapor-preset.js
  admin/kode.js
  admin/preset.js
  cron/harian.js
lib/
  util.js
  prompt.js
  db.js            (klien Supabase, server only)
  rules.js         (salinan logika rapikanAturan untuk server, atau impor dari public/js/rules.js kalau bundling Vercel aman)
public/            (sama seperti v1, plus perubahan UX di bagian 7)
supabase/
  migrations/0001_init.sql
vercel.json
package.json
.env.example
README.md          (ditulis ulang untuk versi Vercel)
```

Hapus folder `functions/` dan `public/_headers` setelah isinya dipindah.

## 4. Batasan platform yang harus diakomodasi

| Batasan | Dampak | Solusi |
|---|---|---|
| Body request Vercel Function maks 4,5 MB, tidak bisa diubah | PDF pedoman sampai 15 MB tidak bisa dikirim utuh | Ekstrak teks PDF di browser pakai PDF.js (sudah ada di `public/vendor/`), kirim teks saja. Lihat 5.1 |
| Vercel Hobby: cron maksimal 1x per hari | Tidak bisa ping per jam | Cukup, karena Supabase baru pause setelah 7 hari tanpa aktivitas |
| Supabase Free pause setelah 7 hari sepi aktivitas database | Preset kosong, kode premium gagal, padahal cek format tetap jalan | Cron harian melakukan query nyata ke database |
| Supabase Free: maks 2 project aktif per akun | Bisa bentrok dengan project CRM A.J. | Tanya A.J. di Tahap 0: project baru atau numpang project lain (pakai schema `risetworks` terpisah) |
| Gemini free tier: limit kecil, nama model bisa berubah | Kalau model diganti Google, fitur AI mati | Daftar model cadangan otomatis. Lihat 5.1 |
| Vercel Hobby hanya untuk non-komersial | Resiko akun di-suspend | Sudah diterima A.J. sebagai resiko sementara. Kode harus mudah dipindah: jangan pakai fitur yang hanya ada di Vercel selain Functions dan Cron |

## 5. Tugas server

### 5.1 `/api/baca-pedoman` (POST)

Alur baru:
1. Browser menghitung SHA-256 dari byte PDF (fungsi `sha256` sudah ada di `app.js`).
2. Browser memanggil `GET /api/preset?id=<hash>` dulu. Kalau sudah ada, pakai langsung, tanpa ekstrak dan tanpa AI.
3. Kalau belum ada, browser ekstrak teks semua halaman dengan PDF.js. Pertahankan penanda halaman (`--- Halaman N ---`) supaya AI bisa membaca konteks.
4. Kirim JSON `{ hash, teks, simpanPublik, namaFile }` ke API. Batasi teks di sisi browser maksimal 3,5 MB.
5. **Fallback PDF hasil scan:** kalau teks hasil ekstrak terlalu sedikit (misalnya < 500 karakter untuk PDF > 2 halaman), dan ukuran PDF ≤ 3 MB, kirim PDF dalam base64 (`{ hash, pdfBase64, ... }`) supaya Gemini membaca langsung. Kalau > 3 MB, tampilkan pesan ramah: "Pedoman ini berupa hasil scan dan terlalu besar. Pakai preset umum atau kirim pedomannya lewat WhatsApp."

Di server:
1. Validasi hash (64 hex).
2. Cek tabel `preset` lalu `cache_pedoman`. Kalau ada, kembalikan dengan `dariCache: true`.
3. Cek rate limit per IP (ambil dari header `x-forwarded-for`, ambil IP pertama). Batas default dari env `BATAS_HARIAN` (5).
4. Panggil Gemini `generateContent` dengan prompt dari `lib/prompt.js` (sesuaikan kalimat pembuka: input sekarang teks hasil ekstrak, bukan PDF). `temperature: 0`, `responseMimeType: application/json`.
5. **Model cadangan otomatis:** baca `GEMINI_MODEL` (boleh berisi beberapa nama dipisah koma). Default: daftar model Flash-Lite dan Flash gratis yang berlaku saat ini (Claude Code cek nama model yang tersedia lewat endpoint `models.list` Gemini memakai API key A.J. saat setup, lalu isi defaultnya). Kalau respons 404 atau "model not found", coba model berikutnya. Kalau 429, langsung kembalikan pesan "kuota AI sedang penuh, coba beberapa menit lagi".
6. Rapikan hasil dengan `rapikanAturan`.
7. **Validasi otomatis sebelum preset dipublikasikan** (pengganti approval manual, karena A.J. tidak mau klik):
   - margin tiap sisi 1 sampai 6 cm
   - ukuran huruf isi 9 sampai 16 pt
   - spasi 1 sampai 3
   - minimal 5 dari kolom utama (margin 4 sisi, font, ukuran, spasi) terisi
   - nama pedoman tidak kosong
   Kalau lolos dan pengguna mencentang simpan publik → masuk `preset` dengan `tampil = true`. Kalau tidak lolos → masuk `cache_pedoman` saja (tetap bisa dipakai pengguna itu), tidak tampil publik.
8. Kembalikan aturan ke browser.

### 5.2 `/api/preset` (GET)

- Tanpa `id`: daftar `{ id, nama }` dari preset `tampil = true`, urut nama. Header `Cache-Control: public, s-maxage=300`.
- Dengan `id`: aturan lengkap.

### 5.3 `/api/lapor-preset` (POST)

- Body `{ id, alasan }`. Tambah `jumlah_laporan`.
- Kalau `jumlah_laporan >= 2`, set `tampil = false` otomatis.
- Rate limit per IP supaya tidak disalahgunakan.

### 5.4 `/api/kode` (POST)

- Tebus kode memakai **fungsi Postgres atomik** (lihat SQL di bagian 6) supaya sisa pemakaian tidak bisa dipakai dobel saat diklik bersamaan.
- Respons sama seperti v1: `{ ok: true, sisa }` atau pesan error yang sama.

### 5.5 `/api/admin/kode` (POST) dan `/api/admin/preset`

- Auth `Authorization: Bearer <ADMIN_PASSWORD>`, perbandingan waktu-konstan seperti v1.
- **Tambahan:** batas percobaan salah, 5 kali per IP per jam, dicatat di `rate_limit`. Lebih dari itu respons 429.
- `/api/admin/kode`: sama seperti v1, plus `GET` untuk daftar 50 kode terakhir (kode, sisa, kedaluwarsa, catatan).
- `/api/admin/preset`: `GET` daftar semua preset (termasuk yang disembunyikan, beserta jumlah laporan), `POST { id, tampil }` untuk menyembunyikan atau menampilkan.

### 5.6 `/api/cron/harian` (GET, dipanggil Vercel Cron)

- Verifikasi header `Authorization: Bearer <CRON_SECRET>` (Vercel otomatis mengirim ini kalau env `CRON_SECRET` ada).
- Jalankan query nyata (bukan cuma koneksi): hapus baris `rate_limit` yang lebih lama dari 2 hari, hapus `cache_pedoman` dan `kode_premium` yang sudah kedaluwarsa, lalu `select count(*)` dari `preset`.
- Jadwal di `vercel.json`: sekali sehari, misalnya `0 19 * * *` (02.00 WIB).

### 5.7 Format kode Vercel

- Pakai Vercel Functions Node.js dengan signature Web standar (`export async function POST(request)` / `GET`) supaya perubahan dari kode Cloudflare minimal.
- `package.json` dengan `"type": "module"`, dependensi hanya `@supabase/supabase-js`.
- Env dibaca dari `process.env`.
- Header keamanan dari `public/_headers` dipindah ke `vercel.json` (`headers`), termasuk `noindex` untuk `/admin.html` dan cache panjang untuk `/vendor/*`.
- Framework preset: Other. Output directory: `public`. Tidak ada build command.

## 6. Database Supabase

File `supabase/migrations/0001_init.sql`. Isi minimal:

```sql
create table if not exists preset (
  id text primary key,                 -- sha256 PDF pedoman
  nama text not null,
  aturan jsonb not null,
  tampil boolean not null default true,
  jumlah_laporan int not null default 0,
  dibuat timestamptz not null default now()
);

create table if not exists cache_pedoman (
  id text primary key,
  aturan jsonb not null,
  kedaluwarsa timestamptz not null default now() + interval '90 days'
);

create table if not exists kode_premium (
  kode text primary key,
  sisa int not null check (sisa >= 0),
  kedaluwarsa timestamptz not null,
  catatan text default '',
  dibuat timestamptz not null default now(),
  terakhir_dipakai timestamptz
);

create table if not exists rate_limit (
  kunci text primary key,              -- contoh: 'pedoman:1.2.3.4:2026-11-14', 'admin:1.2.3.4:2026-11-14T19'
  jumlah int not null default 0,
  dibuat timestamptz not null default now()
);

-- Tebus kode secara atomik
create or replace function tebus_kode(p_kode text)
returns int language plpgsql as $$
declare v_sisa int;
begin
  update kode_premium
     set sisa = sisa - 1, terakhir_dipakai = now()
   where kode = p_kode and sisa > 0 and kedaluwarsa > now()
  returning sisa into v_sisa;
  return v_sisa;  -- null berarti tidak valid / habis / kedaluwarsa
end $$;

-- Tambah hitungan rate limit secara atomik, kembalikan jumlah terbaru
create or replace function tambah_hitungan(p_kunci text)
returns int language plpgsql as $$
declare v int;
begin
  insert into rate_limit (kunci, jumlah) values (p_kunci, 1)
  on conflict (kunci) do update set jumlah = rate_limit.jumlah + 1
  returning jumlah into v;
  return v;
end $$;

-- Kunci semua tabel dari akses browser. Server memakai secret/service key yang melewati RLS.
alter table preset enable row level security;
alter table cache_pedoman enable row level security;
alter table kode_premium enable row level security;
alter table rate_limit enable row level security;
revoke execute on function tebus_kode(text) from anon, authenticated;
revoke execute on function tambah_hitungan(text) from anon, authenticated;
```

Catatan untuk Claude Code:
- Untuk `tebus_kode`, bedakan pesan error (tidak ditemukan / kedaluwarsa / habis) dengan query `select` setelah fungsi mengembalikan null, supaya pesan ke pengguna tetap sama seperti v1.
- Kalau Supabase dipakai bareng project lain, buat semua tabel di schema `risetworks`, bukan `public`.
- Secret key Supabase (service role atau `sb_secret_...`) **hanya** di env Vercel. Jangan pernah ada di folder `public/`. Tambahkan pengecekan di akhir: `grep` folder `public/` untuk memastikan tidak ada key yang bocor.

## 7. Perbaikan UX untuk pengguna

Tujuannya: dari buka web sampai lihat hasil cukup **satu kali pilih file**.

1. **Langsung bisa dipakai.** Preset umum (TNR 12, spasi 1,5, margin 4-4-3-3) terpilih otomatis. Pengguna yang tidak tahu pedomannya tetap bisa langsung cek.
2. **Cek otomatis begitu file dipilih.** Tidak perlu tombol "Cek" terpisah. Tombol tetap ada untuk cek ulang.
3. **Pilih kampus pakai kotak pencarian**, bukan dropdown panjang. Ketik "unpad" langsung muncul pedoman yang cocok. Tetap ringan, tanpa pustaka tambahan.
4. **Area upload besar, bisa drag & drop di laptop, dan tap di HP.** Teks jelas: "Pilih file skripsi (.docx)".
5. **Opsi lanjutan disembunyikan** di bagian "Opsional" yang bisa dibuka: upload PDF skripsi untuk nomor halaman pasti, dan upload PDF pedoman sendiri.
6. **Indikator proses** saat AI membaca pedoman (bisa 10 sampai 30 detik): tulisan bertahap "Membaca pedoman… Menyusun aturan…".
7. **Hasil diringkas di atas:** skor besar, lalu 3 temuan terpenting dalam bahasa sederhana. Detail lengkap per kategori di bawah dalam bentuk yang bisa dibuka-tutup.
8. **Tombol WhatsApp menempel di bawah layar di HP** setelah hasil muncul, dengan estimasi harga.
9. **Tombol "Laporkan pedoman ini salah"** di dekat nama preset yang dipakai (memanggil `/api/lapor-preset`).
10. **Pesan error ramah dan memberi jalan keluar.** Contoh: file bukan .docx → "File harus .docx. Kalau masih .doc, buka di Word lalu Save As .docx." AI gagal → "Pedoman belum bisa dibaca otomatis, pakai preset umum dulu atau kirim pedoman lewat WhatsApp."
11. **Halaman admin ramah HP:** buat kode, salin pesan ke WA dengan satu tombol, lihat daftar kode terakhir, lihat preset yang dilaporkan dan tombol sembunyikan. Password tersimpan di `sessionStorage` selama tab terbuka supaya tidak diketik berulang.
12. Mobile-first: cek tampilan di lebar 360 px.

## 8. Otomasi setup (dikerjakan Claude Code)

Urutan yang dikerjakan Claude Code, dengan A.J. hanya diminta login atau menempel key saat diperlukan:

1. Install CLI yang dibutuhkan: `vercel`, `supabase` (lewat npx kalau tidak bisa install global).
2. **Supabase:** minta A.J. login (`supabase login`) sekali. Buat project lewat CLI (region Singapore, `ap-southeast-1`), atau pakai project yang ditunjuk A.J. Jalankan migrasi (`supabase db push`). Ambil URL dan secret key lewat CLI.
3. **Gemini:** minta A.J. menempelkan API key dari aistudio.google.com. Panggil `models.list` untuk menentukan daftar model default yang tersedia di akunnya.
4. **Generate otomatis:** `ADMIN_PASSWORD` (acak, 24 karakter) dan `CRON_SECRET` (acak, 32 karakter). Tampilkan `ADMIN_PASSWORD` sekali ke A.J. untuk disimpan.
5. **GitHub:** buat repo private `risetworks` lewat `gh repo create`, push kode.
6. **Vercel:** `vercel link` ke repo, set semua env variable lewat `vercel env add` untuk Production dan Preview, lalu deploy production. Setelah ini setiap push ke branch `main` otomatis deploy.
7. **Tes otomatis setelah deploy** (curl ke URL production): `/api/preset` mengembalikan 200, `/api/cron/harian` tanpa secret 401 dan dengan secret 200, buat 1 kode tes lewat `/api/admin/kode`, tebus 2 kali (yang kedua harus gagal kalau jumlah pakai 1), panggil `/api/baca-pedoman` dengan teks pedoman contoh.
8. Tulis ulang `README.md`: cara kerja, daftar env, cara ganti tarif/WA, cara pindah ke paket berbayar atau ke Cloudflare kalau suatu saat perlu.

Env variable yang dipakai:

| Nama | Sumber | Keterangan |
|---|---|---|
| `SUPABASE_URL` | Supabase CLI | |
| `SUPABASE_SECRET_KEY` | Supabase CLI | server only |
| `GEMINI_API_KEY` | A.J. tempel | server only |
| `GEMINI_MODEL` | otomatis dari `models.list` | daftar dipisah koma, urut prioritas |
| `ADMIN_PASSWORD` | generate otomatis | |
| `CRON_SECRET` | generate otomatis | |
| `BATAS_HARIAN` | default `5` | batas baca pedoman per IP per hari |
| `SUPABASE_SCHEMA` | default `public` | isi `risetworks` kalau numpang project lain |

Buat juga `.env.example` berisi nama-nama di atas tanpa nilai.

## 9. Checklist tes sebelum disebar

Otomatis (Claude Code):
- [ ] Tes unit checker yang sudah ada tetap lulus (13 dari 13 kesalahan dokumen contoh terdeteksi, dokumen benar skor 100%).
- [ ] Semua endpoint di Tahap 8 langkah 7.
- [ ] Tidak ada secret di folder `public/`.
- [ ] Tampilan 360 px tidak berantakan (cek dengan Playwright screenshot kalau tersedia).

Manual (A.J.):
- [ ] Cek 3 sampai 5 skripsi asli dari kampus berbeda, catat temuan yang salah tandai.
- [ ] Upload 2 sampai 3 PDF pedoman kampus asli, cocokkan hasil AI dengan isi pedoman.
- [ ] Buka file bercatatan di **Microsoft Word** (abang A.J. baru mengetes di LibreOffice).
- [ ] Coba alur penuh dari HP: buka web, upload, lihat hasil, tekan WA.
- [ ] Pastikan nomor WA dan tarif di `public/js/config.js` sudah milik A.J.

## 10. Hal yang sengaja dibiarkan

- **Paywall file bercatatan bisa dijebol** oleh orang yang paham devtools, karena file dibuat di browser. Ini dipertahankan demi janji privasi (file skripsi tidak ke server). Dengan skala < 50 pengguna dan target mahasiswa umum, resikonya kecil.
- **Tidak ada pembayaran otomatis.** Kode premium tetap dibuat A.J. dari `/admin.html` setelah transfer masuk.

---

## Lampiran: yang harus A.J. siapkan sendiri

Hanya ini yang tidak bisa diotomasi:

1. Akun **GitHub** (gratis) dan login `gh` di Claude Code.
2. Akun **Vercel** (gratis, daftar pakai akun GitHub) dan login `vercel` di Claude Code.
3. Akun **Supabase** (gratis) dan login `supabase` di Claude Code. Putuskan: project baru atau numpang project yang sudah ada.
4. **API key Gemini** dari aistudio.google.com (gratis, tanpa kartu kredit).
5. **Nomor WhatsApp Business** dan **tarif** untuk diisi di `public/js/config.js`.
6. (Opsional, berbayar) domain sendiri. Tanpa domain, web jalan di alamat `risetworks.vercel.app` atau mirip.
