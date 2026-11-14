import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tanyaGemini, daftarModel } from '../lib/gemini.js';
import { samaAman, ambilIp, buatKode, waktuWib } from '../lib/util.js';
import { buatPrompt } from '../lib/prompt.js';

const resp = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const jawab = (obj) => resp(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

test('model cadangan dipakai kalau model pertama 404', async () => {
  process.env.GEMINI_API_KEY = 'tes';
  process.env.GEMINI_MODEL = 'model-hilang, model-ada';
  assert.deepEqual(daftarModel(), ['model-hilang', 'model-ada']);
  const dipanggil = [];
  const fetchFn = async (url) => {
    dipanggil.push(url);
    return url.includes('model-hilang') ? resp(404, { error: { message: 'models/model-hilang is not found' } }) : jawab({ nama: 'X', font: 'Arial' });
  };
  const r = await tanyaGemini({ prompt: 'p', teks: 't', fetchFn });
  assert.equal(r.model, 'model-ada');
  assert.equal(r.data.font, 'Arial');
  assert.equal(dipanggil.length, 2);
});

test('429 langsung dikembalikan sebagai kuota penuh', async () => {
  process.env.GEMINI_MODEL = 'a,b';
  let n = 0;
  await assert.rejects(tanyaGemini({ prompt: 'p', teks: 't', fetchFn: async () => { n++; return resp(429, 'quota'); } }), (e) => e.kode === 'kuota');
  assert.equal(n, 1);
});

test('PDF scan dikirim sebagai inline_data', async () => {
  process.env.GEMINI_MODEL = 'a';
  let body;
  await tanyaGemini({ prompt: 'p', pdfBase64: 'QUJD', fetchFn: async (_u, o) => { body = JSON.parse(o.body); return jawab({ nama: 'Y' }); } });
  assert.equal(body.contents[0].parts[1].inline_data.mime_type, 'application/pdf');
  assert.equal(body.generationConfig.temperature, 0);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
});

test('util', () => {
  assert.equal(samaAman('rahasia', 'rahasia'), true);
  assert.equal(samaAman('rahasiaX', 'rahasia'), false);
  assert.equal(samaAman('', ''), false);
  assert.equal(ambilIp(new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })), '1.2.3.4');
  assert.match(buatKode(), /^RW-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.match(waktuWib().jam, /^\d{4}-\d{2}-\d{2}T\d{2}$/);
  assert.match(buatPrompt({ dariTeks: true }), /--- Halaman N ---/);
});

test('semua model hilang: model dicari otomatis lewat models.list', async () => {
  process.env.GEMINI_MODEL = 'lama-1,lama-2';
  const dipanggil = [];
  const fetchFn = async (url) => {
    dipanggil.push(url.replace(/^.*\/models/, ''));
    if (url.includes('/models?')) {
      return resp(200, { models: [
        { name: 'models/gemini-9.0-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-9.0-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-9.0-flash-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-9', supportedGenerationMethods: ['embedContent'] },
      ] });
    }
    if (url.includes('lama-')) return resp(404, { error: { message: 'not found' } });
    return jawab({ nama: 'Z' });
  };
  const r = await tanyaGemini({ prompt: 'p', teks: 't', fetchFn });
  assert.equal(r.model, 'gemini-9.0-flash-lite');
  assert.ok(dipanggil.some((u) => u.startsWith('?')));
});

test('API key salah dilaporkan sebagai kunci', async () => {
  process.env.GEMINI_MODEL = 'a,b';
  await assert.rejects(
    tanyaGemini({ prompt: 'p', teks: 't', fetchFn: async () => resp(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }) }),
    (e) => e.kode === 'kunci',
  );
});
