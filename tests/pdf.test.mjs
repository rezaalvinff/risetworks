import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { periksaPdf, namaFontPdf } from '../public/js/checker-pdf.js';
import { PRESET_UMUM } from '../public/js/rules.js';

// PDF.js versi legacy yang sama dengan yang dipakai browser
const pdfjs = await import('../public/vendor/pdf.min.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../public/vendor/pdf.worker.min.mjs', import.meta.url).href;
const cek = (f) => periksaPdf(readFileSync(new URL(`../contoh/${f}`, import.meta.url)).buffer, PRESET_UMUM, { pdfjs });

test('nama font PDF dirapikan', () => {
  assert.equal(namaFontPdf('ABCDEF+TimesNewRomanPSMT'), 'Times New Roman');
  assert.equal(namaFontPdf('TimesNewRomanPS-BoldMT'), 'Times New Roman');
  assert.equal(namaFontPdf('BAAAAA+LiberationSerif-Bold'), 'Times New Roman');
  assert.equal(namaFontPdf('Calibri,Bold'), 'Calibri');
  assert.equal(namaFontPdf('EAAAAA+Carlito'), 'Calibri');
});

test('PDF skripsi rapi: skor 100 dan ukuran terbaca', async () => {
  const r = await cek('3-skripsi-rapi.pdf');
  assert.deepEqual(r.temuan.map((t) => t.id), []);
  assert.equal(r.skor, 100);
  assert.equal(r.ukur.kertas, 'A4');
  assert.equal(r.ukur.font, 'Times New Roman');
  assert.equal(r.ukur.ukuran, 12);
  assert.ok(Math.abs(r.ukur.spasi - 1.5) < 0.05);
  assert.ok(Math.abs(r.ukur.margin.kiri - 4) < 0.1);
  assert.ok(Math.abs(r.ukur.margin.kanan - 3) < 0.1);
  assert.ok(Math.abs(r.ukur.margin.atas - 4) < 0.3);
  assert.equal(r.ukur.nomorHalaman, true);
});

test('PDF skripsi hampir rapi: margin kiri, spasi, bab baru terdeteksi', async () => {
  const r = await cek('2-skripsi-hampir-rapi.pdf');
  assert.deepEqual(r.temuan.map((t) => t.id).sort(), ['bab-halaman-baru', 'margin-kiri', 'spasi']);
  assert.ok(r.temuan.find((t) => t.id === 'spasi').halaman.length > 0);
});

test('PDF skripsi banyak salah: kesalahan utama terdeteksi', async () => {
  const r = await cek('1-skripsi-banyak-salah.pdf');
  const id = r.temuan.map((t) => t.id);
  for (const x of ['kertas', 'margin-kiri', 'font', 'ukuran', 'spasi', 'nomor-halaman', 'rata', 'indent', 'judul-kapital', 'judul-tengah', 'bab-halaman-baru']) {
    assert.ok(id.includes(x), `${x} terdeteksi`);
  }
  assert.ok(r.skor < 30);
});
