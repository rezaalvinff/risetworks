import { createHash, timingSafeEqual, randomInt } from 'node:crypto';

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export const galat = (pesan, status = 400, extra = {}) => json({ ok: false, error: pesan, ...extra }, status);

/** IP pengguna: ambil IP pertama dari x-forwarded-for. */
export function ambilIp(request) {
  const xff = request.headers.get('x-forwarded-for') || '';
  const ip = xff.split(',')[0].trim() || request.headers.get('x-real-ip') || 'tanpa-ip';
  return ip.slice(0, 64);
}

/** Baca body JSON dengan batas ukuran. Mengembalikan null kalau tidak valid. */
export async function bacaJson(request, maksByte = 4 * 1024 * 1024) {
  const panjang = Number(request.headers.get('content-length') || 0);
  if (panjang > maksByte) return null;
  try {
    const teks = await request.text();
    if (teks.length > maksByte) return null;
    const data = JSON.parse(teks);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

/** Perbandingan string waktu-konstan. */
export function samaAman(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
}

/** Tanggal (YYYY-MM-DD) dan jam (YYYY-MM-DDTHH) dalam WIB untuk kunci rate limit. */
export function waktuWib() {
  const d = new Date(Date.now() + 7 * 3600 * 1000).toISOString();
  return { tanggal: d.slice(0, 10), jam: d.slice(0, 13) };
}

const HURUF_KODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function buatKode() {
  const blok = () => Array.from({ length: 4 }, () => HURUF_KODE[randomInt(HURUF_KODE.length)]).join('');
  return `RW-${blok()}-${blok()}`;
}

export const normalKode = (k) => String(k || '').toUpperCase().replace(/\s+/g, '').slice(0, 40);

export const HASH_RE = /^[a-f0-9]{64}$/;
