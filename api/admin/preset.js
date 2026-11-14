import { db } from '../../lib/db.js';
import { json, galat, bacaJson, HASH_RE } from '../../lib/util.js';
import { cekAdmin } from '../../lib/admin.js';

export async function GET(request) {
  try {
    const tolak = await cekAdmin(request);
    if (tolak) return tolak;
    const { data, error } = await db().from('preset')
      .select('id, nama, tampil, jumlah_laporan, dibuat')
      .order('jumlah_laporan', { ascending: false })
      .order('dibuat', { ascending: false })
      .limit(500);
    if (error) throw error;
    const { data: lap, error: e2 } = await db().from('laporan_preset')
      .select('preset_id, alasan, dibuat')
      .order('dibuat', { ascending: false })
      .limit(300);
    if (e2) throw e2;
    const alasan = new Map();
    for (const l of lap || []) {
      if (!l.alasan) continue;
      if (!alasan.has(l.preset_id)) alasan.set(l.preset_id, []);
      if (alasan.get(l.preset_id).length < 5) alasan.get(l.preset_id).push(l.alasan);
    }
    return json({ ok: true, preset: (data || []).map((p) => ({ ...p, alasan: alasan.get(p.id) || [] })) });
  } catch (e) {
    console.error('admin preset get', e);
    return galat('Gagal memuat daftar preset.', 503);
  }
}

export async function POST(request) {
  try {
    const tolak = await cekAdmin(request);
    if (tolak) return tolak;
    const body = (await bacaJson(request, 10 * 1024)) || {};
    const id = String(body.id || '').toLowerCase();
    if (!HASH_RE.test(id) || typeof body.tampil !== 'boolean') return galat('Isi { id, tampil: true/false }.');
    const ubah = body.tampil ? { tampil: true, jumlah_laporan: 0 } : { tampil: false };
    const { data, error } = await db().from('preset').update(ubah).eq('id', id).select('id, nama, tampil, jumlah_laporan');
    if (error) throw error;
    if (!data || !data.length) return galat('Preset tidak ditemukan.', 404);
    return json({ ok: true, preset: data[0] });
  } catch (e) {
    console.error('admin preset post', e);
    return galat('Gagal mengubah preset.', 503);
  }
}
