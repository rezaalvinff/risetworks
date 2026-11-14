import { db } from '../../lib/db.js';
import { json, galat, bacaJson, buatKode } from '../../lib/util.js';
import { cekAdmin } from '../../lib/admin.js';

export async function GET(request) {
  try {
    const tolak = await cekAdmin(request);
    if (tolak) return tolak;
    const { data, error } = await db().from('kode_premium')
      .select('kode, sisa, kedaluwarsa, catatan, dibuat, terakhir_dipakai')
      .order('dibuat', { ascending: false })
      .limit(50);
    if (error) throw error;
    return json({ ok: true, kode: data || [] });
  } catch (e) {
    console.error('admin kode get', e);
    return galat('Gagal memuat daftar kode.', 503);
  }
}

export async function POST(request) {
  try {
    const tolak = await cekAdmin(request);
    if (tolak) return tolak;
    const body = (await bacaJson(request, 10 * 1024)) || {};
    const pakai = Math.min(100, Math.max(1, parseInt(body.pakai ?? body.jumlah ?? body.sisa ?? 1, 10) || 1));
    const hari = Math.min(365, Math.max(1, parseInt(body.hari ?? 30, 10) || 30));
    const catatan = String(body.catatan || '').slice(0, 200);
    const kedaluwarsa = new Date(Date.now() + hari * 86400 * 1000).toISOString();
    for (let coba = 0; coba < 5; coba++) {
      const kode = buatKode();
      const { error } = await db().from('kode_premium').insert({ kode, sisa: pakai, kedaluwarsa, catatan });
      if (!error) return json({ ok: true, kode, sisa: pakai, kedaluwarsa, catatan });
      if (error.code !== '23505') throw error; // 23505 = kode kembar, ulangi
    }
    throw new Error('gagal membuat kode unik');
  } catch (e) {
    console.error('admin kode post', e);
    return galat('Gagal membuat kode.', 503);
  }
}
