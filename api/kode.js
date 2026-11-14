import { db, tambahHitungan } from '../lib/db.js';
import { json, galat, ambilIp, bacaJson, waktuWib, normalKode } from '../lib/util.js';

const BATAS_PERCOBAAN = 30;

export async function POST(request) {
  const body = await bacaJson(request, 10 * 1024);
  const kode = normalKode(body && body.kode);
  if (!/^[A-Z0-9-]{4,40}$/.test(kode)) return galat('Format kode tidak valid. Contoh: RW-ABCD-1234.');
  try {
    const n = await tambahHitungan(`kode:${ambilIp(request)}:${waktuWib().tanggal}`);
    if (n > BATAS_PERCOBAAN) return galat('Terlalu banyak percobaan kode hari ini. Coba lagi besok atau hubungi kami lewat WhatsApp.', 429);
    const { data: sisa, error } = await db().rpc('tebus_kode', { p_kode: kode });
    if (error) throw error;
    if (sisa !== null && sisa !== undefined) return json({ ok: true, sisa });
    const { data: k, error: e2 } = await db().from('kode_premium').select('sisa, kedaluwarsa').eq('kode', kode).maybeSingle();
    if (e2) throw e2;
    if (!k) return galat('Kode tidak ditemukan. Periksa lagi penulisannya.', 404);
    if (new Date(k.kedaluwarsa) <= new Date()) return galat('Kode sudah kedaluwarsa. Hubungi kami lewat WhatsApp.', 410);
    return galat('Kode sudah habis dipakai. Hubungi kami lewat WhatsApp untuk kode baru.', 410);
  } catch (e) {
    console.error('kode', e);
    return galat('Server kode sedang bermasalah. Coba lagi beberapa saat, kode Anda tidak terpakai.', 503);
  }
}
