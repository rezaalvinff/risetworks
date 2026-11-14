// Prompt untuk Gemini: ubah isi pedoman penulisan kampus menjadi aturan format berbentuk JSON.

export function buatPrompt({ dariTeks = true, namaFile = '' } = {}) {
  return `Kamu membaca pedoman penulisan karya ilmiah (skripsi, tesis, makalah, atau artikel) dari kampus di Indonesia.
${dariTeks
    ? 'Input di bawah adalah TEKS hasil ekstrak dari file pedoman (PDF atau Word). Penanda "--- Halaman N ---" menunjukkan awal setiap halaman PDF; teks dari Word diawali "--- Dokumen Word ---". Tata letak tabel bisa berantakan, jadi baca konteksnya dengan teliti.'
    : 'Input adalah file PDF pedoman (kemungkinan hasil scan). Baca isinya dengan teliti.'}
${namaFile ? `Nama file: ${namaFile}\n` : ''}
Tugas: ambil aturan FORMAT naskah bagian isi (bukan aturan sampul, bukan aturan isi/substansi), lalu kembalikan SATU objek JSON persis dengan kunci berikut:

{
  "nama": "nama singkat pedoman, contoh: Pedoman Skripsi FISIP Universitas Padjadjaran 2023",
  "kampus": "nama lengkap kampus, contoh: Universitas Padjadjaran",
  "singkatan": "singkatan populer kampus, contoh: UNPAD (kosongkan kalau tidak yakin)",
  "fakultas": "nama fakultas/prodi kalau pedoman khusus fakultas, kalau tidak kosongkan",
  "jenis": "skripsi | tesis | disertasi | makalah | artikel | tugas akhir",
  "kertas": "A4 | Letter | F4 | null",
  "margin": { "atas": angka cm, "bawah": angka cm, "kiri": angka cm, "kanan": angka cm },
  "font": "nama huruf isi, contoh: Times New Roman",
  "ukuran": angka pt huruf isi,
  "spasi": angka spasi baris isi (1, 1.15, 1.5, 2),
  "rataKananKiri": true kalau isi harus rata kanan-kiri (justify),
  "indentBarisPertama": angka cm baris pertama paragraf menjorok (0 kalau tidak menjorok),
  "jarakParagraf": angka pt jarak tambahan antarparagraf (0 kalau tidak ada jarak tambahan),
  "judulBab": { "ukuran": angka pt, "kapital": true/false, "tengah": true/false, "tebal": true/false, "halamanBaru": true/false },
  "nomorHalaman": true kalau naskah wajib bernomor halaman,
  "catatan": ["maksimal 8 aturan format penting lain yang tidak bisa diwakili kolom di atas, kalimat pendek bahasa Indonesia, contoh: Nomor halaman bab pertama di bawah tengah, halaman lain di kanan atas"]
}

Aturan penting:
- Isi null untuk kolom yang TIDAK disebutkan di pedoman. Jangan menebak dan jangan mengisi nilai umum yang tidak tertulis.
- Satuan margin selalu cm. Kalau pedoman memakai mm atau inci, konversi ke cm.
- "Ketukan" untuk indent: 1 ketukan ≈ 0,25 cm; 5 ketukan ≈ 1,25 cm; 7 ketukan ≈ 1,75 cm.
- Kalau pedoman punya beberapa aturan (misal skripsi dan makalah), pakai aturan skripsi/tugas akhir.
- Kalau dokumen ternyata BUKAN pedoman penulisan, kembalikan {"nama": "", "catatan": ["Dokumen ini bukan pedoman penulisan"]}.
- Jawab hanya JSON, tanpa penjelasan lain.`;
}
