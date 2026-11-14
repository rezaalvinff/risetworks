// Klien Supabase untuk server saja. Jangan pernah diimpor dari folder public/.
import { createClient } from '@supabase/supabase-js';

let klien = null;

export function db() {
  if (klien) return klien;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY belum diisi');
  klien = createClient(url, key, {
    db: { schema: process.env.SUPABASE_SCHEMA || 'public' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return klien;
}

/** Tambah hitungan rate limit secara atomik, kembalikan jumlah terbaru. */
export async function tambahHitungan(kunci) {
  const { data, error } = await db().rpc('tambah_hitungan', { p_kunci: kunci });
  if (error) throw error;
  return Number(data) || 0;
}

/** Jumlah hitungan saat ini tanpa menambah. */
export async function hitungan(kunci) {
  const { data, error } = await db().from('rate_limit').select('jumlah').eq('kunci', kunci).maybeSingle();
  if (error) throw error;
  return data ? data.jumlah : 0;
}
