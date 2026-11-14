import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rapikanAturan, validasiPublik, ringkasAturan, PRESET_UMUM } from '../public/js/rules.js';

test('rapikanAturan mengubah satuan dan teks menjadi angka', () => {
  const a = rapikanAturan({
    nama: '  Pedoman Skripsi  Unpad ', singkatan: 'unpad', kertas: 'a4',
    margin: { atas: '4 cm', bawah: '30 mm', kiri: '4,0', kanan: 3 },
    font: 'times new roman', ukuran: '12pt', spasi: '1,5', rataKananKiri: 'ya',
    indentBarisPertama: '1.25 cm', judulBab: { kapital: true, tengah: 'ya', ukuran: '14' }, catatan: 'Nomor halaman kanan atas',
  });
  assert.equal(a.nama, 'Pedoman Skripsi Unpad');
  assert.equal(a.singkatan, 'UNPAD');
  assert.equal(a.kertas, 'A4');
  assert.deepEqual(a.margin, { atas: 4, bawah: 3, kiri: 4, kanan: 3 });
  assert.equal(a.font, 'Times New Roman');
  assert.equal(a.ukuran, 12);
  assert.equal(a.spasi, 1.5);
  assert.equal(a.rataKananKiri, true);
  assert.equal(a.indentBarisPertama, 1.25);
  assert.equal(a.judulBab.tengah, true);
  assert.equal(a.judulBab.ukuran, 14);
  assert.equal(a.jarakParagraf, null);
  assert.deepEqual(a.catatan, ['Nomor halaman kanan atas']);
});

test('rapikanAturan tahan input kosong atau aneh', () => {
  for (const x of [null, undefined, 'teks', 42, [], { margin: 'x', judulBab: 5 }]) {
    const a = rapikanAturan(x);
    assert.equal(a.font, null);
    assert.equal(a.margin.atas, null);
  }
});

test('validasiPublik', () => {
  assert.equal(validasiPublik(PRESET_UMUM).lolos, true);
  assert.equal(validasiPublik({ ...PRESET_UMUM, margin: { ...PRESET_UMUM.margin, kiri: 8 } }).lolos, false);
  assert.equal(validasiPublik({ ...PRESET_UMUM, ukuran: 20 }).lolos, false);
  assert.equal(validasiPublik({ ...PRESET_UMUM, spasi: 0.5 }).lolos, false);
  assert.equal(validasiPublik({ ...PRESET_UMUM, nama: '' }).lolos, false);
  const sedikit = rapikanAturan({ nama: 'X', font: 'Arial', ukuran: 12, spasi: 1.5 });
  assert.equal(validasiPublik(sedikit).lolos, false);
  const cukup = rapikanAturan({ nama: 'X', font: 'Arial', ukuran: 12, spasi: 2, margin: { atas: 3, kiri: 3 } });
  assert.equal(validasiPublik(cukup).lolos, true);
});

test('ringkasAturan', () => {
  assert.equal(ringkasAturan(PRESET_UMUM), 'Times New Roman 12 pt · spasi 1,5 · margin atas 4, kiri 4, bawah 3, kanan 3 cm · kertas A4');
});
