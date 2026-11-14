import { db } from '../lib/db.js';
import { json, galat, HASH_RE } from '../lib/util.js';
import { PRESET_UMUM } from '../lib/rules.js';

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');
  try {
    if (!id) {
      const { data, error } = await db()
        .from('preset')
        .select('id, nama, kampus:aturan->>kampus, singkatan:aturan->>singkatan, fakultas:aturan->>fakultas')
        .eq('tampil', true)
        .order('nama');
      if (error) throw error;
      const preset = (data || []).map((p) => ({
        id: p.id,
        nama: p.nama,
        kampus: p.kampus || '',
        cari: [p.singkatan, p.kampus, p.fakultas].filter(Boolean).join(' '),
      }));
      return json({ ok: true, preset }, 200, { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=600' });
    }
    if (id === 'umum') return json({ ok: true, id, nama: PRESET_UMUM.nama, aturan: PRESET_UMUM });
    if (!HASH_RE.test(id)) return galat('ID pedoman tidak valid.');
    const { data: p, error } = await db().from('preset').select('id, nama, aturan').eq('id', id).eq('tampil', true).maybeSingle();
    if (error) throw error;
    if (p) return json({ ok: true, id: p.id, nama: p.nama, aturan: p.aturan, sumber: 'preset' });
    const { data: c, error: e2 } = await db().from('cache_pedoman').select('id, aturan').eq('id', id).gt('kedaluwarsa', new Date().toISOString()).maybeSingle();
    if (e2) throw e2;
    if (c) return json({ ok: true, id: c.id, nama: c.aturan?.nama || '', aturan: c.aturan, sumber: 'cache' });
    return galat('Pedoman ini belum pernah dibaca.', 404);
  } catch (e) {
    console.error('preset', e);
    return galat('Daftar pedoman sedang tidak tersedia. Pakai pedoman umum dulu.', 503);
  }
}
