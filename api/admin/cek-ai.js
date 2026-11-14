import { json, galat } from '../../lib/util.js';
import { cekAdmin } from '../../lib/admin.js';
import { cariModelTersedia, daftarModel, tanyaGemini } from '../../lib/gemini.js';

// Diagnosa Gemini: apakah API key valid, model apa yang tersedia, dan apakah daftar GEMINI_MODEL bisa dipakai.
export async function GET(request) {
  try {
    const tolak = await cekAdmin(request);
    if (tolak) return tolak;
  } catch (e) {
    console.error('cek-ai admin', e);
    return galat('Database tidak bisa dihubungi.', 503);
  }
  const hasil = { ok: false, kunciTerisi: !!process.env.GEMINI_API_KEY, modelDiatur: daftarModel(), modelTersedia: [], uji: null };
  try {
    hasil.modelTersedia = await cariModelTersedia();
  } catch (e) {
    hasil.galat = e.message;
    return json(hasil);
  }
  try {
    const r = await tanyaGemini({ prompt: 'Jawab dengan JSON {"ok": true}.', teks: 'tes', batasMs: 25000 });
    hasil.uji = { berhasil: true, model: r.model };
    hasil.ok = true;
  } catch (e) {
    hasil.uji = { berhasil: false, kode: e.kode, pesan: e.message };
  }
  if (hasil.modelTersedia.length) hasil.saranGEMINI_MODEL = hasil.modelTersedia.slice(0, 3).join(',');
  return json(hasil);
}
