// Mesin cek format untuk skripsi berbentuk PDF. Berjalan di browser dengan PDF.js.
// Mengukur tata letak dari posisi teks: kertas, margin, huruf, ukuran, spasi, rata kanan-kiri,
// indent, judul bab, dan nomor halaman.

import { fmt } from './rules.js';
import { GalatPengguna, nilaiSkor } from './checker.js';

const PT_CM = 2.54 / 72;
const RE_BAB = /^\s*BAB\s+([IVXLC]+|\d+)\b/i;
const RE_KHUSUS = /^\s*(KATA PENGANTAR|PRAKATA|DAFTAR ISI|DAFTAR TABEL|DAFTAR GAMBAR|DAFTAR LAMPIRAN|DAFTAR PUSTAKA|DAFTAR REFERENSI|REFERENSI|ABSTRAK|ABSTRACT|LAMPIRAN)\s*$/i;
const RE_PUSTAKA = /^\s*(DAFTAR PUSTAKA|DAFTAR REFERENSI|REFERENSI|REFERENCES|BIBLIOGRAFI)\s*$/i;
const RE_MULAI_ARTIKEL = /^\s*((\d+|[IVX]+|[A-Z])[.)]?\s*)?(PENDAHULUAN|LATAR BELAKANG|INTRODUCTION)\s*$/i;
const RE_NOMOR = /^[\s\-–—]*([0-9]{1,4}|[ivxlcdm]{1,7})[\s\-–—]*$/i;
const RE_CAPTION = /^\s*(Tabel|Gambar|Grafik|Bagan|Diagram)\s+\d/i;

/** Nama font PDF → nama keluarga yang mudah dibaca. Font pengganti yang ukurannya identik disamakan. */
export function namaFontPdf(raw) {
  let s = String(raw || '').replace(/^[A-Z]{6}\+/, '');
  s = s.split(/[-,]/)[0].replace(/(PSMT|PS|MT)$/,'').replace(/_/g, ' ');
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  const k = s.toLowerCase().replace(/\s/g, '');
  if (k.startsWith('timesnewroman') || k === 'times' || k.startsWith('liberationserif') || k.startsWith('tinos')) return 'Times New Roman';
  if (k.startsWith('arial') || k.startsWith('liberationsans') || k.startsWith('arimo') || k === 'helvetica') return 'Arial';
  if (k.startsWith('calibri') || k.startsWith('carlito')) return 'Calibri';
  if (k.startsWith('cambria') || k.startsWith('caladea')) return 'Cambria';
  return s || 'tidak diketahui';
}

const tebalDari = (raw) => /bold|black|heavy|semibold|demi/i.test(String(raw || ''));

function faktorBaris(font) {
  if (font === 'Calibri') return 1.22;
  if (font === 'Cambria') return 1.172;
  return 1.15;
}

function modus(nilai, bulat = 0.5) {
  const m = new Map();
  for (const v of nilai) {
    const k = Math.round(v / bulat) * bulat;
    m.set(k, (m.get(k) || 0) + 1);
  }
  let terbaik = null;
  let n = -1;
  for (const [k, c] of m) if (c > n) { terbaik = k; n = c; }
  return { nilai: terbaik, jumlah: n, total: nilai.length };
}

function persentil(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

const potong = (s, n = 70) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const samaFont = (a, b) => String(a).toLowerCase().replace(/\s/g, '') === String(b).toLowerCase().replace(/\s/g, '');

/** Baca semua halaman PDF menjadi baris-baris teks dengan posisi, ukuran, dan font. */
export async function bacaBarisPdf(buffer, pdfjs, onProgres) {
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)), isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
  } catch (e) {
    throw new GalatPengguna(e && e.name === 'PasswordException'
      ? 'PDF ini dikunci password. Simpan ulang tanpa password lalu coba lagi.'
      : 'PDF tidak bisa dibuka. Pastikan file PDF tidak rusak.');
  }
  const halaman = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const namaFont = new Map();
    try {
      await page.getOperatorList();
    } catch { /* tanpa nama font asli */ }
    const fontDari = (id) => {
      if (!namaFont.has(id)) {
        let raw = '';
        try { raw = page.commonObjs.has(id) ? page.commonObjs.get(id)?.name || '' : ''; } catch { raw = ''; }
        if (!raw) raw = tc.styles?.[id]?.fontFamily || '';
        namaFont.set(id, raw);
      }
      return namaFont.get(id);
    };
    const item = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const [a, b, c, d, x, y] = it.transform;
      const size = Math.hypot(c, d) || Math.hypot(a, b);
      if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01) continue; // teks miring/berputar dilewati
      const raw = fontDari(it.fontName);
      item.push({ x, y, x1: x + it.width, size, str: it.str, font: namaFontPdf(raw), tebal: tebalDari(raw) });
    }
    item.sort((p, q) => q.y - p.y || p.x - q.x);
    const baris = [];
    for (const it of item) {
      const b = baris.find((l) => Math.abs(l.y - it.y) < Math.max(1.5, it.size * 0.25));
      if (b) b.item.push(it);
      else baris.push({ y: it.y, item: [it] });
    }
    for (const b of baris) {
      b.item.sort((p, q) => p.x - q.x);
      let teks = '';
      let akhir = null;
      const chars = new Map();
      const ukuran = new Map();
      let tebal = 0;
      let total = 0;
      for (const it of b.item) {
        if (akhir !== null && it.x - akhir > it.size * 0.15 && !teks.endsWith(' ')) teks += ' ';
        teks += it.str;
        akhir = it.x1;
        const n = it.str.replace(/\s/g, '').length;
        total += n;
        chars.set(it.font, (chars.get(it.font) || 0) + n);
        const u = Math.round(it.size * 2) / 2;
        ukuran.set(u, (ukuran.get(u) || 0) + n);
        if (it.tebal) tebal += n;
      }
      b.teks = teks.replace(/\s+/g, ' ').trim();
      b.x0 = b.item[0].x;
      b.x1 = Math.max(...b.item.map((i) => i.x1));
      b.chars = total;
      b.fonts = chars;
      b.font = [...chars.entries()].sort((p, q) => q[1] - p[1])[0][0];
      b.size = [...ukuran.entries()].sort((p, q) => q[1] - p[1])[0][0];
      b.tebal = total > 0 && tebal / total >= 0.6;
      b.halaman = n;
      delete b.item;
    }
    halaman.push({ n, w: vp.width, h: vp.height, baris });
    page.cleanup();
    if (onProgres) onProgres(n, pdf.numPages);
  }
  await pdf.destroy();
  return halaman;
}

/**
 * @param {ArrayBuffer} buffer PDF skripsi
 * @param {object} aturan aturan baku
 * @param {{pdfjs: any, onProgres?: Function}} deps
 */
export async function periksaPdf(buffer, aturan, deps) {
  const halaman = await bacaBarisPdf(buffer, deps.pdfjs, deps.onProgres);
  const semua = halaman.flatMap((h) => h.baris);
  const jumlahHuruf = semua.reduce((n, b) => n + b.chars, 0);
  if (jumlahHuruf < 300) {
    throw new GalatPengguna('Teks di PDF ini tidak terbaca (kemungkinan hasil scan atau gambar). Upload file .docx-nya, atau PDF yang dibuat langsung dari Word (File → Save As → PDF).');
  }

  // nomor halaman: baris pendek berisi angka yang paling atas/bawah di halamannya
  let halBernomor = 0;
  for (const h of halaman) {
    if (!h.baris.length) continue;
    const atas = h.baris[0];
    const bawah = h.baris[h.baris.length - 1];
    for (const b of new Set([atas, bawah])) {
      if (RE_NOMOR.test(b.teks) && b.chars <= 8) { b.nomor = true; if (!h.adaNomor) { h.adaNomor = true; halBernomor++; } }
    }
  }

  // urutan global & area isi
  const urut = semua.filter((b) => !b.nomor);
  urut.forEach((b, i) => { b.i = i; });
  const bersihToc = (b) => !/\.{4,}|…{2,}/.test(b.teks);
  const halToc = new Set(urut.filter((b) => /^\s*DAFTAR ISI\s*$/i.test(b.teks)).map((b) => b.halaman));
  for (const b of urut) {
    const sisa = b.teks.replace(RE_BAB, '').trim();
    b.bab = RE_BAB.test(b.teks) && b.teks.length <= 80 && bersihToc(b) && !halToc.has(b.halaman) && !(sisa && /\s\d+\s*$/.test(' ' + sisa));
    b.khusus = RE_KHUSUS.test(b.teks) && bersihToc(b);
    b.caption = RE_CAPTION.test(b.teks) && b.teks.length < 160;
  }
  for (let k = 0; k < urut.length; k++) {
    const b = urut[k];
    if (b.bab && !b.teks.replace(RE_BAB, '').trim()) {
      const q = urut[k + 1];
      if (q && q.halaman === b.halaman && q.teks.length <= 90 && !q.bab) q.judulBab2 = true;
    }
  }
  const babList = urut.filter((b) => b.bab);
  const modeSkripsi = babList.length > 0;
  const mulaiB = modeSkripsi ? babList[0] : urut.find((b) => RE_MULAI_ARTIKEL.test(b.teks));
  const mulai = mulaiB ? mulaiB.i : 0;
  const pustakaB = urut.find((b) => b.i > mulai && RE_PUSTAKA.test(b.teks));
  const akhir = pustakaB ? pustakaB.i : Infinity;
  const isi = urut.filter((b) => b.i >= mulai && b.i < akhir);

  // ukuran huruf isi dominan
  const ukuranChars = new Map();
  for (const b of isi) ukuranChars.set(b.size, (ukuranChars.get(b.size) || 0) + b.chars);
  const ukuranIsi = [...ukuranChars.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] || 12;
  const tubuh = isi.filter((b) => Math.abs(b.size - ukuranIsi) <= 0.6 && !b.bab && !b.judulBab2 && !b.khusus && !b.caption);
  const panjangAwal = tubuh.filter((b) => b.chars >= 25);

  const hal = new Map(halaman.map((h) => [h.n, h]));
  const lebarHal = modus(halaman.map((h) => h.w), 1).nilai;
  const tinggiHal = modus(halaman.map((h) => h.h), 1).nilai;

  // tepi kiri & kanan blok teks
  const L = modus(panjangAwal.map((b) => b.x0), 1).nilai ?? 72;
  const ujung = panjangAwal.map((b) => b.x1);
  const mUjung = modus(ujung, 1);
  const R = mUjung.jumlah / Math.max(1, mUjung.total) >= 0.3 ? mUjung.nilai : persentil(ujung, 0.95) ?? lebarHal - 72;
  const W = R - L;
  const panjang = tubuh.filter((b) => b.x1 - b.x0 >= 0.6 * W);

  // jarak antarbaris
  const pasangan = [];
  for (let k = 1; k < tubuh.length; k++) {
    const p = tubuh[k - 1];
    const q = tubuh[k];
    if (p.halaman !== q.halaman || q.i !== p.i + 1) continue;
    const dy = p.y - q.y;
    if (dy < p.size * 0.9 || dy > p.size * 3.6) continue;
    pasangan.push({ p, q, dy });
  }
  const pitch = modus(pasangan.filter((x) => x.p.x1 - x.p.x0 >= 0.6 * W).map((x) => x.dy), 0.5).nilai || ukuranIsi * 1.15;
  const fontIsi = (() => {
    const m = new Map();
    for (const b of tubuh) for (const [f, n] of b.fonts) m.set(f, (m.get(f) || 0) + n);
    return [...m.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] || '';
  })();
  const spasiIsi = Math.round((pitch / (ukuranIsi * faktorBaris(fontIsi))) * 100) / 100;

  // paragraf: awal & akhir baris
  for (let k = 0; k < tubuh.length; k++) {
    const b = tubuh[k];
    const prev = tubuh[k - 1];
    const next = tubuh[k + 1];
    const dekat = (atas, bawah) => {
      const dy = atas.y - bawah.y;
      return dy >= atas.size * 0.9 && dy <= Math.max(pitch * 1.25, atas.size * 2.6);
    };
    const sambungPrev = prev && prev.halaman === b.halaman && prev.i === b.i - 1 && dekat(prev, b);
    const sambungNext = next && next.halaman === b.halaman && next.i === b.i + 1 && dekat(b, next);
    b.awalParagraf = !sambungPrev || (prev && prev.x1 < R - 25) || b.x0 > L + 8;
    b.akhirParagraf = !sambungNext || b.x1 < R - 25 || (next && next.x0 > L + 8);
  }
  const awalPar = tubuh.filter((b) => b.awalParagraf && b.chars >= 25 && !/^\s*(\d+[.)]|[a-z][.)]|[•\-–])\s/.test(b.teks));
  const indentList = awalPar.map((b) => (b.x0 - L) * PT_CM).filter((v) => v > 0.3 && v < 3);
  const indentIsi = indentList.length >= awalPar.length * 0.3 ? modus(indentList, 0.05).nilai : 0;

  const temuan = [];
  const halDari = (arr) => [...new Set(arr.map((b) => b.halaman))].sort((a, b) => a - b);
  const contohDari = (arr) => arr.slice(0, 5).map((b) => ({ teks: potong(b.teks), halaman: b.halaman }));
  const tambah = (t) => temuan.push({ paragraf: [], halaman: [], dari: 0, jumlah: 0, contoh: [], ...t });
  const daftar = (arr, dari) => ({ halaman: halDari(arr), jumlah: arr.length, dari, contoh: contohDari(arr) });

  // --- halaman ---
  const KERTAS = { A4: [21, 29.7], Letter: [21.59, 27.94], F4: [21.5, 33] };
  const kertasCm = [Math.min(lebarHal, tinggiHal) * PT_CM, Math.max(lebarHal, tinggiHal) * PT_CM];
  const namaKertas = Object.entries(KERTAS).find(([, [x, y]]) => Math.abs(x - kertasCm[0]) < 0.3 && Math.abs(y - kertasCm[1]) < 0.3)?.[0] || null;
  if (aturan.kertas && KERTAS[aturan.kertas] && namaKertas !== aturan.kertas) {
    const [ex, ey] = KERTAS[aturan.kertas];
    tambah({ id: 'kertas', kategori: 'Halaman', tingkat: 'berat', judul: 'Ukuran kertas belum sesuai',
      pesan: `Kertas ${namaKertas ? namaKertas + ' ' : ''}(${fmt(kertasCm[0])} × ${fmt(kertasCm[1])} cm), seharusnya ${aturan.kertas} (${fmt(ex)} × ${fmt(ey)} cm).`,
      saran: `Di Word: Layout → Size → pilih ${aturan.kertas}, lalu simpan ulang sebagai PDF.` });
  }
  const atasList = [];
  const bawahList = [];
  for (const h of halaman) {
    const bs = h.baris.filter((b) => !b.nomor && Math.abs(b.size - ukuranIsi) <= 0.6 && b.chars >= 3);
    if (!bs.length || h.n === 1) continue;
    const t = bs[0];
    atasList.push(h.h - t.y - (t.size * 0.93 + Math.max(0, pitch - t.size * 1.15) / 2));
    const z = bs[bs.length - 1];
    if (bs.length >= 15) bawahList.push(z.y - z.size * 0.22);
  }
  const margin = {
    atas: atasList.length ? Math.round(modus(atasList.map((v) => v * PT_CM), 0.05).nilai * 100) / 100 : null,
    bawah: bawahList.length ? Math.round(Math.min(...bawahList) * PT_CM * 100) / 100 : null,
    kiri: Math.round(L * PT_CM * 100) / 100,
    kanan: Math.round((lebarHal - R) * PT_CM * 100) / 100,
  };
  const pitchCm = pitch * PT_CM;
  const SISI = { atas: 'Top', bawah: 'Bottom', kiri: 'Left', kanan: 'Right' };
  for (const sisi of ['atas', 'bawah', 'kiri', 'kanan']) {
    const harus = aturan.margin?.[sisi];
    const v = margin[sisi];
    if (!harus || v === null) continue;
    let salah;
    if (sisi === 'bawah') salah = v < harus - 0.4 || v > harus + pitchCm + 0.5;
    else if (sisi === 'atas') salah = Math.abs(v - harus) > 0.45;
    else if (sisi === 'kanan' && mUjung.jumlah / Math.max(1, mUjung.total) < 0.3) salah = v < harus - 0.3 || v > harus + 1;
    else salah = Math.abs(v - harus) > 0.3;
    if (salah) {
      tambah({ id: `margin-${sisi}`, kategori: 'Halaman', tingkat: 'berat', judul: `Margin ${sisi} belum sesuai`,
        pesan: `Margin ${sisi} sekitar ${fmt(v)} cm, seharusnya ${fmt(harus)} cm.`,
        saran: `Di Word: Layout → Margins → Custom Margins → isi ${SISI[sisi]} ${fmt(harus)} cm, lalu simpan ulang sebagai PDF.` });
    }
  }
  const nomorAda = halBernomor >= Math.max(1, (halaman.length - 1) * 0.5);
  if (aturan.nomorHalaman && !nomorAda) {
    tambah({ id: 'nomor-halaman', kategori: 'Halaman', tingkat: 'sedang', judul: 'Nomor halaman belum ada',
      pesan: `Hanya ${halBernomor} dari ${halaman.length} halaman yang bernomor.`,
      saran: 'Di Word: Insert → Page Number → pilih posisi sesuai pedoman.' });
  }

  // --- huruf ---
  const hurufDicek = isi.filter((b) => b.chars >= 15);
  if (aturan.font) {
    const lain = new Map();
    const salah = hurufDicek.filter((b) => {
      let beda = 0;
      for (const [f, n] of b.fonts) if (!samaFont(f, aturan.font)) { beda += n; lain.set(f, (lain.get(f) || 0) + n); }
      return beda / Math.max(1, b.chars) > 0.15;
    });
    if (salah.length) {
      const contohFont = [...lain.entries()].sort((p, q) => q[1] - p[1]).slice(0, 2).map(([f]) => f).join(', ');
      tambah({ id: 'font', kategori: 'Huruf', tingkat: 'berat', judul: 'Jenis huruf belum seragam',
        pesan: `${salah.length} baris memakai huruf ${contohFont}, seharusnya ${aturan.font}.`,
        saran: `Di Word: Ctrl+A lalu pilih huruf ${aturan.font}, kemudian simpan ulang sebagai PDF.`, ...daftar(salah, hurufDicek.length) });
    }
  }
  if (aturan.ukuran) {
    const dicek = isi.filter((b) => b.x1 - b.x0 >= 0.6 * W && !b.bab && !b.judulBab2 && !b.khusus && !b.caption);
    const salah = dicek.filter((b) => Math.abs(b.size - aturan.ukuran) > 0.3);
    if (salah.length) {
      const u = modus(salah.map((b) => b.size), 0.5).nilai;
      tambah({ id: 'ukuran', kategori: 'Huruf', tingkat: 'berat', judul: 'Ukuran huruf isi belum sesuai',
        pesan: `${salah.length} baris berukuran ${fmt(u)} pt, seharusnya ${fmt(aturan.ukuran)} pt.`,
        saran: `Di Word: blok teks isi, ubah ukuran menjadi ${fmt(aturan.ukuran)}, lalu simpan ulang sebagai PDF.`, ...daftar(salah, dicek.length) });
    }
  }

  // --- paragraf ---
  if (aturan.spasi) {
    const dicek = pasangan.filter((x) => x.p.x1 - x.p.x0 >= 0.6 * W && !x.p.akhirParagraf);
    const nilai = new Map();
    const salah = dicek.filter((x) => {
      const mult = x.dy / (x.p.size * faktorBaris(x.p.font));
      const b = Math.abs(mult - aturan.spasi) > 0.15;
      if (b) { const r = Math.round(mult * 20) / 20; nilai.set(r, (nilai.get(r) || 0) + 1); }
      return b;
    }).map((x) => x.p);
    if (salah.length) {
      const v = [...nilai.entries()].sort((p, q) => q[1] - p[1])[0][0];
      tambah({ id: 'spasi', kategori: 'Paragraf', tingkat: 'berat', judul: 'Spasi baris belum sesuai',
        pesan: `${salah.length} baris berspasi sekitar ${fmt(v)}, seharusnya ${fmt(aturan.spasi)}.`,
        saran: `Di Word: blok paragraf isi → Paragraph → Line spacing ${fmt(aturan.spasi)}, lalu simpan ulang sebagai PDF.`, ...daftar(salah, dicek.length) });
    }
  }
  let rataPersen = null;
  {
    const dicek = panjang.filter((b) => !b.akhirParagraf);
    const tidak = dicek.filter((b) => b.x1 < R - 4);
    rataPersen = dicek.length ? Math.round((1 - tidak.length / dicek.length) * 100) : null;
    if (aturan.rataKananKiri && dicek.length >= 5 && tidak.length / dicek.length > 0.3) {
      tambah({ id: 'rata', kategori: 'Paragraf', tingkat: 'sedang', judul: 'Paragraf belum rata kanan-kiri',
        pesan: `${tidak.length} dari ${dicek.length} baris isi tidak rata di sisi kanan.`,
        saran: 'Di Word: blok paragraf isi → Ctrl+J (Justify), lalu simpan ulang sebagai PDF.', ...daftar(tidak, dicek.length) });
    }
  }
  if (aturan.indentBarisPertama !== null && aturan.indentBarisPertama !== undefined && awalPar.length >= 3) {
    const target = aturan.indentBarisPertama;
    const salah = awalPar.filter((b) => {
      const v = (b.x0 - L) * PT_CM;
      return target > 0 ? Math.abs(v - target) > 0.35 : v > 0.3;
    });
    if (salah.length / awalPar.length > 0.2) {
      tambah({ id: 'indent', kategori: 'Paragraf', tingkat: 'sedang',
        judul: target > 0 ? 'Baris pertama paragraf belum menjorok' : 'Baris pertama paragraf tidak boleh menjorok',
        pesan: target > 0 ? `${salah.length} paragraf tidak menjorok ${fmt(target)} cm di baris pertama.` : `${salah.length} paragraf menjorok di baris pertama.`,
        saran: `Di Word: blok paragraf isi → Paragraph → Special: First line, By: ${fmt(target)} cm.`, ...daftar(salah, awalPar.length) });
    }
  }

  // --- judul bab ---
  const judulBab = urut.filter((b) => (b.bab || b.judulBab2 || b.khusus) && (!halToc.has(b.halaman) || /^\s*DAFTAR ISI\s*$/i.test(b.teks)));
  const jb = aturan.judulBab || {};
  const tengahHal = (L + R) / 2;
  if (judulBab.length) {
    const cek = (id, judul, pesanFn, saran, uji) => {
      const salah = judulBab.filter(uji);
      if (salah.length) tambah({ id, kategori: 'Judul', tingkat: 'sedang', judul, pesan: pesanFn(salah), saran, ...daftar(salah, judulBab.length) });
    };
    if (jb.kapital) cek('judul-kapital', 'Judul bab belum huruf kapital', (s) => `${s.length} judul bab belum kapital semua, misalnya "${potong(s[0].teks, 40)}".`, 'Di Word: blok judul → Shift+F3 sampai HURUF BESAR.', (b) => /\p{Ll}/u.test(b.teks));
    if (jb.tengah) cek('judul-tengah', 'Judul bab belum di tengah', (s) => `${s.length} judul bab belum rata tengah.`, 'Di Word: klik judul → Ctrl+E.', (b) => Math.abs((b.x0 + b.x1) / 2 - tengahHal) > 14);
    if (jb.tebal) cek('judul-tebal', 'Judul bab belum dicetak tebal', (s) => `${s.length} judul bab belum tebal.`, 'Di Word: blok judul → Ctrl+B.', (b) => !b.tebal);
    if (jb.ukuran) cek('judul-ukuran', 'Ukuran huruf judul bab belum sesuai', (s) => `${s.length} judul bab berukuran ${fmt(s[0].size)} pt, seharusnya ${fmt(jb.ukuran)} pt.`, `Di Word: ubah ukuran judul menjadi ${fmt(jb.ukuran)} pt.`, (b) => Math.abs(b.size - jb.ukuran) > 0.3);
  }
  if (jb.halamanBaru && babList.length) {
    const salah = babList.filter((b) => {
      const h = hal.get(b.halaman);
      const pertama = h.baris.find((x) => !x.nomor);
      return pertama !== b;
    });
    if (salah.length) tambah({ id: 'bab-halaman-baru', kategori: 'Judul', tingkat: 'sedang', judul: 'Bab baru belum dimulai di halaman baru',
      pesan: `${salah.length} bab tidak dimulai di awal halaman, misalnya "${potong(salah[0].teks, 40)}".`,
      saran: 'Di Word: klik di depan tulisan BAB → tekan Ctrl+Enter.', ...daftar(salah, babList.length) });
  }

  const skor = nilaiSkor(temuan);
  return {
    jenis: 'pdf',
    skor,
    temuan,
    mode: modeSkripsi ? 'skripsi' : 'artikel',
    statistik: { halaman: halaman.length, estimasiHalaman: halaman.length, jumlahBab: babList.length },
    ukur: {
      kertas: namaKertas || `${fmt(kertasCm[0])} × ${fmt(kertasCm[1])} cm`,
      margin,
      font: fontIsi,
      ukuran: ukuranIsi,
      spasi: spasiIsi,
      rataPersen,
      indent: indentIsi,
      nomorHalaman: nomorAda,
      judulBab: judulBab.length,
    },
  };
}
