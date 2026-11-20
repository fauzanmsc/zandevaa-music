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
    id: 'lagu-kedua',
    title: 'Lagu Kedua', // Ganti dengan judul lagu ke-2 Anda.
    artist: 'Zandevaa',
    audio: 'assets/lagu-kedua.mp3', // Isi file MP3 lagu ke-2 di sini.
    cover: 'assets/cover-lagu-kedua.svg', // Ganti ke cover asli: JPG/PNG/WEBP.
    lyricFile: 'lyrics/lagu-kedua.txt', // File lirik independen dari lagu 1.
    lrcFile: 'lyrics/lagu-kedua.lrc',
    description: 'Setiap lagu adalah satu cerita baru yang ingin kusampaikan.',
    dedication: 'Cerita selanjutnya, untuk seseorang yang istimewa.',
    date: 'COMING SOON'
  }
];
