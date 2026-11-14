import { tambahHitungan } from '../lib/db.js';
import { json, galat, ambilIp, bacaJson, waktuWib, HASH_RE } from '../lib/util.js';
import { buatPrompt } from '../lib/prompt.js';
import { tanyaGemini } from '../lib/gemini.js';
import { rapikanAturan } from '../lib/rules.js';

// Membaca pedoman dengan AI lalu langsung mengembalikan aturannya.
// Pedoman dan aturannya TIDAK disimpan di server.

const PESAN_GAGAL = 'Pedoman belum bisa dibaca otomatis, pakai pedoman umum dulu atau kirim pedoman lewat WhatsApp.';

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
  const namaFile = String(body.namaFile || '').slice(0, 120);

  // batas per IP per hari (hanya hitungan, bukan isi pedoman)
  try {
    const batas = parseInt(process.env.BATAS_HARIAN || '5', 10) || 5;
    const n = await tambahHitungan(`pedoman:${ambilIp(request)}:${waktuWib().tanggal}`);
    if (n > batas) return galat(`Batas baca pedoman hari ini sudah habis (${batas} kali). Coba lagi besok, atau pakai pedoman umum dulu.`, 429);
  } catch (e) {
    console.error('baca-pedoman db', e);
    return galat('Server sedang sibuk. Pakai pedoman umum dulu, lalu coba lagi nanti.', 503);
  }

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
  if (!aturan.nama) aturan.nama = (aturan.kampus ? `Pedoman ${aturan.kampus}` : namaFile.replace(/\.pdf$/i, '')).slice(0, 160) || 'Pedoman kampus';
  return json({ ok: true, id: hash, aturan, model: hasil.model });
}
