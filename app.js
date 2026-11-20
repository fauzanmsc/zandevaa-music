/**
 * Music Stories — Multi-song music & lyric player for GitHub Pages.
 * Edit playlist.js to add any number of tracks; each has its own audio, cover and lyric file.
 */
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const BASE_URL = new URL('./', document.querySelector('script[src*="app.js"]')?.src || location.href);
  const IS_HTTP = location.protocol === 'http:' || location.protocol === 'https:';
  const tracks = Array.isArray(window.PLAYLIST_TRACKS) ? window.PLAYLIST_TRACKS.filter(t => t && t.id && t.title && t.audio && t.lyricFile) : [];

  function resolvePath(path) {
    if (!path) return '';
    try { return new URL(path, BASE_URL).href; }
    catch (_e) { return path; }
  }

  function getTrackShareUrl(track) {
    if (!track) return location.href.split('#')[0];
    if (IS_HTTP) return new URL(`song/${encodeURIComponent(track.id)}/`, BASE_URL).href;
    const url = new URL(location.href);
    url.hash = '';
    url.searchParams.set('song', track.id);
    return url.toString();
  }

  function setMetaContent(selector, content) {
    const el = document.querySelector(selector);
    if (el && content) el.setAttribute('content', content);
  }
  const audio = $('#audio');
  const playButton = $('#playButton');
  const previousButton = $('#previousButton');
  const nextButton = $('#nextButton');
  const seekControl = $('#seekControl');
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
  let isSeeking = false;
  let seekPointerId = null;
  let pendingSeekTime = 0;
  let followLyrics = true;
  let repeatMode = 'off'; // off: next then stop; all: repeat playlist; one: repeat this song
  let lyricLines = [];
  let lastActiveLine = -1;
  let lyricRequest = 0;
  let themeRequest = 0;
  let toastTimer = null;
  const localAudioOverrides = new Map();
  const paletteCache = new Map();
  const DEFAULT_PALETTE = { baseH: 215, baseS: 0.62, accentH: 34, accentS: 0.68, roseH: 6, roseS: 0.80 };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
        case g: h = ((b - r) / d + 2) * 60; break;
        default: h = ((r - g) / d + 4) * 60; break;
      }
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else[r, g, b] = [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function hslCss(h, s, l, alpha) {
    const [r, g, b] = hslToRgb(h, s, l);
    return alpha === undefined ? rgbToHex(r, g, b) : `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function hueDistance(a, b) {
    const diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
  }

  function extractPaletteFromImage(image) {
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return DEFAULT_PALETTE;
    ctx.drawImage(image, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    const BINS = 24;
    let totalPixels = 0;
    let lightSum = 0;
    let brightPixels = 0;
    const bgBins = Array.from({ length: BINS }, () => ({ w: 0, sin: 0, cos: 0, s: 0 }));
    const accBins = Array.from({ length: BINS }, () => ({ w: 0, sin: 0, cos: 0, s: 0 }));

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 180) continue;
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      totalPixels++;
      lightSum += l;
      if (l > 0.72) brightPixels++;
      if (l < 0.04 || l > 0.95 || s < 0.12) continue;
      const px = (i / 4) % size;
      const py = Math.floor((i / 4) / size);
      const dx = (px / (size - 1)) - 0.5;
      const dy = (py / (size - 1)) - 0.5;
      const centerBoost = 0.6 + 0.8 * Math.max(0, 1 - Math.hypot(dx, dy) * 1.45);
      const idx = Math.floor(h / (360 / BINS)) % BINS;
      const rad = h * Math.PI / 180;
      const sin = Math.sin(rad);
      const cos = Math.cos(rad);

      if (l <= 0.82) {
        const wBg = (0.3 + s) * (1 - Math.abs(l - 0.38) * 0.75) * centerBoost;
        if (wBg > 0) {
          bgBins[idx].w += wBg;
          bgBins[idx].sin += sin * wBg;
          bgBins[idx].cos += cos * wBg;
          bgBins[idx].s += s * wBg;
        }
      }
      if (l >= 0.18 && l <= 0.88 && s >= 0.18) {
        const wAcc = (s * s) * (0.45 + l) * (1 - Math.abs(l - 0.58) * 0.65) * centerBoost;
        if (wAcc > 0) {
          accBins[idx].w += wAcc;
          accBins[idx].sin += sin * wAcc;
          accBins[idx].cos += cos * wAcc;
          accBins[idx].s += s * wAcc;
        }
      }
    }

    const avgLight = totalPixels ? lightSum / totalPixels : 0.25;
    const brightRatio = totalPixels ? brightPixels / totalPixels : 0;
    const isLight = avgLight > 0.56 || brightRatio > 0.42;

    const combineCluster = (bins, center) => {
      let w = 0, sin = 0, cos = 0, s = 0;
      for (const offset of [-1, 0, 1]) {
        const b = bins[(center + offset + BINS) % BINS];
        w += b.w; sin += b.sin; cos += b.cos; s += b.s;
      }
      if (w <= 0) return null;
      const h = (Math.atan2(sin, cos) * 180 / Math.PI + 360) % 360;
      return { h, s: s / w, w };
    };

    let bestBgIdx = -1, bestBgScore = 0;
    for (let i = 0; i < BINS; i++) {
      const score = bgBins[i].w + (bgBins[(i + 1) % BINS].w + bgBins[(i + BINS - 1) % BINS].w) * 0.45;
      if (score > bestBgScore) { bestBgScore = score; bestBgIdx = i; }
    }
    const baseCluster = bestBgIdx >= 0 ? combineCluster(bgBins, bestBgIdx) : null;
    if (!baseCluster || baseCluster.w < 6) {
      return { baseH: 225, baseS: 0.16, accentH: 36, accentS: 0.58, roseH: 18, roseS: 0.60, isLight };
    }

    const pickAccent = (minDistance) => {
      let bestIdx = -1, bestScore = 0;
      for (let i = 0; i < BINS; i++) {
        const binHue = (i + 0.5) * (360 / BINS);
        if (hueDistance(binHue, baseCluster.h) < minDistance) continue;
        const score = accBins[i].w + (accBins[(i + 1) % BINS].w + accBins[(i + BINS - 1) % BINS].w) * 0.4;
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }
      return bestIdx >= 0 ? combineCluster(accBins, bestIdx) : null;
    };

    const accentCluster = pickAccent(42) || pickAccent(24) || { h: (baseCluster.h + 38) % 360, s: 0.65, w: 0 };
    return {
      baseH: baseCluster.h,
      baseS: baseCluster.s,
      accentH: accentCluster.h,
      accentS: accentCluster.s,
      roseH: accentCluster.h,
      roseS: clamp(accentCluster.s + 0.08, 0.52, 0.86),
      isLight
    };
  }

  function blendHue(h1, h2, ratio) {
    let diff = ((h2 - h1 + 540) % 360) - 180;
    return (h1 + diff * ratio + 360) % 360;
  }

  function applyThemePalette(palette) {
    const isLight = Boolean(palette.isLight);
    const baseH = palette.baseH;
    const baseS = clamp(palette.baseS, 0.26, 0.72);
    const accentH = palette.accentH;
    const accentS = clamp(palette.accentS, 0.48, 0.82);
    const roseH = palette.roseH ?? accentH;
    const roseS = clamp(palette.roseS ?? accentS, 0.52, 0.84);
    const surfaceH = hueDistance(baseH, roseH) <= 125 ? blendHue(baseH, roseH, 0.22) : baseH;

    let vars;
    let pageHex;

    if (isLight) {
      const primaryAccentH = baseH;
      const primaryAccentS = clamp(baseS + 0.22, 0.50, 0.78);
      const warmRoseH = accentH;
      const warmRoseS = clamp(accentS, 0.56, 0.84);
      pageHex = hslCss(baseH, clamp(baseS * 0.68, 0.20, 0.44), 0.955);
      const bgTop = hslCss(baseH, clamp(baseS * 0.78, 0.24, 0.52), 0.925);
      const bgBottom = hslCss(warmRoseH, clamp(warmRoseS * 0.45, 0.16, 0.36), 0.945);
      const glowARgb = hslToRgb(baseH, clamp(baseS + 0.26, 0.52, 0.82), 0.68);
      const glowBRgb = hslToRgb(warmRoseH, clamp(warmRoseS, 0.56, 0.84), 0.72);
      const accentRgb = hslToRgb(primaryAccentH, primaryAccentS, 0.42);
      const roseRgb = hslToRgb(warmRoseH, warmRoseS, 0.50);
      const tintRgb = hslToRgb(baseH, clamp(baseS * 0.75, 0.24, 0.48), 0.28);

      vars = {
        '--page': pageHex,
        '--bg-top': bgTop,
        '--bg-bottom': bgBottom,
        '--glow-a': rgbToHex(...glowARgb),
        '--glow-a-rgb': glowARgb.join(', '),
        '--glow-b': rgbToHex(...glowBRgb),
        '--glow-b-rgb': glowBRgb.join(', '),
        '--ink': hslCss(baseH, clamp(baseS + 0.12, 0.34, 0.60), 0.14),
        '--dim': hslCss(baseH, clamp(baseS * 0.55, 0.18, 0.34), 0.34),
        '--muted': hslCss(baseH, clamp(baseS * 0.45, 0.14, 0.28), 0.46),
        '--accent': rgbToHex(...accentRgb),
        '--accent-rgb': accentRgb.join(', '),
        '--accent-soft': hslCss(warmRoseH, clamp(warmRoseS * 0.85, 0.44, 0.74), 0.44),
        '--accent-strong': hslCss(baseH, clamp(baseS + 0.16, 0.40, 0.66), 0.20),
        '--accent-deep': '#ffffff',
        '--rose': rgbToHex(...roseRgb),
        '--rose-rgb': roseRgb.join(', '),
        '--tint-rgb': tintRgb.join(', '),
        '--tint-strong': hslCss(baseH, clamp(baseS + 0.10, 0.30, 0.58), 0.42),
        '--tint-mid': hslCss(baseH, clamp(baseS * 0.55, 0.18, 0.36), 0.25),
        '--card-top': 'rgba(255, 255, 255, 0.78)',
        '--card-mid': 'rgba(248, 250, 255, 0.84)',
        '--card-bottom': 'rgba(243, 247, 254, 0.88)',
        '--panel-top': 'rgba(255, 255, 255, 0.76)',
        '--panel-bottom': 'rgba(244, 247, 253, 0.68)',
        '--dock-bg': 'rgba(255, 255, 255, 0.86)',
        '--topbar-bg': 'rgba(248, 250, 255, 0.76)',
        '--scroll-thumb': hslCss(baseH, clamp(baseS * 0.55, 0.20, 0.40), 0.68),
        '--track-rail': hslCss(baseH, clamp(baseS * 0.45, 0.18, 0.34), 0.20, 0.16),
        '--surface-hover': hslCss(baseH, clamp(baseS * 0.50, 0.20, 0.38), 0.22, 0.09),
        '--surface-subtle': hslCss(baseH, clamp(baseS * 0.50, 0.20, 0.38), 0.22, 0.05),
        '--play-bg-a': hslCss(primaryAccentH, primaryAccentS, 0.44),
        '--play-bg-b': hslCss(primaryAccentH, clamp(primaryAccentS + 0.08, 0.54, 0.82), 0.30),
        '--play-ink': '#ffffff'
      };
    } else {
      const darkSat = clamp(baseS, 0.32, 0.68);
      pageHex = hslCss(surfaceH, darkSat, 0.105);
      const bgTop = hslCss(baseH, clamp(darkSat + 0.08, 0.38, 0.74), 0.185);
      const bgBottom = hslCss(surfaceH, darkSat, 0.082);
      const glowARgb = hslToRgb(baseH, clamp(darkSat + 0.16, 0.56, 0.88), 0.48);
      const glowBRgb = hslToRgb(roseH, clamp(roseS * 0.92, 0.52, 0.84), 0.48);
      const accentRgb = hslToRgb(accentH, accentS, 0.82);
      const roseRgb = hslToRgb(roseH, roseS, 0.76);
      const tintRgb = hslToRgb(surfaceH, clamp(darkSat * 0.62, 0.20, 0.48), 0.86);

      vars = {
        '--page': pageHex,
        '--bg-top': bgTop,
        '--bg-bottom': bgBottom,
        '--glow-a': rgbToHex(...glowARgb),
        '--glow-a-rgb': glowARgb.join(', '),
        '--glow-b': rgbToHex(...glowBRgb),
        '--glow-b-rgb': glowBRgb.join(', '),
        '--ink': '#f2f5fa',
        '--dim': hslCss(surfaceH, clamp(darkSat * 0.38, 0.14, 0.28), 0.75),
        '--muted': hslCss(surfaceH, clamp(darkSat * 0.36, 0.12, 0.26), 0.62),
        '--accent': rgbToHex(...accentRgb),
        '--accent-rgb': accentRgb.join(', '),
        '--accent-soft': hslCss(accentH, clamp(accentS * 0.78, 0.38, 0.68), 0.75),
        '--accent-strong': hslCss(accentH, clamp(accentS + 0.06, 0.54, 0.90), 0.93),
        '--accent-deep': hslCss(surfaceH, clamp(darkSat + 0.06, 0.34, 0.70), 0.11),
        '--rose': rgbToHex(...roseRgb),
        '--rose-rgb': roseRgb.join(', '),
        '--tint-rgb': tintRgb.join(', '),
        '--tint-strong': hslCss(surfaceH, clamp(darkSat * 0.85, 0.28, 0.70), 0.89),
        '--tint-mid': hslCss(surfaceH, clamp(darkSat * 0.45, 0.16, 0.34), 0.85),
        '--card-top': hslCss(surfaceH, clamp(darkSat + 0.04, 0.32, 0.68), 0.21, 0.78),
        '--card-mid': hslCss(surfaceH, darkSat, 0.14, 0.86),
        '--card-bottom': hslCss(surfaceH, darkSat, 0.115, 0.90),
        '--panel-top': hslCss(surfaceH, clamp(darkSat + 0.04, 0.32, 0.68), 0.20, 0.82),
        '--panel-bottom': hslCss(surfaceH, darkSat, 0.135, 0.76),
        '--dock-bg': hslCss(surfaceH, clamp(darkSat + 0.04, 0.32, 0.68), 0.115, 0.84),
        '--topbar-bg': hslCss(surfaceH, darkSat, 0.11, 0.72),
        '--scroll-thumb': hslCss(surfaceH, clamp(darkSat * 0.55, 0.20, 0.40), 0.40),
        '--track-rail': 'rgba(255, 255, 255, 0.18)',
        '--surface-hover': 'rgba(255, 255, 255, 0.08)',
        '--surface-subtle': 'rgba(255, 255, 255, 0.045)',
        '--play-bg-a': hslCss(accentH, clamp(accentS + 0.06, 0.54, 0.90), 0.93),
        '--play-bg-b': rgbToHex(...accentRgb),
        '--play-ink': hslCss(surfaceH, clamp(darkSat + 0.06, 0.34, 0.70), 0.11)
      };
    }

    document.documentElement.dataset.themeMode = isLight ? 'light' : 'dark';
    const rootStyle = document.documentElement.style;
    for (const [name, value] of Object.entries(vars)) rootStyle.setProperty(name, value);
    setMetaContent('meta[name="theme-color"]', pageHex);
  }

  function applyTrackTheme(track, coverUrl) {
    const reqId = ++themeRequest;
    if (track?.theme && typeof track.theme.baseHue === 'number') {
      applyThemePalette({
        baseH: track.theme.baseHue,
        baseS: track.theme.baseSat ?? 0.52,
        accentH: track.theme.accentHue ?? (track.theme.baseHue + 38) % 360,
        accentS: track.theme.accentSat ?? 0.68,
        roseH: track.theme.roseHue ?? track.theme.accentHue ?? (track.theme.baseHue + 38) % 360,
        roseS: track.theme.roseSat ?? 0.76
      });
      return;
    }
    if (paletteCache.has(coverUrl)) {
      applyThemePalette(paletteCache.get(coverUrl));
      return;
    }
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.decoding = 'async';
    probe.onload = () => {
      if (reqId !== themeRequest) return;
      try {
        const palette = extractPaletteFromImage(probe);
        paletteCache.set(coverUrl, palette);
        applyThemePalette(palette);
      } catch (_e) {
        applyThemePalette(DEFAULT_PALETTE);
      }
    };
    probe.onerror = () => {
      if (reqId === themeRequest) applyThemePalette(DEFAULT_PALETTE);
    };
    probe.src = coverUrl;
  }

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
    const artist = track.artist || 'Zandevaa';
    const fullTitle = `${track.title} — ${artist}`;
    const coverUrl = resolvePath(track.cover || 'assets/cover-lagu-kedua.png');
    const ogImageUrl = resolvePath(track.ogImage || track.cover || 'assets/cover-lagu-kedua.png');
    const description = track.description || 'Sebuah lagu dan cerita yang ditulis sepenuh hati.';
    setTitle(track.title);
    $('#heroDate').textContent = track.date || 'A PERSONAL MUSIC STORY';
    $('#heroDescription').textContent = description;
    $('#heroCover').src = coverUrl;
    $('#heroCover').alt = `Cover lagu ${track.title}`;
    $('#heroArtist').textContent = `by ${artist}`;
    $('#heroDedication').textContent = `“${track.dedication || 'Ada cerita di balik setiap lagu.'}”`;
    $('#dedicationTitle').textContent = `— ${track.title}`;
    $('#playerCover').src = coverUrl;
    $('#playerTitle').textContent = track.title;
    $('#playerArtist').textContent = artist;
    $('#lyricsTrackTitle').textContent = track.title.toUpperCase();
    document.documentElement.style.setProperty('--cover-bg', `url("${coverUrl}")`);
    applyTrackTheme(track, coverUrl);
    document.title = fullTitle;
    setMetaContent('meta[name="description"]', description);
    setMetaContent('meta[property="og:title"]', fullTitle);
    setMetaContent('meta[property="og:description"]', description);
    setMetaContent('meta[property="og:image"]', ogImageUrl);
    setMetaContent('meta[property="og:url"]', getTrackShareUrl(track));
    setMetaContent('meta[name="twitter:title"]', fullTitle);
    setMetaContent('meta[name="twitter:description"]', description);
    setMetaContent('meta[name="twitter:image"]', ogImageUrl);
    $('#lyricsScroll').setAttribute('aria-label', `Lirik lagu ${track.title}. Geser untuk membaca.`);
    $('#playlistCount').textContent = `${String(tracks.length).padStart(2, '0')} LAGU`;
    if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist,
        album: 'Music Stories',
        artwork: [{ src: coverUrl }]
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
      image.src = resolvePath(track.cover || 'assets/cover-lagu-kedua.png');
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

  function setSeekVisual(percentage) {
    const clamped = clamp(percentage, 0, 100);
    seekBar.value = String(clamped);
    if (seekControl) seekControl.style.setProperty('--progress', `${clamped}%`);
  }

  function setReady(value) {
    ready = value;
    seekBar.disabled = !value;
    if (seekControl) seekControl.classList.toggle('is-disabled', !value);
    if (value) {
      audioFailed = false;
      const isLocal = localAudioOverrides.has(currentTrack().id);
      audioHint.textContent = isLocal
        ? `♪ MP3 lokal untuk “${currentTrack().title}” siap diputar.`
        : `♪ “${currentTrack().title}” siap didengarkan.`;
      audioHint.classList.add('has-track');
      audioHint.hidden = !isLocal;
    } else {
      audioHint.classList.remove('has-track');
      audioHint.hidden = false;
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
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    $('#totalTime').textContent = timeString(duration);
    if (isSeeking) return;
    const elapsed = audio.currentTime || 0;
    $('#currentTime').textContent = timeString(elapsed);
    const percentage = duration ? clamp(elapsed / duration * 100, 0, 100) : 0;
    setSeekVisual(percentage);
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
        section = { title: heading[1], lines: [] };
        sections.push(section);
        continue;
      }
      if (!section) { section = { title: 'Lyrics', lines: [] }; sections.push(section); }
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
        lines.push({ time: Number(m[1]) * 60 + Number(m[2]) + fraction, text: words });
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
        lyricLines.push({ element: line, text, time: null });
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
        const response = await fetch(resolvePath(track.lyricFile), { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        text = await response.text();
      }
      if (requestId !== lyricRequest) return;
      const isLrc = /\.lrc(?:$|\?)/i.test(track.lyricFile);
      const entries = isLrc ? parseLrc(text) : [];
      const sections = isLrc ? [{ title: 'Song Lyrics', lines: entries.map(row => row.text) }] : parseTextLyrics(text);
      if (sections.length === 0) throw new Error('File lirik kosong');
      renderLyrics(sections);
      if (isLrc) applyLrc(entries);
      else if (track.lrcFile) {
        try {
          const sample = window.PLAYLIST_INLINE_LRC?.[track.id];
          let lrc;
          if (typeof sample === 'string') lrc = sample;
          else {
            const resp = await fetch(resolvePath(track.lrcFile), { cache: 'no-cache' });
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
    lyricsScroll.scrollTo({ top: lyricsScroll.scrollTop + offset, behavior: 'smooth' });
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
      history.replaceState({}, '', getTrackShareUrl(track));
    } catch (_e) { /* E.g. sandboxed local HTML preview. */ }
  }

  function switchTrack(index, { autoplay = false, updateUrl = true } = {}) {
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
    isSeeking = false;
    seekPointerId = null;
    if (seekControl) seekControl.classList.remove('is-seeking');
    $('#currentTime').textContent = '0:00';
    $('#totalTime').textContent = '0:00';
    setSeekVisual(0);
    audioHint.textContent = `Memuat sumber musik “${track.title}”…`;
    loadLyricsForTrack(track, requestId);
    if (updateUrl) updatePageLink(track);
    audio.src = localAudioOverrides.get(track.id) || resolvePath(track.audio);
    audio.load();
    if (autoplay) tryPlay();
  }

  function nextTrack() { switchTrack((activeIndex + 1) % tracks.length, { autoplay: true }); }
  function previousTrack() {
    if (ready && audio.currentTime > 3) { audio.currentTime = 0; progress(); return; }
    switchTrack((activeIndex - 1 + tracks.length) % tracks.length, { autoplay: true });
  }

  function updateRepeatUi() {
    repeatButton.dataset.mode = repeatMode;
    const labels = { off: 'Pengulangan mati', all: 'Ulang seluruh playlist', one: 'Ulang lagu ini' };
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
    switchTrack(index, { autoplay: true });
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
    switchTrack(activeIndex, { autoplay: true });
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
    if (activeIndex < tracks.length - 1) { switchTrack(activeIndex + 1, { autoplay: true }); return; }
    if (repeatMode === 'all') { switchTrack(0, { autoplay: true }); return; }
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

  function scrubToClientX(clientX, { commit = false } = {}) {
    if (!ready || !Number.isFinite(audio.duration) || audio.duration <= 0 || !seekControl) return;
    const rect = seekControl.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const targetTime = ratio * audio.duration;
    pendingSeekTime = targetTime;
    setSeekVisual(ratio * 100);
    $('#currentTime').textContent = timeString(targetTime);
    syncActiveLyric(targetTime);
    if (commit) audio.currentTime = targetTime;
  }

  if (seekControl) {
    seekControl.addEventListener('pointerdown', (event) => {
      if (!ready || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      isSeeking = true;
      seekPointerId = event.pointerId;
      seekControl.classList.add('is-seeking');
      try { seekControl.setPointerCapture(event.pointerId); } catch (_e) { /* Optional. */ }
      scrubToClientX(event.clientX, { commit: false });
    });
    seekControl.addEventListener('pointermove', (event) => {
      if (!isSeeking || event.pointerId !== seekPointerId) return;
      event.preventDefault();
      scrubToClientX(event.clientX, { commit: false });
    });
    const finishSeek = (event) => {
      if (!isSeeking || event.pointerId !== seekPointerId) return;
      scrubToClientX(event.clientX, { commit: true });
      isSeeking = false;
      seekPointerId = null;
      seekControl.classList.remove('is-seeking');
      try { seekControl.releasePointerCapture(event.pointerId); } catch (_e) { /* Optional. */ }
      progress();
    };
    seekControl.addEventListener('pointerup', finishSeek);
    seekControl.addEventListener('pointercancel', (event) => {
      if (!isSeeking || event.pointerId !== seekPointerId) return;
      if (Number.isFinite(pendingSeekTime)) audio.currentTime = pendingSeekTime;
      isSeeking = false;
      seekPointerId = null;
      seekControl.classList.remove('is-seeking');
      progress();
    });
  }

  // Keyboard & assistive technology fallback for the underlying range input.
  seekBar.addEventListener('input', () => {
    if (isSeeking || !ready || !Number.isFinite(audio.duration)) return;
    const pct = clamp(Number(seekBar.value), 0, 100);
    audio.currentTime = pct / 100 * audio.duration;
    setSeekVisual(pct);
    progress();
  });

  // Prevent mobile pinch-zoom gestures while preserving normal scroll & seek scrubbing.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  });
  document.addEventListener('touchmove', (event) => {
    if (event.touches.length > 1) event.preventDefault();
  }, { passive: false });
  volumeBar.addEventListener('input', () => { audio.volume = Number(volumeBar.value); });
  repeatButton.addEventListener('click', () => {
    repeatMode = { off: 'all', all: 'one', one: 'off' }[repeatMode];
    updateRepeatUi();
    showToast({ off: 'Pengulangan dimatikan', all: 'Ulangi seluruh playlist', one: 'Ulangi lagu ini' }[repeatMode]);
  });
  $('#topLyrics').addEventListener('click', () => {
    followLyrics = false;
    updateFollowButton();
    lyricsScroll.scrollTo({ top: 0, behavior: 'smooth' });
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
    }, { passive: true });
  });
  $('#shareButton').addEventListener('click', async () => {
    const track = currentTrack();
    const url = getTrackShareUrl(track);
    const shareTitle = `${track.title} — ${track.artist || 'Zandevaa'}`;
    const payload = { title: shareTitle, text: `${shareTitle} — Ada lagu dan cerita kecil untukmu. ♡`, url };
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
    const rawSongParam = new URLSearchParams(location.search).get('song');
    const normalizedParam = rawSongParam ? rawSongParam.trim().toLowerCase() : '';
    const index = normalizedParam
      ? tracks.findIndex(track =>
        track.id.toLowerCase() === normalizedParam ||
        track.title.toLowerCase() === normalizedParam
      )
      : -1;
    updateRepeatUi();
    switchTrack(index >= 0 ? index : 0, { updateUrl: IS_HTTP || index >= 0 });
  } else {
    setLyricsMessage('Belum ada lagu. Tambahkan daftar lagu di playlist.js.');
    audioHint.textContent = 'Playlist masih kosong.';
    playButton.disabled = true;
    previousButton.disabled = true;
    nextButton.disabled = true;
  }
})();
