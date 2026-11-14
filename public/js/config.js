// Pengaturan yang boleh diubah pemilik. Setelah diubah: commit & push ke main, Vercel otomatis deploy.
export const CONFIG = {
  namaLayanan: 'RISETWORKS',
  // GANTI dengan nomor WhatsApp Business milik Anda, format internasional tanpa + dan spasi.
  nomorWa: '6288212259829',
  tarif: {
    // Jasa rapikan format: harga per halaman dengan harga minimum.
    rapikanPerHalaman: 2000,
    rapikanMinimum: 75000,
    // Harga 1 kode file bercatatan (komentar Word di setiap temuan).
    fileBercatatan: 15000,
  },
};
