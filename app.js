/**
 * Music Letters — Multi-song music & lyric player for GitHub Pages.
 * Edit playlist.js to add any number of tracks; each has its own audio, cover and lyric file.
 */
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const tracks = Array.isArray(window.PLAYLIST_TRACKS) ? window.PLAYLIST_TRACKS.filter(t => t && t.id && t.title && t.audio && t.lyricFile) : [];
  const audio = $('#audio');
  const playButton = $('#playButton');
  const previousButton = $('#previousButton');
  const nextButton = $('#nextButton');
  const seekBar = $('#seekBar');
  const volumeBar = $('#volumeBar');
  const repeatButton = $('#repeatButton');
  const addTrackButton = $('#addTrackButton');
  const fileInput = $('#fileInput');
  const audioHint = $('#audioHint');
  const trackState = $('#trackState');
  const lyricsContent = $('#lyricsContent');
  const lyricsScroll = $('#lyricsScroll');
  const followButton = $('#followButton');
  const lyricsTip = $('#lyricsTip');
  const playlistList = $('#playlistList');
  const toast = $('#toast');

  let activeIndex = 0;
  let ready = false;
  let audioFailed = false;
  let followLyrics = true;
  let repeatMode = 'off'; // off: next then stop; all: repeat playlist; one: repeat this song
  let lyricLines = [];
  let lastActiveLine = -1;
  let lyricRequest = 0;
  let toastTimer = null;
  const localAudioOverrides = new Map();

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3900);
  }

  function timeString(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const number = Math.floor(seconds);
    return `${Math.floor(number / 60)}:${String(number % 60).padStart(2, '0')}`;
  }

  function currentTrack() { return tracks[activeIndex]; }

  function setTitle(title) {
    const heading = $('#pageTitle');
    heading.replaceChildren();
    const words = title.trim().split(/\s+/);
    const last = words.pop();
    if (words.length) heading.append(document.createTextNode(words.join(' ') + ' '));
    const highlighted = document.createElement('em');
    highlighted.textContent = last + (/[.!?]$/.test(last) ? '' : '.');
    heading.append(highlighted);
  }

  function populateTrackInfo(track) {
    setTitle(track.title);
    $('#heroDate').textContent = track.date || 'A PERSONAL MUSIC STORY';
    $('#heroDescription').textContent = track.description || 'Sebuah lagu dan cerita yang ditulis sepenuh hati.';
    $('#heroCover').src = track.cover || 'assets/cover-lagu-kedua.svg';
    $('#heroCover').alt = `Cover lagu ${track.title}`;
    $('#heroArtist').textContent = `by ${track.artist || 'Zandevaa'}`;
    $('#heroDedication').textContent = `“${track.dedication || 'Ada cerita di balik setiap lagu.'}”`;
    $('#dedicationTitle').textContent = `— ${track.title}`;
    $('#playerCover').src = track.cover || 'assets/cover-lagu-kedua.svg';
    $('#playerTitle').textContent = track.title;
    $('#playerArtist').textContent = track.artist || 'Zandevaa';
    $('#lyricsTrackTitle').textContent = track.title.toUpperCase();
    document.title = `${track.title} — ${track.artist || 'Zandevaa'}`;
    $('#lyricsScroll').setAttribute('aria-label', `Lirik lagu ${track.title}. Geser untuk membaca.`);
    $('#playlistCount').textContent = `${String(tracks.length).padStart(2, '0')} LAGU`;
    if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist || 'Zandevaa',
        album: 'Music Letters',
        artwork: [{src: new URL(track.cover || 'assets/cover-lagu-kedua.svg', location.href).href}]
      });
    }
  }

  function renderPlaylist() {
    const list = document.createDocumentFragment();
    tracks.forEach((track, index) => {
      const selected = index === activeIndex;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `playlist-item${selected ? ' selected' : ''}`;
      button.dataset.trackIndex = String(index);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', `Pilih ${track.title}, ${track.artist || 'Zandevaa'}`);
      const number = document.createElement('span');
      number.className = 'playlist-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const image = document.createElement('img');
      image.className = 'playlist-thumb';
      image.src = track.cover || 'assets/cover-lagu-kedua.svg';
      image.alt = '';
      image.loading = 'lazy';
      const details = document.createElement('span');
      details.className = 'playlist-details';
      const title = document.createElement('strong');
      title.textContent = track.title;
      const artist = document.createElement('small');
      artist.textContent = track.artist || 'Zandevaa';
      details.append(title, artist);
      const icon = document.createElement('span');
      icon.className = 'playlist-indicator';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = selected ? '♪' : '↗';
      button.append(number, image, details, icon);
      list.append(button);
    });
    playlistList.replaceChildren(list);
  }

  function updatePlayState() {
    const playing = !audio.paused && !audio.ended && !audio.error;
    document.body.classList.toggle('is-playing', playing);
    playButton.setAttribute('aria-label', playing ? 'Jeda lagu' : `Putar ${currentTrack()?.title || 'lagu'}`);
    playButton.title = playing ? 'Jeda' : 'Putar';
    if (playing) trackState.textContent = 'NOW PLAYING';
    else if (audioFailed) trackState.textContent = 'MP3 BELUM TERSEDIA';
    else if (ready) trackState.textContent = 'READY TO PLAY';
    else trackState.textContent = 'LOADING AUDIO';
    // Keep selected row visible as the playing song changes.
    playlistList.querySelectorAll('.playlist-item').forEach((row) => {
      row.classList.toggle('currently-playing', playing && Number(row.dataset.trackIndex) === activeIndex);
    });
  }

  function setReady(value) {
    ready = value;
    seekBar.disabled = !value;
    if (value) {
      audioFailed = false;
      audioHint.textContent = localAudioOverrides.has(currentTrack().id)
        ? `♪ MP3 lokal untuk “${currentTrack().title}” siap diputar. File ini belum diunggah ke GitHub.`
        : `♪ “${currentTrack().title}” siap didengarkan.`;
      audioHint.classList.add('has-track');
    } else {
      audioHint.classList.remove('has-track');
    }
    updatePlayState();
  }

  async function tryPlay() {
    if (audioFailed) {
      showToast(`MP3 “${currentTrack().title}” belum tersedia. Pilih MP3 lokal untuk mencoba.`);
      fileInput.click();
      return;
    }
    try { await audio.play(); }
    catch (error) {
      if (error?.name === 'AbortError') return; // User switched song before play completed.
      if (audio.error) return; // Handled by the error event, with a useful filename.
      showToast('Audio tidak dapat diputar. Pastikan sumber MP3 dapat diakses.');
    }
  }

  function togglePlay() {
    if (audio.paused) tryPlay();
    else audio.pause();
  }

  function progress() {
    const elapsed = audio.currentTime || 0;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    $('#currentTime').textContent = timeString(elapsed);
    $('#totalTime').textContent = timeString(duration);
    const percentage = duration ? Math.min(100, Math.max(0, elapsed / duration * 100)) : 0;
    seekBar.value = String(percentage);
    seekBar.style.setProperty('--progress', `${percentage}%`);
    syncActiveLyric(elapsed);
  }

  function changeTime(seconds) {
    if (!ready) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : audio.currentTime + Math.max(0, seconds);
    audio.currentTime = Math.min(duration, Math.max(0, audio.currentTime + seconds));
    progress();
  }

  // Text format: [Verse 1], [Chorus], [Bridge] and plain lines. No editing HTML required.
  function parseTextLyrics(text) {
    const sections = [];
    let section = null;
    for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const heading = line.match(/^\[([^\]\r\n]+)\]$/);
      if (heading && !/^\d{1,3}:\d{2}/.test(heading[1])) {
        section = {title: heading[1], lines: []};
        sections.push(section);
        continue;
      }
      if (!section) { section = {title: 'Lyrics', lines: []}; sections.push(section); }
      section.lines.push(line);
    }
    return sections.filter(s => s.lines.length);
  }

  function parseLrc(text) {
    const lines = [];
    const timePattern = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
    for (const row of text.split(/\r?\n/)) {
      const matches = [...row.matchAll(timePattern)];
      const words = row.replace(timePattern, '').trim();
      if (!matches.length || !words) continue;
      for (const m of matches) {
        const fraction = m[3] ? Number(`0.${m[3].padEnd(3, '0')}`) : 0;
        lines.push({time: Number(m[1]) * 60 + Number(m[2]) + fraction, text: words});
      }
    }
    return lines.sort((a, b) => a.time - b.time);
  }

  function renderLyrics(sections) {
    lyricLines = [];
    lastActiveLine = -1;
    followButton.hidden = true;
    followLyrics = true;
    updateFollowButton();
    const fragment = document.createDocumentFragment();
    for (const section of sections) {
      const wrapper = document.createElement('section');
      wrapper.className = 'lyric-group';
      const heading = document.createElement('h3');
      heading.className = 'lyric-group-heading';
      heading.textContent = section.title;
      wrapper.append(heading);
      for (const text of section.lines) {
        const line = document.createElement('span');
        line.className = 'lyric-line';
        line.textContent = text;
        lyricLines.push({element: line, text, time: null});
        wrapper.append(line);
      }
      fragment.append(wrapper);
    }
    lyricsContent.replaceChildren(fragment);
    lyricsScroll.scrollTop = 0;
    lyricsTip.textContent = '↕ Scroll untuk membaca lirik';
  }

  function setLyricsMessage(message) {
    lyricLines = [];
    lastActiveLine = -1;
    followButton.hidden = true;
    const p = document.createElement('p');
    p.className = 'lyrics-message';
    p.textContent = message;
    lyricsContent.replaceChildren(p);
    lyricsScroll.scrollTop = 0;
  }

  function normalizeText(text) {
    return text.trim().toLowerCase().normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  }

  async function loadLyricsForTrack(track, requestId) {
    setLyricsMessage('Memuat lirik untuk “' + track.title + '”…');
    lyricsTip.textContent = 'Memuat file lirik…';
    try {
      // A standalone preview can embed lyrics; the downloadable project uses actual .txt files.
      const inline = window.PLAYLIST_INLINE_LYRICS?.[track.id];
      let text;
      if (typeof inline === 'string') text = inline;
      else {
        const response = await fetch(track.lyricFile, {cache: 'no-cache'});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        text = await response.text();
      }
      if (requestId !== lyricRequest) return;
      const isLrc = /\.lrc(?:$|\?)/i.test(track.lyricFile);
      const entries = isLrc ? parseLrc(text) : [];
      const sections = isLrc ? [{title: 'Song Lyrics', lines: entries.map(row => row.text)}] : parseTextLyrics(text);
      if (sections.length === 0) throw new Error('File lirik kosong');
      renderLyrics(sections);
      if (isLrc) applyLrc(entries);
      else if (track.lrcFile) {
        try {
          const sample = window.PLAYLIST_INLINE_LRC?.[track.id];
          let lrc;
          if (typeof sample === 'string') lrc = sample;
          else {
            const resp = await fetch(track.lrcFile, {cache: 'no-cache'});
            if (!resp.ok) return; // Timestamp .lrc is optional.
            lrc = await resp.text();
          }
          if (requestId === lyricRequest) applyLrc(parseLrc(lrc));
        } catch (_e) { /* LRC is optional. Manual scrolling still works. */ }
      }
    } catch (_error) {
      if (requestId !== lyricRequest) return;
      setLyricsMessage(location.protocol === 'file:'
        ? `File lirik tidak bisa dimuat langsung dari file://. Jalankan website melalui Live Server atau GitHub Pages. File: ${track.lyricFile}`
        : `Lirik “${track.title}” belum tersedia. Tambahkan atau periksa file ${track.lyricFile} di repository.`);
      lyricsTip.textContent = 'File lirik belum dapat dibaca';
    }
  }

  function applyLrc(entries) {
    let position = 0;
    let count = 0;
    for (const entry of entries) {
      const text = normalizeText(entry.text);
      for (let i = position; i < lyricLines.length; i++) {
        if (normalizeText(lyricLines[i].text) !== text) continue;
        lyricLines[i].time = entry.time;
        lyricLines[i].element.dataset.timed = 'true';
        lyricLines[i].element.dataset.time = String(entry.time);
        lyricLines[i].element.title = `Putar mulai ${timeString(entry.time)}`;
        position = i + 1;
        count++;
        break;
      }
    }
    if (count) {
      followButton.hidden = false;
      lyricsTip.textContent = '♪ Lirik tersinkronisasi · klik baris untuk lompat';
      syncActiveLyric(audio.currentTime || 0);
    }
  }

  function updateFollowButton() {
    followButton.setAttribute('aria-pressed', String(followLyrics));
    followButton.querySelector('span').textContent = followLyrics ? 'Ikuti lagu' : 'Ikuti lagi';
  }

  function centerLyric(element) {
    const panel = lyricsScroll.getBoundingClientRect();
    const line = element.getBoundingClientRect();
    const offset = line.top - panel.top - (panel.height - line.height) / 2;
    lyricsScroll.scrollTo({top: lyricsScroll.scrollTop + offset, behavior: 'smooth'});
  }

  function syncActiveLyric(seconds) {
    let matchedIndex = -1;
    for (let i = 0; i < lyricLines.length; i++) {
      const time = lyricLines[i].time;
      if (time !== null && time <= seconds + .07) matchedIndex = i;
      if (time !== null && time > seconds + .07) break;
    }
    if (matchedIndex === lastActiveLine) return;
    if (lastActiveLine >= 0) lyricLines[lastActiveLine]?.element.classList.remove('active');
    if (matchedIndex >= 0) {
      const element = lyricLines[matchedIndex].element;
      element.classList.add('active');
      if (followLyrics && !audio.paused) centerLyric(element);
    }
    lastActiveLine = matchedIndex;
  }

  function updatePageLink(track) {
    try {
      const url = new URL(location.href);
      url.searchParams.set('song', track.id);
      history.replaceState({}, '', url.toString());
    } catch (_e) { /* E.g. sandboxed local HTML preview. */ }
  }

  function switchTrack(index, {autoplay = false, updateUrl = true} = {}) {
    if (!tracks.length || index < 0 || index >= tracks.length) return;
    activeIndex = index;
    const track = currentTrack();
    const requestId = ++lyricRequest;
    audio.pause();
    ready = false;
    audioFailed = false;
    audio.removeAttribute('src');
    audio.load();
    populateTrackInfo(track);
    renderPlaylist();
    setReady(false);
    $('#currentTime').textContent = '0:00';
    $('#totalTime').textContent = '0:00';
    seekBar.value = '0';
    seekBar.style.setProperty('--progress', '0%');
    audioHint.textContent = `Memuat sumber musik “${track.title}”…`;
    loadLyricsForTrack(track, requestId);
    if (updateUrl) updatePageLink(track);
    audio.src = localAudioOverrides.get(track.id) || track.audio;
    audio.load();
    if (autoplay) tryPlay();
  }

  function nextTrack() { switchTrack((activeIndex + 1) % tracks.length, {autoplay: true}); }
  function previousTrack() {
    if (ready && audio.currentTime > 3) { audio.currentTime = 0; progress(); return; }
    switchTrack((activeIndex - 1 + tracks.length) % tracks.length, {autoplay: true});
  }

  function updateRepeatUi() {
    repeatButton.dataset.mode = repeatMode;
    const labels = {off: 'Pengulangan mati', all: 'Ulang seluruh playlist', one: 'Ulang lagu ini'};
    repeatButton.title = `Mode: ${labels[repeatMode]}`;
    repeatButton.setAttribute('aria-label', `Mode: ${labels[repeatMode]}. Klik untuk mengubah.`);
    repeatButton.setAttribute('aria-pressed', String(repeatMode !== 'off'));
    repeatButton.querySelector('.repeat-index').textContent = repeatMode === 'one' ? '1' : '';
  }

  playlistList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-track-index]');
    if (!button) return;
    const index = Number(button.dataset.trackIndex);
    if (index === activeIndex) { togglePlay(); return; }
    switchTrack(index, {autoplay: true});
  });
  playButton.addEventListener('click', togglePlay);
  previousButton.addEventListener('click', previousTrack);
  nextButton.addEventListener('click', nextTrack);
  addTrackButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)) {
      showToast('Pilih file audio seperti .mp3 atau .m4a.');
      return;
    }
    const trackId = currentTrack().id;
    const oldUrl = localAudioOverrides.get(trackId);
    const url = URL.createObjectURL(file);
    localAudioOverrides.set(trackId, url);
    switchTrack(activeIndex, {autoplay: true});
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    fileInput.value = '';
  });

  audio.addEventListener('loadedmetadata', () => { setReady(true); progress(); });
  audio.addEventListener('durationchange', progress);
  audio.addEventListener('timeupdate', progress);
  audio.addEventListener('play', updatePlayState);
  audio.addEventListener('pause', updatePlayState);
  audio.addEventListener('ended', () => {
    if (repeatMode === 'one') { audio.currentTime = 0; tryPlay(); return; }
    if (activeIndex < tracks.length - 1) { switchTrack(activeIndex + 1, {autoplay: true}); return; }
    if (repeatMode === 'all') { switchTrack(0, {autoplay: true}); return; }
    updatePlayState();
  });
  audio.addEventListener('error', () => {
    // The MP3 is intentionally absent from this starter project until uploaded.
    audioFailed = true;
    ready = false;
    setReady(false);
    const track = currentTrack();
    const local = localAudioOverrides.has(track.id);
    audioHint.textContent = local
      ? `File audio lokal untuk “${track.title}” tidak dapat dibaca. Coba format MP3.`
      : `MP3 “${track.title}” belum tersedia. Tambahkan ${track.audio} ke GitHub atau tekan + MP3 lokal.`;
    updatePlayState();
  });

  seekBar.addEventListener('input', () => {
    if (!ready || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Number(seekBar.value) / 100 * audio.duration;
    progress();
  });
  volumeBar.addEventListener('input', () => { audio.volume = Number(volumeBar.value); });
  repeatButton.addEventListener('click', () => {
    repeatMode = {off: 'all', all: 'one', one: 'off'}[repeatMode];
    updateRepeatUi();
    showToast({off: 'Pengulangan dimatikan', all: 'Ulangi seluruh playlist', one: 'Ulangi lagu ini'}[repeatMode]);
  });
  $('#topLyrics').addEventListener('click', () => {
    followLyrics = false;
    updateFollowButton();
    lyricsScroll.scrollTo({top: 0, behavior: 'smooth'});
  });
  followButton.addEventListener('click', () => {
    followLyrics = !followLyrics;
    updateFollowButton();
    if (followLyrics && lastActiveLine >= 0) centerLyric(lyricLines[lastActiveLine].element);
  });
  lyricsContent.addEventListener('click', (event) => {
    const line = event.target.closest('.lyric-line[data-time]');
    if (!line || audioFailed) return;
    audio.currentTime = Number(line.dataset.time);
    followLyrics = true;
    updateFollowButton();
    progress();
  });
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(type => {
    lyricsScroll.addEventListener(type, (event) => {
      if (type === 'keydown' && !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) return;
      if (!followButton.hidden) { followLyrics = false; updateFollowButton(); }
    }, {passive: true});
  });
  $('#shareButton').addEventListener('click', async () => {
    const url = location.href.split('#')[0]; // Includes ?song=... to share the selected track.
    const payload = {title: `${currentTrack().title} — ${currentTrack().artist}`, text: 'Ada lagu dan cerita kecil untukmu. ♡', url};
    try {
      if (navigator.share) { await navigator.share(payload); return; }
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); showToast('Tautan lagu ini berhasil disalin ♡'); return; }
      throw new Error('Clipboard tidak tersedia');
    } catch (e) { if (e.name !== 'AbortError') showToast('Salin URL browser untuk membagikan lagu ini.'); }
  });
  document.addEventListener('keydown', (event) => {
    const focus = document.activeElement;
    if (['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT'].includes(focus?.tagName) || focus === lyricsScroll || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
    if (event.code === 'ArrowRight') changeTime(10);
    if (event.code === 'ArrowLeft') changeTime(-10);
  });
  if ('mediaSession' in navigator) {
    const actions = {
      play: () => tryPlay(), pause: () => audio.pause(),
      previoustrack: previousTrack, nexttrack: nextTrack,
      seekbackward: (details) => changeTime(-(details.seekOffset || 10)),
      seekforward: (details) => changeTime(details.seekOffset || 10),
      seekto: (details) => { if (ready && details.seekTime !== undefined) { audio.currentTime = details.seekTime; progress(); } }
    };
    Object.entries(actions).forEach(([name, handler]) => {
      try { navigator.mediaSession.setActionHandler(name, handler); } catch (_e) { /* Optional on browser. */ }
    });
  }
  window.addEventListener('beforeunload', () => {
    for (const url of localAudioOverrides.values()) URL.revokeObjectURL(url);
  });
  audio.volume = Number(volumeBar.value);
  if (tracks.length) {
    const id = new URLSearchParams(location.search).get('song');
    const index = tracks.findIndex(track => track.id === id);
    updateRepeatUi();
    switchTrack(index >= 0 ? index : 0, {updateUrl: index >= 0});
  } else {
    setLyricsMessage('Belum ada lagu. Tambahkan daftar lagu di playlist.js.');
    audioHint.textContent = 'Playlist masih kosong.';
    playButton.disabled = true;
    previousButton.disabled = true;
    nextButton.disabled = true;
  }
})();
