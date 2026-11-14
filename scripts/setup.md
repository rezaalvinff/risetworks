# Setup otomatis (catatan untuk Claude Code / pemilik)

Semua langkah di bawah bisa dijalankan dari terminal. Hanya bagian bertanda (manual) yang perlu dikerjakan pemilik.

## 1. Supabase
- (manual) Buat akun di supabase.com dan buat Personal Access Token: Account → Access Tokens.
- Buat project lewat Management API:
  `POST https://api.supabase.com/v1/projects` dengan `{ name: "risetworks", organization_id, region: "ap-southeast-1", db_pass }`.
  (atau `npx supabase projects create risetworks --region ap-southeast-1 --org-id <org>`)
- Jalankan migrasi: `POST https://api.supabase.com/v1/projects/<ref>/database/query` dengan `{ query: <isi supabase/migrations/0001_init.sql> }`
  (atau `npx supabase link --project-ref <ref> && npx supabase db push`).
- Ambil secret key: `GET https://api.supabase.com/v1/projects/<ref>/api-keys?reveal=true` → key bertipe `secret`.
- `SUPABASE_URL` = `https://<ref>.supabase.co`.

## 2. Gemini
- (manual) Buat API key di aistudio.google.com.
- Lihat model yang tersedia: `GET https://generativelanguage.googleapis.com/v1beta/models` (header `x-goog-api-key`).
  Isi `GEMINI_MODEL` dengan model Flash-Lite dan Flash yang mendukung `generateContent`, urut dari yang paling hemat kuota.

## 3. Rahasia acak
- `ADMIN_PASSWORD`: `node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"` (24 karakter)
- `CRON_SECRET`: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"` (32 karakter)

## 4. Vercel
- (manual) Buat akun Vercel dengan login GitHub, buat token di vercel.com/account/tokens.
- `npx vercel link --yes --token $VERCEL_TOKEN`
- `npx vercel git connect` (menyambungkan repo GitHub supaya push ke main otomatis deploy)
- Untuk tiap env: `printf %s "$NILAI" | npx vercel env add NAMA production --token $VERCEL_TOKEN` (ulang untuk `preview`)
- `npx vercel deploy --prod --token $VERCEL_TOKEN`

## 5. Tes setelah deploy
`BASE_URL=https://<domain> ADMIN_PASSWORD=... CRON_SECRET=... npm run tes-produksi`
