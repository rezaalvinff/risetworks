import { CONFIG } from './config.js';

const $ = (s) => document.querySelector(s);
const KUNCI = 'rw-admin';

const ambilPw = () => { try { return sessionStorage.getItem(KUNCI) || ''; } catch { return ''; } };
const simpanPw = (v) => { try { if (v) sessionStorage.setItem(KUNCI, v); else sessionStorage.removeItem(KUNCI); } catch { /* abaikan */ } };
let password = ambilPw();

function h(tag, attrs = {}, ...anak) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const a of anak.flat()) if (a !== null && a !== undefined) el.append(a instanceof Node ? a : String(a));
  return el;
}

async function api(path, opsi = {}) {
  const res = await fetch(path, {
    ...opsi,
    headers: { authorization: `Bearer ${password}`, ...(opsi.body ? { 'content-type': 'application/json' } : {}) },
  });
  let data = {};
  try { data = await res.json(); } catch { /* kosong */ }
  if (res.status === 401 || res.status === 429) {
    keluar(data.error || 'Password salah.');
    throw new Error(data.error || 'Tidak diizinkan');
  }
  if (!res.ok) throw new Error(data.error || `Gagal (${res.status})`);
  return data;
}

const tgl = (iso) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

function keluar(pesan = '') {
  password = '';
  simpanPw('');
  $('#panel').hidden = true;
  $('#masuk').hidden = false;
  $('#masuk-status').textContent = pesan;
}

async function masuk() {
  try {
    await muatKode();
    simpanPw(password);
    $('#masuk').hidden = true;
    $('#panel').hidden = false;
    muatPreset();
  } catch (e) {
    $('#masuk-status').textContent = e.message;
  }
}

async function muatKode() {
  const d = await api('/api/admin/kode');
  const tb = $('#daftar-kode');
  tb.replaceChildren(...d.kode.map((k) => {
    const kadaluarsa = new Date(k.kedaluwarsa) < new Date();
    return h('tr', {}, h('td', {}, h('code', {}, k.kode)), h('td', {}, String(k.sisa)), h('td', {}, kadaluarsa ? `${tgl(k.kedaluwarsa)} (lewat)` : tgl(k.kedaluwarsa)), h('td', {}, k.catatan || ''));
  }));
  if (!d.kode.length) tb.append(h('tr', {}, h('td', { colspan: '4' }, 'Belum ada kode.')));
}

async function muatPreset() {
  const tb = $('#daftar-preset');
  try {
    const d = await api('/api/admin/preset');
    tb.replaceChildren(...d.preset.map((p) => h('tr', {},
      h('td', {}, p.nama, p.alasan.length ? h('ul', { class: 'contoh' }, p.alasan.map((a) => h('li', {}, a))) : null),
      h('td', {}, String(p.jumlah_laporan)),
      h('td', {}, h('button', { class: 'tombol kecil' + (p.tampil ? ' sekunder' : ''), type: 'button', onclick: () => ubahPreset(p.id, !p.tampil) }, p.tampil ? 'Sembunyikan' : 'Tampilkan')),
    )));
    if (!d.preset.length) tb.append(h('tr', {}, h('td', { colspan: '3' }, 'Belum ada preset.')));
  } catch (e) {
    tb.replaceChildren(h('tr', {}, h('td', { colspan: '3' }, e.message)));
  }
}

async function ubahPreset(id, tampil) {
  try {
    await api('/api/admin/preset', { method: 'POST', body: JSON.stringify({ id, tampil }) });
    muatPreset();
  } catch (e) {
    alert(e.message);
  }
}

let pesanWa = '';
async function buatKode(ev) {
  ev.preventDefault();
  const tombol = $('#tombol-kode');
  tombol.disabled = true;
  try {
    const d = await api('/api/admin/kode', {
      method: 'POST',
      body: JSON.stringify({ pakai: Number($('#pakai').value), hari: Number($('#hari').value), catatan: $('#catatan').value }),
    });
    pesanWa = `Terima kasih, pembayaran sudah kami terima.\n\nKode file bercatatan ${CONFIG.namaLayanan}: ${d.kode}\nBisa dipakai ${d.sisa}x, berlaku sampai ${tgl(d.kedaluwarsa)}.\n\nCara pakai:\n1. Buka ${location.origin}\n2. Pilih file skripsi (.docx), tunggu hasil cek muncul\n3. Masukkan kode di bagian "File bercatatan", tekan Buat file\n4. File dengan komentar di setiap temuan akan terunduh`;
    $('#kode-baru').textContent = d.kode;
    $('#pesan-wa').textContent = pesanWa;
    $('#hasil-kode').hidden = false;
    $('#salin-status').textContent = '';
    $('#catatan').value = '';
    muatKode();
  } catch (e) {
    alert(e.message);
  } finally {
    tombol.disabled = false;
  }
}

async function salin(teks) {
  try {
    await navigator.clipboard.writeText(teks);
    $('#salin-status').textContent = 'Tersalin. Tempel di chat WhatsApp pembeli.';
  } catch {
    $('#salin-status').textContent = 'Tidak bisa menyalin otomatis. Tekan lama teks di atas lalu salin manual.';
  }
}

$('#form-masuk').addEventListener('submit', (e) => {
  e.preventDefault();
  password = $('#password').value;
  $('#password').value = '';
  masuk();
});
$('#form-kode').addEventListener('submit', buatKode);
$('#salin-wa').addEventListener('click', () => salin(pesanWa));
$('#salin-kode').addEventListener('click', () => salin($('#kode-baru').textContent));
$('#muat-kode').addEventListener('click', () => muatKode().catch((e) => alert(e.message)));
$('#muat-preset').addEventListener('click', muatPreset);
$('#keluar').addEventListener('click', () => keluar(''));

if (password) masuk();
