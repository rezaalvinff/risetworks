import { db } from '../../lib/db.js';
import { json, galat, samaAman } from '../../lib/util.js';

// Dipanggil Vercel Cron 1x sehari. Query nyata supaya Supabase Free tidak di-pause,
// sekalian membersihkan data kedaluwarsa.
export async function GET(request) {
  const rahasia = process.env.CRON_SECRET;
  if (!rahasia) return galat('CRON_SECRET belum diatur.', 500);
  const auth = request.headers.get('authorization') || '';
  if (!samaAman(auth.startsWith('Bearer ') ? auth.slice(7) : '', rahasia)) return galat('Tidak diizinkan.', 401);
  try {
    const sekarang = Date.now();
    const iso = (ms) => new Date(sekarang - ms).toISOString();
    const HARI = 86400 * 1000;
    const r1 = await db().from('rate_limit').delete({ count: 'exact' }).lt('dibuat', iso(2 * HARI));
    if (r1.error) throw r1.error;
    const r2 = await db().from('cache_pedoman').delete({ count: 'exact' }).lt('kedaluwarsa', iso(0));
    if (r2.error) throw r2.error;
    // kode kedaluwarsa disimpan 30 hari lagi supaya pengguna tetap mendapat pesan "kedaluwarsa"
    const r3 = await db().from('kode_premium').delete({ count: 'exact' }).lt('kedaluwarsa', iso(30 * HARI));
    if (r3.error) throw r3.error;
    const r4 = await db().from('laporan_preset').delete({ count: 'exact' }).lt('dibuat', iso(180 * HARI));
    if (r4.error) throw r4.error;
    const r5 = await db().from('preset').select('*', { count: 'exact', head: true });
    if (r5.error) throw r5.error;
    return json({
      ok: true,
      preset: r5.count,
      dihapus: { rate_limit: r1.count, cache_pedoman: r2.count, kode_premium: r3.count, laporan_preset: r4.count },
    });
  } catch (e) {
    console.error('cron', e);
    return galat('Cron gagal: ' + (e.message || 'error'), 500);
  }
}
