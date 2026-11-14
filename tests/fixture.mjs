// Pembuat dokumen .docx contoh untuk tes: satu dokumen benar dan satu dokumen dengan 13 kesalahan.
import JSZip from 'jszip';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const PROSA = [
  'Penelitian ini membahas pengaruh penggunaan media pembelajaran digital terhadap hasil belajar mahasiswa pada mata kuliah statistika dasar di lingkungan perguruan tinggi negeri.',
  'Data dikumpulkan melalui kuesioner yang dibagikan kepada seratus dua puluh responden dari tiga fakultas yang berbeda selama satu semester penuh pada tahun akademik berjalan.',
  'Hasil analisis awal menunjukkan bahwa mahasiswa yang aktif memakai media digital cenderung memperoleh nilai ujian akhir yang lebih tinggi dibandingkan kelompok pembanding.',
  'Oleh karena itu, penelitian lanjutan diperlukan untuk memastikan hubungan sebab akibat antara variabel bebas dan variabel terikat dengan desain penelitian yang lebih kuat.',
];

function run(text, o = {}) {
  const rPr = [];
  if (o.font) rPr.push(`<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}"/>`);
  if (o.b) rPr.push('<w:b/>');
  if (o.sz) rPr.push(`<w:sz w:val="${o.sz}"/>`);
  return `<w:r>${rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function p(text, o = {}) {
  const pPr = [];
  if (o.style) pPr.push(`<w:pStyle w:val="${o.style}"/>`);
  if (o.line) pPr.push(`<w:spacing w:line="${o.line}" w:lineRule="auto"/>`);
  if (o.ind !== undefined) pPr.push(`<w:ind w:firstLine="${o.ind}"/>`);
  if (o.jc) pPr.push(`<w:jc w:val="${o.jc}"/>`);
  let isi = text ? run(text, o) : '';
  if (o.ins) isi += `<w:ins w:id="99" w:author="Dosen" w:date="2026-01-01T00:00:00Z">${run(' tambahan', o)}</w:ins>`;
  if (o.instr) isi = `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${o.instr}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${isi}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  return `<w:p>${pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : ''}${isi}</w:p>`;
}

const pageBreak = () => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
const tabel = () => `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>
<w:tr><w:tc><w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>${run('Fakultas', { font: 'Arial', sz: 20 })}</w:p></w:tc><w:tc><w:p>${run('Jumlah')}</w:p></w:tc></w:tr>
<w:tr><w:tc><w:p>${run('Ekonomi')}</w:p></w:tc><w:tc><w:p>${run('40')}</w:p></w:tc></w:tr></w:tbl>`;
const gambar = () => '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing/></w:r></w:p>';

function styles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:ind w:firstLine="720"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:firstLine="0"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:firstLine="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Pustaka"><w:name w:val="Daftar Pustaka"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:line="240" w:lineRule="auto"/><w:ind w:left="720" w:hanging="720" w:firstLine="0"/></w:pPr></w:style>
</w:styles>`;
}

const FOOTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:fldSimple w:instr=" PAGE \\* MERGEFORMAT "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;

function sectPr({ w = 11906, h = 16838, top = 2268, left = 2268, bottom = 1701, right = 1701, footer = true }) {
  return `<w:sectPr>${footer ? '<w:footerReference w:type="default" r:id="rIdFooter1"/>' : ''}<w:pgSz w:w="${w}" w:h="${h}"/><w:pgMar w:top="${top}" w:right="${right}" w:bottom="${bottom}" w:left="${left}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
}

async function zipkan(bodyXml, { footer = true } = {}) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${footer ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''}</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${footer ? '<Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : ''}</Relationships>`);
  zip.file('word/styles.xml', styles());
  if (footer) zip.file('word/footer1.xml', FOOTER);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${bodyXml}</w:body></w:document>`);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

function bagianDepan() {
  return [
    p('PENGARUH MEDIA PEMBELAJARAN DIGITAL TERHADAP HASIL BELAJAR', { jc: 'center', b: true, sz: 28, ind: 0 }),
    p('SKRIPSI', { jc: 'center', ind: 0 }),
    p('Disusun oleh: Mahasiswa Contoh', { jc: 'center', ind: 0 }),
    pageBreak(),
    p('KATA PENGANTAR', { style: 'Heading1' }),
    p(PROSA[0]),
    pageBreak(),
    p('DAFTAR ISI', { style: 'Heading1' }),
    p('BAB I PENDAHULUAN\t1', { style: 'TOC1', instr: ' TOC \\o "1-3" \\h \\z \\u ' }),
    p('BAB II TINJAUAN PUSTAKA\t5', { style: 'TOC1' }),
    pageBreak(),
  ].join('');
}

function pustaka() {
  return [
    pageBreak(),
    p('DAFTAR PUSTAKA', { style: 'Heading1' }),
    p('Arikunto, S. (2013). Prosedur Penelitian: Suatu Pendekatan Praktik. Jakarta: Rineka Cipta.', { style: 'Pustaka' }),
    p('Sugiyono. (2019). Metode Penelitian Kuantitatif, Kualitatif, dan R&D. Bandung: Alfabeta.', { style: 'Pustaka' }),
  ].join('');
}

export async function dokumenBenar() {
  const body = [
    bagianDepan(),
    p('BAB I', { style: 'Heading1' }),
    p('PENDAHULUAN', { style: 'Heading1' }),
    p('1.1 Latar Belakang', { style: 'Heading2' }),
    p(PROSA[0]), p(PROSA[1]),
    p('Tabel 1.1 Jumlah responden per fakultas', { style: 'Caption' }),
    tabel(),
    p(PROSA[2]),
    gambar(),
    p('Gambar 1.1 Kerangka pemikiran', { style: 'Caption' }),
    p(PROSA[3]),
    pageBreak(),
    p('BAB II', { style: 'Heading1' }),
    p('TINJAUAN PUSTAKA', { style: 'Heading1' }),
    p(PROSA[1]), p(PROSA[2]), p(PROSA[3]),
    pustaka(),
    sectPr({}),
  ].join('');
  return zipkan(body);
}

/** 13 kesalahan yang disengaja, masing-masing id temuan yang harus terdeteksi. */
export const KESALAHAN = [
  'kertas', 'margin-atas', 'margin-kiri', 'font', 'ukuran', 'spasi', 'rata',
  'judul-kapital', 'bab-halaman-baru', 'nomor-halaman', 'revisi', 'enter-berulang', 'posisi-judul-tabel',
];

export async function dokumenSalah() {
  const body = [
    bagianDepan(),
    p('BAB I', { style: 'Heading1' }),
    p('PENDAHULUAN', { style: 'Heading1' }),
    p('1.1 Latar Belakang', { style: 'Heading2' }),
    p(PROSA[0], { font: 'Calibri' }), // font
    p(PROSA[1], { sz: 22 }), // ukuran
    p(''), p(''), p(''), p(''), // enter-berulang
    p(PROSA[2], { line: 240 }), // spasi
    tabel(),
    p('Tabel 1.1 Jumlah responden per fakultas', { style: 'Caption' }), // posisi-judul-tabel
    p(PROSA[3], { jc: 'left' }), // rata
    p(PROSA[0], { ins: true }), // revisi
    // bab-halaman-baru: tidak ada page break sebelum BAB II
    p('BAB II', { style: 'Heading1' }),
    p('Tinjauan Pustaka', { style: 'Heading1' }), // judul-kapital
    p(PROSA[1]), p(PROSA[2]),
    pustaka(),
    // kertas Letter, margin atas 2,54 cm, margin kiri 3 cm, tanpa nomor halaman
    sectPr({ w: 12240, h: 15840, top: 1440, left: 1701, footer: false }),
  ].join('');
  return zipkan(body, { footer: false });
}
