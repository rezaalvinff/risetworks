// Aturan format: bentuk baku, preset umum, perapian hasil AI, dan validasi publik.
// Dipakai di browser (public/js) dan di server (lib/rules.js mengimpor file ini).

export const PRESET_UMUM = Object.freeze({
  id: 'umum',
  versi: 1,
  nama: 'Pedoman umum',
  kampus: '',
  singkatan: '',
  fakultas: '',
  jenis: 'skripsi',
  kertas: 'A4',
  margin: { atas: 4, bawah: 3, kiri: 4, kanan: 3 },
  font: 'Times New Roman',
  ukuran: 12,
  spasi: 1.5,
  rataKananKiri: true,
  indentBarisPertama: 1.27,
  jarakParagraf: 0,
  judulBab: { ukuran: null, kapital: true, tengah: true, tebal: true, halamanBaru: true },
  nomorHalaman: true,
  catatan: [],
});

const KERTAS = { a4: 'A4', letter: 'Letter', kuarto: 'Letter', quarto: 'Letter', f4: 'F4', folio: 'F4' };

function angka(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).toLowerCase().replace(',', '.');
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (/mm\b/.test(s)) n = n / 10;
  else if (/(inci|inch|\bin\b|")/.test(s)) n = n * 2.54;
  return Number.isFinite(n) ? n : null;
}

function cm(v) {
  let n = angka(v);
  if (n === null) return null;
  if (n > 10) n = n / 10; // kemungkinan besar ditulis dalam mm
  return Math.round(n * 100) / 100;
}

function bool(v) {
  if (v === true || v === false) return v;
  if (v === null || v === undefined) return null;
  const s = String(v).toLowerCase().trim();
  if (['ya', 'yes', 'true', '1', 'benar'].includes(s)) return true;
  if (['tidak', 'no', 'false', '0', 'salah'].includes(s)) return false;
  return null;
}

function teks(v, maks = 200) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim().slice(0, maks);
}

function namaFont(v) {
  const s = teks(v, 60);
  if (!s) return null;
  const k = s.toLowerCase();
  if (k.includes('times')) return 'Times New Roman';
  if (k.includes('arial')) return 'Arial';
  if (k.includes('calibri')) return 'Calibri';
  if (k.includes('cambria')) return 'Cambria';
  if (k.includes('book antiqua')) return 'Book Antiqua';
  if (k.includes('garamond')) return 'Garamond';
  if (k.includes('georgia')) return 'Georgia';
  return s;
}

/** Ubah keluaran AI (atau input lain) menjadi aturan berbentuk baku. */
export function rapikanAturan(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const m = r.margin && typeof r.margin === 'object' ? r.margin : {};
  const jb = r.judulBab && typeof r.judulBab === 'object' ? r.judulBab : {};
  const kertasRaw = teks(r.kertas, 20).toLowerCase().replace(/[^a-z0-9]/g, '');
  let spasi = angka(r.spasi);
  if (spasi !== null) spasi = Math.round(spasi * 100) / 100;
  const ukuran = angka(r.ukuran);
  const catatan = Array.isArray(r.catatan)
    ? r.catatan.map((c) => teks(c, 300)).filter(Boolean).slice(0, 15)
    : teks(r.catatan, 300) ? [teks(r.catatan, 300)] : [];
  return {
    versi: 1,
    nama: teks(r.nama, 160),
    kampus: teks(r.kampus, 120),
    singkatan: teks(r.singkatan, 30).toUpperCase(),
    fakultas: teks(r.fakultas, 120),
    jenis: teks(r.jenis, 30).toLowerCase() || 'skripsi',
    kertas: KERTAS[kertasRaw] || null,
    margin: { atas: cm(m.atas), bawah: cm(m.bawah), kiri: cm(m.kiri), kanan: cm(m.kanan) },
    font: namaFont(r.font),
    ukuran: ukuran === null ? null : Math.round(ukuran * 2) / 2,
    spasi,
    rataKananKiri: bool(r.rataKananKiri),
    indentBarisPertama: cm(r.indentBarisPertama),
    jarakParagraf: angka(r.jarakParagraf),
    judulBab: {
      ukuran: angka(jb.ukuran),
      kapital: bool(jb.kapital),
      tengah: bool(jb.tengah),
      tebal: bool(jb.tebal),
      halamanBaru: bool(jb.halamanBaru),
    },
    nomorHalaman: bool(r.nomorHalaman),
    catatan,
  };
}

/**
 * Validasi otomatis sebelum preset dipublikasikan (pengganti approval manual).
 * @returns {{lolos: boolean, alasan: string[]}}
 */
export function validasiPublik(a) {
  const alasan = [];
  const sisi = ['atas', 'bawah', 'kiri', 'kanan'];
  for (const s of sisi) {
    const v = a.margin?.[s];
    if (v !== null && v !== undefined && (v < 1 || v > 6)) alasan.push(`margin ${s} ${v} cm di luar 1-6 cm`);
  }
  if (a.ukuran !== null && a.ukuran !== undefined && (a.ukuran < 9 || a.ukuran > 16)) alasan.push(`ukuran huruf ${a.ukuran} pt di luar 9-16 pt`);
  if (a.spasi !== null && a.spasi !== undefined && (a.spasi < 1 || a.spasi > 3)) alasan.push(`spasi ${a.spasi} di luar 1-3`);
  const terisi = [...sisi.map((s) => a.margin?.[s]), a.font, a.ukuran, a.spasi].filter((v) => v !== null && v !== undefined && v !== '').length;
  if (terisi < 5) alasan.push(`baru ${terisi} dari 7 kolom utama terisi (minimal 5)`);
  if (!a.nama) alasan.push('nama pedoman kosong');
  return { lolos: alasan.length === 0, alasan };
}

/** Ringkasan satu baris untuk ditampilkan ke pengguna. */
export function ringkasAturan(a) {
  const bagian = [];
  if (a.font) bagian.push(a.font + (a.ukuran ? ` ${fmt(a.ukuran)} pt` : ''));
  else if (a.ukuran) bagian.push(`huruf ${fmt(a.ukuran)} pt`);
  if (a.spasi) bagian.push(`spasi ${fmt(a.spasi)}`);
  const m = a.margin || {};
  if ([m.atas, m.kiri, m.bawah, m.kanan].some((v) => v)) {
    bagian.push(`margin atas ${fmt(m.atas)}, kiri ${fmt(m.kiri)}, bawah ${fmt(m.bawah)}, kanan ${fmt(m.kanan)} cm`);
  }
  if (a.kertas) bagian.push(`kertas ${a.kertas}`);
  return bagian.join(' · ');
}

export function fmt(n) {
  if (n === null || n === undefined) return '-';
  return String(Math.round(n * 100) / 100).replace('.', ',');
}
