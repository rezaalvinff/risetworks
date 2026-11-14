// Pemanggil Gemini generateContent dengan daftar model cadangan otomatis.

const DEFAULT_MODEL = 'gemini-2.5-flash-lite,gemini-2.5-flash,gemini-2.0-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GalatAi extends Error {
  constructor(pesan, kode) {
    super(pesan);
    this.kode = kode;
  }
}

export function daftarModel() {
  return (process.env.GEMINI_MODEL || DEFAULT_MODEL).split(',').map((s) => s.trim()).filter(Boolean);
}

let modelTemuan = null; // hasil models.list, disimpan selama instance hidup

/** Daftar model di akun ini yang mendukung generateContent (urut: Flash-Lite, Flash, lainnya). */
export async function cariModelTersedia(fetchFn = fetch) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GalatAi('GEMINI_API_KEY belum diatur', 'konfigurasi');
  const res = await fetchFn(`${ENDPOINT}?pageSize=200`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(10000) });
  const raw = await res.text();
  if (!res.ok) throw new GalatAi(`models.list error ${res.status}: ${raw.slice(0, 300)}`, res.status === 429 ? 'kuota' : 'kunci');
  const j = JSON.parse(raw);
  const nama = (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name || '').replace(/^models\//, ''))
    .filter((n) => /^gemini-/.test(n) && /flash/.test(n) && !/(image|tts|audio|live|thinking|exp|embedding|native)/.test(n));
  const skor = (n) => (/-lite/.test(n) ? 0 : 1) + (/preview/.test(n) ? 2 : 0) + (/latest/.test(n) ? 0.5 : 0);
  const versi = (n) => parseFloat((n.match(/gemini-(\d+(\.\d+)?)/) || [])[1] || '0');
  return nama.sort((a, b) => skor(a) - skor(b) || versi(b) - versi(a) || a.localeCompare(b));
}

function ambilJson(teks) {
  try {
    return JSON.parse(teks);
  } catch {
    const m = teks.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* lanjut */ }
    }
    return null;
  }
}

/**
 * @param {{prompt: string, teks?: string, pdfBase64?: string, fetchFn?: typeof fetch, batasMs?: number}} o
 * @returns {Promise<{data: object, model: string}>}
 */
export async function tanyaGemini({ prompt, teks, pdfBase64, fetchFn = fetch, batasMs = 50000 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GalatAi('GEMINI_API_KEY belum diatur', 'konfigurasi');
  const parts = [{ text: prompt }];
  if (pdfBase64) parts.push({ inline_data: { mime_type: 'application/pdf', data: pdfBase64 } });
  else parts.push({ text: teks });
  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  });
  const mulai = Date.now();
  let terakhir = null;
  const dicoba = new Set();
  const antrean = [...daftarModel(), ...(modelTemuan || [])];
  const sudahCari = !!modelTemuan;
  while (antrean.length) {
    const model = antrean.shift();
    if (dicoba.has(model)) continue;
    dicoba.add(model);
    const sisa = batasMs - (Date.now() - mulai);
    if (sisa < 3000) break;
    let res;
    try {
      res = await fetchFn(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body,
        signal: AbortSignal.timeout(sisa),
      });
    } catch (e) {
      terakhir = new GalatAi(`Gagal menghubungi Gemini (${model}): ${e.message}`, 'jaringan');
      continue;
    }
    const raw = await res.text();
    if (res.status === 429) throw new GalatAi('kuota', 'kuota');
    if (res.status === 404 || /not found|is not supported|no longer available|deprecated/i.test(res.status >= 400 ? raw : '')) {
      terakhir = new GalatAi(`Model ${model} tidak tersedia`, 'model');
      continue;
    }
    if (res.status === 403 || (res.status === 400 && /api key|API_KEY/i.test(raw))) {
      throw new GalatAi(`API key Gemini ditolak (${res.status}): ${raw.slice(0, 200)}`, 'kunci');
    }
    if (!res.ok) {
      terakhir = new GalatAi(`Gemini ${model} error ${res.status}: ${raw.slice(0, 300)}`, 'server');
      if (res.status >= 500) continue;
      throw terakhir;
    }
    let j;
    try { j = JSON.parse(raw); } catch { j = null; }
    const teksJawab = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    const data = ambilJson(teksJawab);
    if (!data || typeof data !== 'object') {
      terakhir = new GalatAi(`Jawaban ${model} bukan JSON`, 'format');
      continue;
    }
    return { data, model };
  }
  // semua model di daftar hilang: cari model yang tersedia di akun ini
  if (terakhir?.kode === 'model' && !sudahCari && batasMs - (Date.now() - mulai) > 5000) {
    try {
      modelTemuan = (await cariModelTersedia(fetchFn)).slice(0, 4);
    } catch (e) {
      if (e.kode === 'kuota') throw e;
      throw new GalatAi(e.message, e.kode || 'model');
    }
    const baru = modelTemuan.filter((m) => !dicoba.has(m));
    if (baru.length) return tanyaGemini({ prompt, teks, pdfBase64, fetchFn, batasMs: batasMs - (Date.now() - mulai) });
  }
  throw terakhir || new GalatAi('Tidak ada model Gemini yang bisa dipakai', 'model');
}
