import { ambilIp, galat, samaAman, waktuWib } from './util.js';
import { hitungan, tambahHitungan } from './db.js';

const BATAS_SALAH = 5;

/**
 * Cek password admin dengan batas 5 kali salah per IP per jam.
 * @returns {Promise<Response|null>} null kalau lolos, Response kalau ditolak.
 */
export async function cekAdmin(request) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return galat('ADMIN_PASSWORD belum diatur di server.', 500);
  const kunci = `admin:${ambilIp(request)}:${waktuWib().jam}`;
  if ((await hitungan(kunci)) >= BATAS_SALAH) {
    return galat('Terlalu banyak percobaan password salah. Coba lagi dalam 1 jam.', 429);
  }
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!samaAman(token, password)) {
    const n = await tambahHitungan(kunci);
    return galat(`Password salah. Sisa percobaan: ${Math.max(0, BATAS_SALAH - n)}.`, n >= BATAS_SALAH ? 429 : 401);
  }
  return null;
}
