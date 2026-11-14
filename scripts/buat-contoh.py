"""Membuat file contoh untuk mencoba RISETWORKS.

Hasil di folder contoh/:
  1-skripsi-banyak-salah.docx   format bawaan Word, banyak kesalahan
  1-skripsi-banyak-salah.pdf    PDF dari file yang sama (untuk fitur nomor halaman pasti)
  2-skripsi-hampir-rapi.docx    beberapa kesalahan kecil
  3-skripsi-rapi.docx           sesuai pedoman umum (skor 100)
  4-pedoman-univ-nusantara-raya.pdf  pedoman kampus fiktif untuk mencoba fitur baca pedoman (AI)

Pakai: python3 scripts/buat-contoh.py  (butuh python-docx, Pillow, LibreOffice untuk PDF)
"""
import copy
import os
import subprocess
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from PIL import Image, ImageDraw

OUT = 'contoh'
os.makedirs(OUT, exist_ok=True)

JUDUL = 'PENGARUH PENGGUNAAN APLIKASI BELAJAR DARING TERHADAP MOTIVASI BELAJAR MAHASISWA'

BAB = [
    ('BAB I', 'PENDAHULUAN', [
        ('1.1 Latar Belakang', [
            'Perkembangan teknologi informasi dalam satu dekade terakhir telah mengubah cara mahasiswa belajar. Kegiatan yang dahulu hanya berlangsung di ruang kelas kini dapat dilakukan di mana saja melalui aplikasi belajar daring yang tersedia di telepon genggam. Perubahan ini membuka peluang baru bagi perguruan tinggi untuk memperluas akses pembelajaran, sekaligus menghadirkan tantangan dalam menjaga kualitas proses belajar mahasiswa.',
            'Motivasi belajar merupakan salah satu faktor penting yang menentukan keberhasilan mahasiswa dalam menyelesaikan studi. Mahasiswa dengan motivasi yang tinggi cenderung lebih tekun, lebih aktif bertanya, dan lebih mampu mengatur waktu belajar secara mandiri. Sebaliknya, rendahnya motivasi belajar sering dikaitkan dengan menurunnya prestasi akademik dan meningkatnya angka keterlambatan kelulusan.',
            'Berdasarkan pengamatan awal di Fakultas Ekonomi dan Bisnis, sebagian besar mahasiswa telah memasang setidaknya satu aplikasi belajar daring. Namun, belum ada kajian yang secara khusus mengukur sejauh mana penggunaan aplikasi tersebut berhubungan dengan motivasi belajar mahasiswa. Oleh karena itu, penelitian ini dilakukan untuk mengisi kekosongan tersebut dengan pendekatan kuantitatif.',
        ]),
        ('1.2 Rumusan Masalah', [
            'Berdasarkan latar belakang yang telah diuraikan, rumusan masalah dalam penelitian ini adalah seberapa besar pengaruh penggunaan aplikasi belajar daring terhadap motivasi belajar mahasiswa Fakultas Ekonomi dan Bisnis, serta aspek penggunaan mana yang memberikan pengaruh paling kuat terhadap motivasi tersebut.',
        ]),
        ('1.3 Tujuan Penelitian', [
            'Penelitian ini bertujuan untuk mengetahui dan menganalisis pengaruh penggunaan aplikasi belajar daring terhadap motivasi belajar mahasiswa, serta mengidentifikasi aspek penggunaan aplikasi yang paling berkontribusi terhadap peningkatan motivasi belajar sehingga dapat menjadi bahan pertimbangan bagi pengelola program studi.',
        ]),
    ]),
    ('BAB II', 'TINJAUAN PUSTAKA', [
        ('2.1 Motivasi Belajar', [
            'Motivasi belajar dapat diartikan sebagai dorongan dari dalam maupun dari luar diri seseorang yang menggerakkan, mengarahkan, dan mempertahankan perilaku belajar. Para ahli umumnya membedakan motivasi intrinsik yang bersumber dari minat dan rasa ingin tahu, serta motivasi ekstrinsik yang dipengaruhi oleh penghargaan, nilai, atau tuntutan lingkungan sekitar mahasiswa.',
            'Indikator motivasi belajar yang sering digunakan dalam penelitian meliputi ketekunan dalam menghadapi tugas, keuletan menghadapi kesulitan, minat terhadap berbagai masalah, kecenderungan bekerja mandiri, serta kesenangan dalam mencari dan memecahkan soal. Indikator tersebut menjadi dasar penyusunan instrumen penelitian ini.',
        ]),
        ('2.2 Aplikasi Belajar Daring', [
            'Aplikasi belajar daring adalah perangkat lunak yang menyediakan materi, latihan, dan interaksi pembelajaran melalui jaringan internet. Fitur yang umum ditemui antara lain video pembelajaran, kuis interaktif, forum diskusi, pengingat jadwal belajar, dan papan peringkat yang mendorong mahasiswa untuk terus berlatih.',
            'Penelitian terdahulu menunjukkan bahwa fitur umpan balik langsung dan unsur permainan dalam aplikasi dapat meningkatkan keterlibatan pengguna. Meskipun demikian, hasil penelitian tersebut belum seragam, karena sebagian studi menemukan bahwa penggunaan yang berlebihan justru menimbulkan kejenuhan dan mengurangi fokus belajar.',
        ]),
    ]),
    ('BAB III', 'METODE PENELITIAN', [
        ('3.1 Desain Penelitian', [
            'Penelitian ini menggunakan pendekatan kuantitatif dengan desain survei. Data dikumpulkan satu kali pada periode tertentu untuk menggambarkan hubungan antara penggunaan aplikasi belajar daring sebagai variabel bebas dan motivasi belajar sebagai variabel terikat pada populasi mahasiswa aktif.',
        ]),
        ('3.2 Populasi dan Sampel', [
            'Populasi penelitian adalah seluruh mahasiswa aktif Fakultas Ekonomi dan Bisnis angkatan 2021 sampai 2023. Sampel diambil dengan teknik acak berstrata berdasarkan program studi sehingga diperoleh seratus dua puluh responden yang mewakili setiap program studi secara proporsional.',
            'Instrumen penelitian berupa kuesioner dengan skala Likert lima poin. Sebelum digunakan, kuesioner diuji validitas dan reliabilitasnya kepada tiga puluh mahasiswa di luar sampel penelitian, dan seluruh butir pernyataan dinyatakan valid serta reliabel.',
        ]),
    ]),
    ('BAB IV', 'HASIL DAN PEMBAHASAN', [
        ('4.1 Gambaran Responden', [
            'Responden penelitian terdiri atas mahasiswa dari tiga program studi dengan jumlah yang hampir seimbang. Sebagian besar responden menggunakan aplikasi belajar daring lebih dari tiga kali dalam seminggu, dengan durasi rata-rata empat puluh lima menit setiap kali penggunaan.',
        ]),
        ('4.2 Hasil Analisis Regresi', [
            'Hasil analisis regresi linear sederhana menunjukkan bahwa penggunaan aplikasi belajar daring berpengaruh positif dan signifikan terhadap motivasi belajar mahasiswa. Nilai koefisien determinasi sebesar 0,41 menunjukkan bahwa empat puluh satu persen variasi motivasi belajar dapat dijelaskan oleh penggunaan aplikasi tersebut.',
            'Temuan ini sejalan dengan teori yang menyatakan bahwa umpan balik yang cepat dan terukur dapat menumbuhkan rasa mampu pada diri mahasiswa. Namun, pengaruh tersebut perlu disertai pendampingan dosen agar penggunaan aplikasi tetap terarah pada tujuan pembelajaran mata kuliah.',
        ]),
    ]),
    ('BAB V', 'PENUTUP', [
        ('5.1 Kesimpulan', [
            'Berdasarkan hasil penelitian dan pembahasan, dapat disimpulkan bahwa penggunaan aplikasi belajar daring berpengaruh positif dan signifikan terhadap motivasi belajar mahasiswa. Aspek fitur umpan balik langsung memberikan kontribusi paling besar dibandingkan aspek lain yang diteliti.',
        ]),
        ('5.2 Saran', [
            'Program studi disarankan untuk mengintegrasikan aplikasi belajar daring ke dalam rencana pembelajaran semester, sedangkan penelitian selanjutnya disarankan menambahkan variabel lain seperti dukungan teman sebaya dan kemandirian belajar agar gambaran yang diperoleh lebih lengkap.',
        ]),
    ]),
]

PUSTAKA = [
    'Arikunto, S. (2013). Prosedur Penelitian: Suatu Pendekatan Praktik. Jakarta: Rineka Cipta.',
    'Sardiman, A. M. (2018). Interaksi dan Motivasi Belajar Mengajar. Depok: Rajawali Pers.',
    'Sugiyono. (2019). Metode Penelitian Kuantitatif, Kualitatif, dan R&D. Bandung: Alfabeta.',
    'Uno, H. B. (2016). Teori Motivasi dan Pengukurannya. Jakarta: Bumi Aksara.',
]

TABEL = [('Program Studi', 'Jumlah', 'Persentase'), ('Manajemen', '42', '35%'), ('Akuntansi', '40', '33%'), ('Ekonomi Pembangunan', '38', '32%')]


def gambar_grafik(path):
    img = Image.new('RGB', (900, 420), 'white')
    d = ImageDraw.Draw(img)
    d.line((80, 360, 860, 360), fill='black', width=3)
    d.line((80, 40, 80, 360), fill='black', width=3)
    for i, (h, label) in enumerate([(250, 'Manajemen'), (235, 'Akuntansi'), (220, 'Ekonomi Pemb.')]):
        x = 160 + i * 240
        d.rectangle((x, 360 - h, x + 140, 360), fill=(60, 60, 60))
        d.text((x + 10, 370), label, fill='black')
    img.save(path)


# ---------- helper XML ----------

def field(paragraph, instr, teks=''):
    """Sisipkan field Word (PAGE, TOC, dst.) ke paragraf."""
    def r(child):
        run = OxmlElement('w:r')
        run.append(child)
        paragraph._p.append(run)
    b = OxmlElement('w:fldChar'); b.set(qn('w:fldCharType'), 'begin'); r(b)
    it = OxmlElement('w:instrText'); it.set(qn('xml:space'), 'preserve'); it.text = f' {instr} '; r(it)
    s = OxmlElement('w:fldChar'); s.set(qn('w:fldCharType'), 'separate'); r(s)
    if teks:
        paragraph.add_run(teks)
    e = OxmlElement('w:fldChar'); e.set(qn('w:fldCharType'), 'end'); r(e)


def fonts_tnr(rpr):
    rf = rpr.find(qn('w:rFonts'))
    if rf is None:
        rf = OxmlElement('w:rFonts'); rpr.insert(0, rf)
    for a in list(rf.attrib):
        if a.endswith('Theme') or a.endswith('theme'):
            del rf.attrib[a]
    for a in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
        rf.set(qn(a), 'Times New Roman')


def atur_gaya_rapi(doc, ukuran_judul=12):
    st = doc.styles.element
    dd = st.find(qn('w:docDefaults'))
    rpr = dd.find(qn('w:rPrDefault')).find(qn('w:rPr'))
    fonts_tnr(rpr)
    rpr.find(qn('w:sz')).set(qn('w:val'), '24')
    sp = dd.find(qn('w:pPrDefault')).find(qn('w:pPr')).find(qn('w:spacing'))
    sp.set(qn('w:after'), '0'); sp.set(qn('w:line'), '360'); sp.set(qn('w:lineRule'), 'auto')
    n = doc.styles['Normal']
    n.font.name = 'Times New Roman'; n.font.size = Pt(12)
    pf = n.paragraph_format
    pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY; pf.first_line_indent = Cm(1.27)
    pf.space_after = Pt(0); pf.space_before = Pt(0); pf.line_spacing = 1.5
    for nama, tengah in (('Heading 1', True), ('Heading 2', False), ('Caption', True)):
        s = doc.styles[nama]
        s.font.name = 'Times New Roman'
        s.font.size = Pt(ukuran_judul if nama == 'Heading 1' else 12)
        s.font.color.rgb = RGBColor(0, 0, 0)
        s.font.bold = nama != 'Caption'
        s.font.italic = False
        fonts_tnr(s.element.get_or_add_rPr())
        s.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER if tengah else WD_ALIGN_PARAGRAPH.LEFT
        s.paragraph_format.first_line_indent = Cm(0)
        s.paragraph_format.space_before = Pt(0); s.paragraph_format.space_after = Pt(0)
        s.paragraph_format.line_spacing = 1.5


def atur_halaman(section, kertas='A4', atas=4, kiri=4, bawah=3, kanan=3):
    if kertas == 'A4':
        section.page_width, section.page_height = Cm(21), Cm(29.7)
    section.top_margin, section.left_margin = Cm(atas), Cm(kiri)
    section.bottom_margin, section.right_margin = Cm(bawah), Cm(kanan)


def nomor_halaman(section):
    p = section.footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.first_line_indent = Cm(0)
    field(p, 'PAGE', '1')


def halaman_baru(doc):
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


def tengah(doc, teks, bold=False, size=None):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.first_line_indent = Cm(0)
    r = p.add_run(teks); r.bold = bold
    if size: r.font.size = Pt(size)
    return p


def tabel(doc):
    t = doc.add_table(rows=len(TABEL), cols=3)
    t.style = 'Table Grid'
    for i, baris in enumerate(TABEL):
        for j, v in enumerate(baris):
            c = t.cell(i, j).paragraphs[0]
            c.paragraph_format.first_line_indent = Cm(0)
            c.add_run(v).bold = i == 0
    return t


def sampul(doc):
    tengah(doc, JUDUL, bold=True, size=14)
    tengah(doc, 'SKRIPSI')
    tengah(doc, 'Diajukan untuk memenuhi salah satu syarat memperoleh gelar Sarjana Ekonomi')
    tengah(doc, 'Disusun oleh: Nama Mahasiswa Contoh (NIM 2101234567)')
    tengah(doc, 'FAKULTAS EKONOMI DAN BISNIS UNIVERSITAS NUSANTARA RAYA 2026', bold=True)


# ---------- dokumen rapi ----------

def skripsi_rapi(path, variasi=None):
    variasi = variasi or {}
    doc = Document()
    atur_gaya_rapi(doc)
    s = doc.sections[0]
    atur_halaman(s, kiri=variasi.get('kiri', 4))
    nomor_halaman(s)
    sampul(doc)
    halaman_baru(doc)
    doc.add_heading('KATA PENGANTAR', level=1)
    doc.add_paragraph('Puji syukur penulis panjatkan kepada Tuhan Yang Maha Esa karena atas rahmat-Nya skripsi ini dapat diselesaikan. Penulis mengucapkan terima kasih kepada dosen pembimbing, keluarga, dan rekan-rekan yang telah memberikan dukungan selama proses penyusunan skripsi ini.')
    halaman_baru(doc)
    doc.add_heading('DAFTAR ISI', level=1)
    p = doc.add_paragraph()
    p.paragraph_format.first_line_indent = Cm(0)
    field(p, 'TOC \\o "1-2" \\h \\z \\u', 'BAB I PENDAHULUAN\t1')
    for k, (b, j, _) in enumerate(BAB[1:], start=2):
        q = doc.add_paragraph(f'{b} {j}\t{k * 3}')
        q.paragraph_format.first_line_indent = Cm(0)
    spasi_satu = set(variasi.get('spasi_satu', []))
    tanpa_break = variasi.get('tanpa_break')
    nomor = 0
    for b, judul, sub in BAB:
        if b != tanpa_break:
            halaman_baru(doc)
        doc.add_heading(b, level=1)
        doc.add_heading(judul, level=1)
        for js, paras in sub:
            doc.add_heading(js, level=2)
            for t in paras:
                nomor += 1
                if nomor in variasi.get('spasi_ganda', []):
                    t = t.replace('. ', '.  ', 1)
                p = doc.add_paragraph(t)
                if nomor in spasi_satu:
                    p.paragraph_format.line_spacing = 1.0
            if js.startswith('4.1'):
                doc.add_paragraph('Tabel 4.1 Jumlah responden per program studi', style='Caption')
                tabel(doc)
                g = doc.add_paragraph(); g.alignment = WD_ALIGN_PARAGRAPH.CENTER; g.paragraph_format.first_line_indent = Cm(0)
                g.add_run().add_picture(os.path.join(OUT, '_grafik.png'), width=Cm(12))
                doc.add_paragraph('Gambar 4.1 Sebaran responden per program studi', style='Caption')
    halaman_baru(doc)
    doc.add_heading('DAFTAR PUSTAKA', level=1)
    for t in PUSTAKA:
        p = doc.add_paragraph(t)
        p.paragraph_format.first_line_indent = Cm(-1.27)
        p.paragraph_format.left_indent = Cm(1.27)
        p.paragraph_format.line_spacing = 1.0
    doc.save(path)


# ---------- dokumen banyak salah (bawaan Word + kebiasaan umum) ----------

def tambah_revisi(paragraph, teks):
    ins = OxmlElement('w:ins')
    ins.set(qn('w:id'), '901'); ins.set(qn('w:author'), 'Dosen Pembimbing'); ins.set(qn('w:date'), '2026-10-01T09:00:00Z')
    r = OxmlElement('w:r'); t = OxmlElement('w:t'); t.set(qn('xml:space'), 'preserve'); t.text = teks
    r.append(t); ins.append(r); paragraph._p.append(ins)


def skripsi_banyak_salah(path):
    doc = Document()  # bawaan: Letter, margin 2,54/3,175 cm, Calibri 11, spasi 1,15, after 10 pt
    sampul(doc)
    halaman_baru(doc)
    doc.add_heading('Kata Pengantar', level=1)
    doc.add_paragraph('Puji syukur penulis panjatkan kepada Tuhan Yang Maha Esa karena atas rahmat-Nya skripsi ini dapat diselesaikan. Penulis mengucapkan terima kasih kepada dosen pembimbing, keluarga, dan rekan-rekan yang telah memberikan dukungan.')
    halaman_baru(doc)
    doc.add_heading('Daftar Isi', level=1)
    for k, (b, j, _) in enumerate(BAB, start=1):
        doc.add_paragraph(f'{b} {j} .................................................. {k * 3}')
    nomor = 0
    for bi, (b, judul, sub) in enumerate(BAB):
        if bi == 2:
            for _ in range(6):
                doc.add_paragraph()  # Enter berulang untuk pindah halaman
        else:
            halaman_baru(doc)
        doc.add_heading(f'{b} {judul.title()}', level=1)
        for js, paras in sub:
            doc.add_heading(js, level=2)
            for t in paras:
                nomor += 1
                if nomor in (3, 9):
                    t = t.replace(', ', ',  ', 2)
                p = doc.add_paragraph(t)
                if nomor in (2, 7):  # tempelan dari internet
                    for r in p.runs:
                        r.font.name = 'Arial'; r.font.size = Pt(10)
                if nomor == 5:
                    p.runs[0].font.highlight_color = 7  # kuning
                if nomor == 11:
                    tambah_revisi(p, ' Hal ini diperkuat oleh hasil wawancara awal dengan beberapa mahasiswa.')
                if nomor == 13:
                    doc.add_comment(p.runs, text='Tambahkan sumber kutipan.', author='Dosen Pembimbing', initials='DP')
            if js.startswith('4.1'):
                tabel(doc)
                doc.add_paragraph('Tabel 4.1 Jumlah responden per program studi', style='Caption')
                doc.add_paragraph('Gambar 4.1 Sebaran responden per program studi', style='Caption')
                g = doc.add_paragraph(); g.alignment = WD_ALIGN_PARAGRAPH.CENTER
                g.add_run().add_picture(os.path.join(OUT, '_grafik.png'), width=Cm(12))
    halaman_baru(doc)
    doc.add_heading('Daftar Pustaka', level=1)
    for t in PUSTAKA:
        doc.add_paragraph(t)
    doc.save(path)


# ---------- pedoman fiktif ----------

def pedoman(path_docx):
    doc = Document()
    atur_gaya_rapi(doc)
    atur_halaman(doc.sections[0], atas=3, kiri=3, bawah=3, kanan=3)
    tengah(doc, 'PEDOMAN PENULISAN SKRIPSI', bold=True, size=16)
    tengah(doc, 'FAKULTAS EKONOMI DAN BISNIS', bold=True, size=14)
    tengah(doc, 'UNIVERSITAS NUSANTARA RAYA (UNR)', bold=True, size=14)
    tengah(doc, 'Edisi 2026')
    tengah(doc, 'Dokumen ini fiktif dan dibuat hanya untuk mencoba aplikasi RISETWORKS.', size=10)
    halaman_baru(doc)
    isi = [
        ('BAB I KETENTUAN UMUM', [
            'Skripsi adalah karya ilmiah yang disusun mahasiswa program sarjana sebagai salah satu syarat kelulusan. Pedoman ini mengatur tata cara penulisan agar seluruh skripsi di lingkungan Fakultas Ekonomi dan Bisnis memiliki format yang seragam.',
            'Isi skripsi menjadi tanggung jawab penuh mahasiswa dan dosen pembimbing. Bagian ini tidak mengatur substansi penelitian, melainkan hanya aspek penulisan dan tata letak.',
        ]),
        ('BAB II TATA CARA PENULISAN', [
            'Kertas yang digunakan adalah HVS A4 (21 x 29,7 cm) berat 80 gram, dicetak satu muka dan tidak bolak-balik.',
            'Batas pengetikan (margin) adalah sebagai berikut: tepi atas 3 cm, tepi bawah 3 cm, tepi kiri 4 cm, dan tepi kanan 3 cm dari pinggir kertas.',
            'Naskah diketik menggunakan huruf Times New Roman ukuran 12 pt untuk seluruh isi naskah. Penggunaan huruf miring hanya untuk istilah asing.',
            'Jarak antarbaris pada isi naskah adalah 2 (dua) spasi. Kutipan langsung lebih dari empat baris, judul tabel, judul gambar, dan daftar pustaka diketik 1 (satu) spasi.',
            'Teks diketik rata kiri dan kanan (justify). Setiap paragraf baru dimulai dengan menjorok ke dalam lima ketukan atau 1,25 cm dari tepi kiri. Tidak ada jarak tambahan antarparagraf.',
        ]),
        ('BAB III JUDUL, BAB, DAN PENOMORAN', [
            'Judul bab ditulis dengan huruf kapital seluruhnya, dicetak tebal, diletakkan di tengah halaman, dengan ukuran huruf 14 pt. Setiap bab dimulai pada halaman baru.',
            'Halaman bagian awal diberi nomor dengan angka Romawi kecil di bagian bawah tengah. Halaman bagian inti diberi nomor dengan angka Arab di kanan atas, kecuali halaman awal setiap bab yang nomornya diletakkan di bawah tengah.',
            'Judul tabel diletakkan di atas tabel, sedangkan judul gambar diletakkan di bawah gambar. Tabel dan gambar diberi nomor sesuai bab, misalnya Tabel 4.1 dan Gambar 4.1.',
        ]),
    ]
    for judul, paras in isi:
        doc.add_heading(judul, level=1)
        for t in paras:
            doc.add_paragraph(t)
    doc.save(path_docx)


def ke_pdf(path_docx):
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', OUT, path_docx], check=True, capture_output=True)


if __name__ == '__main__':
    gambar_grafik(os.path.join(OUT, '_grafik.png'))
    skripsi_banyak_salah(os.path.join(OUT, '1-skripsi-banyak-salah.docx'))
    ke_pdf(os.path.join(OUT, '1-skripsi-banyak-salah.docx'))
    skripsi_rapi(os.path.join(OUT, '2-skripsi-hampir-rapi.docx'), {'kiri': 3, 'spasi_satu': [4, 5, 10], 'tanpa_break': 'BAB III', 'spasi_ganda': [6]})
    skripsi_rapi(os.path.join(OUT, '3-skripsi-rapi.docx'))
    pedoman(os.path.join(OUT, '_pedoman.docx'))
    ke_pdf(os.path.join(OUT, '_pedoman.docx'))
    os.replace(os.path.join(OUT, '_pedoman.pdf'), os.path.join(OUT, '4-pedoman-univ-nusantara-raya.pdf'))
    for f in ('_pedoman.docx', '_grafik.png'):
        os.remove(os.path.join(OUT, f))
    print('\n'.join(sorted(os.listdir(OUT))))
