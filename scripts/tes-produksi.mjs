// Tes otomatis setelah deploy. Pakai:
// BASE_URL=https://xxx.vercel.app ADMIN_PASSWORD=... CRON_SECRET=... node scripts/tes-produksi.mjs
import { createHash, randomBytes } from 'node:crypto';

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const { ADMIN_PASSWORD, CRON_SECRET } = process.env;
if (!BASE || !ADMIN_PASSWORD || !CRON_SECRET) {
  console.error('Isi BASE_URL, ADMIN_PASSWORD, CRON_SECRET');
  process.exit(2);
}

let gagal = 0;
const cek = (nama, ok, info = '') => {
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? ' · ' + info : ''}`);
  if (!ok) gagal++;
};
async function req(path, opsi = {}) {
  const res = await fetch(BASE + path, { ...opsi, headers: { 'content-type': 'application/json', ...(opsi.headers || {}) } });
  let data = null;
  const teks = await res.text();
  try { data = JSON.parse(teks); } catch { data = teks; }
  return { status: res.status, data, headers: res.headers };
}

const home = await req('/');
cek('halaman utama 200', home.status === 200);
cek('header CSP terpasang', /default-src 'self'/.test(home.headers.get('content-security-policy') || ''));
const admin = await req('/admin.html');
cek('admin.html noindex', /noindex/.test(admin.headers.get('x-robots-tag') || ''));
const vendor = await req('/vendor/jszip.min.js');
cek('vendor cache panjang', /immutable/.test(vendor.headers.get('cache-control') || ''));


cek('/api/cron/harian tanpa secret 401', (await req('/api/cron/harian')).status === 401);
const cron = await req('/api/cron/harian', { headers: { authorization: `Bearer ${CRON_SECRET}` } });
cek('/api/cron/harian dengan secret 200', cron.status === 200, JSON.stringify(cron.data));

cek('/api/admin/kode password salah 401', (await req('/api/admin/kode', { headers: { authorization: 'Bearer salah' } })).status === 401);
const kode = await req('/api/admin/kode', { method: 'POST', headers: { authorization: `Bearer ${ADMIN_PASSWORD}` }, body: JSON.stringify({ pakai: 1, hari: 1, catatan: 'tes otomatis' }) });
cek('buat kode tes', kode.status === 200 && kode.data?.kode, kode.data?.kode);
if (kode.data?.kode) {
  const t1 = await req('/api/kode', { method: 'POST', body: JSON.stringify({ kode: kode.data.kode }) });
  cek('tebus pertama berhasil', t1.status === 200 && t1.data.sisa === 0, JSON.stringify(t1.data));
  const t2 = await req('/api/kode', { method: 'POST', body: JSON.stringify({ kode: kode.data.kode }) });
  cek('tebus kedua ditolak (habis)', t2.status === 410, JSON.stringify(t2.data));
}
const t3 = await req('/api/kode', { method: 'POST', body: JSON.stringify({ kode: 'RW-TIDAK-ADA1' }) });
cek('kode tidak ada 404', t3.status === 404);
const daftar = await req('/api/admin/kode', { headers: { authorization: `Bearer ${ADMIN_PASSWORD}` } });
cek('daftar kode admin', daftar.status === 200 && Array.isArray(daftar.data?.kode));
const ai = await req('/api/admin/cek-ai', { headers: { authorization: `Bearer ${ADMIN_PASSWORD}` } });
cek('cek AI admin', ai.status === 200 && ai.data?.ok === true, `model ${ai.data?.uji?.model || '-'}`);

if (process.env.LEWATI_AI !== '1') {
  const teks = `--- Halaman 1 ---
PEDOMAN PENULISAN SKRIPSI (CONTOH TES OTOMATIS RISETWORKS)
Naskah diketik pada kertas A4. Margin kiri 4 cm, atas 4 cm, kanan 3 cm, bawah 3 cm.
Huruf Times New Roman ukuran 12. Spasi 2. Teks rata kanan kiri. Paragraf baru menjorok 1 cm.
--- Halaman 2 ---
Judul bab ditulis huruf kapital, tebal, di tengah, ukuran 14. Setiap bab dimulai di halaman baru.`;
  const hash = createHash('sha256').update(randomBytes(16)).digest('hex');
  const bp = await req('/api/baca-pedoman', { method: 'POST', body: JSON.stringify({ hash, teks, namaFile: 'tes-otomatis.pdf' }) });
  const a = bp.data?.aturan || {};
  cek('/api/baca-pedoman membaca teks contoh', bp.status === 200 && a.margin?.kiri === 4 && a.ukuran === 12 && a.spasi === 2, `status ${bp.status}, model ${bp.data?.model || '-'}, ${bp.data?.error || JSON.stringify({ margin: a.margin, font: a.font, ukuran: a.ukuran, spasi: a.spasi })}`);
}

console.log(gagal ? `\n${gagal} tes gagal` : '\nSemua tes lulus');
process.exit(gagal ? 1 : 0);
