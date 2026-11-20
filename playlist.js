/**
 * DAFTAR LAGU - EDIT FILE INI UNTUK MENAMBAHKAN TRACK
 * Setiap lagu bisa punya audio, cover, lirik, cerita (story), dan voiceNote (opsional) sendiri.
 * audio boleh berupa path lokal (mis. assets/lagu-03.mp3) atau URL HTTPS langsung.
 * lyricFile: .txt dengan heading [Verse 1], [Chorus] dll; optional lrcFile untuk sinkronisasi.
 */
window.PLAYLIST_TRACKS = [
  {
    id: 'untukmu-syifa',
    title: 'Untukmu Syifa',
    artist: 'Zandevaa',
    duration: '5:23',
    audio: 'assets/untukmu-syifa.mp3',
    cover: 'assets/cover.webp',
    lyricFile: 'lyrics/untukmu-syifa.txt',
    lrcFile: 'lyrics/untukmu-syifa.lrc',
    description: 'Ada perasaan yang tak selalu pandai menjadi kata. Jadi, biarkan lagu ini yang bercerita.',
    dedication: 'Karena hadirmu lebih berharga dari jawabannya.',
    story: 'Ditulis dari perasaan yang sempat disimpan diam-diam di antara hari-hari biasa—tentang seseorang yang kehadirannya perlahan mengubah cara melihat waktu.',
    voiceNote: '', // Opsional: isi path audio pesan suara singkat, mis. 'assets/vn-untukmu-syifa.mp3'
    date: '18.11.2026'
  },
  {
    id: 'S-Y-I-F-A',
    title: 'S-Y-I-F-A (Always-on-My-Mind)',
    artist: 'Zandevaa',
    duration: '3:01',
    audio: 'assets/S-Y-I-F-A (Always-on-My-Mind).mp3',
    cover: 'assets/cover-lagu-kedua.webp',
    lyricFile: 'lyrics/lagu-kedua.txt',
    lrcFile: 'lyrics/lagu-kedua.lrc',
    description: 'Setiap lagu adalah satu cerita baru yang ingin kusampaikan.',
    dedication: 'Cerita selanjutnya, untuk seseorang yang istimewa.',
    story: 'Lagu tentang nama yang selalu kembali teringat di sela-sela riuh hari, seperti melodi yang tak pernah benar-benar pergi dari kepala.',
    voiceNote: '',
    date: '18.11.2026'
  },
  {
    id: 'you',
    title: 'You!',
    artist: 'Zandevaa',
    duration: '2:43',
    audio: 'assets/You!.mp3',
    cover: 'assets/cover-3.webp',
    lyricFile: 'lyrics/you.txt',
    lrcFile: 'lyrics/you.lrc',
    description: 'Satu kata sederhana, tapi selalu cukup untuk menggambarkan semuanya.',
    dedication: 'Karena pada akhirnya, jawabannya selalu kamu.',
    story: 'Nuansa pagi yang hangat dan jujur—tidak perlu banyak kalimat rumit ketika semua alasan akhirnya selalu mengarah pada satu kata: kamu.',
    voiceNote: '',
    date: '20.11.2026'
  }
];
