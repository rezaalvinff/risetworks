import { db, tambahHitungan } from '../lib/db.js';
import { json, galat, ambilIp, bacaJson, waktuWib, HASH_RE } from '../lib/util.js';
import { buatPrompt } from '../lib/prompt.js';
import { tanyaGemini } from '../lib/gemini.js';
import { rapikanAturan, validasiPublik } from '../lib/rules.js';

const PESAN_GAGAL = 'Pedoman belum bisa dibaca otomatis, pakai preset umum dulu atau kirim pedoman lewat WhatsApp.';

export async function POST(request) {
  const body = await bacaJson(request, 4.4 * 1024 * 1024);
  if (!body) return galat('Permintaan tidak valid atau terlalu besar (maksimal 4 MB).', 413);
  const hash = String(body.hash || '').toLowerCase();
  if (!HASH_RE.test(hash)) return galat('Hash pedoman tidak valid.');
  const teks = typeof body.teks === 'string' ? body.teks : '';
  const pdfBase64 = typeof body.pdfBase64 === 'string' ? body.pdfBase64 : '';
  if (!teks && !pdfBase64) return galat('Isi pedoman kosong.');
  if (teks && teks.length > 3.6 * 1024 * 1024) return galat('Teks pedoman terlalu panjang.', 413);
  if (pdfBase64 && (pdfBase64.length > 4.2 * 1024 * 1024 || !/^[A-Za-z0-9+/=\s]+$/.test(pdfBase64.slice(0, 1000)))) return galat('PDF pedoman tidak valid atau terlalu besar.', 413);
  const simpanPublik = body.simpanPublik !== false;
  const namaFile = String(body.namaFile || '').slice(0, 120);

  try {
    // 1. sudah pernah dibaca?
    const { data: p, error: e1 } = await db().from('preset').select('id, aturan').eq('id', hash).eq('tampil', true).maybeSingle();
    if (e1) throw e1;
    if (p) return json({ ok: true, id: p.id, aturan: p.aturan, dariCache: true, publik: true });
    const { data: c, error: e2 } = await db().from('cache_pedoman').select('id, aturan').eq('id', hash).gt('kedaluwarsa', new Date().toISOString()).maybeSingle();
    if (e2) throw e2;
    if (c) return json({ ok: true, id: c.id, aturan: c.aturan, dariCache: true, publik: false });

    // 2. rate limit per IP per hari
    const batas = parseInt(process.env.BATAS_HARIAN || '5', 10) || 5;
    const n = await tambahHitungan(`pedoman:${ambilIp(request)}:${waktuWib().tanggal}`);
    if (n > batas) return galat(`Batas baca pedoman hari ini sudah habis (${batas} kali). Coba lagi besok, atau pakai pedoman umum dulu.`, 429);
  } catch (e) {
    console.error('baca-pedoman db', e);
    return galat('Database sedang tidak tersedia. Pakai pedoman umum dulu, lalu coba lagi nanti.', 503);
  }

  // 3. AI
  let hasil;
  try {
    hasil = await tanyaGemini({ prompt: buatPrompt({ dariTeks: !pdfBase64, namaFile }), teks, pdfBase64 });
  } catch (e) {
    console.error('baca-pedoman ai', e.kode, e.message);
    if (e.kode === 'kuota') return galat('Kuota AI sedang penuh, coba beberapa menit lagi.', 429);
    return galat(PESAN_GAGAL, 502, { detail: e.kode || 'tidak diketahui' });
  }
  const aturan = rapikanAturan(hasil.data);
  const m = aturan.margin;
  const terisi = [m.atas, m.bawah, m.kiri, m.kanan, aturan.font, aturan.ukuran, aturan.spasi].filter((v) => v !== null).length;
  if (terisi === 0) {
    const bukan = aturan.catatan.some((c) => /bukan pedoman/i.test(c));
    return galat(bukan
      ? 'File ini sepertinya bukan pedoman penulisan. Pilih PDF pedoman format dari kampus, atau pakai pedoman umum.'
      : 'Aturan format (margin, huruf, spasi) tidak ditemukan di pedoman ini. Pakai pedoman umum dulu atau kirim pedoman lewat WhatsApp.', 422);
  }
  if (!aturan.nama) aturan.nama = (aturan.kampus ? `Pedoman ${aturan.kampus}` : namaFile.replace(/\.pdf$/i, '')).slice(0, 160) || 'Pedoman tanpa nama';

  // 4. validasi otomatis sebelum publik
  const v = validasiPublik(aturan);
  let publik = false;
  try {
    if (simpanPublik && v.lolos) {
      const { data, error } = await db().from('preset')
        .upsert({ id: hash, nama: aturan.nama, aturan, tampil: true }, { onConflict: 'id', ignoreDuplicates: true })
        .select('id');
      if (error) throw error;
      publik = Array.isArray(data) && data.length > 0;
    }
    if (!publik) {
      const kedaluwarsa = new Date(Date.now() + 90 * 86400 * 1000).toISOString();
      const { error } = await db().from('cache_pedoman').upsert({ id: hash, aturan, kedaluwarsa }, { onConflict: 'id' });
      if (error) throw error;
    }
  } catch (e) {
    console.error('baca-pedoman simpan', e);
  }
  return json({ ok: true, id: hash, aturan, dariCache: false, publik, model: hasil.model, validasi: v.alasan });
}
