import { CONFIG } from './config.js';
import { ringkasAturan, fmt } from './rules.js';
import { periksaDocx, semua } from './checker.js';

const $ = (s) => document.querySelector(s);
const MB = 1024 * 1024;

const state = {
  skripsi: null, // { jenis: 'docx' | 'pdf', buffer, nama }
  pedoman: null, // { nama, hash }
  aturan: null,
  pedomanSesi: new Map(), // aturan pedoman yang sudah dibaca di tab ini (tidak disimpan di mana pun)
  laporan: null,
  sibuk: false,
};

// ---------- util ----------

function h(tag, attrs = {}, ...anak) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const a of anak.flat()) if (a !== null && a !== undefined && a !== false) el.append(a instanceof Node ? a : String(a));
  return el;
}

function ikon(id, cls = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (cls) svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

function ramah(pesan) {
  const e = new Error(pesan);
  e.ramah = true;
  return e;
}

const rupiah = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');
const ekstensi = (nama) => (String(nama).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';

async function sha256(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function keBase64(buffer) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(ramah('PDF gagal dibaca.'));
    r.readAsDataURL(new Blob([buffer], { type: 'application/pdf' }));
  });
}

async function api(path, opsi = {}, batasMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), batasMs);
  try {
    const res = await fetch(path, {
      ...opsi,
      signal: ctrl.signal,
      headers: { ...(opsi.body ? { 'content-type': 'application/json' } : {}), ...(opsi.headers || {}) },
    });
    let data = {};
    try { data = await res.json(); } catch { /* bukan json */ }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    if (e.name === 'AbortError') throw ramah('Server terlalu lama menjawab. Periksa koneksi internet lalu coba lagi.');
    throw ramah('Tidak bisa terhubung ke server. Periksa koneksi internet lalu coba lagi.');
  } finally {
    clearTimeout(t);
  }
}

// ---------- status & pesan ----------

let timerTahap = [];
function status(teks, tahapan = []) {
  timerTahap.forEach(clearTimeout);
  timerTahap = [];
  const el = $('#status');
  if (!teks) { el.hidden = true; return; }
  $('#status-teks').textContent = teks;
  el.hidden = false;
  for (const [ms, t] of tahapan) timerTahap.push(setTimeout(() => { $('#status-teks').textContent = t; }, ms));
}

function pesan(teks, jenis = 'info') {
  const el = $('#pesan');
  if (!teks) { el.hidden = true; return; }
  el.className = 'pesan' + (jenis === 'galat' ? ' galat' : jenis === 'sukses' ? ' sukses' : '');
  el.textContent = teks;
  el.hidden = false;
}

function tanganiGalat(e, cadangan) {
  console.error(e);
  pesan(e && e.ramah ? e.message : cadangan, 'galat');
}

// ---------- kotak upload ----------

function setKotak(jenis, { nama = '', keadaan = '' } = {}) {
  const kotak = $(`#unggah-${jenis}`);
  kotak.classList.toggle('terisi', keadaan === 'terisi');
  kotak.classList.toggle('proses', keadaan === 'proses');
  kotak.classList.toggle('perlu', keadaan === 'perlu');
  $(`#sub-${jenis}`).textContent = nama || 'Word (.docx) atau PDF';
  $(`#aksi-${jenis}`).textContent = keadaan === 'terisi' ? 'Ganti file' : keadaan === 'proses' ? 'Membaca…' : 'Pilih file';
}

// ---------- WhatsApp ----------

function linkWa(teks) {
  return `https://wa.me/${CONFIG.nomorWa}?text=${encodeURIComponent(teks)}`;
}

function estimasiHarga(halaman) {
  const t = CONFIG.tarif;
  return Math.max(t.rapikanMinimum, Math.ceil((halaman * t.rapikanPerHalaman) / 1000) * 1000);
}

function perbaruiWa() {
  const L = state.laporan;
  const nama = state.aturan?.nama || '-';
  $('#harga-catatan').textContent = rupiah(CONFIG.tarif.fileBercatatan);
  $('#wa-kode').href = linkWa(`Halo ${CONFIG.namaLayanan}, saya mau beli kode file bercatatan.\nPedoman: ${nama}\n${L ? `Skor format: ${L.skor}/100 (${L.temuan.length} temuan)` : ''}`);
  if (!L) return;
  const hal = L.statistik.estimasiHalaman;
  const harga = estimasiHarga(hal);
  $('#wa-estimasi').textContent = `Estimasi ${rupiah(harga)} (±${hal} halaman)`;
  const utama = L.temuan.slice(0, 5).map((t) => `- ${t.judul}`).join('\n');
  $('#wa-rapikan').href = linkWa(
    `Halo ${CONFIG.namaLayanan}, saya mau dirapikan format skripsinya.\n` +
    `Pedoman: ${nama}\nSkor format: ${L.skor}/100 (${L.temuan.length} temuan)\nPerkiraan: ±${hal} halaman (estimasi ${rupiah(harga)})\n` +
    (utama ? `Temuan utama:\n${utama}` : ''),
  );
}

// ---------- skripsi ----------

async function pilihSkripsi(file) {
  pesan('');
  if (!file) return;
  const ext = ekstensi(file.name);
  if (ext === 'doc') return pesan('File .doc lama belum bisa dicek. Buka di Word lalu Save As → Word Document (.docx), atau simpan sebagai PDF.', 'galat');
  if (!['docx', 'pdf'].includes(ext)) return pesan('File skripsi harus Word (.docx) atau PDF.', 'galat');
  if (file.size > 60 * MB) return pesan('File terlalu besar (lebih dari 60 MB). Kompres gambar di Word (File → Compress Pictures) lalu coba lagi.', 'galat');
  state.skripsi = { jenis: ext, buffer: await file.arrayBuffer(), nama: file.name };
  setKotak('skripsi', { nama: file.name, keadaan: 'terisi' });
  jalankanCek();
}

// ---------- pedoman ----------

async function teksDariDocx(buffer) {
  if (!window.JSZip) throw ramah('Halaman belum termuat sempurna. Muat ulang halaman lalu coba lagi.');
  let zip;
  try { zip = await window.JSZip.loadAsync(buffer); } catch { throw ramah('File pedoman Word tidak bisa dibuka. Simpan ulang sebagai .docx atau PDF.'); }
  const f = zip.file('word/document.xml');
  if (!f) throw ramah('File pedoman bukan dokumen Word yang valid.');
  const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
  const baris = semua(doc, 'p').map((p) => semua(p, 't').map((t) => t.textContent).join('')).filter((t) => t.trim());
  return `--- Dokumen Word ---\n${baris.join('\n')}`;
}

function tampilkanAturan() {
  const a = state.aturan;
  $('#aturan-kotak').hidden = !a;
  if (!a) return;
  $('#nama-pedoman').textContent = a.nama || 'Pedoman kampus';
  $('#ringkas-aturan').textContent = ringkasAturan(a) || 'Aturan format terbaca.';
}

async function prosesPedoman(file) {
  pesan('');
  const ext = ekstensi(file.name);
  if (ext === 'doc') return pesan('File pedoman .doc lama belum bisa dibaca. Simpan ulang sebagai .docx atau PDF.', 'galat');
  if (!['docx', 'pdf'].includes(ext)) return pesan('File pedoman harus Word (.docx) atau PDF.', 'galat');
  if (file.size > 15 * MB) return pesan('File pedoman maksimal 15 MB. Kirim pedomannya lewat WhatsApp kalau lebih besar.', 'galat');
  setKotak('pedoman', { nama: file.name, keadaan: 'proses' });
  try {
    status('Membaca pedoman…');
    const buf = await file.arrayBuffer();
    const hash = await sha256(buf);
    let aturan = state.pedomanSesi.get(hash);
    if (!aturan) {
      const body = { hash, namaFile: file.name.slice(0, 120) };
      if (ext === 'docx') {
        body.teks = (await teksDariDocx(buf)).slice(0, 3_500_000);
      } else {
        const { bacaTeksPdf, gabungDenganPenanda } = await import('./pagemap.js');
        const halaman = await bacaTeksPdf(buf, { onProgres: (n, t) => status(`Membaca pedoman… halaman ${n} dari ${t}`) });
        const jumlahHuruf = halaman.join('').replace(/\s/g, '').length;
        if (jumlahHuruf < 500 && halaman.length > 2) {
          if (file.size > 3 * MB) throw ramah('Pedoman ini berupa hasil scan dan terlalu besar untuk dibaca. Upload versi Word-nya, atau kirim pedoman lewat WhatsApp.');
          body.pdfBase64 = await keBase64(buf);
        } else {
          body.teks = gabungDenganPenanda(halaman).teks;
        }
      }
      status('AI sedang membaca pedoman…', [[6000, 'Menyusun aturan format…'], [18000, 'Hampir selesai, mohon tunggu…'], [40000, 'Masih memproses, pedoman ini cukup panjang…']]);
      const r = await api('/api/baca-pedoman', { method: 'POST', body: JSON.stringify(body) }, 75000);
      if (!r.ok) throw ramah(r.data.error || 'Pedoman belum bisa dibaca otomatis. Coba file lain, atau kirim pedoman lewat WhatsApp.');
      aturan = r.data.aturan;
      state.pedomanSesi.set(hash, aturan);
    }
    status('');
    state.pedoman = { nama: file.name, hash };
    state.aturan = aturan;
    setKotak('pedoman', { nama: file.name, keadaan: 'terisi' });
    tampilkanAturan();
    perbaruiWa();
    if (state.skripsi) jalankanCek();
    else pesan('Aturan pedoman sudah terbaca. Sekarang pilih file skripsi (kotak 1).', 'sukses');
  } catch (e) {
    status('');
    setKotak('pedoman', state.pedoman ? { nama: state.pedoman.nama, keadaan: 'terisi' } : {});
    tanganiGalat(e, 'Pedoman belum bisa dibaca otomatis. Coba file lain, atau kirim pedoman lewat WhatsApp.');
  }
}

// ---------- cek ----------

async function jalankanCek() {
  if (!state.skripsi || state.sibuk) return;
  if (!state.aturan) {
    if (!$('#unggah-pedoman').classList.contains('proses')) {
      setKotak('pedoman', { keadaan: 'perlu' });
      pesan('File skripsi siap. Sekarang pilih file pedoman kampus (kotak 2), pengecekan langsung berjalan.', 'info');
    }
    return;
  }
  state.sibuk = true;
  pesan('');
  status('Memeriksa format skripsi…');
  try {
    await new Promise((r) => setTimeout(r, 30));
    if (state.skripsi.jenis === 'docx') {
      if (!window.JSZip) throw ramah('Halaman belum termuat sempurna. Muat ulang halaman lalu coba lagi.');
      state.laporan = await periksaDocx(state.skripsi.buffer, state.aturan);
    } else {
      const [{ periksaPdf }, { muatPdfjs }] = await Promise.all([import('./checker-pdf.js'), import('./pagemap.js')]);
      state.laporan = await periksaPdf(state.skripsi.buffer, state.aturan, {
        pdfjs: await muatPdfjs(),
        onProgres: (n, t) => status(`Memeriksa format skripsi… halaman ${n} dari ${t}`),
      });
    }
    status('');
    tampilkanHasil();
  } catch (e) {
    status('');
    state.laporan = null;
    $('#hasil').hidden = true;
    tanganiGalat(e, 'Terjadi kesalahan saat memeriksa file. Coba simpan ulang lalu pilih lagi, atau kirim file lewat WhatsApp untuk dicek manual.');
  } finally {
    state.sibuk = false;
  }
}

// ---------- laporan ----------

const KATEGORI = [['Halaman', 'A4'], ['Huruf', 'Aa'], ['Paragraf', '¶'], ['Judul', 'H1'], ['Tabel & Gambar', '▦'], ['Lainnya', '⋯']];
const LABEL_TINGKAT = { berat: 'Penting', sedang: 'Sedang', ringan: 'Ringan' };

function halamanTemuan(t) {
  const L = state.laporan;
  if (L.jenis === 'pdf') return t.halaman || [];
  return [...new Set(t.paragraf.map((i) => L.halamanPerkiraan[i]).filter(Boolean))].sort((a, b) => a - b);
}

function labelLokasi(t) {
  const hal = halamanTemuan(t);
  if (!hal.length) return 'Berlaku untuk seluruh dokumen';
  const pasti = state.laporan.jenis === 'pdf';
  const tampil = hal.slice(0, 6).map((x) => (pasti ? x : '±' + x)).join(', ');
  return `Halaman ${tampil}${hal.length > 6 ? ` dan ${hal.length - 6} halaman lain` : ''}`;
}

function animasiSkor(target) {
  const el = $('#skor');
  const lingkar = $('#skor-lingkar');
  const mulai = performance.now();
  const langkah = (t) => {
    const k = Math.min(1, (t - mulai) / 900);
    const v = Math.round(target * (1 - Math.pow(1 - k, 3)));
    el.textContent = v;
    lingkar.style.setProperty('--nilai', v);
    if (k < 1) requestAnimationFrame(langkah);
  };
  requestAnimationFrame(langkah);
}

const ada = (v) => v !== null && v !== undefined;
const cm = (v, kira) => (ada(v) ? `${kira ? '±' : ''}${fmt(v)} cm` : '-');
const pt = (v) => (ada(v) ? `${fmt(v)} pt` : '-');

function barisBanding() {
  const a = state.aturan;
  const u = state.laporan.ukur || {};
  const kira = state.laporan.jenis === 'pdf';
  const jb = a.judulBab || {};
  const sifatJudul = [jb.kapital && 'kapital', jb.tengah && 'tengah', jb.tebal && 'tebal', jb.ukuran && `${fmt(jb.ukuran)} pt`].filter(Boolean);
  const m = a.margin || {};
  const um = u.margin || {};
  const rows = [
    ['Ukuran kertas', a.kertas, u.kertas, ['kertas']],
    ['Margin atas', m.atas && cm(m.atas), cm(um.atas, kira), ['margin-atas']],
    ['Margin bawah', m.bawah && cm(m.bawah), cm(um.bawah, kira), ['margin-bawah']],
    ['Margin kiri', m.kiri && cm(m.kiri), cm(um.kiri, kira), ['margin-kiri']],
    ['Margin kanan', m.kanan && cm(m.kanan), cm(um.kanan, kira), ['margin-kanan']],
    ['Jenis huruf', a.font, u.font, ['font']],
    ['Ukuran huruf', a.ukuran && pt(a.ukuran), pt(u.ukuran), ['ukuran']],
    ['Spasi baris', a.spasi && fmt(a.spasi), u.spasi ? fmt(u.spasi) : '-', ['spasi']],
    ['Rata kanan-kiri', a.rataKananKiri ? 'Wajib' : null, ada(u.rataPersen) ? `${u.rataPersen}% paragraf` : '-', ['rata']],
    ['Menjorok baris pertama', ada(a.indentBarisPertama) ? cm(a.indentBarisPertama) : null, ada(u.indent) ? cm(u.indent, kira) : '-', ['indent']],
    ['Jarak antarparagraf', ada(a.jarakParagraf) && !kira ? pt(a.jarakParagraf) : null, pt(u.jarak), ['jarak-paragraf']],
    ['Judul bab', sifatJudul.length ? sifatJudul.join(', ') : null, u.judulBab ? `${u.judulBab} judul ditemukan` : 'tidak ditemukan', ['judul-kapital', 'judul-tengah', 'judul-tebal', 'judul-ukuran', 'bab-halaman-baru']],
    ['Nomor halaman', a.nomorHalaman ? 'Wajib' : null, u.nomorHalaman ? 'Ada' : 'Tidak ada', ['nomor-halaman']],
  ];
  rows.splice(12, 0, ['Bab di halaman baru', jb.halamanBaru ? 'Wajib' : null, u.judulBab ? 'Dicek' : '-', ['bab-halaman-baru']]);
  rows[11][3] = ['judul-kapital', 'judul-tengah', 'judul-tebal', 'judul-ukuran'];
  const ids = new Set(state.laporan.temuan.map((t) => t.id));
  return rows.filter((r) => r[1]).map(([label, ped, dok, cekId]) => {
    const ok = !cekId.some((x) => ids.has(x));
    // margin bawah dari PDF hanya perkiraan (halaman jarang terisi penuh), jadi tampilkan kesimpulannya saja
    if (kira && label === 'Margin bawah' && ok) dok = 'Sesuai';
    if (label === 'Judul bab' || label === 'Bab di halaman baru') dok = ok ? 'Sesuai' : (label === 'Judul bab' ? 'Ada yang belum' : 'Ada yang belum');
    return { label, ped, dok, ok };
  });
}

function tampilkanBanding(rows) {
  const tb = $('#banding');
  tb.replaceChildren(...rows.map((r) => h('li', { class: r.ok ? 'ok' : 'salah' },
    h('span', { class: 'tanda', 'aria-hidden': 'true' }, r.ok ? '✓' : '✕'),
    h('div', { class: 'b-teks' }, h('strong', {}, r.label), h('small', {}, `Pedoman: ${r.ped}`)),
    h('span', { class: 'b-nilai' }, h('span', { class: 'sr' }, r.ok ? 'Sesuai. Skripsi Anda: ' : 'Belum sesuai. Skripsi Anda: '), r.dok ?? '-'),
  )));
  if (!rows.length) tb.append(h('li', {}, 'Pedoman tidak menyebutkan aturan yang bisa dibandingkan.'));
  $('#info-ukur').textContent = state.laporan.jenis === 'pdf'
    ? 'Nilai bertanda ± diukur dari posisi teks di PDF, jadi bisa selisih sedikit dari pengaturan di Word.'
    : 'Nilai diambil dari pengaturan yang paling banyak dipakai di isi skripsi.';
}

function tampilkanPeta() {
  const L = state.laporan;
  const total = Math.min(400, L.jenis === 'pdf' ? L.statistik.halaman : Math.max(1, ...L.halamanPerkiraan));
  const perHal = new Map();
  for (const t of L.temuan) for (const p of halamanTemuan(t)) {
    if (!perHal.has(p)) perHal.set(p, []);
    perHal.get(p).push(t);
  }
  const peta = $('#peta');
  peta.replaceChildren();
  const detail = $('#peta-detail');
  detail.hidden = true;
  for (let p = 1; p <= total; p++) {
    const daftar = perHal.get(p) || [];
    const n = daftar.length;
    const tingkat = Math.min(3, n);
    peta.append(h('button', {
      type: 'button', role: 'listitem', class: `hal l${tingkat}`,
      'aria-label': `Halaman ${p}: ${n ? `${n} temuan` : 'bersih'}`,
      onclick: (ev) => {
        peta.querySelectorAll('.hal.aktif').forEach((x) => x.classList.remove('aktif'));
        ev.currentTarget.classList.add('aktif');
        detail.replaceChildren(
          h('strong', {}, `Halaman ${L.jenis === 'pdf' ? '' : '±'}${p}`),
          n ? h('ul', {}, daftar.map((t) => h('li', {}, h('span', { class: `tingkat ${t.tingkat}` }, LABEL_TINGKAT[t.tingkat]), t.judul)))
            : h('p', {}, 'Tidak ada temuan di halaman ini.'),
        );
        detail.hidden = false;
      },
    }, String(p)));
  }
  const umum = L.temuan.filter((t) => !halamanTemuan(t).length).length;
  $('#peta-info').textContent = `Makin gelap, makin banyak temuan di halaman itu. Ketuk kotak halaman untuk melihat temuannya.${umum ? ` ${umum} temuan lain berlaku untuk seluruh dokumen (misalnya margin).` : ''}${L.jenis === 'pdf' ? '' : ' Nomor halaman perkiraan.'}`;
}

function tampilkanHasil() {
  const L = state.laporan;
  $('#hasil').hidden = false;
  const tgl = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#laporan-meta').replaceChildren(
    h('span', {}, ikon('i-file'), state.skripsi.nama),
    h('span', {}, ikon('i-buku'), state.aturan.nama || state.pedoman?.nama || 'Pedoman kampus'),
    h('span', {}, tgl),
  );
  const lingkar = $('#skor-lingkar');
  lingkar.className = 'skor-lingkar ' + (L.skor >= 80 ? 'tinggi' : L.skor >= 50 ? 'sedang' : 'rendah');
  lingkar.setAttribute('aria-label', `Skor format ${L.skor} dari 100`);
  animasiSkor(L.skor);
  $('#skor-label').textContent = L.skor >= 90 ? 'Sudah rapi' : L.skor >= 70 ? 'Hampir rapi' : L.skor >= 40 ? 'Perlu dirapikan' : 'Banyak yang perlu dirapikan';
  $('#skor-ringkas').textContent = L.temuan.length ? `${L.temuan.length} hal belum sesuai pedoman.` : 'Format sudah sesuai pedoman.';
  const hitung = { berat: 0, sedang: 0, ringan: 0 };
  for (const t of L.temuan) hitung[t.tingkat]++;
  $('#ringkas-tingkat').replaceChildren(...(L.temuan.length
    ? Object.entries(hitung).filter(([, n]) => n).map(([k, n]) => h('span', { class: `chip ${k}` }, `${n} ${LABEL_TINGKAT[k].toLowerCase()}`))
    : [h('span', { class: 'chip ok' }, 'Semua lolos')]));
  const rows = barisBanding();
  const sesuai = rows.filter((r) => r.ok).length;
  $('#statistik').replaceChildren(
    h('div', {}, h('b', {}, `${sesuai}/${rows.length}`), h('span', {}, 'aturan sesuai')),
    h('div', {}, h('b', {}, `${L.jenis === 'pdf' ? '' : '±'}${L.statistik.estimasiHalaman}`), h('span', {}, 'halaman')),
    h('div', {}, h('b', {}, L.jenis === 'pdf' ? 'PDF' : 'Word'), h('span', {}, 'format file')),
  );

  tampilkanBanding(rows);
  tampilkanPeta();

  const ol = $('#temuan-utama');
  ol.replaceChildren();
  for (const t of L.temuan.slice(0, 3)) {
    ol.append(h('li', {},
      h('strong', {}, t.judul),
      h('p', {}, t.pesan),
      h('p', { class: 'cara' }, h('b', {}, 'Cara: '), t.saran),
      h('span', { class: 'lokasi' }, labelLokasi(t))));
  }
  if (!L.temuan.length) ol.append(h('li', { class: 'semua-ok' }, 'Semua pemeriksaan lolos. Tetap baca ulang naskah sebelum dicetak.'));
  $('#info-halaman').textContent = L.jenis === 'pdf'
    ? 'Nomor halaman sesuai urutan halaman di file PDF.'
    : 'Nomor halaman bertanda ± adalah perkiraan. Untuk nomor pasti, upload versi PDF skripsi.';

  const detail = $('#detail');
  detail.replaceChildren();
  for (const [k, ik] of KATEGORI) {
    const isi = L.temuan.filter((t) => t.kategori === k);
    if (!isi.length && L.jenis === 'pdf' && ['Tabel & Gambar', 'Lainnya'].includes(k)) continue;
    const ul = h('ul');
    for (const t of isi) {
      ul.append(h('li', {},
        h('p', {}, h('span', { class: `tingkat ${t.tingkat}` }, LABEL_TINGKAT[t.tingkat]), h('strong', {}, t.judul)),
        h('p', {}, t.pesan),
        h('p', { class: 'saran' }, h('strong', {}, 'Cara memperbaiki: '), t.saran),
        t.contoh && t.contoh.length ? h('ul', { class: 'contoh' }, t.contoh.map((c) => h('li', {}, `${c.halaman ? `${L.jenis === 'pdf' ? '' : '±'}Hal. ${c.halaman}: ` : ''}"${c.teks}"`))) : null,
        h('span', { class: 'lokasi' }, labelLokasi(t)),
      ));
    }
    if (!isi.length) ul.append(h('li', {}, h('p', { class: 'kecil redup' }, 'Tidak ada temuan di bagian ini.')));
    const kelas = isi.length ? (isi.some((t) => t.tingkat === 'berat') ? 'berat' : isi.some((t) => t.tingkat === 'sedang') ? 'sedang' : 'ringan') : 'ok';
    detail.append(h('details', { class: 'kategori' },
      h('summary', {}, h('span', { class: 'kat-ikon', 'aria-hidden': 'true' }, ik), h('span', { class: 'kat-nama' }, k),
        h('span', { class: `chip ${kelas}` }, isi.length ? `${isi.length} temuan` : 'OK'), ikon('i-panah', 'chevron')),
      ul));
  }

  const catatan = state.aturan.catatan || [];
  $('#catatan-pedoman').hidden = !catatan.length;
  $('#catatan-daftar').replaceChildren(...catatan.map((c) => h('li', {}, c)));

  const pdf = L.jenis === 'pdf';
  $('#premium-pdf').hidden = !pdf;
  $('#kode-form').hidden = pdf;
  $('#kode-status').textContent = '';

  perbaruiWa();
  $('#wa-bar').hidden = false;
  document.body.classList.add('ada-bar');
  $('#hasil').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- kode premium & file bercatatan ----------

async function tebusKode(ev) {
  ev.preventDefault();
  const el = $('#kode-status');
  const kode = $('#kode').value.trim().toUpperCase();
  if (!state.laporan || state.laporan.jenis !== 'docx') { el.textContent = 'Upload file skripsi .docx dulu.'; return; }
  if (!kode) { el.textContent = 'Masukkan kode yang Anda terima lewat WhatsApp.'; return; }
  const tombol = $('#tebus');
  tombol.disabled = true;
  el.textContent = 'Memeriksa kode…';
  try {
    const { buatFileBercatatan } = await import('./annotate.js');
    const r = await api('/api/kode', { method: 'POST', body: JSON.stringify({ kode }) });
    if (!r.ok) throw ramah(r.data.error || 'Kode tidak bisa dipakai.');
    el.textContent = 'Kode valid. Menyiapkan file bercatatan…';
    const { file, jumlahKomentar } = await buatFileBercatatan(state.skripsi.buffer, state.laporan);
    const nama = state.skripsi.nama.replace(/\.docx$/i, '') + ' - bercatatan RISETWORKS.docx';
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: nama });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    el.textContent = `Berhasil! File "${nama}" terunduh dengan ${jumlahKomentar} komentar. Sisa pemakaian kode: ${r.data.sisa}.`;
  } catch (e) {
    console.error(e);
    el.textContent = e.ramah ? e.message : 'File bercatatan gagal dibuat. Hubungi kami lewat WhatsApp, kode Anda akan kami bantu.';
  } finally {
    tombol.disabled = false;
  }
}

// ---------- pasang ----------

function pasangKotak(jenis, input, fn) {
  const el = $(`#unggah-${jenis}`);
  ['dragenter', 'dragover'].forEach((t) => el.addEventListener(t, (e) => { e.preventDefault(); el.classList.add('seret'); }));
  ['dragleave', 'drop'].forEach((t) => el.addEventListener(t, (e) => { e.preventDefault(); el.classList.remove('seret'); }));
  el.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) fn(f); });
  $(input).addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) fn(f);
  });
}

function mulai() {
  perbaruiWa();
  pasangKotak('skripsi', '#file-skripsi', pilihSkripsi);
  pasangKotak('pedoman', '#file-pedoman', prosesPedoman);
  // cegah browser membuka file kalau dijatuhkan di luar kotak
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  $('#cek-ulang').addEventListener('click', jalankanCek);
  $('#cetak').addEventListener('click', () => window.print());
  window.addEventListener('beforeprint', () => document.querySelectorAll('#detail details').forEach((d) => { d.open = true; }));
  $('#kode-form').addEventListener('submit', tebusKode);
}

mulai();
