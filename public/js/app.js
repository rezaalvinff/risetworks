import { CONFIG } from './config.js';
import { PRESET_UMUM, ringkasAturan } from './rules.js';
import { periksaDocx } from './checker.js';

const $ = (s) => document.querySelector(s);
const MB = 1024 * 1024;

const state = {
  presetId: 'umum',
  aturan: PRESET_UMUM,
  pedomanSesi: new Map(), // pedoman yang sudah dibaca di tab ini (tidak disimpan di mana pun)
  namaFile: '',
  bufferDocx: null,
  laporan: null,
  halamanPdfTeks: null,
  halamanPdf: null,
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

function ramah(pesan) {
  const e = new Error(pesan);
  e.ramah = true;
  return e;
}


const rupiah = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');

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
  const nama = state.aturan.nama || 'Pedoman umum';
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

// ---------- pedoman ----------

function tampilkanPedoman() {
  const a = state.aturan;
  const umum = state.presetId === 'umum';
  $('#nama-pedoman').textContent = umum ? 'Pedoman umum' : (a.nama || 'Pedoman kampus');
  $('#ringkas-aturan').textContent = ringkasAturan(a);
  $('#pakai-umum').hidden = umum;
  $('#slot-pedoman').classList.toggle('terisi', !umum);
  $('#slot-pedoman-aksi').textContent = umum ? 'Pilih' : 'Ganti';
  if (umum) $('#slot-pedoman-sub').textContent = 'Kosongkan untuk memakai pedoman umum';
}

function terapkanAturan(id, aturan) {
  state.presetId = id;
  state.aturan = id === 'umum' ? PRESET_UMUM : aturan;
  tampilkanPedoman();
  perbaruiWa();
  if (state.bufferDocx) jalankanCek();
}

// ---------- baca PDF pedoman (5.1) ----------

async function prosesPedoman(file) {
  pesan('');
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return pesan('Pedoman harus berupa file PDF.', 'galat');
  if (file.size > 15 * MB) return pesan('PDF pedoman maksimal 15 MB. Pakai pedoman umum dulu atau kirim pedomannya lewat WhatsApp.', 'galat');
  try {
    status('Membaca pedoman…');
    const buf = await file.arrayBuffer();
    const hash = await sha256(buf);
    $('#slot-pedoman-sub').textContent = file.name;
    if (state.pedomanSesi.has(hash)) {
      status('');
      terapkanAturan(hash, state.pedomanSesi.get(hash));
      pesan('Aturan pedoman ini sudah dibaca tadi, langsung dipakai.', 'sukses');
      return;
    }
    const { bacaTeksPdf, gabungDenganPenanda } = await import('./pagemap.js');
    const halaman = await bacaTeksPdf(buf, { onProgres: (n, t) => status(`Membaca pedoman… halaman ${n} dari ${t}`) });
    const jumlahHuruf = halaman.join('').replace(/\s/g, '').length;
    const body = { hash, namaFile: file.name.slice(0, 120) };
    if (jumlahHuruf < 500 && halaman.length > 2) {
      if (file.size > 3 * MB) throw ramah('Pedoman ini berupa hasil scan dan terlalu besar. Pakai preset umum atau kirim pedomannya lewat WhatsApp.');
      body.pdfBase64 = await keBase64(buf);
    } else {
      body.teks = gabungDenganPenanda(halaman).teks;
    }
    status('AI sedang membaca pedoman…', [[6000, 'Menyusun aturan format…'], [18000, 'Hampir selesai, mohon tunggu…'], [40000, 'Masih memproses, pedoman ini cukup panjang…']]);
    const r = await api('/api/baca-pedoman', { method: 'POST', body: JSON.stringify(body) }, 75000);
    status('');
    if (!r.ok) throw ramah(r.data.error || 'Pedoman belum bisa dibaca otomatis, pakai preset umum dulu atau kirim pedoman lewat WhatsApp.');
    state.pedomanSesi.set(hash, r.data.aturan);
    terapkanAturan(hash, r.data.aturan);
    $('#slot-pedoman-sub').textContent = file.name;
    pesan('Aturan pedoman berhasil dibaca. Cek ringkasannya di bawah kotak upload, pastikan sesuai dengan pedoman Anda.', 'sukses');
  } catch (e) {
    status('');
    tampilkanPedoman();
    tanganiGalat(e, 'Pedoman belum bisa dibaca otomatis, pakai pedoman umum dulu atau kirim pedoman lewat WhatsApp.');
  }
}

// ---------- cek dokumen ----------

async function pilihDocx(file) {
  pesan('');
  if (!file) return;
  const nama = file.name || '';
  if (/\.doc$/i.test(nama)) return pesan('File harus .docx. Kalau masih .doc, buka di Word lalu Save As .docx.', 'galat');
  if (/\.pdf$/i.test(nama)) return pesan('Yang dicek harus file Word (.docx), bukan PDF. PDF skripsi bisa ditambahkan di kotak "PDF skripsi" untuk nomor halaman.', 'galat');
  if (!/\.docx$/i.test(nama)) return pesan('File harus .docx. Kalau masih .doc, buka di Word lalu Save As .docx.', 'galat');
  if (file.size > 60 * MB) return pesan('File terlalu besar (lebih dari 60 MB). Kompres gambar di Word (File → Compress Pictures) lalu coba lagi.', 'galat');
  state.namaFile = nama;
  state.bufferDocx = await file.arrayBuffer();
  state.halamanPdf = null;
  $('#dz-sub').textContent = `${nama} · ketuk untuk ganti file`;
  $('#dropzone').classList.add('terisi');
  $('#dropzone .dz-judul').textContent = 'File terpilih';
  $('#dropzone .dz-tombol').textContent = 'Ganti file';
  jalankanCek();
}

async function jalankanCek() {
  if (!state.bufferDocx || state.sibuk) return;
  state.sibuk = true;
  status('Memeriksa format…');
  try {
    await new Promise((r) => setTimeout(r, 30)); // beri waktu UI menampilkan status
    if (!window.JSZip) throw ramah('Halaman belum termuat sempurna. Muat ulang halaman lalu coba lagi.');
    state.laporan = await periksaDocx(state.bufferDocx, state.aturan);
    if (state.halamanPdfTeks) await cocokkanPdf();
    status('');
    tampilkanHasil();
  } catch (e) {
    status('');
    state.laporan = null;
    $('#hasil').hidden = true;
    tanganiGalat(e, 'Terjadi kesalahan saat memeriksa file. Coba simpan ulang di Word lalu pilih lagi, atau kirim file lewat WhatsApp untuk dicek manual.');
  } finally {
    state.sibuk = false;
  }
}

async function cocokkanPdf() {
  const { petakanHalaman } = await import('./pagemap.js');
  state.halamanPdf = petakanHalaman(state.halamanPdfTeks, state.laporan.paragrafTeks);
  const cocok = state.halamanPdf.filter(Boolean).length;
  $('#info-pdf-skripsi').textContent = cocok
    ? `${state.namaPdf} · cocok, ${state.halamanPdfTeks.length} halaman`
    : 'PDF tidak cocok dengan file .docx. Pastikan PDF dibuat dari file yang sama.';
  if (!cocok) state.halamanPdf = null;
}

async function prosesPdfSkripsi(file) {
  pesan('');
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return pesan('Pilih file PDF skripsi.', 'galat');
  try {
    status('Membaca PDF skripsi…');
    const { bacaTeksPdf } = await import('./pagemap.js');
    state.halamanPdfTeks = await bacaTeksPdf(await file.arrayBuffer(), { onProgres: (n, t) => status(`Membaca PDF skripsi… halaman ${n} dari ${t}`) });
    status('');
    state.namaPdf = file.name;
    $('#info-pdf-skripsi').textContent = `${file.name} · ${state.halamanPdfTeks.length} halaman`;
    $('#slot-pdf').classList.add('terisi');
    $('#slot-pdf-aksi').textContent = 'Ganti';
    if (state.laporan) { await cocokkanPdf(); tampilkanHasil(); }
  } catch (e) {
    status('');
    tanganiGalat(e, 'PDF skripsi tidak bisa dibaca. Lokasi temuan tetap memakai perkiraan halaman.');
  }
}

// ---------- tampilan hasil ----------

function labelLokasi(t) {
  if (!t.paragraf.length) return 'Berlaku untuk seluruh dokumen';
  const pakaiPdf = !!state.halamanPdf;
  const hal = [...new Set(t.paragraf.map((i) => (pakaiPdf ? state.halamanPdf[i] : state.laporan.halamanPerkiraan[i])).filter(Boolean))].sort((a, b) => a - b);
  if (!hal.length) return '';
  const tampil = hal.slice(0, 6).map((x) => (pakaiPdf ? x : '±' + x)).join(', ');
  return `Halaman ${tampil}${hal.length > 6 ? ` dan ${hal.length - 6} halaman lain` : ''}`;
}

const KATEGORI = [
  ['Halaman', 'A4'], ['Huruf', 'Aa'], ['Paragraf', '¶'], ['Judul', 'H1'], ['Tabel & Gambar', '▦'], ['Lainnya', '⋯'],
];
const LABEL_TINGKAT = { berat: 'Penting', sedang: 'Sedang', ringan: 'Ringan' };

function animasiSkor(target) {
  const el = $('#skor');
  const lingkar = $('#skor-lingkar');
  const mulai = performance.now();
  const durasi = 900;
  const langkah = (t) => {
    const k = Math.min(1, (t - mulai) / durasi);
    const v = Math.round(target * (1 - Math.pow(1 - k, 3)));
    el.textContent = v;
    lingkar.style.setProperty('--nilai', v);
    if (k < 1) requestAnimationFrame(langkah);
  };
  requestAnimationFrame(langkah);
}

function tampilkanHasil() {
  const L = state.laporan;
  $('#hasil').hidden = false;
  const lingkar = $('#skor-lingkar');
  lingkar.className = 'skor-lingkar ' + (L.skor >= 80 ? 'tinggi' : L.skor >= 50 ? 'sedang' : 'rendah');
  lingkar.setAttribute('aria-label', `Skor format ${L.skor} dari 100`);
  animasiSkor(L.skor);
  $('#skor-label').textContent = L.skor >= 90 ? 'Sudah rapi' : L.skor >= 70 ? 'Hampir rapi' : L.skor >= 40 ? 'Perlu dirapikan' : 'Banyak yang perlu dirapikan';
  $('#skor-ringkas').textContent = L.temuan.length
    ? `${L.temuan.length} hal perlu diperbaiki sesuai ${state.presetId === 'umum' ? 'pedoman umum' : 'pedoman kampus'}.`
    : 'Format sudah sesuai pedoman yang dipilih.';
  const hitung = { berat: 0, sedang: 0, ringan: 0 };
  for (const t of L.temuan) hitung[t.tingkat]++;
  $('#ringkas-tingkat').replaceChildren(...(L.temuan.length
    ? Object.entries(hitung).filter(([, n]) => n).map(([k, n]) => h('span', { class: `chip ${k}` }, `${n} ${LABEL_TINGKAT[k].toLowerCase()}`))
    : [h('span', { class: 'chip ok' }, 'Semua lolos')]));

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

  $('#info-halaman').textContent = state.halamanPdf
    ? 'Nomor halaman diambil dari PDF skripsi (urutan halaman di file PDF).'
    : 'Nomor halaman bertanda ± adalah perkiraan. Untuk nomor pasti, tambahkan PDF skripsi di kotak "PDF skripsi" di atas.';

  const detail = $('#detail');
  detail.replaceChildren();
  for (const [k, ikon] of KATEGORI) {
    const isi = L.temuan.filter((t) => t.kategori === k);
    const ul = h('ul');
    for (const t of isi) {
      ul.append(h('li', {},
        h('p', {}, h('span', { class: `tingkat ${t.tingkat}` }, LABEL_TINGKAT[t.tingkat]), h('strong', {}, t.judul)),
        h('p', {}, t.pesan),
        h('p', { class: 'saran' }, h('strong', {}, 'Cara memperbaiki: '), t.saran),
        t.contoh && t.contoh.length ? h('ul', { class: 'contoh' }, t.contoh.map((c) => {
          const hal = state.halamanPdf ? state.halamanPdf[c.i] : c.halaman;
          return h('li', {}, `${hal ? (state.halamanPdf ? `Hal. ${hal}` : `±Hal. ${hal}`) + ': ' : ''}"${c.teks}"`);
        })) : null,
        h('span', { class: 'lokasi' }, labelLokasi(t)),
      ));
    }
    if (!isi.length) ul.append(h('li', {}, h('p', { class: 'kecil redup' }, 'Tidak ada temuan di bagian ini.')));
    const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('class', 'chevron');
    chevron.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-panah');
    chevron.append(use);
    detail.append(h('details', { class: 'kategori' },
      h('summary', {}, h('span', { class: 'kat-ikon', 'aria-hidden': 'true' }, ikon), h('span', { class: 'kat-nama' }, k),
        h('span', { class: 'chip ' + (isi.length ? (isi.some((t) => t.tingkat === 'berat') ? 'berat' : isi.some((t) => t.tingkat === 'sedang') ? 'sedang' : 'ringan') : 'ok') }, isi.length ? `${isi.length} temuan` : 'OK'),
        chevron),
      ul));
  }

  const catatan = state.aturan.catatan || [];
  $('#catatan-pedoman').hidden = !catatan.length;
  $('#catatan-daftar').replaceChildren(...catatan.map((c) => h('li', {}, c)));

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
  if (!state.laporan) { el.textContent = 'Pilih dan cek file .docx dulu.'; return; }
  if (!kode) { el.textContent = 'Masukkan kode yang Anda terima lewat WhatsApp.'; return; }
  const tombol = $('#tebus');
  tombol.disabled = true;
  el.textContent = 'Memeriksa kode…';
  try {
    const { buatFileBercatatan } = await import('./annotate.js');
    const r = await api('/api/kode', { method: 'POST', body: JSON.stringify({ kode }) });
    if (!r.ok) throw ramah(r.data.error || 'Kode tidak bisa dipakai.');
    el.textContent = 'Kode valid. Menyiapkan file bercatatan…';
    const { file, jumlahKomentar } = await buatFileBercatatan(state.bufferDocx, state.laporan, { halaman: state.halamanPdf || undefined });
    const nama = state.namaFile.replace(/\.docx$/i, '') + ' - bercatatan RISETWORKS.docx';
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

function pasangDropzone() {
  const dz = $('#dropzone');
  ['dragenter', 'dragover'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('seret'); }));
  ['dragleave', 'drop'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove('seret'); }));
  dz.addEventListener('drop', (e) => pilihDocx(e.dataTransfer.files[0]));
  // cegah browser membuka file kalau dijatuhkan di luar area
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
}

function pasangInputFile(sel, fn) {
  $(sel).addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) fn(f);
  });
}

function pasangSlot(sel, input, fn) {
  const el = $(sel);
  ['dragenter', 'dragover'].forEach((t) => el.addEventListener(t, (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('seret'); }));
  ['dragleave', 'drop'].forEach((t) => el.addEventListener(t, (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove('seret'); }));
  el.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) fn(f); });
  pasangInputFile(input, fn);
}

function mulai() {
  tampilkanPedoman();
  perbaruiWa();
  pasangDropzone();
  pasangInputFile('#file-docx', pilihDocx);
  pasangSlot('#slot-pdf', '#file-pdf-skripsi', prosesPdfSkripsi);
  pasangSlot('#slot-pedoman', '#file-pedoman', prosesPedoman);
  $('#cek-ulang').addEventListener('click', jalankanCek);
  $('#pakai-umum').addEventListener('click', () => { terapkanAturan('umum', PRESET_UMUM); pesan(''); });
  $('#kode-form').addEventListener('submit', tebusKode);
}

mulai();
