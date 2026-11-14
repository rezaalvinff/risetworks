import { db, tambahHitungan } from '../lib/db.js';
import { json, galat, ambilIp, bacaJson, waktuWib, HASH_RE } from '../lib/util.js';

export async function POST(request) {
  const body = await bacaJson(request, 10 * 1024);
  const id = String((body && body.id) || '').toLowerCase();
  if (!HASH_RE.test(id)) return galat('Pedoman tidak valid.');
  const alasan = String((body && body.alasan) || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const ip = ambilIp(request);
  try {
    if ((await tambahHitungan(`lapor:${ip}:${waktuWib().tanggal}`)) > 10) return galat('Terlalu banyak laporan hari ini. Coba lagi besok.', 429);
    // satu IP hanya dihitung sekali per pedoman
    if ((await tambahHitungan(`lapor:${ip}:${id}`)) > 1) return json({ ok: true, sudah: true });
    const { data, error } = await db().rpc('lapor_preset', { p_id: id, p_alasan: alasan });
    if (error) throw error;
    if (data === null || data === undefined) return galat('Pedoman tidak ditemukan.', 404);
    return json({ ok: true, jumlah: data });
  } catch (e) {
    console.error('lapor', e);
    return galat('Laporan gagal dikirim. Coba lagi nanti.', 503);
  }
}
