// Mesin cek format .docx. Berjalan sepenuhnya di browser (file tidak dikirim ke server).
// Juga bisa dijalankan di Node untuk tes dengan menyuntikkan JSZip dan DOMParser lewat `deps`.

import { fmt } from './rules.js';

export const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TWIP_PER_CM = 566.929;

export class GalatPengguna extends Error {
  constructor(pesan) {
    super(pesan);
    this.name = 'GalatPengguna';
    this.ramah = true;
  }
}

// ---------- helper XML ----------

export function semua(el, nama) {
  return Array.from(el.getElementsByTagNameNS(W, nama));
}

function anak(el, nama) {
  if (!el) return null;
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && c.localName === nama) return c;
  }
  return null;
}

function anakSemua(el, nama) {
  const out = [];
  if (!el) return out;
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && c.localName === nama) out.push(c);
  }
  return out;
}

function atr(el, nama) {
  if (!el) return null;
  let v = el.getAttributeNS(W, nama);
  if (v === null || v === '') v = el.getAttribute('w:' + nama);
  return v === null || v === '' ? null : v;
}

function toggle(el) {
  if (!el) return null;
  const v = atr(el, 'val');
  if (v === null) return true;
  return !['0', 'false', 'off', 'none'].includes(v.toLowerCase());
}

function leluhur(el, namaSet) {
  for (let n = el.parentNode; n && n.nodeType === 1; n = n.parentNode) {
    if (namaSet.has(n.localName)) return n.localName;
  }
  return null;
}

function parseXml(Parser, str, nama) {
  const doc = new Parser().parseFromString(str, 'application/xml');
  const err = doc.getElementsByTagName('parsererror');
  if (err && err.length) throw new GalatPengguna(`Bagian ${nama} di dalam file rusak. Coba buka di Word lalu simpan ulang sebagai .docx.`);
  return doc;
}

async function bacaTeks(zip, path) {
  const f = zip.file(path);
  return f ? f.async('string') : null;
}

export function hitungKata(s) {
  return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

function namaFontSama(a, b) {
  const n = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  const x = n(a);
  const y = n(b);
  return x === y || (x.length > 3 && y.length > 3 && (x.startsWith(y) || y.startsWith(x)));
}

function potong(s, n = 70) {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

// ---------- gaya (styles.xml + theme) ----------

function bacaGaya(stylesDoc, themeDoc) {
  const gaya = new Map();
  let pPrDefault = null;
  let rPrDefault = null;
  let defaultPara = null;
  if (stylesDoc) {
    const dd = semua(stylesDoc, 'docDefaults')[0];
    if (dd) {
      pPrDefault = anak(anak(dd, 'pPrDefault'), 'pPr');
      rPrDefault = anak(anak(dd, 'rPrDefault'), 'rPr');
    }
    for (const s of semua(stylesDoc, 'style')) {
      const id = atr(s, 'styleId');
      if (!id) continue;
      const tipe = atr(s, 'type') || 'paragraph';
      const info = {
        id,
        tipe,
        nama: (atr(anak(s, 'name'), 'val') || id).toLowerCase(),
        basedOn: atr(anak(s, 'basedOn'), 'val'),
        pPr: anak(s, 'pPr'),
        rPr: anak(s, 'rPr'),
      };
      gaya.set(id, info);
      const def = atr(s, 'default');
      if (tipe === 'paragraph' && (def === '1' || def === 'true') && !defaultPara) defaultPara = id;
    }
  }
  const tema = { minor: null, major: null };
  if (themeDoc) {
    const ambil = (nama) => {
      const el = themeDoc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', nama)[0];
      const latin = el && el.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'latin')[0];
      return latin ? latin.getAttribute('typeface') : null;
    };
    tema.minor = ambil('minorFont');
    tema.major = ambil('majorFont');
  }
  const rantai = (id) => {
    const out = [];
    const lihat = new Set();
    let cur = id;
    while (cur && gaya.has(cur) && !lihat.has(cur) && out.length < 20) {
      lihat.add(cur);
      const g = gaya.get(cur);
      out.push(g);
      cur = g.basedOn;
    }
    return out;
  };
  return { gaya, pPrDefault, rPrDefault, defaultPara, tema, rantai };
}

// ---------- pembaca paragraf ----------

const LEWATI_JALAN = new Set(['pPr', 'del', 'moveFrom', 'p', 'txbxContent', 'Fallback', 'rPr']);

function kumpulkanRun(pEl) {
  const runs = [];
  const jalan = (node) => {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType !== 1) continue;
      if (c.localName === 'r') runs.push(c);
      else if (!LEWATI_JALAN.has(c.localName)) jalan(c);
    }
  };
  jalan(pEl);
  return runs;
}

function isiRun(r) {
  let teks = '';
  let breakHalaman = false;
  let rendered = 0;
  let gambar = false;
  const instr = [];
  for (let c = r.firstChild; c; c = c.nextSibling) {
    if (c.nodeType !== 1) continue;
    switch (c.localName) {
      case 't': teks += c.textContent; break;
      case 'tab': teks += '\t'; break;
      case 'br':
        if (atr(c, 'type') === 'page') breakHalaman = true;
        else teks += '\n';
        break;
      case 'cr': teks += '\n'; break;
      case 'noBreakHyphen': teks += '-'; break;
      case 'lastRenderedPageBreak': rendered++; break;
      case 'drawing': case 'pict': case 'object': gambar = true; break;
      case 'AlternateContent': gambar = true; break;
      case 'instrText': instr.push(c.textContent); break;
      default: break;
    }
  }
  return { teks, breakHalaman, rendered, gambar, instr };
}

function buatResolver(G) {
  const rantaiP = (pPr) => {
    const id = atr(anak(pPr, 'pStyle'), 'val') || G.defaultPara;
    return G.rantai(id);
  };
  const daftarPPr = (pPr) => [pPr, ...rantaiP(pPr).map((g) => g.pPr), G.pPrDefault].filter(Boolean);
  const cariAtr = (list, tag, nama) => {
    for (const el of list) {
      const v = atr(anak(el, tag), nama);
      if (v !== null) return v;
    }
    return null;
  };
  const cariEl = (list, tag) => {
    for (const el of list) {
      const e = anak(el, tag);
      if (e) return e;
    }
    return null;
  };
  const fontDari = (list) => {
    for (const rPr of list) {
      const f = anak(rPr, 'rFonts');
      if (!f) continue;
      const ascii = atr(f, 'ascii');
      if (ascii) return ascii;
      const at = atr(f, 'asciiTheme');
      if (at) return (at.startsWith('major') ? G.tema.major : G.tema.minor) || 'Calibri';
      const h = atr(f, 'hAnsi');
      if (h) return h;
      const ht = atr(f, 'hAnsiTheme');
      if (ht) return (ht.startsWith('major') ? G.tema.major : G.tema.minor) || 'Calibri';
    }
    return 'Times New Roman';
  };
  const daftarRPr = (r, pPr) => {
    const rPr = anak(r, 'rPr');
    const rs = atr(anak(rPr, 'rStyle'), 'val');
    return [rPr, ...(rs ? G.rantai(rs).map((g) => g.rPr) : []), ...rantaiP(pPr).map((g) => g.rPr), G.rPrDefault].filter(Boolean);
  };
  const propRun = (r, pPr) => {
    const list = daftarRPr(r, pPr);
    const sz = cariAtr(list, 'sz', 'val');
    const warnaEl = cariEl(list, 'color');
    const hl = cariAtr(list, 'highlight', 'val');
    const shd = cariAtr(list, 'shd', 'fill');
    const va = cariAtr(list, 'vertAlign', 'val');
    return {
      font: fontDari(list),
      ukuran: sz ? parseInt(sz, 10) / 2 : 10,
      tebal: !!toggle(cariEl(list, 'b')),
      kapital: !!toggle(cariEl(list, 'caps')),
      warna: warnaEl ? (atr(warnaEl, 'val') || 'auto').toLowerCase() : 'auto',
      sorot: (hl && hl !== 'none') || (shd && !['auto', 'ffffff'].includes(shd.toLowerCase())),
      naikTurun: va === 'superscript' || va === 'subscript',
    };
  };
  return { rantaiP, daftarPPr, cariAtr, cariEl, propRun };
}

const RE_BAB = /^\s*BAB\s+([IVXLC]+|\d+)\b/i;
const RE_KHUSUS = /^\s*(KATA PENGANTAR|PRAKATA|DAFTAR ISI|DAFTAR TABEL|DAFTAR GAMBAR|DAFTAR LAMPIRAN|DAFTAR SINGKATAN|DAFTAR SIMBOL|DAFTAR ISTILAH|DAFTAR PUSTAKA|DAFTAR REFERENSI|REFERENSI|BIBLIOGRAFI|ABSTRAK|ABSTRACT|INTISARI|LAMPIRAN|LAMPIRAN-LAMPIRAN|PERSEMBAHAN|MOTTO|RIWAYAT HIDUP|HALAMAN PENGESAHAN|LEMBAR PENGESAHAN|HALAMAN PERSETUJUAN|LEMBAR PERSETUJUAN|PERNYATAAN( KEASLIAN.*)?|SURAT PERNYATAAN.*)\s*$/i;
const RE_PUSTAKA = /^\s*(DAFTAR PUSTAKA|DAFTAR REFERENSI|REFERENSI|REFERENCES|BIBLIOGRAFI)\s*$/i;
const RE_LAMPIRAN = /^\s*(LAMPIRAN|LAMPIRAN-LAMPIRAN)\b/i;
const RE_MULAI_ARTIKEL = /^\s*((\d+|[IVX]+|[A-Z])[.)]?\s*)?(PENDAHULUAN|LATAR BELAKANG|INTRODUCTION)\s*$/i;
const RE_SUBJUDUL = /^\s*((\d+\.)+\d*|[A-Z]\.|[a-z]\.|\d+\))\s+\S/;
const RE_TABEL = /^\s*Tabel\s+\d+([.\-]\d+)*\b/i;
const RE_GAMBAR = /^\s*(Gambar|Grafik|Bagan|Diagram)\s+\d+([.\-]\d+)*\b/i;
const RE_TOC_BARIS = /(\.{4,}|…{2,}|\t\s*[\divxlc]+\s*$)/i;

// ---------- skor ----------

/** Hitung skor 0-100 dari daftar temuan, sekaligus mengurutkan temuan dari yang paling berat. */
export function nilaiSkor(temuan) {
  const BOBOT = { berat: 10, sedang: 6, ringan: 3 };
  let potongSkor = 0;
  for (const t of temuan) {
    let faktor = 1;
    if (t.dari) faktor = 0.5 + 0.5 * Math.min(1, (t.jumlah / t.dari) * 4);
    t.bobot = Math.round(BOBOT[t.tingkat] * faktor * 10) / 10;
    potongSkor += t.bobot;
  }
  const URUT = { berat: 0, sedang: 1, ringan: 2 };
  temuan.sort((a, b) => URUT[a.tingkat] - URUT[b.tingkat] || b.bobot - a.bobot);
  return Math.max(0, Math.round(100 - potongSkor));
}

// ---------- pemeriksaan utama ----------

/**
 * @param {ArrayBuffer|Uint8Array} buffer isi file .docx
 * @param {object} aturan aturan baku (lihat rules.js)
 * @param {{JSZip?: any, DOMParser?: any}} deps
 */
export async function periksaDocx(buffer, aturan, deps = {}) {
  const JSZip = deps.JSZip || globalThis.JSZip;
  const Parser = deps.DOMParser || globalThis.DOMParser;
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 4) throw new GalatPengguna('File kosong. Pilih file skripsi .docx yang benar.');
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new GalatPengguna('File ini format Word lama (.doc) atau dikunci password. Buka di Word, lalu Save As → Word Document (.docx) tanpa password.');
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new GalatPengguna('File harus .docx. Kalau masih .doc atau PDF, buka di Word lalu Save As .docx.');
  }
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new GalatPengguna('File tidak bisa dibuka. Pastikan file .docx tidak rusak, lalu coba lagi.');
  }
  const docStr = await bacaTeks(zip, 'word/document.xml');
  if (!docStr) throw new GalatPengguna('File ini bukan dokumen Word .docx yang valid.');
  const doc = parseXml(Parser, docStr, 'dokumen');
  const stylesStr = await bacaTeks(zip, 'word/styles.xml');
  const themePath = Object.keys(zip.files).find((p) => /^word\/theme\/theme\d*\.xml$/.test(p));
  const themeStr = themePath ? await bacaTeks(zip, themePath) : null;
  const G = bacaGaya(stylesStr ? parseXml(Parser, stylesStr, 'gaya') : null, themeStr ? parseXml(Parser, themeStr, 'tema') : null);
  const R = buatResolver(G);

  const body = semua(doc, 'body')[0];
  if (!body) throw new GalatPengguna('Isi dokumen tidak terbaca. Coba simpan ulang di Word sebagai .docx.');

  // --- kumpulkan paragraf ---
  const semuaP = semua(doc, 'p');
  const adaRendered = semua(doc, 'lastRenderedPageBreak').length > 0;
  const tocSdt = new Set();
  for (const sdt of semua(doc, 'sdt')) {
    const g = semua(sdt, 'docPartGallery')[0];
    if (g && /table of contents/i.test(atr(g, 'val') || '')) for (const p of semua(sdt, 'p')) tocSdt.add(p);
  }
  let adaFieldToc = tocSdt.size > 0;
  const PAR = [];
  let halaman = 1;
  for (let i = 0; i < semuaP.length; i++) {
    const el = semuaP[i];
    const pPr = anak(el, 'pPr');
    const posisi = leluhur(el, new Set(['tc', 'txbxContent', 'Fallback', 'footnote', 'endnote', 'comment']));
    const runs = kumpulkanRun(el);
    let teks = '';
    let breakHalaman = false;
    let renderedAwal = 0;
    let renderedTengah = 0;
    let gambar = false;
    let breakAwal = false;
    const instr = [];
    const potongan = [];
    for (const r of runs) {
      const isi = isiRun(r);
      if (isi.breakHalaman && !teks.trim()) breakAwal = true;
      if (isi.breakHalaman) breakHalaman = true;
      if (isi.rendered) { if (!teks.trim()) renderedAwal += isi.rendered; else renderedTengah += isi.rendered; }
      if (isi.gambar) gambar = true;
      instr.push(...isi.instr);
      teks += isi.teks;
      if (isi.teks) potongan.push({ r, n: isi.teks.length, teks: isi.teks });
    }
    for (const fs of semua(el, 'fldSimple')) instr.push(atr(fs, 'instr') || '');
    const instrGab = instr.join(' ');
    if (/\bTOC\b/.test(instrGab)) adaFieldToc = true;
    const list = R.daftarPPr(pPr);
    const gayaRantai = R.rantaiP(pPr);
    const namaGaya = gayaRantai[0]?.nama || 'normal';
    const outline = R.cariAtr(list, 'outlineLvl', 'val');
    const numPr = R.cariEl(list, 'numPr');
    const sectPr = anak(pPr, 'sectPr');
    const pageBreakBefore = !!toggle(R.cariEl(list, 'pageBreakBefore'));
    const bersih = teks.replace(/\s+/g, ' ').trim();

    if (!posisi) {
      if (adaRendered) halaman += renderedAwal;
      else {
        if (pageBreakBefore && i > 0) halaman++;
        if (breakAwal) halaman++;
      }
    }
    const halamanIni = halaman;
    if (!posisi) {
      if (adaRendered) halaman += renderedTengah;
      else {
        if (breakHalaman && !breakAwal) halaman++;
        if (sectPr && atr(anak(sectPr, 'type'), 'val') !== 'continuous') halaman++;
      }
    }

    PAR.push({
      i,
      el,
      pPr,
      list,
      teks: bersih,
      teksAsli: teks,
      kata: hitungKata(bersih),
      potongan,
      posisi,
      namaGaya,
      gayaId: gayaRantai[0]?.id || '',
      outline: outline === null ? null : parseInt(outline, 10),
      daftar: !!numPr && atr(anak(numPr, 'numId'), 'val') !== '0',
      sectPr,
      pageBreakBefore,
      breakHalaman,
      gambar,
      instr: instrGab,
      toc: tocSdt.has(el) || /^toc|^daftar isi|table of figures|^tof/.test(namaGaya) || (RE_TOC_BARIS.test(teks) && bersih.length < 200),
      halaman: halamanIni,
    });
  }

  // propertinya dihitung malas supaya cepat
  const propCache = new Map();
  const propPar = (p) => {
    if (propCache.has(p.i)) return propCache.get(p.i);
    const chars = { font: new Map(), ukuran: new Map() };
    let total = 0;
    let tebal = 0;
    let kapital = 0;
    let warna = false;
    for (const pot of p.potongan) {
      const n = pot.teks.replace(/\s/g, '').length;
      if (!n) continue;
      const pr = R.propRun(pot.r, p.pPr);
      total += n;
      chars.font.set(pr.font, (chars.font.get(pr.font) || 0) + n);
      if (!pr.naikTurun) chars.ukuran.set(pr.ukuran, (chars.ukuran.get(pr.ukuran) || 0) + n);
      if (pr.tebal) tebal += n;
      if (pr.kapital) kapital += n;
      const diLink = pot.r.parentNode && pot.r.parentNode.localName === 'hyperlink';
      if (!diLink && n >= 3 && ((pr.warna !== 'auto' && pr.warna !== '000000') || pr.sorot)) warna = true;
    }
    const dominan = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const jc = R.cariAtr(p.list, 'jc', 'val') || 'left';
    const line = R.cariAtr(p.list, 'spacing', 'line');
    const lineRule = R.cariAtr(p.list, 'spacing', 'lineRule') || 'auto';
    const before = R.cariAtr(p.list, 'spacing', 'beforeAutospacing') === '1' ? 14 : parseInt(R.cariAtr(p.list, 'spacing', 'before') || '0', 10) / 20;
    const after = R.cariAtr(p.list, 'spacing', 'afterAutospacing') === '1' ? 14 : parseInt(R.cariAtr(p.list, 'spacing', 'after') || '0', 10) / 20;
    const firstLine = parseInt(R.cariAtr(p.list, 'ind', 'firstLine') || '0', 10);
    const hanging = parseInt(R.cariAtr(p.list, 'ind', 'hanging') || '0', 10);
    const ukuranDom = dominan(chars.ukuran) || 12;
    let spasi;
    if (line === null) spasi = 1;
    else if (lineRule === 'auto') spasi = parseInt(line, 10) / 240;
    else {
      const pt = parseInt(line, 10) / 20;
      spasi = pt / (ukuranDom * 1.15);
      if (lineRule === 'atLeast') spasi = Math.max(1, spasi);
    }
    const hasil = {
      total,
      chars,
      font: dominan(chars.font),
      ukuran: ukuranDom,
      tebalRasio: total ? tebal / total : 0,
      kapitalRasio: total ? kapital / total : 0,
      warna,
      jc,
      spasi: Math.round(spasi * 100) / 100,
      lineRule,
      before,
      after,
      indentCm: (firstLine - hanging) / TWIP_PER_CM,
    };
    propCache.set(p.i, hasil);
    return hasil;
  };

  // --- klasifikasi ---
  const utama = PAR.filter((p) => !p.posisi);
  const kosong = (p) => !p.teks && !p.gambar && !p.breakHalaman && !p.sectPr;
  const pendek = (p) => p.kata > 0 && p.kata <= 12 && p.teks.length <= 120;
  for (const p of utama) {
    p.bab = !p.toc && pendek(p) && RE_BAB.test(p.teks);
    p.khusus = !p.toc && pendek(p) && RE_KHUSUS.test(p.teks);
    p.caption = !p.toc && p.kata <= 40 && (RE_TABEL.test(p.teks) || RE_GAMBAR.test(p.teks) || /caption|keterangan/.test(p.namaGaya));
    p.subjudul = !p.toc && pendek(p) && (/^heading [2-9]|^judul [2-9]/.test(p.namaGaya) || (p.outline !== null && p.outline >= 1) || (RE_SUBJUDUL.test(p.teks) && p.kata <= 10 && !/[.;:,]$/.test(p.teks)));
  }
  // baris kedua judul bab (misal "PENDAHULUAN" di bawah "BAB I")
  for (let k = 0; k < utama.length; k++) {
    const p = utama[k];
    if (!p.bab || hitungKata(p.teks.replace(RE_BAB, '')) > 0) continue;
    let j = k + 1;
    while (j < utama.length && kosong(utama[j])) j++;
    const q = utama[j];
    if (q && pendek(q) && !q.bab && !q.khusus && !q.caption && !q.subjudul) q.judulBab2 = true;
  }
  for (const p of utama) {
    p.judul = p.bab || p.khusus || p.judulBab2 || p.subjudul || /^heading 1|^judul 1|^title/.test(p.namaGaya) || p.outline === 0;
  }

  const babList = utama.filter((p) => p.bab);
  const modeSkripsi = babList.length > 0;
  let mulai;
  if (modeSkripsi) mulai = babList[0].i;
  else {
    const m = utama.find((p) => !p.toc && pendek(p) && RE_MULAI_ARTIKEL.test(p.teks));
    mulai = m ? m.i : 0;
  }
  const pustaka = utama.find((p) => p.i > mulai && RE_PUSTAKA.test(p.teks) && pendek(p));
  const akhirIsi = pustaka ? pustaka.i : Infinity;
  const lampiran = utama.find((p) => p.i > (pustaka ? pustaka.i : mulai) && (p.khusus || p.bab) && RE_LAMPIRAN.test(p.teks));
  const akhirSemua = lampiran ? lampiran.i : Infinity;

  const isi = utama.filter((p) => p.i >= mulai && p.i < akhirIsi);
  const isiPustaka = utama.filter((p) => p.i >= mulai && p.i < akhirSemua);
  const minKataProsa = modeSkripsi ? 12 : 20;
  const prosa = isi.filter((p) => !p.toc && !p.judul && !p.caption && p.kata >= minKataProsa);
  const teksBerhuruf = isiPustaka.filter((p) => !p.toc && p.kata >= 2);
  if (!prosa.length && !teksBerhuruf.length) {
    throw new GalatPengguna('Teks di dokumen ini terlalu sedikit untuk dicek. Pastikan yang dipilih file skripsi/makalah, bukan template kosong.');
  }

  const temuan = [];
  const tambah = (t) => temuan.push({ paragraf: [], dari: 0, ...t });

  // --- 1. halaman: kertas & margin ---
  const sects = semua(doc, 'sectPr').filter((s) => s.parentNode && s.parentNode.localName !== 'sectPrChange');
  const KERTAS = { A4: [21, 29.7], Letter: [21.59, 27.94], F4: [21.5, 33] };
  const namaKertas = (a, b) => Object.entries(KERTAS).find(([, [x, y]]) => Math.abs(x - a) < 0.3 && Math.abs(y - b) < 0.3)?.[0];
  if (aturan.kertas && KERTAS[aturan.kertas]) {
    const [ex, ey] = KERTAS[aturan.kertas];
    const salah = [];
    for (const s of sects) {
      const pg = anak(s, 'pgSz');
      if (!pg) continue;
      const w = parseInt(atr(pg, 'w') || '0', 10) / TWIP_PER_CM;
      const h = parseInt(atr(pg, 'h') || '0', 10) / TWIP_PER_CM;
      const [a, b] = [Math.min(w, h), Math.max(w, h)];
      if (Math.abs(a - ex) > 0.3 || Math.abs(b - ey) > 0.3) salah.push([a, b]);
    }
    if (salah.length) {
      const [a, b] = salah[0];
      const nm = namaKertas(a, b);
      tambah({
        id: 'kertas', kategori: 'Halaman', tingkat: 'berat',
        judul: 'Ukuran kertas belum sesuai',
        pesan: `Kertas ${nm ? nm + ' ' : ''}(${fmt(a)} × ${fmt(b)} cm), seharusnya ${aturan.kertas} (${fmt(ex)} × ${fmt(ey)} cm).`,
        saran: `Layout → Size → pilih ${aturan.kertas}. Pastikan "Apply to: Whole document".`,
      });
    }
  }
  const SISI = [['atas', 'top'], ['bawah', 'bottom'], ['kiri', 'left'], ['kanan', 'right']];
  for (const [sisi, tag] of SISI) {
    const harus = aturan.margin?.[sisi];
    if (!harus) continue;
    const nilai = [];
    let dicek = 0;
    for (const s of sects) {
      const pm = anak(s, 'pgMar');
      const pg = anak(s, 'pgSz');
      if (!pm) continue;
      if (pg && (atr(pg, 'orient') === 'landscape' || parseInt(atr(pg, 'w') || '0', 10) > parseInt(atr(pg, 'h') || '0', 10))) continue;
      dicek++;
      let v = Math.abs(parseInt(atr(pm, tag) || '0', 10));
      if (tag === 'left') v += parseInt(atr(pm, 'gutter') || '0', 10);
      const vc = Math.round((v / TWIP_PER_CM) * 100) / 100;
      if (Math.abs(vc - harus) > 0.1) nilai.push(vc);
    }
    if (nilai.length) {
      const bagian = dicek > 1 ? ` (di ${nilai.length} dari ${dicek} bagian dokumen)` : '';
      const label = { atas: 'Top', bawah: 'Bottom', kiri: 'Left', kanan: 'Right' }[sisi];
      tambah({
        id: `margin-${sisi}`, kategori: 'Halaman', tingkat: 'berat',
        judul: `Margin ${sisi} belum sesuai`,
        pesan: `Margin ${sisi} ${fmt(nilai[0])} cm, seharusnya ${fmt(harus)} cm${bagian}.`,
        saran: `Layout → Margins → Custom Margins → isi ${label} ${fmt(harus)} cm, "Apply to: Whole document".`,
      });
    }
  }

  // --- 2. nomor halaman ---
  if (aturan.nomorHalaman) {
    let ada = false;
    for (const path of Object.keys(zip.files)) {
      if (!/^word\/(header|footer)\d*\.xml$/.test(path)) continue;
      const s = await bacaTeks(zip, path);
      if (s && (/instr="[^"]*\bPAGE\b/.test(s) || /<w:instrText[^>]*>[^<]*\bPAGE\b/.test(s))) { ada = true; break; }
    }
    if (!ada) {
      tambah({
        id: 'nomor-halaman', kategori: 'Halaman', tingkat: 'sedang',
        judul: 'Belum ada nomor halaman otomatis',
        pesan: 'Dokumen belum memakai nomor halaman otomatis.',
        saran: 'Insert → Page Number → pilih posisi sesuai pedoman. Jangan diketik manual.',
      });
    }
  }

  // --- 3. huruf ---
  const flagParagraf = (daftar, uji) => daftar.filter((p) => uji(p, propPar(p)));
  if (aturan.font) {
    const lain = new Map();
    const salah = flagParagraf(teksBerhuruf, (p, pr) => {
      let beda = 0;
      for (const [f, n] of pr.chars.font) if (!namaFontSama(f, aturan.font)) { beda += n; lain.set(f, (lain.get(f) || 0) + n); }
      return pr.total > 0 && beda / pr.total > 0.15;
    });
    if (salah.length) {
      const contohFont = [...lain.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([f]) => f).join(', ');
      tambah({
        id: 'font', kategori: 'Huruf', tingkat: 'berat',
        judul: 'Jenis huruf belum seragam',
        pesan: `${salah.length} paragraf memakai huruf ${contohFont}, seharusnya ${aturan.font}.`,
        saran: `Tekan Ctrl+A, lalu pilih huruf ${aturan.font}. Untuk judul, ubah lewat style Heading supaya ikut berubah.`,
        paragraf: salah.map((p) => p.i), dari: teksBerhuruf.length,
      });
    }
  }
  const ukuranDicek = isiPustaka.filter((p) => !p.toc && !p.judul && !p.caption && p.kata >= 4);
  if (aturan.ukuran) {
    const lain = new Map();
    const salah = flagParagraf(ukuranDicek, (p, pr) => {
      let total = 0;
      let beda = 0;
      for (const [u, n] of pr.chars.ukuran) { total += n; if (Math.abs(u - aturan.ukuran) > 0.25) { beda += n; lain.set(u, (lain.get(u) || 0) + n); } }
      return total > 0 && beda / total > 0.15;
    });
    if (salah.length) {
      const u = [...lain.entries()].sort((a, b) => b[1] - a[1])[0][0];
      tambah({
        id: 'ukuran', kategori: 'Huruf', tingkat: 'berat',
        judul: 'Ukuran huruf isi belum sesuai',
        pesan: `${salah.length} paragraf berukuran ${fmt(u)} pt, seharusnya ${fmt(aturan.ukuran)} pt.`,
        saran: `Blok paragraf isi, lalu ubah ukuran huruf menjadi ${fmt(aturan.ukuran)}. Lebih rapi lewat style Normal (klik kanan Normal → Modify).`,
        paragraf: salah.map((p) => p.i), dari: ukuranDicek.length,
      });
    }
  }
  {
    const warnaDicek = isi.filter((p) => !p.toc && p.kata >= 2);
    const salah = flagParagraf(warnaDicek, (p, pr) => pr.warna);
    if (salah.length) {
      tambah({
        id: 'warna', kategori: 'Huruf', tingkat: 'ringan',
        judul: 'Ada teks berwarna atau di-highlight',
        pesan: `${salah.length} paragraf berisi teks berwarna atau berlatar warna. Naskah resmi umumnya hitam polos.`,
        saran: 'Blok teksnya, lalu Font Color → Automatic dan Text Highlight → No Color.',
        paragraf: salah.map((p) => p.i), dari: warnaDicek.length,
      });
    }
  }

  // --- 4. paragraf ---
  if (aturan.spasi) {
    const nilai = new Map();
    const salah = flagParagraf(prosa, (p, pr) => {
      const b = Math.abs(pr.spasi - aturan.spasi) > 0.12;
      if (b) nilai.set(pr.spasi, (nilai.get(pr.spasi) || 0) + 1);
      return b;
    });
    if (salah.length) {
      const v = [...nilai.entries()].sort((a, b) => b[1] - a[1])[0][0];
      tambah({
        id: 'spasi', kategori: 'Paragraf', tingkat: 'berat',
        judul: 'Spasi baris belum sesuai',
        pesan: `${salah.length} paragraf berspasi ${fmt(v)}, seharusnya ${fmt(aturan.spasi)}.`,
        saran: `Blok paragraf isi → Paragraph → Line spacing: ${aturan.spasi === 1.5 ? '1.5 lines' : aturan.spasi === 2 ? 'Double' : aturan.spasi === 1 ? 'Single' : 'Multiple ' + fmt(aturan.spasi)}.`,
        paragraf: salah.map((p) => p.i), dari: prosa.length,
      });
    }
  }
  if (aturan.jarakParagraf !== null && aturan.jarakParagraf !== undefined) {
    let maks = 0;
    const salah = flagParagraf(prosa, (p, pr) => {
      const v = Math.max(pr.before, pr.after);
      const b = v > aturan.jarakParagraf + 6;
      if (b) maks = Math.max(maks, v);
      return b;
    });
    if (salah.length) {
      tambah({
        id: 'jarak-paragraf', kategori: 'Paragraf', tingkat: 'sedang',
        judul: 'Ada jarak tambahan antarparagraf',
        pesan: `${salah.length} paragraf punya jarak tambahan sebelum/sesudah sampai ${fmt(maks)} pt (bawaan Word). Seharusnya ${fmt(aturan.jarakParagraf)} pt.`,
        saran: `Blok paragraf isi → Paragraph → Spacing Before dan After isi ${fmt(aturan.jarakParagraf)} pt.`,
        paragraf: salah.map((p) => p.i), dari: prosa.length,
      });
    }
  }
  if (aturan.rataKananKiri) {
    const salah = flagParagraf(prosa, (p, pr) => !['both', 'distribute', 'lowKashida', 'mediumKashida', 'highKashida', 'thaiDistribute'].includes(pr.jc));
    if (salah.length) {
      tambah({
        id: 'rata', kategori: 'Paragraf', tingkat: 'sedang',
        judul: 'Paragraf belum rata kanan-kiri',
        pesan: `${salah.length} paragraf isi belum rata kanan-kiri (justify).`,
        saran: 'Blok paragraf isi, lalu tekan Ctrl+J (Justify).',
        paragraf: salah.map((p) => p.i), dari: prosa.length,
      });
    }
  }
  if (aturan.indentBarisPertama !== null && aturan.indentBarisPertama !== undefined) {
    const target = aturan.indentBarisPertama;
    const dicek = prosa.filter((p) => !p.daftar);
    const salah = flagParagraf(dicek, (p, pr) => {
      const tab = /^\t/.test(p.teksAsli);
      if (target > 0) return !tab && Math.abs(pr.indentCm - target) > 0.3;
      return tab || pr.indentCm > 0.3;
    });
    if (salah.length) {
      tambah({
        id: 'indent', kategori: 'Paragraf', tingkat: 'sedang',
        judul: target > 0 ? 'Baris pertama paragraf belum menjorok' : 'Baris pertama paragraf tidak boleh menjorok',
        pesan: target > 0
          ? `${salah.length} paragraf tidak menjorok ${fmt(target)} cm di baris pertama.`
          : `${salah.length} paragraf menjorok di baris pertama, padahal pedoman meminta rata kiri.`,
        saran: `Blok paragraf isi → Paragraph → Special: First line, By: ${fmt(target)} cm.`,
        paragraf: salah.map((p) => p.i), dari: dicek.length,
      });
    }
  }
  {
    const salah = prosa.filter((p) => /\S {2,}\S/.test(p.teksAsli));
    if (salah.length) {
      tambah({
        id: 'spasi-ganda', kategori: 'Paragraf', tingkat: 'ringan',
        judul: 'Ada spasi ganda di antara kata',
        pesan: `${salah.length} paragraf berisi dua spasi atau lebih di antara kata.`,
        saran: 'Ctrl+H → Find what: dua spasi, Replace with: satu spasi → Replace All (ulangi sampai 0).',
        paragraf: salah.map((p) => p.i), dari: prosa.length,
      });
    }
  }
  {
    const awal = [];
    let deret = 0;
    let mulaiDeret = null;
    for (const p of isi) {
      if (kosong(p)) { if (deret === 0) mulaiDeret = p.i; deret++; }
      else { if (deret >= 3) awal.push(mulaiDeret); deret = 0; }
    }
    if (deret >= 3) awal.push(mulaiDeret);
    if (awal.length) {
      tambah({
        id: 'enter-berulang', kategori: 'Paragraf', tingkat: 'ringan',
        judul: 'Memakai Enter berulang untuk memberi jarak',
        pesan: `Ada ${awal.length} tempat dengan 3 baris kosong atau lebih berturut-turut. Tata letak bisa bergeser saat dicetak.`,
        saran: 'Hapus baris kosongnya. Untuk pindah halaman pakai Ctrl+Enter (Page Break).',
        paragraf: awal,
      });
    }
  }

  // --- 5. judul bab ---
  const judulBab = utama.filter((p) => (p.bab || p.khusus || p.judulBab2) && !p.toc);
  const jb = aturan.judulBab || {};
  if (judulBab.length) {
    if (jb.kapital) {
      const salah = judulBab.filter((p) => /\p{Ll}/u.test(p.teks) && propPar(p).kapitalRasio < 0.8);
      if (salah.length) tambah({
        id: 'judul-kapital', kategori: 'Judul', tingkat: 'sedang',
        judul: 'Judul bab belum huruf kapital',
        pesan: `${salah.length} judul bab belum ditulis huruf kapital semua, misalnya "${potong(salah[0].teks, 40)}".`,
        saran: 'Blok judulnya → Shift+F3 sampai jadi HURUF BESAR, atau Home → Change Case → UPPERCASE.',
        paragraf: salah.map((p) => p.i), dari: judulBab.length,
      });
    }
    if (jb.tengah) {
      const salah = judulBab.filter((p) => propPar(p).jc !== 'center');
      if (salah.length) tambah({
        id: 'judul-tengah', kategori: 'Judul', tingkat: 'sedang',
        judul: 'Judul bab belum di tengah',
        pesan: `${salah.length} judul bab belum rata tengah.`,
        saran: 'Klik judul → Ctrl+E. Lebih rapi: klik kanan style Heading 1 → Modify → Center.',
        paragraf: salah.map((p) => p.i), dari: judulBab.length,
      });
    }
    if (jb.tebal) {
      const salah = judulBab.filter((p) => propPar(p).tebalRasio < 0.6);
      if (salah.length) tambah({
        id: 'judul-tebal', kategori: 'Judul', tingkat: 'sedang',
        judul: 'Judul bab belum dicetak tebal',
        pesan: `${salah.length} judul bab belum tebal (bold).`,
        saran: 'Blok judul → Ctrl+B.',
        paragraf: salah.map((p) => p.i), dari: judulBab.length,
      });
    }
    if (jb.ukuran) {
      const salah = judulBab.filter((p) => Math.abs(propPar(p).ukuran - jb.ukuran) > 0.25);
      if (salah.length) tambah({
        id: 'judul-ukuran', kategori: 'Judul', tingkat: 'sedang',
        judul: 'Ukuran huruf judul bab belum sesuai',
        pesan: `${salah.length} judul bab berukuran ${fmt(propPar(salah[0]).ukuran)} pt, seharusnya ${fmt(jb.ukuran)} pt.`,
        saran: `Klik kanan style Heading 1 → Modify → ukuran ${fmt(jb.ukuran)}.`,
        paragraf: salah.map((p) => p.i), dari: judulBab.length,
      });
    }
  }
  if (jb.halamanBaru && babList.length) {
    const idxUtama = new Map(utama.map((p, k) => [p.i, k]));
    const salah = babList.filter((p) => {
      if (p.pageBreakBefore) return false;
      const k = idxUtama.get(p.i);
      if (k === 0) return false;
      for (let j = k - 1; j >= 0; j--) {
        const q = utama[j];
        if (q.breakHalaman) return false;
        if (q.sectPr && atr(anak(q.sectPr, 'type'), 'val') !== 'continuous') return false;
        if (!kosong(q)) return true;
      }
      return false;
    });
    if (salah.length) tambah({
      id: 'bab-halaman-baru', kategori: 'Judul', tingkat: 'sedang',
      judul: 'Bab baru belum dimulai di halaman baru',
      pesan: `${salah.length} bab tidak diawali page break, misalnya "${potong(salah[0].teks, 40)}".`,
      saran: 'Klik di depan tulisan BAB → tekan Ctrl+Enter. Hapus baris kosong yang dipakai untuk mendorong ke halaman baru.',
      paragraf: salah.map((p) => p.i), dari: babList.length,
    });
  }

  // --- 6. tabel & gambar ---
  const blok = [];
  const indexEl = new Map(PAR.map((p) => [p.el, p]));
  const jalanBlok = (node) => {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType !== 1) continue;
      if (c.localName === 'p') { const p = indexEl.get(c); if (p && !kosong(p)) blok.push({ p }); }
      else if (c.localName === 'tbl') blok.push({ tbl: true });
      else if (c.localName === 'sdt' || c.localName === 'sdtContent' || c.localName === 'customXml') jalanBlok(c);
    }
  };
  jalanBlok(body);
  const tabelSalah = [];
  const gambarSalah = [];
  for (let k = 0; k < blok.length; k++) {
    const p = blok[k].p;
    if (!p || p.toc || p.posisi) continue;
    const capGaya = /caption|keterangan/.test(p.namaGaya);
    const prev = blok[k - 1];
    const next = blok[k + 1];
    if (RE_TABEL.test(p.teks) && (capGaya || p.kata <= 15)) {
      if (prev?.tbl && !next?.tbl) tabelSalah.push(p.i);
    } else if (RE_GAMBAR.test(p.teks) && (capGaya || p.kata <= 15)) {
      if (next?.p?.gambar && !prev?.p?.gambar) gambarSalah.push(p.i);
    }
  }
  if (tabelSalah.length) tambah({
    id: 'posisi-judul-tabel', kategori: 'Tabel & Gambar', tingkat: 'ringan',
    judul: 'Judul tabel ada di bawah tabel',
    pesan: `${tabelSalah.length} judul tabel diletakkan di bawah tabel. Judul tabel seharusnya di atas tabel.`,
    saran: 'Pindahkan judul ke atas tabel. Pakai References → Insert Caption → Position: Above selected item.',
    paragraf: tabelSalah,
  });
  if (gambarSalah.length) tambah({
    id: 'posisi-judul-gambar', kategori: 'Tabel & Gambar', tingkat: 'ringan',
    judul: 'Judul gambar ada di atas gambar',
    pesan: `${gambarSalah.length} judul gambar diletakkan di atas gambar. Judul gambar seharusnya di bawah gambar.`,
    saran: 'Pindahkan judul ke bawah gambar. Pakai References → Insert Caption → Position: Below selected item.',
    paragraf: gambarSalah,
  });

  // --- 7. lain-lain ---
  const revisi = ['ins', 'del', 'moveFrom', 'moveTo', 'pPrChange', 'rPrChange', 'sectPrChange'].reduce((n, t) => n + semua(doc, t).length, 0);
  if (revisi) tambah({
    id: 'revisi', kategori: 'Lainnya', tingkat: 'sedang',
    judul: 'Masih ada track changes',
    pesan: `Ada ${revisi} revisi (track changes) yang belum diterima atau ditolak. Bisa ikut tercetak.`,
    saran: 'Review → Accept → Accept All Changes, lalu matikan Track Changes.',
  });
  const komentarStr = await bacaTeks(zip, 'word/comments.xml');
  const jmlKomentar = komentarStr ? (komentarStr.match(/<w:comment\b/g) || []).length : 0;
  if (jmlKomentar) tambah({
    id: 'komentar', kategori: 'Lainnya', tingkat: 'ringan',
    judul: 'Masih ada komentar di dokumen',
    pesan: `Ada ${jmlKomentar} komentar yang belum dihapus.`,
    saran: 'Review → Delete → Delete All Comments in Document (setelah semua catatan selesai dikerjakan).',
  });
  const daftarIsi = utama.find((p) => /^\s*DAFTAR ISI\s*$/i.test(p.teks));
  if (modeSkripsi && daftarIsi && !adaFieldToc) tambah({
    id: 'daftar-isi', kategori: 'Lainnya', tingkat: 'ringan',
    judul: 'Daftar isi masih diketik manual',
    pesan: 'Daftar isi belum dibuat otomatis, jadi nomor halamannya rawan meleset.',
    saran: 'Pakai style Heading untuk judul, lalu References → Table of Contents. Setelah revisi, klik Update Table.',
    paragraf: [daftarIsi.i],
  });

  // --- skor ---
  for (const t of temuan) {
    t.jumlah = t.paragraf.length;
    t.contoh = t.paragraf.slice(0, 5).map((i) => ({ i, teks: potong(PAR[i].teks || '(baris kosong)'), halaman: PAR[i].halaman }));
  }
  const skor = nilaiSkor(temuan);

  const jumlahKata = isi.reduce((n, p) => n + p.kata, 0);
  const halamanTerakhir = PAR.length ? PAR[PAR.length - 1].halaman : 1;
  const estimasiHalaman = Math.max(halamanTerakhir, Math.ceil(utama.reduce((n, p) => n + p.kata, 0) / ((aturan.spasi || 1.5) >= 1.5 ? 280 : 450)));

  // --- nilai terukur untuk tabel perbandingan ---
  const dominan = (arr) => { const m = new Map(); for (const [k, n] of arr) m.set(k, (m.get(k) || 0) + n); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };
  const sectUtama = sects[sects.length - 1];
  const pgSz = anak(sectUtama, 'pgSz');
  const pgMar = anak(sectUtama, 'pgMar');
  const cmDari = (el, tag, tambahan = 0) => (el ? Math.round(((Math.abs(parseInt(atr(el, tag) || '0', 10)) + tambahan) / TWIP_PER_CM) * 100) / 100 : null);
  const wCm = pgSz ? parseInt(atr(pgSz, 'w') || '0', 10) / TWIP_PER_CM : 0;
  const hCm = pgSz ? parseInt(atr(pgSz, 'h') || '0', 10) / TWIP_PER_CM : 0;
  const prosaProp = prosa.map((p) => propPar(p));
  const ukur = {
    kertas: pgSz ? (namaKertas(Math.min(wCm, hCm), Math.max(wCm, hCm)) || `${fmt(Math.min(wCm, hCm))} × ${fmt(Math.max(wCm, hCm))} cm`) : null,
    margin: { atas: cmDari(pgMar, 'top'), bawah: cmDari(pgMar, 'bottom'), kiri: cmDari(pgMar, 'left', pgMar ? parseInt(atr(pgMar, 'gutter') || '0', 10) : 0), kanan: cmDari(pgMar, 'right') },
    font: dominan(teksBerhuruf.flatMap((p) => [...propPar(p).chars.font.entries()])),
    ukuran: dominan(ukuranDicek.flatMap((p) => [...propPar(p).chars.ukuran.entries()])),
    spasi: dominan(prosaProp.map((x) => [x.spasi, 1])),
    rataPersen: prosaProp.length ? Math.round((prosaProp.filter((x) => ['both', 'distribute'].includes(x.jc)).length / prosaProp.length) * 100) : null,
    indent: dominan(prosa.filter((p) => !p.daftar).map((p) => [Math.round(propPar(p).indentCm * 100) / 100, 1])),
    jarak: dominan(prosaProp.map((x) => [Math.max(x.before, x.after), 1])),
    nomorHalaman: !temuan.some((t) => t.id === 'nomor-halaman'),
    judulBab: judulBab.length,
  };

  return {
    jenis: 'docx',
    skor,
    temuan,
    ukur,
    mode: modeSkripsi ? 'skripsi' : 'artikel',
    statistik: {
      paragraf: utama.filter((p) => p.teks).length,
      paragrafIsi: prosa.length,
      jumlahKata,
      jumlahBab: babList.length,
      estimasiHalaman,
      halamanDariWord: adaRendered,
    },
    paragrafTeks: PAR.map((p) => p.teks),
    halamanPerkiraan: PAR.map((p) => p.halaman),
    paragrafUtama: utama.filter((p) => p.teks).map((p) => p.i),
  };
}
