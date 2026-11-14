# RISETWORKS v2

Web cek format skripsi, makalah, dan artikel (.docx) sesuai pedoman kampus. Mahasiswa memilih file, hasil cek langsung muncul (skor, temuan terpenting, cara memperbaiki), lalu bisa order jasa rapikan lewat WhatsApp. Fitur premium **file bercatatan** (komentar Word di setiap temuan) dibuka dengan kode.

Jalan di **Vercel (Hobby) + Supabase (Free) + Gemini API (free tier)**. Biaya Rp0.

## Cara kerja

```
Browser pengguna
  ├─ cek format .docx (public/js/checker.js)           → lokal, tanpa server
  ├─ cocokkan halaman dari PDF skripsi (pagemap.js)     → lokal, tanpa server
  ├─ ekstrak teks PDF pedoman (PDF.js)                  → lokal, lalu teksnya dikirim ke API
  └─ buat file bercatatan (annotate.js)                 → lokal, setelah kode premium valid

Vercel
  ├─ public/                 hosting statis
  ├─ /api/baca-pedoman       teks pedoman → Gemini → aturan → Supabase
  ├─ /api/preset             daftar & detail preset
  ├─ /api/kode               tebus kode premium (atomik di Postgres)
  ├─ /api/lapor-preset       laporkan preset salah (2 laporan → otomatis disembunyikan)
  ├─ /api/admin/kode         buat & lihat kode (password admin, maks 5 salah/jam/IP)
  ├─ /api/admin/preset       lihat preset & laporannya, sembunyikan/tampilkan
  ├─ /api/admin/cek-ai       diagnosa Gemini: key valid? model apa yang tersedia?
  └─ /api/cron/harian        1x sehari 02.00 WIB: query nyata supaya Supabase tidak pause + bersih data lama

Supabase: tabel preset, cache_pedoman, kode_premium, rate_limit, laporan_preset
```

**File skripsi tidak pernah dikirim ke server.** Yang dikirim hanya teks pedoman kampus (atau PDF pedoman hasil scan ≤ 3 MB), kode premium, dan laporan preset. Lihat `public/privasi.html`.

### Alur baca pedoman

1. Browser menghitung SHA-256 PDF pedoman, lalu `GET /api/preset?id=<hash>`. Kalau sudah pernah dibaca, langsung dipakai (tanpa AI).
2. Kalau belum, PDF.js mengekstrak teks per halaman (`--- Halaman N ---`), maksimal 3,5 MB, lalu dikirim ke `/api/baca-pedoman`.
3. PDF hasil scan (teks < 500 huruf untuk PDF > 2 halaman): kalau ≤ 3 MB dikirim sebagai base64 supaya Gemini membaca langsung; kalau lebih besar, pengguna diarahkan ke preset umum/WhatsApp.
4. Server: cek cache → rate limit per IP (`BATAS_HARIAN`) → Gemini (model cadangan otomatis) → `rapikanAturan` → validasi otomatis → simpan.
5. Validasi otomatis sebelum preset tampil publik: margin 1–6 cm, huruf 9–16 pt, spasi 1–3, minimal 5 dari 7 kolom utama terisi, nama tidak kosong. Tidak lolos → hanya disimpan di `cache_pedoman` (tetap bisa dipakai pengunggahnya).

## Struktur

```
api/                 Vercel Functions (Node, signature Web standar GET/POST)
lib/                 util, prompt Gemini, klien Supabase, rules (impor dari public/js/rules.js)
public/              situs statis (index, admin, privasi) + js + vendor (PDF.js 4.10, JSZip 3.10)
supabase/migrations/ skema database
scripts/             dev-server lokal, cek-rahasia, tes-produksi, setup
tests/               tes unit (node --test)
vercel.json          header keamanan, cron, durasi fungsi
```

## Env variable (di Vercel, Production + Preview)

| Nama | Isi |
|---|---|
| `SUPABASE_URL` | URL project Supabase (`https://<ref>.supabase.co`) |
| `SUPABASE_SECRET_KEY` | secret key Supabase (`sb_secret_...`). **Server saja.** |
| `GEMINI_API_KEY` | API key dari aistudio.google.com. **Server saja.** |
| `GEMINI_MODEL` | daftar model dipisah koma, urut prioritas. Model berikutnya dicoba otomatis kalau model sebelumnya hilang (404). |
| `ADMIN_PASSWORD` | password halaman `/admin.html` |
| `CRON_SECRET` | rahasia cron; Vercel otomatis mengirim `Authorization: Bearer <CRON_SECRET>` |
| `BATAS_HARIAN` | batas baca pedoman per IP per hari (default 5) |
| `SUPABASE_SCHEMA` | default `public`; isi `risetworks` kalau numpang project lain |

Contoh tanpa nilai ada di `.env.example`.

## Mengubah nomor WA dan tarif

Edit `public/js/config.js` (`nomorWa`, `tarif.rapikanPerHalaman`, `tarif.rapikanMinimum`, `tarif.fileBercatatan`), commit, push ke `main`. Vercel otomatis deploy.

## Admin

Buka `/admin.html`, masukkan `ADMIN_PASSWORD` (tersimpan selama tab terbuka).

- **Buat kode**: isi jumlah pemakaian, masa berlaku, catatan pembeli → tekan *Salin pesan WA* → tempel di chat pembeli.
- **Kode terakhir**: 50 kode terbaru dengan sisa pemakaian.
- **Preset pedoman**: preset yang dilaporkan (beserta alasannya) di urutan atas. Tombol sembunyikan/tampilkan. Menampilkan lagi akan mengosongkan hitungan laporan.

**Cek AI (Gemini)**: buka `/api/admin/cek-ai` dengan header `Authorization: Bearer <ADMIN_PASSWORD>`. Hasilnya menunjukkan apakah API key valid, model apa yang tersedia, dan saran isi `GEMINI_MODEL`. Kalau semua model di `GEMINI_MODEL` sudah dihapus Google, server otomatis mencari model Flash yang tersedia lewat `models.list`.

Kode yang kedaluwarsa disimpan 30 hari lagi (supaya pembeli mendapat pesan "kedaluwarsa", bukan "tidak ditemukan"), lalu dihapus otomatis oleh cron.

## Pengembangan lokal

```bash
npm install
npm test                 # tes unit: checker 13/13, dokumen benar 100, file bercatatan, rules, pagemap, Gemini fallback
npm run dev              # http://localhost:3000, membaca .env kalau ada
npm run cek-rahasia      # pastikan tidak ada secret di public/
BASE_URL=https://... ADMIN_PASSWORD=... CRON_SECRET=... npm run tes-produksi
```

## Setup ulang dari nol

Lihat `scripts/setup.md`. Ringkasnya:

1. Supabase: buat project (region `ap-southeast-1`), jalankan `supabase/migrations/0001_init.sql` (SQL Editor, `supabase db push`, atau Management API), ambil URL + secret key.
2. Gemini: buat API key di aistudio.google.com, cek model yang tersedia: `curl -H "x-goog-api-key: $KEY" https://generativelanguage.googleapis.com/v1beta/models`.
3. Vercel: import repo GitHub, Framework **Other**, Output Directory `public`, tanpa build command. Isi env di atas. Setiap push ke `main` otomatis deploy.

## Pindah ke paket berbayar atau ke tempat lain

- **Vercel Pro**: tidak perlu ubah kode. Bisa naikkan `maxDuration` di `vercel.json` dan jadwal cron lebih sering.
- **Supabase Pro**: tidak perlu ubah kode. Cron harian boleh tetap (bersih-bersih data).
- **Cloudflare Pages/Workers**: `api/*.js` sudah memakai `Request`/`Response` standar. Pindahkan ke `functions/api/*.js` dengan `export const onRequestGet = ({ request, env }) => GET(request)`, ganti `process.env` dengan `env`, pindahkan header dari `vercel.json` ke `public/_headers`, dan cron ke Cron Trigger. Database tetap Supabase.
- **Server Node biasa**: `scripts/dev-server.mjs` sudah bisa menjalankan semua endpoint; tambahkan cron sistem untuk memanggil `/api/cron/harian`.

## Batasan yang disengaja

- Paywall file bercatatan bisa dijebol lewat devtools karena file dibuat di browser. Dipertahankan demi janji privasi.
- Tidak ada pembayaran otomatis. Kode dibuat dari `/admin.html` setelah transfer masuk.
- Vercel Hobby untuk non-komersial: risiko diterima sementara selama uji pasar. Kode tidak memakai fitur khusus Vercel selain Functions dan Cron.
- Hasil cek otomatis bisa keliru (misalnya kutipan langsung yang memang berspasi 1). Pengguna selalu diingatkan mencocokkan dengan pedoman resmi.
