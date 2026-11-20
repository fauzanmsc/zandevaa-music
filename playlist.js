/**
 * DAFTAR LAGU - EDIT FILE INI UNTUK MENAMBAHKAN TRACK
 * Setiap lagu bisa punya audio, cover dan file lirik yang berbeda.
 * audio boleh berupa path lokal (mis. assets/lagu-03.mp3) atau URL HTTPS langsung.
 * lyricFile: .txt dengan heading [Verse 1], [Chorus] dll; optional lrcFile untuk sinkronisasi.
 */
window.PLAYLIST_TRACKS = [
  {
    id: 'untukmu-syifa',
    title: 'Untukmu Syifa',
    artist: 'Zandevaa',
    audio: 'assets/untukmu-syifa.mp3',
    cover: 'assets/cover.webp',
    lyricFile: 'lyrics/untukmu-syifa.txt',
    lrcFile: 'lyrics/untukmu-syifa.lrc', // Opsional: buat jika punya timestamp asli.
    description: 'Ada perasaan yang tak selalu pandai menjadi kata. Jadi, biarkan lagu ini yang bercerita.',
    dedication: 'Karena hadirmu lebih berharga dari jawabannya.',
    date: '18.11.2026'
  },
  {
    id: 'S-Y-I-F-A',
    title: 'S-Y-I-F-A (Always-on-My-Mind)', // Ganti dengan judul lagu ke-2 Anda.
    artist: 'Zandevaa',
    audio: 'assets/S-Y-I-F-A (Always-on-My-Mind).mp3', // Isi file MP3 lagu ke-2 di sini.
    cover: 'assets/cover-lagu-kedua.png', // Ganti ke cover asli: JPG/PNG/WEBP.
    lyricFile: 'lyrics/lagu-kedua.txt', // File lirik independen dari lagu 1.
    lrcFile: 'lyrics/lagu-kedua.lrc',
    description: 'Setiap lagu adalah satu cerita baru yang ingin kusampaikan.',
    dedication: 'Cerita selanjutnya, untuk seseorang yang istimewa.',
    date: '18.11.2026'
  },
  {
    id: 'you',
    title: 'You!',
    artist: 'Zandevaa',
    audio: 'assets/You!.mp3',
    cover: 'assets/cover-3.png', // Simpan cover lagu ke-3 di assets/cover-3.png.
    lyricFile: 'lyrics/you.txt',
    lrcFile: 'lyrics/you.lrc',
    description: 'Satu kata sederhana, tapi selalu cukup untuk menggambarkan semuanya.',
    dedication: 'Karena pada akhirnya, jawabannya selalu kamu.',
    date: '20.11.2026'
  }
];
