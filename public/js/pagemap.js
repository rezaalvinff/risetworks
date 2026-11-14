// Membaca teks PDF dengan PDF.js (di browser) dan mencocokkan paragraf .docx ke nomor halaman PDF.

let pdfjsPromise = null;

/** Muat PDF.js hanya saat dibutuhkan supaya halaman awal tetap ringan. */
export function muatPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../vendor/pdf.min.mjs').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
      return lib;
    });
  }
  return pdfjsPromise;
}

/**
 * @param {ArrayBuffer} buffer isi PDF
 * @param {{onProgres?: (halaman: number, total: number) => void, pdfjs?: any}} opsi
 * @returns {Promise<string[]>} teks per halaman
 */
export async function bacaTeksPdf(buffer, opsi = {}) {
  const pdfjs = opsi.pdfjs || (await muatPdfjs());
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)), isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (e) {
    const err = new Error(e && e.name === 'PasswordException'
      ? 'PDF ini dikunci password. Simpan ulang tanpa password lalu coba lagi.'
      : 'PDF tidak bisa dibaca. Pastikan file PDF tidak rusak.');
    err.ramah = true;
    throw err;
  }
  const halaman = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const isi = await page.getTextContent();
    let teks = '';
    for (const item of isi.items) {
      if (typeof item.str !== 'string') continue;
      teks += item.str;
      teks += item.hasEOL ? '\n' : ' ';
    }
    halaman.push(teks.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim());
    page.cleanup();
    if (opsi.onProgres) opsi.onProgres(n, pdf.numPages);
  }
  await pdf.destroy();
  return halaman;
}

/** Gabungkan teks per halaman dengan penanda halaman untuk dikirim ke AI. */
export function gabungDenganPenanda(halaman, maksByte = 3.5 * 1024 * 1024) {
  const enc = new TextEncoder();
  let hasil = '';
  let byte = 0;
  let terpotong = false;
  for (let i = 0; i < halaman.length; i++) {
    const bagian = `--- Halaman ${i + 1} ---\n${halaman[i]}\n\n`;
    const b = enc.encode(bagian).length;
    if (byte + b > maksByte) { terpotong = true; break; }
    hasil += bagian;
    byte += b;
  }
  return { teks: hasil, terpotong };
}

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

/**
 * Cocokkan paragraf ke halaman PDF.
 * @param {string[]} halamanTeks teks per halaman PDF
 * @param {string[]} paragrafTeks teks per paragraf dari checker
 * @returns {(number|null)[]} nomor halaman (mulai 1) per paragraf
 */
export function petakanHalaman(halamanTeks, paragrafTeks) {
  let gabung = '';
  const batas = []; // offset awal tiap halaman
  for (const h of halamanTeks) {
    batas.push(gabung.length);
    gabung += norm(h);
  }
  const keHalaman = (off) => {
    let lo = 0;
    let hi = batas.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (batas[mid] <= off) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const hasil = new Array(paragrafTeks.length).fill(null);
  let kursor = 0;
  for (let i = 0; i < paragrafTeks.length; i++) {
    const n = norm(paragrafTeks[i] || '');
    if (n.length < 3) continue;
    const kunci = n.slice(0, 40);
    let pos = gabung.indexOf(kunci, kursor);
    if (n.length < 12) {
      // teks pendek (mis. "BAB I") hanya dicari sedikit di depan posisi terakhir supaya tidak salah cocok
      if (pos - kursor > 3000) pos = -1;
    } else if (pos < 0) pos = gabung.indexOf(kunci);
    if (pos < 0 && n.length > 60) {
      // coba potongan tengah (awal paragraf kadang terpotong nomor/simbol)
      const tengah = n.slice(20, 60);
      pos = gabung.indexOf(tengah, kursor);
    }
    if (pos >= 0) {
      hasil[i] = keHalaman(pos);
      if (pos >= kursor) kursor = pos + Math.min(kunci.length, 10);
    }
  }
  // isi paragraf yang tidak cocok (misal baris kosong) dari tetangga sebelumnya
  let akhir = null;
  for (let i = 0; i < hasil.length; i++) {
    if (hasil[i] === null) hasil[i] = akhir;
    else akhir = hasil[i];
  }
  return hasil;
}
