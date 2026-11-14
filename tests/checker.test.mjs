import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { periksaDocx, GalatPengguna } from '../public/js/checker.js';
import { buatFileBercatatan } from '../public/js/annotate.js';
import { PRESET_UMUM } from '../public/js/rules.js';
import { dokumenBenar, dokumenSalah, KESALAHAN } from './fixture.mjs';

const deps = { JSZip, DOMParser };

test('dokumen benar mendapat skor 100 tanpa temuan', async () => {
  const r = await periksaDocx(await dokumenBenar(), PRESET_UMUM, deps);
  assert.deepEqual(r.temuan.map((t) => t.id), []);
  assert.equal(r.skor, 100);
  assert.equal(r.mode, 'skripsi');
  assert.equal(r.statistik.jumlahBab, 2);
});

test(`dokumen salah: ${KESALAHAN.length} dari ${KESALAHAN.length} kesalahan terdeteksi`, async () => {
  const r = await periksaDocx(await dokumenSalah(), PRESET_UMUM, deps);
  const id = r.temuan.map((t) => t.id).sort();
  assert.equal(KESALAHAN.length, 13);
  assert.deepEqual(id, [...KESALAHAN].sort());
  assert.ok(r.skor < 50, `skor ${r.skor} seharusnya rendah`);
  for (const t of r.temuan) {
    assert.ok(t.judul && t.pesan && t.saran, `temuan ${t.id} lengkap`);
    assert.ok(['berat', 'sedang', 'ringan'].includes(t.tingkat));
  }
});

test('temuan diurutkan dari yang paling berat', async () => {
  const r = await periksaDocx(await dokumenSalah(), PRESET_UMUM, deps);
  const urut = { berat: 0, sedang: 1, ringan: 2 };
  for (let i = 1; i < r.temuan.length; i++) assert.ok(urut[r.temuan[i - 1].tingkat] <= urut[r.temuan[i].tingkat]);
});

test('aturan null tidak dicek', async () => {
  const kosong = { ...PRESET_UMUM, kertas: null, margin: { atas: null, bawah: null, kiri: null, kanan: null }, font: null, ukuran: null, spasi: null, rataKananKiri: null, indentBarisPertama: null, jarakParagraf: null, nomorHalaman: null, judulBab: {} };
  const r = await periksaDocx(await dokumenSalah(), kosong, deps);
  const id = r.temuan.map((t) => t.id).sort();
  assert.deepEqual(id, ['enter-berulang', 'posisi-judul-tabel', 'revisi']);
});

test('dokumen bawaan Word (Calibri, spasi 1,08, after 8 pt) terdeteksi', async () => {
  const zip = await JSZip.loadAsync(await dokumenBenar());
  let s = await zip.file('word/styles.xml').async('string');
  s = s.replace('<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>', '<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/>')
    .replace('<w:spacing w:after="0" w:line="360" w:lineRule="auto"/>', '<w:spacing w:after="160" w:line="259" w:lineRule="auto"/>');
  zip.file('word/styles.xml', s);
  zip.file('word/theme/theme1.xml', '<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>');
  const r = await periksaDocx(await zip.generateAsync({ type: 'uint8array' }), PRESET_UMUM, deps);
  const id = r.temuan.map((t) => t.id);
  for (const x of ['font', 'spasi', 'jarak-paragraf']) assert.ok(id.includes(x), `${x} terdeteksi`);
  assert.match(r.temuan.find((t) => t.id === 'font').pesan, /Calibri/);
  assert.match(r.temuan.find((t) => t.id === 'spasi').pesan, /1,08/);
});

test('file bukan docx ditolak dengan pesan ramah', async () => {
  await assert.rejects(periksaDocx(new TextEncoder().encode('%PDF-1.4 bukan docx'), PRESET_UMUM, deps), (e) => e instanceof GalatPengguna && /\.docx/.test(e.message));
  await assert.rejects(periksaDocx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), PRESET_UMUM, deps), (e) => e.ramah && /\.doc/.test(e.message));
});

test('file bercatatan berisi komentar Word yang valid dan tetap bisa dicek ulang', async () => {
  const buf = await dokumenSalah();
  const lap = await periksaDocx(buf, PRESET_UMUM, deps);
  const { file, jumlahKomentar } = await buatFileBercatatan(buf, lap, { JSZip, DOMParser, XMLSerializer, tipe: 'uint8array' });
  assert.ok(jumlahKomentar > 5);
  const zip = await JSZip.loadAsync(file);
  const komentar = await zip.file('word/comments.xml').async('string');
  const doc = await zip.file('word/document.xml').async('string');
  const rels = await zip.file('word/_rels/document.xml.rels').async('string');
  const ct = await zip.file('[Content_Types].xml').async('string');
  assert.equal((komentar.match(/<w:comment /g) || []).length, jumlahKomentar);
  assert.equal((doc.match(/<w:commentReference /g) || []).length, jumlahKomentar);
  assert.equal((doc.match(/<w:commentRangeStart /g) || []).length, jumlahKomentar);
  assert.match(komentar, /CATATAN UMUM DOKUMEN/);
  assert.match(komentar, /Margin kiri/);
  assert.match(rels, /relationships\/comments/);
  assert.match(ct, /\/word\/comments\.xml/);
  assert.ok(doc.startsWith('<?xml'));
  // XML harus tetap valid dan tidak ada deklarasi namespace ganda di elemen baru
  assert.doesNotMatch(doc, /<w:commentRangeStart [^>]*xmlns:w=/);
  const ulang = await periksaDocx(file, PRESET_UMUM, deps);
  assert.ok(ulang.temuan.some((t) => t.id === 'komentar'));
  assert.equal(ulang.temuan.length, lap.temuan.length + 1);
});
