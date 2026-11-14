// Membuat salinan .docx dengan komentar Word di paragraf yang bermasalah.
// Berjalan di browser. Indeks paragraf sama dengan checker.js (urutan semua <w:p> di document.xml).

import { W, semua } from './checker.js';

const REL_KOMENTAR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments';
const CT_KOMENTAR = 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml';
const XML_DEKL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function serialisasi(Serializer, doc) {
  const s = new Serializer().serializeToString(doc);
  return s.startsWith('<?xml') ? s : XML_DEKL + s;
}

function elW(doc, nama, attrs = {}) {
  const el = doc.createElementNS(W, 'w:' + nama);
  for (const [k, v] of Object.entries(attrs)) el.setAttributeNS(W, 'w:' + k, String(v));
  return el;
}

/**
 * @param {ArrayBuffer|Uint8Array} buffer file .docx asli
 * @param {object} laporan hasil periksaDocx
 * @param {{JSZip?, DOMParser?, XMLSerializer?, halaman?: (number|null)[], tipe?: string}} deps
 * @returns {Promise<Blob|Uint8Array>}
 */
export async function buatFileBercatatan(buffer, laporan, deps = {}) {
  const JSZip = deps.JSZip || globalThis.JSZip;
  const Parser = deps.DOMParser || globalThis.DOMParser;
  const Serializer = deps.XMLSerializer || globalThis.XMLSerializer;
  const zip = await JSZip.loadAsync(buffer);
  const doc = new Parser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
  const semuaP = semua(doc, 'p');
  const halaman = deps.halaman || laporan.halamanPerkiraan || [];
  const labelHal = (i) => {
    const h = halaman[i];
    if (!h) return '';
    return deps.halaman ? ` (hal. ${h} di PDF)` : ` (sekitar hal. ${h})`;
  };

  // Kelompokkan catatan per paragraf
  const perParagraf = new Map();
  const umum = [];
  for (const t of laporan.temuan) {
    const catatan = `${t.judul}. ${t.pesan} Cara memperbaiki: ${t.saran}`;
    if (!t.paragraf.length) { umum.push(catatan); continue; }
    for (const i of t.paragraf) {
      if (!perParagraf.has(i)) perParagraf.set(i, []);
      const daftar = perParagraf.get(i);
      if (!daftar.some((x) => x.id === t.id)) daftar.push({ id: t.id, teks: `${t.judul}. ${t.saran}` });
    }
  }
  if (umum.length) {
    const target = (laporan.paragrafUtama && laporan.paragrafUtama[0]) ?? 0;
    const daftar = perParagraf.get(target) || [];
    daftar.unshift({ id: '_umum', teks: `CATATAN UMUM DOKUMEN (skor format ${laporan.skor}/100):\n` + umum.map((u, k) => `${k + 1}. ${u}`).join('\n') });
    perParagraf.set(target, daftar);
  }

  // Siapkan comments.xml (tambahkan ke yang sudah ada kalau ada)
  let komentarDoc;
  let idAwal = 0;
  const fKomentar = zip.file('word/comments.xml');
  if (fKomentar) {
    komentarDoc = new Parser().parseFromString(await fKomentar.async('string'), 'application/xml');
    for (const c of semua(komentarDoc, 'comment')) {
      const id = parseInt(c.getAttributeNS(W, 'id') || c.getAttribute('w:id') || '0', 10);
      if (id >= idAwal) idAwal = id + 1;
    }
  } else {
    komentarDoc = new Parser().parseFromString(
      `${XML_DEKL}<w:comments xmlns:w="${W}"></w:comments>`,
      'application/xml',
    );
  }
  const akar = komentarDoc.documentElement;
  const tanggal = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  let id = idAwal;
  let jumlah = 0;

  const urut = [...perParagraf.keys()].sort((a, b) => a - b);
  for (const i of urut) {
    const p = semuaP[i];
    if (!p) continue;
    const isi = perParagraf.get(i);
    const teksKomentar = isi.map((x) => x.teks).join('\n') + (isi[0].id === '_umum' ? '' : labelHal(i));

    // isi comments.xml
    const c = elW(komentarDoc, 'comment', { id, author: 'RISETWORKS', date: tanggal, initials: 'RW' });
    for (const baris of teksKomentar.split('\n')) {
      const cp = elW(komentarDoc, 'p');
      const r = elW(komentarDoc, 'r');
      const t = elW(komentarDoc, 't');
      t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
      t.appendChild(komentarDoc.createTextNode(baris));
      r.appendChild(t);
      cp.appendChild(r);
      c.appendChild(cp);
    }
    akar.appendChild(c);

    // tandai paragraf di document.xml
    const mulai = elW(doc, 'commentRangeStart', { id });
    const akhir = elW(doc, 'commentRangeEnd', { id });
    const rRef = elW(doc, 'r');
    rRef.appendChild(elW(doc, 'commentReference', { id }));
    let pPr = null;
    for (let n = p.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1 && n.localName === 'pPr') { pPr = n; break; }
    }
    p.insertBefore(mulai, pPr ? pPr.nextSibling : p.firstChild);
    p.appendChild(akhir);
    p.appendChild(rRef);
    id++;
    jumlah++;
  }

  zip.file('word/document.xml', serialisasi(Serializer, doc));
  zip.file('word/comments.xml', serialisasi(Serializer, komentarDoc));

  // relasi
  const relPath = 'word/_rels/document.xml.rels';
  let rels = zip.file(relPath) ? await zip.file(relPath).async('string') : `${XML_DEKL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  if (!rels.includes(REL_KOMENTAR)) {
    let n = 1;
    while (rels.includes(`Id="rIdRW${n}"`)) n++;
    rels = rels.replace('</Relationships>', `<Relationship Id="rIdRW${n}" Type="${REL_KOMENTAR}" Target="comments.xml"/></Relationships>`);
    zip.file(relPath, rels);
  }
  // content types
  let ct = await zip.file('[Content_Types].xml').async('string');
  if (!ct.includes('/word/comments.xml')) {
    ct = ct.replace('</Types>', `<Override PartName="/word/comments.xml" ContentType="${CT_KOMENTAR}"/></Types>`);
    zip.file('[Content_Types].xml', ct);
  }

  const hasil = await zip.generateAsync({
    type: deps.tipe || 'blob',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  return { file: hasil, jumlahKomentar: jumlah };
}

