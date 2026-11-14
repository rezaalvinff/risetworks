import { CONFIG } from './config.js';
import { PRESET_UMUM, ringkasAturan } from './rules.js';
import { periksaDocx } from './checker.js';

const $ = (s) => document.querySelector(s);
const MB = 1024 * 1024;

const state = {
  presetId: 'umum',
  aturan: PRESET_UMUM,
  daftarPreset: [],
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

const simpanLokal = (k, v) => { try { localStorage.setItem(k, v); } catch { /* abaikan */ } };
const ambilLokal = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

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

// ---------- pedoman / preset ----------

function tampilkanPedoman() {
  const a = state.aturan;
  $('#nama-pedoman').textContent = a.nama || 'Pedoman tanpa nama';
  $('#ringkas-aturan').textContent = ringkasAturan(a);
  $('#lapor-buka').hidden = state.presetId === 'umum';
  $('#lapor-form').hidden = true;
}

function terapkanAturan(id, aturan) {
  state.presetId = id;
  state.aturan = id === 'umum' ? PRESET_UMUM : aturan;
  simpanLokal('rw-preset', id);
  tampilkanPedoman();
  perbaruiWa();
  if (state.bufferDocx) jalankanCek();
}

async function pilihPreset(id, nama, diam = false) {
  if (id === 'umum') return terapkanAturan('umum', PRESET_UMUM);
  if (!diam) status(`Memuat pedoman ${nama || ''}…`);
  try {
    const r = await api(`/api/preset?id=${encodeURIComponent(id)}`);
    if (!r.ok) throw ramah(r.data.error || 'Pedoman ini tidak bisa dimuat. Pakai pedoman umum dulu.');
    status('');
    terapkanAturan(r.data.id, r.data.aturan);
  } catch (e) {
    status('');
    if (diam) simpanLokal('rw-preset', 'umum');
    else tanganiGalat(e, 'Pedoman ini tidak bisa dimuat. Pakai pedoman umum dulu.');
  }
}

async function muatDaftarPreset() {
  try {
    const r = await api('/api/preset');
    if (r.ok && Array.isArray(r.data.preset)) state.daftarPreset = r.data.preset;
  } catch { /* daftar kosong, preset umum tetap jalan */ }
}

const normal = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

let pilihanAktif = -1;
function tampilkanHasilCari() {
  const q = normal($('#cari-pedoman').value);
  const ul = $('#hasil-cari');
  ul.replaceChildren();
  pilihanAktif = -1;
  const token = q.split(' ').filter(Boolean);
  const cocok = state.daftarPreset.filter((p) => {
    const hay = normal(`${p.nama} ${p.cari || ''}`);
    return token.every((t) => hay.includes(t));
  }).slice(0, 8);
  const opsi = [];
  if (!q || 'pedoman umum'.includes(q) || 'umum'.startsWith(q)) opsi.push({ id: 'umum', nama: PRESET_UMUM.nama });
  opsi.push(...cocok);
  for (const [k, p] of opsi.entries()) {
    ul.append(h('li', { role: 'option', id: `opsi-${k}`, 'data-id': p.id, onmousedown: (ev) => { ev.preventDefault(); pilih(p); } },
      p.nama, p.kampus ? h('small', {}, p.kampus) : p.id === 'umum' ? h('small', {}, 'TNR 12 · spasi 1,5 · margin 4-4-3-3 · cocok untuk kebanyakan kampus') : null));
  }
  if (!opsi.length || (q && !cocok.length)) {
    ul.append(h('li', { class: 'kosong' }, 'Belum ada di daftar. ',
      h('button', { type: 'button', class: 'tautan', onmousedown: (ev) => { ev.preventDefault(); bukaUploadPedoman(); } }, 'Upload PDF pedoman kampus Anda')));
  }
  ul.hidden = false;
  $('#cari-pedoman').setAttribute('aria-expanded', 'true');
}

function bukaPanelCari(buka) {
  $('#panel-cari').hidden = !buka;
  $('#ganti-pedoman').setAttribute('aria-expanded', String(buka));
  $('#ganti-pedoman').textContent = buka ? 'Tutup' : 'Ganti';
  if (buka) { $('#cari-pedoman').focus(); tampilkanHasilCari(); }
}

function tutupCari() {
  $('#hasil-cari').hidden = true;
  $('#cari-pedoman').setAttribute('aria-expanded', 'false');
}

function pilih(p) {
  $('#cari-pedoman').value = '';
  tutupCari();
  bukaPanelCari(false);
  pilihPreset(p.id, p.nama);
}

function bukaUploadPedoman() {
  tutupCari();
  bukaPanelCari(false);
  $('#opsional').open = true;
  $('#file-pedoman').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#file-pedoman').focus();
}

function pasangCari() {
  const input = $('#cari-pedoman');
  input.addEventListener('input', tampilkanHasilCari);
  input.addEventListener('focus', tampilkanHasilCari);
  input.addEventListener('blur', () => setTimeout(tutupCari, 150));
  input.addEventListener('keydown', (e) => {
    const item = [...$('#hasil-cari').querySelectorAll('li[role="option"]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!item.length) return;
      pilihanAktif = (pilihanAktif + (e.key === 'ArrowDown' ? 1 : -1) + item.length) % item.length;
      item.forEach((li, k) => li.setAttribute('aria-selected', k === pilihanAktif ? 'true' : 'false'));
      input.setAttribute('aria-activedescendant', item[pilihanAktif].id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const li = item[pilihanAktif >= 0 ? pilihanAktif : 0];
      if (li) li.dispatchEvent(new MouseEvent('mousedown'));
    } else if (e.key === 'Escape') tutupCari();
  });
}

// ---------- baca PDF pedoman (5.1) ----------

async function prosesPedoman(file) {
  pesan('');
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return pesan('Pedoman harus berupa file PDF.', 'galat');
  if (file.size > 15 * MB) return pesan('PDF pedoman maksimal 15 MB. Pakai pedoman umum dulu atau kirim pedomannya lewat WhatsApp.', 'galat');
  const simpanPublik = $('#simpan-publik').checked;
  try {
    status('Membaca pedoman…');
    const buf = await file.arrayBuffer();
    const hash = await sha256(buf);
    const ada = await api(`/api/preset?id=${hash}`);
    if (ada.ok && ada.data.aturan) {
      status('');
      terapkanAturan(ada.data.id, ada.data.aturan);
      pesan('Pedoman ini sudah pernah dibaca, aturannya langsung dipakai.', 'sukses');
      return;
    }
    const { bacaTeksPdf, gabungDenganPenanda } = await import('./pagemap.js');
    const halaman = await bacaTeksPdf(buf, { onProgres: (n, t) => status(`Membaca pedoman… halaman ${n} dari ${t}`) });
    const jumlahHuruf = halaman.join('').replace(/\s/g, '').length;
    const body = { hash, simpanPublik, namaFile: file.name.slice(0, 120) };
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
    terapkanAturan(r.data.id, r.data.aturan);
    await muatDaftarPreset();
    pesan(r.data.publik
      ? 'Aturan pedoman berhasil dibaca dan dibagikan untuk teman satu kampus. Cek ringkasan aturan di atas.'
      : 'Aturan pedoman berhasil dibaca. Cek ringkasan aturan di atas, kalau ada yang keliru tekan "Laporkan pedoman ini salah".', 'sukses');
  } catch (e) {
    status('');
    tanganiGalat(e, 'Pedoman belum bisa dibaca otomatis, pakai preset umum dulu atau kirim pedoman lewat WhatsApp.');
  }
}

// ---------- cek dokumen ----------

async function pilihDocx(file) {
  pesan('');
  if (!file) return;
  const nama = file.name || '';
  if (/\.doc$/i.test(nama)) return pesan('File harus .docx. Kalau masih .doc, buka di Word lalu Save As .docx.', 'galat');
  if (/\.pdf$/i.test(nama)) return pesan('Yang dicek harus file Word (.docx), bukan PDF. PDF skripsi bisa ditambahkan di bagian Opsional untuk nomor halaman.', 'galat');
  if (!/\.docx$/i.test(nama)) return pesan('File harus .docx. Kalau masih .doc, buka di Word lalu Save As .docx.', 'galat');
  if (file.size > 60 * MB) return pesan('File terlalu besar (lebih dari 60 MB). Kompres gambar di Word (File → Compress Pictures) lalu coba lagi.', 'galat');
  state.namaFile = nama;
  state.bufferDocx = await file.arrayBuffer();
  state.halamanPdf = null;
  if (state.halamanPdfTeks) $('#info-pdf-skripsi').textContent = 'PDF skripsi sebelumnya akan dicocokkan lagi dengan file ini.';
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
    ? `PDF dicocokkan: ${state.halamanPdfTeks.length} halaman.`
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
    $('#info-pdf-skripsi').textContent = `PDF terbaca: ${state.halamanPdfTeks.length} halaman.`;
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
    : 'Nomor halaman bertanda ± adalah perkiraan. Untuk nomor pasti, tambahkan PDF skripsi di bagian Opsional.';

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

// ---------- lapor preset ----------

async function kirimLaporan(ev) {
  ev.preventDefault();
  const alasan = $('#lapor-alasan').value.trim();
  try {
    const r = await api('/api/lapor-preset', { method: 'POST', body: JSON.stringify({ id: state.presetId, alasan }) });
    if (!r.ok) throw ramah(r.data.error || 'Laporan gagal dikirim. Coba lagi nanti.');
    $('#lapor-form').hidden = true;
    $('#lapor-alasan').value = '';
    pesan('Terima kasih, laporan diterima. Pedoman yang dilaporkan beberapa orang akan disembunyikan otomatis.', 'sukses');
  } catch (e) {
    tanganiGalat(e, 'Laporan gagal dikirim. Coba lagi nanti.');
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

async function mulai() {
  tampilkanPedoman();
  perbaruiWa();
  pasangDropzone();
  pasangCari();
  pasangInputFile('#file-docx', pilihDocx);
  pasangInputFile('#file-pdf-skripsi', prosesPdfSkripsi);
  pasangInputFile('#file-pedoman', prosesPedoman);
  $('#cek-ulang').addEventListener('click', jalankanCek);
  $('#ganti-pedoman').addEventListener('click', () => bukaPanelCari($('#panel-cari').hidden));
  $('#kode-form').addEventListener('submit', tebusKode);
  $('#lapor-buka').addEventListener('click', () => { $('#lapor-form').hidden = false; $('#lapor-alasan').focus(); });
  $('#lapor-batal').addEventListener('click', () => { $('#lapor-form').hidden = true; });
  $('#lapor-form').addEventListener('submit', kirimLaporan);

  await muatDaftarPreset();
  const terakhir = ambilLokal('rw-preset');
  if (terakhir && terakhir !== 'umum' && /^[a-f0-9]{64}$/.test(terakhir) && !state.bufferDocx) {
    const p = state.daftarPreset.find((x) => x.id === terakhir);
    pilihPreset(terakhir, p ? p.nama : '', true);
  }
}

mulai();
