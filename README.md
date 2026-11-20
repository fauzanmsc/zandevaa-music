# ♡ Music Letters — Untukmu Syifa | Multi-Song Website

Website musik personal Zandevaa dengan **playlist multi-lagu**, cover dan lirik per lagu, siap untuk GitHub Pages. Dibangun dengan HTML, CSS, dan JavaScript murni (tanpa framework, backend, atau build).

## Fitur

- 2 lagu awal, bisa tambah **3, 4, 10 lagu atau lebih** di `playlist.js`.
- Klik kartu playlist untuk berganti lagu; **judul, cover utama, thumbnail player, audio MP3, lirik, dan judul tab browser** ikut berubah.
- Tombol **sebelumnya, play/pause, berikutnya**, progress/seek, volume dan auto-play lagu berikutnya.
- **Repeat**: mati → seluruh playlist → satu lagu → mati.
- Lirik setiap lagu dibaca dari **file terpisah** `lyrics/*.txt`. Scroll manual. Opsional: pasang `.lrc` per lagu untuk highlight otomatis berdasarkan timestamp.
- Klik **+ MP3 lokal** untuk mencoba MP3 pada lagu terpilih tanpa upload ke server (sementara; hilang setelah refresh).
- URL lagu individu dapat dibagikan, contoh `.../?song=untukmu-syifa` atau `.../?song=lagu-kedua`.
- Responsif untuk mobile; mendukung kontrol media perangkat apabila browser mengizinkan.

## Mulai cepat: isi 2 lagu

**Lagu 1:** `Untukmu Syifa` sudah memiliki cover dan seluruh lirik asli. Tambahkan MP3-nya pada:

`assets/untukmu-syifa.mp3`

**Lagu 2:** entri contoh `Lagu Kedua` punya **cover placeholder** dan file lirik contoh. Sesuaikan dulu:

1. Tambahkan MP3 kedua di `assets/lagu-kedua.mp3`.
2. Ganti teks di `lyrics/lagu-kedua.txt` dengan lirik asli lagu kedua.
3. Simpan cover asli kedua di `assets/cover-lagu-kedua.webp` (bisa PNG atau JPG).
4. Di `playlist.js`, ubah `title`, `artist`, `cover`, `description`, dan `dedication` untuk lagu kedua. Ganti nama path bila nama file berbeda.

> Penting: **Paket tidak menyertakan MP3** apa pun. Lagu kedua dan cover kedua saat ini sengaja hanya contoh, karena judul, lirik, cover, dan MP3 aslinya belum disediakan.

## Menambah lagu ketiga dan seterusnya

Buka `playlist.js`, salin satu objek di array `window.PLAYLIST_TRACKS` dan tambahkan di bawah lagu kedua (pastikan objek sebelumnya diakhiri koma). Contoh:

```js
{
  id: 'lagu-ketiga', // Harus unik; dipakai untuk URL ?song=lagu-ketiga
  title: 'Judul Lagu Ketiga',
  artist: 'Zandevaa',
  audio: 'assets/lagu-ketiga.mp3',
  cover: 'assets/cover-lagu-ketiga.jpg',
  lyricFile: 'lyrics/lagu-ketiga.txt',
  lrcFile: 'lyrics/lagu-ketiga.lrc', // Opsional; boleh dihapus jika tidak perlu
  description: 'Satu kalimat deskripsi lagu.',
  dedication: 'Pesan singkat dari hati.',
  date: '2026'
}
```

Kemudian upload file MP3, cover, dan lirik ke folder sesuai path. **Tidak perlu membuat halaman HTML baru secara manual atau mengubah kode pemutar.** Setiap entri menggunakan pemutar yang sama.

### Memperbarui preview tautan WhatsApp (Open Graph)

WhatsApp membaca metadata statis HTML tanpa menjalankan JavaScript. Setelah menambah atau mengubah lagu di `playlist.js`, jalankan perintah berikut agar setiap lagu punya halaman share `song/<id>/index.html` dengan judul `"Judul Lagu — Zandevaa"`:

```bash
node scripts/generate-share-pages.mjs
```

Lalu commit & push folder `song/` beserta perubahan lainnya ke GitHub.

**Sumber musik eksternal:** `audio` juga boleh diisi URL HTTPS langsung ke file audio, misalnya `https://domain-anda.com/music/lagu-03.mp3`, asalkan pemilik server mengizinkan akses dari website. Jangan gunakan tautan ke halaman pemutar streaming, karena bukan URL file MP3.

## Format lirik setiap lagu

Simpan `.txt` UTF-8 terpisah di folder `lyrics/`. Nama bagian diberi tanda `[Bagian]`. Contoh:

```text
[Verse 1]
Baris pertama lirik lagu.
Baris kedua lirik lagu.

[Chorus]
Reff lagu di sini.
Baris kedua reff.

[Outro]
Kalimat terakhir.
```

Bila file lagu kedua dipilih, website mengambil **`lyrics/lagu-kedua.txt`**, bukan `lyrics/untukmu-syifa.txt`. Seluruh tampilan dan scroll lirik di-reset untuk lagu baru. File `.txt` dapat Anda edit langsung di GitHub.

### Lirik yang mengikuti musik (.lrc) — opsional

Jika ingin highlight berdasarkan waktu audio, tambahkan file `.lrc` sesuai `lrcFile` di `playlist.js` (satu file per lagu). Contoh **waktu hanya ilustrasi**, bukan sinkronisasi lagu aslinya:

```lrc
[ti:Untukmu Syifa]
[ar:Zandevaa]
[00:12.50]Awalnya kau hanya seseorang yang biasa
[00:17.20]Di antara meja, pekerjaan, dan cerita
```

Syarat: teks tiap baris `.lrc` harus sesuai lirik yang ada di `.txt`, termasuk setiap pengulangan chorus, dalam urutan yang benar. Jika `.lrc` belum tersedia, **scroll lirik manual tetap berfungsi**. File `lyrics/CONTOH TIMESTAMP.lrc` hanya sebagai referensi format. Dua file `.lrc` bawaan hanya berisi metadata, belum mempunyai timestamp; silakan isi jika ingin lirik mengikuti audio.

## Struktur folder

```text
music-letters/
├── index.html
├── styles.css
├── app.js                 # Player, playlist, load lirik, kontrol
├── playlist.js            # EDIT INI untuk menambah/mengganti lagu
├── README.md
├── .nojekyll
├── assets/
│   ├── cover.webp         # Cover asli Untukmu Syifa
│   ├── cover.jpg          # Preview tautan
│   ├── cover-original.png
│   ├── cover-lagu-kedua.png    # Contoh; ganti cover aslinya
│   ├── favicon.svg
│   ├── untukmu-syifa.mp3       # TAMBAHKAN SENDIRI
│   └── lagu-kedua.mp3          # TAMBAHKAN SENDIRI
└── lyrics/
    ├── untukmu-syifa.txt     # Lirik lengkap lagu 1
    ├── lagu-kedua.txt        # Contoh, ganti lirik lagu 2
    ├── untukmu-syifa.lrc     # Opsional jika tersinkronisasi
    └── lagu-kedua.lrc        # Opsional jika tersinkronisasi
```

## Menjalankan secara lokal

Karena file lirik dimuat menggunakan browser `fetch()`, pembacaan lirik `.txt` mungkin **diblokir** jika Anda membuka `index.html` langsung dengan `file://`. Jalankan server lokal di folder proyek:

```bash
python3 -m http.server 8000
```

Buka `http://localhost:8000`. Bisa juga memakai ekstensi Live Server di VS Code. **Preview HTML tunggal** yang disertakan terpisah sudah mengemas lirik contoh agar dapat dibuka tanpa server, tetapi paket proyek standar memakai file lirik sungguhan.

## Publikasi di GitHub Pages

1. Buat repository baru di GitHub, contoh `untukmu-syifa`.
2. Unggah **isi folder** proyek ini ke root repository, termasuk `index.html`, `playlist.js`, `app.js`, `styles.css`, `assets/`, `lyrics/` dan `.nojekyll`.
3. Di repository, buka **Settings → Pages → Build and deployment → Deploy from a branch**.
4. Pilih `main` dan `/ (root)`, lalu Save.
5. Kunjungi `https://USERNAME.github.io/untukmu-syifa/`. Sesuaikan `USERNAME` dengan nama akun Anda.
6. Unggah kedua MP3 asli agar pengunjung bisa mendengarkan keduanya secara online. GitHub menerima file biasa sampai batas per file yang berlaku; untuk file besar, pertimbangkan host audio eksternal.

**Catatan pemutaran:** pemutaran otomatis ketika berpindah lagu dari interaksi pengguna didukung sebagian besar browser. Pemutaran otomatis saat membuka halaman pertama kali sengaja dimatikan demi kebijakan browser.

**Pintasan:** Space = play/pause, ← / → = mundur/maju 10 detik saat halaman tidak sedang berfokus pada input atau tombol.

---
© 2026 Zandevaa. A personal collection of songs for Syifa. ♡
