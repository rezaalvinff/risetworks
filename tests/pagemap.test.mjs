import { test } from 'node:test';
import assert from 'node:assert/strict';
import { petakanHalaman, gabungDenganPenanda } from '../public/js/pagemap.js';

test('paragraf dicocokkan ke halaman PDF walau spasi/baris berbeda', () => {
  const halaman = [
    'JUDUL SKRIPSI\nNama Mahasiswa',
    'BAB I\nPENDAHULUAN\n1.1 Latar Belakang\nPenelitian ini mem-\nbahas pengaruh media',
    'pembelajaran digital terhadap hasil belajar. Data dikumpulkan melalui kuesioner kepada responden.',
  ];
  const par = ['JUDUL SKRIPSI', '', 'BAB I', 'Penelitian ini membahas pengaruh media pembelajaran digital terhadap hasil belajar.', 'Data dikumpulkan melalui kuesioner kepada responden.'];
  const r = petakanHalaman(halaman, par);
  assert.equal(r[0], 1);
  assert.equal(r[1], 1);
  assert.equal(r[2], 2);
  assert.equal(r[4], 3);
});

test('gabungDenganPenanda memberi penanda halaman dan memotong sesuai batas', () => {
  const { teks, terpotong } = gabungDenganPenanda(['satu', 'dua']);
  assert.match(teks, /--- Halaman 1 ---\nsatu/);
  assert.match(teks, /--- Halaman 2 ---\ndua/);
  assert.equal(terpotong, false);
  const besar = gabungDenganPenanda(['a'.repeat(100), 'b'.repeat(100)], 150);
  assert.equal(besar.terpotong, true);
  assert.doesNotMatch(besar.teks, /Halaman 2/);
});
