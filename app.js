/**
 * Music Stories — Multi-song music & lyric player for GitHub Pages.
 * Edit playlist.js to add any number of tracks; each has its own audio, cover and lyric file.
 */
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const BASE_URL = new URL('./', document.querySelector('script[src*="app.js"]')?.src || location.href);
  const IS_HTTP = location.protocol === 'http:' || location.protocol === 'https:';
  const IS_IOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const IS_MOBILE = window.matchMedia?.('(max-width: 768px)').matches || ('ontouchstart' in window);
  const tracks = Array.isArray(window.PLAYLIST_TRACKS) ? window.PLAYLIST_TRACKS.filter(t => t && t.id && t.title && t.audio && t.lyricFile) : [];

  function triggerHaptic(ms = 10) {
    try { if (typeof navigator.vibrate === 'function') navigator.vibrate(ms); }
    catch (_e) { /* Unsupported. */ }
  }

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
  const musicDock = $('#musicDock');
  const miniProgressFill = $('#miniProgressFill');
  const playButton = $('#playButton');
  const previousButton = $('#previousButton');
  const nextButton = $('#nextButton');
  const shuffleButton = $('#shuffleButton');
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

  // New UI refs (Full-Screen Now Playing, Focus Lyrics, Sleep Timer, Lyric Card Studio, Favorites)
  const nowPlayingSheet = $('#nowPlayingSheet');
  const sheetSeekControl = $('#sheetSeekControl');
  const sheetSeekBar = $('#sheetSeekBar');
  const sheetLyricsScroll = $('#sheetLyricsScroll');
  const sheetLyricsContent = $('#sheetLyricsContent');
  const visualizerCanvas = $('#visualizerCanvas');
  const sleepTimerModal = $('#sleepTimerModal');
  const lyricCardModal = $('#lyricCardModal');
  const lyricCardCanvas = $('#lyricCardCanvas');
  const lyricCardLinesEl = $('#lyricCardLines');
  const eqModal = $('#eqModal');
  const lrcSyncModal = $('#lrcSyncModal');
  const welcomeGate = $('#welcomeGate');
  const shortcutsModal = $('#shortcutsModal');
  const voiceNoteAudio = $('#voiceNoteAudio');
  const installAppButton = $('#installAppButton');

  const EQ_PRESETS = {
    normal: { label: 'Normal', low: 0, mid: 0, high: 0 },
    warm: { label: 'Warm Acoustic', low: 2.5, mid: 1.5, high: -1.5 },
    bass: { label: 'Bass Boost', low: 6, mid: -1, high: 1.5 },
    vocal: { label: 'Vocal Clear', low: -2, mid: 4.5, high: 2.5 },
    night: { label: 'Late Night', low: -3, mid: 1, high: -4 }
  };

  const STORAGE_KEY = 'zandevaa_music_prefs_v1';
  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_e) { return {}; }
  }
  const prefs = loadPrefs();
  function savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        favorites: [...favorites],
        playCounts,
        shuffle: shuffleMode,
        repeatMode,
        eqPreset,
        playbackSpeed,
        vinylMode,
        playlistView,
        volume: targetVolume,
        lastTrackId: currentTrack()?.id || '',
        lastTime: Number.isFinite(audio.currentTime) ? Math.floor(audio.currentTime) : 0
      }));
    } catch (_e) { /* Ignore private browsing quota errors. */ }
  }

  let activeIndex = 0;
  let upcomingIndex = 0;
  let ready = false;
  let audioFailed = false;
  let userWantsPlaying = false;
  let networkRetryCount = 0;
  let networkRetryTimer = null;
  let stallWatchTimer = null;
  let isSeeking = false;
  let seekPointerId = null;
  let activeSeekControl = null;
  let pendingSeekTime = 0;
  let followLyrics = true;
  let shuffleMode = Boolean(prefs.shuffle);
  let repeatMode = ['off', 'all', 'one'].includes(prefs.repeatMode) ? prefs.repeatMode : 'off';
  let eqPreset = EQ_PRESETS[prefs.eqPreset] ? prefs.eqPreset : 'normal';
  let playbackSpeed = [0.85, 0.95, 1, 1.1].includes(Number(prefs.playbackSpeed)) ? Number(prefs.playbackSpeed) : 1;
  let vinylMode = Boolean(prefs.vinylMode);
  let playlistView = 'grid';
  let ambientMode = 'off'; // 'off' | 'vinyl' | 'rain'
  let ambientVolume = 0.28;
  let ambientCtx = null;
  let ambientSource = null;
  let ambientGain = null;
  let mutedBeforeVolume = 0.85;
  let quotedLineIndex = -1;
  let targetVolume = Number.isFinite(prefs.volume) ? Math.min(1, Math.max(0, prefs.volume)) : Number(volumeBar.value || 0.85);
  let favorites = new Set(Array.isArray(prefs.favorites) ? prefs.favorites : []);
  const playCounts = (prefs.playCounts && typeof prefs.playCounts === 'object') ? { ...prefs.playCounts } : {};
  let countedTrackSession = false;
  let isCinemaMode = false;
  let pendingMomentToast = '';
  let cachedAccentColor = '#f1cfa8';
  let cachedRoseColor = '#f2968e';
  const preloadedCovers = new Set();
  let playlistFilter = 'all'; // 'all' | 'favorites'
  let playlistQuery = '';
  const trackDurations = new Map();
  let deferredInstallPrompt = null;
  let lyricLines = [];
  let sheetLyricLines = [];
  let currentSections = [];
  let currentRawLyrics = '';
  let lastActiveLine = -1;
  let lyricRequest = 0;
  let themeRequest = 0;
  let toastTimer = null;
  let currentPalette = null;
  let isSheetOpen = false;
  let activeSheetTab = 'player';
  let isMiniDock = false;
  let pendingRestoreTime = 0;
  let lastSavedSecond = -1;

  // Web Audio API (3-band EQ + Visualizer + smooth fade)
  let audioCtx = null;
  let lowEqNode = null;
  let midEqNode = null;
  let highEqNode = null;
  let gainNode = null;
  let analyserNode = null;
  let freqData = null;
  let audioGraphReady = false;
  let audioGraphFailed = false;
  let visualizerRaf = null;
  let pauseFadeTimer = null;

  // Tap-to-Sync .lrc Studio state
  let syncLines = [];
  let syncTimedEntries = [];
  let syncClockRaf = null;

  // Sleep Timer state
  let sleepMode = 'off'; // 'off' | 'end-of-track' | 'minutes'
  let sleepEndTimestamp = 0;
  let sleepTickInterval = null;

  // Share Lyric Card state
  let lyricCardRatio = 'story'; // 'story' (9:16) | 'post' (4:5)
  let selectedCardLineIndices = [];
  let cardCoverImage = null;

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

    currentPalette = { ...palette, isLight, pageHex };
    cachedAccentColor = vars['--accent'] || '#f1cfa8';
    cachedRoseColor = vars['--rose'] || '#f2968e';
    document.documentElement.dataset.themeMode = isLight ? 'light' : 'dark';
    const rootStyle = document.documentElement.style;
    for (const [name, value] of Object.entries(vars)) rootStyle.setProperty(name, value);
    setMetaContent('meta[name="theme-color"]', pageHex);
    if (!lyricCardModal.hidden) renderLyricCard();
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
    if ($('#heroChapter')) $('#heroChapter').textContent = (track.chapter || `CHAPTER ${String(activeIndex + 1).padStart(2, '0')}`).toUpperCase();
    $('#heroDate').textContent = track.date || 'A PERSONAL MUSIC STORY';
    if ($('#heroMood')) {
      $('#heroMood').textContent = track.mood || 'Personal Story';
      $('#heroMood').hidden = !track.mood;
    }
    $('#heroDescription').textContent = description;
    $('#heroCover').src = coverUrl;
    $('#heroCover').alt = `Cover lagu ${track.title}`;
    if ($('#heroVinylLabel')) $('#heroVinylLabel').src = coverUrl;
    if ($('#sheetVinylLabel')) $('#sheetVinylLabel').src = coverUrl;
    if ($('#sheetMood')) {
      $('#sheetMood').textContent = track.mood || 'Music Stories';
    }
    $('#heroArtist').textContent = `by ${artist}`;
    $('#heroDedication').textContent = `“${track.dedication || 'Ada cerita di balik setiap lagu.'}”`;
    $('#dedicationTitle').textContent = `— ${track.title}`;
    const storyBox = $('#storyBox');
    const heroStory = $('#heroStory');
    const vnBtn = $('#voiceNoteButton');
    if (voiceNoteAudio) {
      voiceNoteAudio.pause();
      voiceNoteAudio.removeAttribute('src');
    }
    if (vnBtn) {
      vnBtn.classList.remove('is-playing');
      if ($('#voiceNoteLabel')) $('#voiceNoteLabel').textContent = 'Pesan Suara';
      vnBtn.hidden = !track.voiceNote;
    }
    if (storyBox && heroStory) {
      const hasStory = Boolean(track.story || track.voiceNote);
      storyBox.hidden = !hasStory;
      heroStory.textContent = track.story || '';
      heroStory.hidden = !track.story;
    }
    $('#playerCover').src = coverUrl;
    $('#playerTitle').textContent = track.title;
    $('#playerArtist').textContent = artist;
    $('#sheetCover').src = coverUrl;
    $('#sheetCover').alt = `Cover lagu ${track.title}`;
    $('#sheetTitle').textContent = track.title;
    $('#sheetArtist').textContent = artist;
    $('#sheetLyricsTrackTitle').textContent = track.title;
    $('#sheetLyricsTrackArtist').textContent = artist;
    $('#lyricsTrackTitle').textContent = track.title.toUpperCase();
    document.documentElement.style.setProperty('--cover-bg', `url("${coverUrl}")`);
    applyTrackTheme(track, coverUrl);
    updateFavoriteUi();
    refreshUpcomingTrack();
    renderChapterTimeline();
    requestAnimationFrame(syncAllMarquees);
    hideQuoteQuickBar();
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
      const jpegArt = resolvePath(`assets/og/${track.id}.jpg`);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist,
        album: 'Music Stories — Zandevaa',
        artwork: [
          { src: jpegArt, sizes: '800x800', type: 'image/jpeg' },
          { src: coverUrl, sizes: '1000x1000', type: /\.png$/i.test(coverUrl) ? 'image/png' : 'image/webp' }
        ]
      });
    }
  }

  function renderChapterTimeline() {
    const strip = $('#chapterTimeline');
    if (!strip) return;
    if (tracks.length <= 1) { strip.hidden = true; return; }
    strip.hidden = false;
    const frag = document.createDocumentFragment();
    tracks.forEach((track, idx) => {
      if (idx > 0) {
        const line = document.createElement('span');
        line.className = 'chapter-connector';
        line.setAttribute('aria-hidden', 'true');
        frag.append(line);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `chapter-pill${idx === activeIndex ? ' active' : ''}`;
      btn.dataset.chapterIndex = String(idx);
      btn.setAttribute('aria-current', idx === activeIndex ? 'true' : 'false');
      const num = document.createElement('span');
      num.className = 'chapter-pill-num';
      num.textContent = String(idx + 1).padStart(2, '0');
      const label = document.createElement('span');
      label.textContent = track.title;
      btn.append(num, label);
      frag.append(btn);
    });
    strip.replaceChildren(frag);
    const activePill = strip.querySelector('.chapter-pill.active');
    if (activePill && typeof activePill.scrollIntoView === 'function') {
      activePill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  function applyVinylMode(enabled, { silent = false } = {}) {
    vinylMode = Boolean(enabled);
    document.body.classList.toggle('vinyl-mode', vinylMode);
    for (const btn of [$('#vinylToggleBtn'), $('#sheetVinylButton')]) {
      if (!btn) continue;
      btn.setAttribute('aria-pressed', String(vinylMode));
      btn.title = vinylMode ? 'Kembali ke tampilan Cover' : 'Aktifkan Mode Vinyl';
    }
    const toggleLabel = $('#vinylToggleBtn span');
    if (toggleLabel) toggleLabel.textContent = vinylMode ? 'Cover' : 'Vinyl';
    savePrefs();
    if (!silent) showToast(vinylMode ? 'Mode Vinyl aktif ◎' : 'Tampilan Cover aktif');
  }

  function applyPlaylistView(view) {
    playlistView = view === 'grid' ? 'grid' : 'list';
    playlistList.classList.toggle('is-grid', playlistView === 'grid');
    $('#playlistViewListBtn')?.classList.toggle('active', playlistView === 'list');
    $('#playlistViewListBtn')?.setAttribute('aria-pressed', String(playlistView === 'list'));
    $('#playlistViewGridBtn')?.classList.toggle('active', playlistView === 'grid');
    $('#playlistViewGridBtn')?.setAttribute('aria-pressed', String(playlistView === 'grid'));
    savePrefs();
  }

  // ─── Independent Procedural Ambient Sound (Vinyl Crackle & Soft Rain) ───
  // Kept in its own AudioContext so native <audio> background playback on mobile is NEVER affected.
  function stopAmbientSound() {
    if (ambientSource) {
      try { ambientSource.stop(); ambientSource.disconnect(); } catch (_e) { /* Ignore. */ }
      ambientSource = null;
    }
    if (ambientCtx && ambientCtx.state === 'running') {
      ambientCtx.suspend().catch(() => { /* Ignore. */ });
    }
  }

  function startAmbientSound(mode) {
    if (mode === 'off') { stopAmbientSound(); return; }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      if (!ambientCtx) {
        ambientCtx = new AudioCtx();
        ambientGain = ambientCtx.createGain();
        ambientGain.connect(ambientCtx.destination);
      }
      if (ambientCtx.state === 'suspended') ambientCtx.resume().catch(() => { /* Ignore. */ });
      if (ambientSource) {
        try { ambientSource.stop(); ambientSource.disconnect(); } catch (_e) { /* Ignore. */ }
      }
      const sr = ambientCtx.sampleRate;
      const len = sr * 4;
      const buffer = ambientCtx.createBuffer(1, len, sr);
      const out = buffer.getChannelData(0);

      if (mode === 'vinyl') {
        let last = 0;
        for (let i = 0; i < len; i++) {
          const white = Math.random() * 2 - 1;
          last = (last + 0.03 * white) / 1.03;
          let crackle = 0;
          if (Math.random() < 0.00055) crackle = (Math.random() * 2 - 1) * 0.42;
          else if (Math.random() < 0.003) crackle = (Math.random() * 2 - 1) * 0.11;
          out[i] = last * 0.28 + crackle;
        }
      } else {
        // Soft night rain (pink-ish filtered noise)
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < len; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.997 * b0 + white * 0.029;
          b1 = 0.985 * b1 + white * 0.032;
          b2 = 0.950 * b2 + white * 0.048;
          out[i] = (b0 + b1 + b2 + white * 0.015) * 0.45;
        }
      }

      const src = ambientCtx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const filter = ambientCtx.createBiquadFilter();
      filter.type = mode === 'vinyl' ? 'bandpass' : 'lowpass';
      filter.frequency.value = mode === 'vinyl' ? 1400 : 950;
      filter.Q.value = mode === 'vinyl' ? 0.55 : 0.7;

      src.connect(filter);
      filter.connect(ambientGain);
      ambientGain.gain.setValueAtTime(ambientVolume * (mode === 'vinyl' ? 0.55 : 0.45), ambientCtx.currentTime);
      src.start();
      ambientSource = src;
    } catch (_e) {
      stopAmbientSound();
    }
  }

  function setAmbientMode(mode, { silent = false } = {}) {
    ambientMode = ['off', 'vinyl', 'rain'].includes(mode) ? mode : 'off';
    eqModal?.querySelectorAll('#ambientOptions .speed-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.ambient === ambientMode);
    });
    if ($('#ambientVolRow')) $('#ambientVolRow').hidden = ambientMode === 'off';
    if (ambientMode === 'off') {
      stopAmbientSound();
    } else if (!audio.paused) {
      startAmbientSound(ambientMode);
    }
    if (!silent) {
      const labels = { off: 'Atmosfer dimatikan', vinyl: 'Atmosfer: Vinyl Crackle ◎', rain: 'Atmosfer: Soft Rain 🌧' };
      showToast(labels[ambientMode]);
    }
  }

  function showWelcomeGateForTrack(track) {
    if (!welcomeGate || !track) return;
    if ($('#welcomeCover')) $('#welcomeCover').src = resolvePath(track.cover || 'assets/cover.webp');
    if ($('#welcomeTitle')) $('#welcomeTitle').textContent = track.title;
    if ($('#welcomeNote')) $('#welcomeNote').textContent = `“${track.dedication || track.description || 'Ada lagu dan cerita kecil untukmu.'}”`;
    welcomeGate.hidden = false;
    welcomeGate.classList.remove('is-leaving');
  }

  function dismissWelcomeGate({ autoplay = false } = {}) {
    if (!welcomeGate || welcomeGate.hidden) return;
    try { sessionStorage.setItem('zandevaa_opened', '1'); } catch (_e) { /* Ignore. */ }
    welcomeGate.classList.add('is-leaving');
    setTimeout(() => { welcomeGate.hidden = true; welcomeGate.classList.remove('is-leaving'); }, 340);
    if (autoplay) tryPlay();
  }

  function syncMarquee(wrapEl, textEl) {
    if (!wrapEl || !textEl) return;
    wrapEl.classList.remove('is-marquee');
    wrapEl.style.removeProperty('--marquee-shift');
    wrapEl.style.removeProperty('--marquee-duration');
    const overflow = Math.ceil(textEl.scrollWidth - wrapEl.clientWidth);
    if (overflow > 6) {
      const shift = overflow + 18;
      const duration = clamp(shift / 24 + 4.5, 6, 16);
      wrapEl.style.setProperty('--marquee-shift', `-${shift}px`);
      wrapEl.style.setProperty('--marquee-duration', `${duration.toFixed(1)}s`);
      wrapEl.classList.add('is-marquee');
    }
  }

  function syncAllMarquees() {
    syncMarquee($('#dockTitleWrap'), $('#playerTitle'));
    if (isSheetOpen) syncMarquee($('#sheetTitleWrap'), $('#sheetTitle'));
  }

  function hideQuoteQuickBar() {
    quotedLineIndex = -1;
    if ($('#quoteQuickBar')) $('#quoteQuickBar').hidden = true;
    lyricsContent.querySelectorAll('.lyric-line.quote-selected').forEach((el) => el.classList.remove('quote-selected'));
    sheetLyricsContent?.querySelectorAll('.lyric-line.quote-selected').forEach((el) => el.classList.remove('quote-selected'));
  }

  function getMostPlayedTrackId() {
    let bestId = '';
    let bestCount = 1; // Only show badge once a track has been played at least 2 times
    for (const track of tracks) {
      const count = Number(playCounts[track.id] || 0);
      if (count > bestCount) { bestCount = count; bestId = track.id; }
    }
    return bestId;
  }

  function renderPlaylist() {
    if ($('#favCountBadge')) $('#favCountBadge').textContent = String(favorites.size);
    const topPlayedId = getMostPlayedTrackId();
    const query = playlistQuery.trim().toLowerCase();
    const filtered = tracks
      .map((track, index) => ({ track, index }))
      .filter(({ track }) => {
        if (playlistFilter === 'favorites' && !favorites.has(track.id)) return false;
        if (!query) return true;
        const haystack = `${track.title} ${track.artist || ''} ${track.description || ''}`.toLowerCase();
        return haystack.includes(query);
      });

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'playlist-empty';
      empty.textContent = playlistFilter === 'favorites'
        ? 'Belum ada lagu favorit. Ketuk ikon ♡ untuk menyimpan lagu favoritmu.'
        : `Tidak ada lagu yang cocok dengan “${playlistQuery.trim()}”.`;
      playlistList.replaceChildren(empty);
      return;
    }

    const list = document.createDocumentFragment();
    filtered.forEach(({ track, index }) => {
      const selected = index === activeIndex;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `playlist-item${selected ? ' selected' : ''}`;
      button.dataset.trackIndex = String(index);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', `Pilih ${track.title}, ${track.artist || 'Zandevaa'}`);
      const thumbWrap = document.createElement('span');
      thumbWrap.className = 'playlist-thumb-wrap';
      const number = document.createElement('span');
      number.className = 'playlist-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const image = document.createElement('img');
      image.className = 'playlist-thumb';
      image.src = resolvePath(track.cover || 'assets/cover-lagu-kedua.webp');
      image.alt = '';
      image.loading = 'lazy';
      const details = document.createElement('span');
      details.className = 'playlist-details';
      const title = document.createElement('strong');
      title.textContent = track.title;
      if (favorites.has(track.id)) {
        const heart = document.createElement('span');
        heart.className = 'playlist-fav-mark';
        heart.textContent = '♥';
        heart.setAttribute('aria-label', 'Favorit');
        title.append(heart);
      }
      if (track.id === topPlayedId) {
        const topBadge = document.createElement('span');
        topBadge.className = 'playlist-top-badge';
        topBadge.textContent = '✦ Sering diputar';
        title.append(topBadge);
      }
      const artist = document.createElement('small');
      artist.textContent = track.mood ? `${track.artist || 'Zandevaa'} · ${track.mood}` : (track.artist || 'Zandevaa');
      details.append(title, artist);
      const dur = document.createElement('span');
      dur.className = 'playlist-duration';
      dur.textContent = trackDurations.get(track.id) || track.duration || '';
      const icon = document.createElement('span');
      icon.className = 'playlist-indicator';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = '<svg class="pi-play" viewBox="0 0 24 24"><path d="M8.5 5.6v12.8c0 .8.9 1.3 1.6.9l9.4-6.4a1.1 1.1 0 0 0 0-1.8L10.1 4.7c-.7-.4-1.6.1-1.6.9Z" /></svg><span class="pi-eq"><i></i><i></i><i></i></span>';
      if (selected && !audio.paused && !audio.ended && !audio.error) {
        button.classList.add('currently-playing');
      }
      thumbWrap.append(number, image, dur, icon);
      button.append(thumbWrap, details);
      list.append(button);
    });
    playlistList.replaceChildren(list);
  }

  function updatePlayState() {
    const playing = !audio.paused && !audio.ended && !audio.error;
    document.body.classList.toggle('is-playing', playing);
    playButton.setAttribute('aria-label', playing ? 'Jeda lagu' : `Putar ${currentTrack()?.title || 'lagu'}`);
    playButton.title = playing ? 'Jeda' : 'Putar';
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
      } catch (_e) { /* Optional. */ }
    }
    if (playing) {
      trackState.textContent = 'NOW PLAYING';
      startVisualizerLoop();
      if (ambientMode !== 'off') startAmbientSound(ambientMode);
    } else {
      stopVisualizerLoop();
      if (ambientMode !== 'off') stopAmbientSound();
      if (audioFailed) trackState.textContent = 'MP3 BELUM TERSEDIA';
      else if (ready) trackState.textContent = 'READY TO PLAY';
      else trackState.textContent = 'LOADING AUDIO';
    }
    playlistList.querySelectorAll('.playlist-item').forEach((row) => {
      row.classList.toggle('currently-playing', playing && Number(row.dataset.trackIndex) === activeIndex);
    });
    updateMediaPositionState();
  }

  function applyPlaybackSpeed(speed, { silent = false } = {}) {
    const val = [0.85, 0.95, 1, 1.1].includes(Number(speed)) ? Number(speed) : 1;
    playbackSpeed = val;
    audio.playbackRate = val;
    if ('preservesPitch' in audio) audio.preservesPitch = val >= 0.95;
    if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = val >= 0.95;
    eqModal?.querySelectorAll('.speed-pill').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.speed) === val);
    });
    const active = eqPreset !== 'normal' || playbackSpeed !== 1;
    for (const btn of [$('#eqButton'), $('#sheetEqButton')]) {
      if (btn) btn.setAttribute('aria-pressed', String(active));
    }
    updateMediaPositionState();
    savePrefs();
    if (!silent) {
      const label = val === 0.85 ? '0.85× Slowed' : val === 0.95 ? '0.95× Chill' : val === 1.1 ? '1.1× Bright' : '1.0× Normal';
      showToast(`Playback Mood: ${label}`);
    }
  }

  function applyEqPreset(presetKey, { silent = false } = {}) {
    const key = EQ_PRESETS[presetKey] ? presetKey : 'normal';
    eqPreset = key;
    const p = EQ_PRESETS[key];
    if (audioGraphReady && audioCtx && lowEqNode && midEqNode && highEqNode) {
      const now = audioCtx.currentTime;
      lowEqNode.gain.setTargetAtTime(p.low, now, 0.04);
      midEqNode.gain.setTargetAtTime(p.mid, now, 0.04);
      highEqNode.gain.setTargetAtTime(p.high, now, 0.04);
    }
    const active = key !== 'normal' || playbackSpeed !== 1;
    for (const btn of [$('#eqButton'), $('#sheetEqButton')]) {
      if (!btn) continue;
      btn.setAttribute('aria-pressed', String(active));
      btn.title = `Audio & Mood: ${p.label}`;
    }
    eqModal?.querySelectorAll('.eq-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.eq === key);
    });
    if ($('#eqStatusText')) {
      $('#eqStatusText').textContent = `EQ: ${p.label} · Speed: ${playbackSpeed}×`;
    }
    savePrefs();
    if (!silent) showToast(`Equalizer: ${p.label}`);
  }

  function ensureAudioGraph({ force = false } = {}) {
    if (audioGraphReady || audioGraphFailed) return;
    if (!IS_HTTP && !String(audio.src || '').startsWith('blob:')) return;
    // Keep ALL mobile browsers (Android Chrome & iOS Safari/Chrome) on the native <audio> pipeline
    // by default so background playback & lock-screen media controls stay 100% alive without
    // AudioContext background suspension. Only attach Web Audio on mobile if user picks custom EQ.
    if ((IS_IOS || IS_MOBILE) && !force && eqPreset === 'normal') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) { audioGraphFailed = true; return; }
    try {
      audioCtx = new AudioCtx();
      const source = audioCtx.createMediaElementSource(audio);
      lowEqNode = audioCtx.createBiquadFilter();
      lowEqNode.type = 'lowshelf';
      lowEqNode.frequency.value = 120;
      midEqNode = audioCtx.createBiquadFilter();
      midEqNode.type = 'peaking';
      midEqNode.frequency.value = 1500;
      midEqNode.Q.value = 1.0;
      highEqNode = audioCtx.createBiquadFilter();
      highEqNode.type = 'highshelf';
      highEqNode.frequency.value = 8000;
      gainNode = audioCtx.createGain();
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 128;
      analyserNode.smoothingTimeConstant = 0.82;
      freqData = new Uint8Array(analyserNode.frequencyBinCount);
      gainNode.gain.value = targetVolume;
      source.connect(lowEqNode);
      lowEqNode.connect(midEqNode);
      midEqNode.connect(highEqNode);
      highEqNode.connect(gainNode);
      gainNode.connect(analyserNode);
      analyserNode.connect(audioCtx.destination);
      audio.volume = 1;
      audioGraphReady = true;
      applyEqPreset(eqPreset, { silent: true });
    } catch (_e) {
      audioGraphFailed = true;
      audio.volume = targetVolume;
    }
  }

  function setOutputVolume(val) {
    targetVolume = clamp(val, 0, 1);
    if (audioGraphReady && gainNode && audioCtx) {
      const now = audioCtx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setTargetAtTime(targetVolume, now, 0.03);
    } else {
      audio.volume = targetVolume;
    }
    savePrefs();
  }

  function isVisualizerVisible() {
    if (document.hidden || !isSheetOpen) return false;
    return activeSheetTab === 'player' || window.innerWidth >= 900;
  }

  function startVisualizerLoop() {
    // Only animate canvas when Now Playing player panel is actively visible (zero mobile background drain!)
    if (visualizerRaf || !isVisualizerVisible()) return;
    const ctx = visualizerCanvas?.getContext('2d');
    if (!ctx) return;
    const barCount = 34;
    let phase = 0;
    let lastFrameTime = 0;
    const frameInterval = IS_MOBILE ? 42 : 25; // ~24fps on mobile, ~40fps on desktop

    const draw = (now) => {
      if (!isVisualizerVisible() || audio.paused || audio.ended) {
        stopVisualizerLoop();
        return;
      }
      visualizerRaf = requestAnimationFrame(draw);
      if (now - lastFrameTime < frameInterval) return;
      lastFrameTime = now;

      phase += 0.14;
      if (audioGraphReady && analyserNode && freqData) {
        analyserNode.getByteFrequencyData(freqData);
      }

      const w = visualizerCanvas.width;
      const h = visualizerCanvas.height;
      ctx.clearRect(0, 0, w, h);

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, cachedAccentColor);
      grad.addColorStop(0.5, cachedRoseColor);
      grad.addColorStop(1, cachedAccentColor);
      ctx.fillStyle = grad;

      const gap = 4;
      const barW = (w - gap * (barCount - 1)) / barCount;
      const mid = (barCount - 1) / 2;

      for (let i = 0; i < barCount; i++) {
        const distFromMid = Math.abs(i - mid) / mid;
        let amp;
        if (audioGraphReady && analyserNode && freqData) {
          const bin = Math.min(freqData.length - 1, Math.floor((1 - distFromMid * 0.72) * 28));
          amp = (freqData[bin] / 255) * (1 - distFromMid * 0.35);
        } else {
          amp = (0.28 + 0.48 * Math.abs(Math.sin(phase + i * 0.42))) * (1 - distFromMid * 0.4);
        }
        const barH = Math.max(4, amp * (h - 4));
        const x = i * (barW + gap);
        const y = (h - barH) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, barW / 2);
        ctx.fill();
      }
    };
    visualizerRaf = requestAnimationFrame(draw);
  }

  function stopVisualizerLoop() {
    if (visualizerRaf) { cancelAnimationFrame(visualizerRaf); visualizerRaf = null; }
    const ctx = visualizerCanvas?.getContext('2d');
    if (ctx) {
      const w = visualizerCanvas.width;
      const h = visualizerCanvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(180, 195, 220, 0.22)';
      const barCount = 34;
      const gap = 4;
      const barW = (w - gap * (barCount - 1)) / barCount;
      for (let i = 0; i < barCount; i++) {
        ctx.beginPath();
        ctx.roundRect(i * (barW + gap), (h - 4) / 2, barW, 4, 2);
        ctx.fill();
      }
    }
  }

  function setSeekVisual(percentage) {
    const clamped = clamp(percentage, 0, 100);
    seekBar.value = String(clamped);
    if (sheetSeekBar) sheetSeekBar.value = String(clamped);
    if (seekControl) seekControl.style.setProperty('--progress', `${clamped}%`);
    if (sheetSeekControl) sheetSeekControl.style.setProperty('--progress', `${clamped}%`);
    if (miniProgressFill) miniProgressFill.style.width = `${clamped}%`;
  }

  function updateTimeDisplays(elapsed, duration) {
    const cur = timeString(elapsed);
    const tot = timeString(duration);
    $('#currentTime').textContent = cur;
    $('#totalTime').textContent = tot;
    if ($('#sheetCurrentTime')) $('#sheetCurrentTime').textContent = cur;
    if ($('#sheetTotalTime')) $('#sheetTotalTime').textContent = tot;
  }

  function updateMediaPositionState() {
    if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate || 1,
        position: clamp(audio.currentTime || 0, 0, audio.duration)
      });
    } catch (_e) { /* Optional on older browsers. */ }
  }

  function setReady(value) {
    ready = value;
    seekBar.disabled = !value;
    if (sheetSeekBar) sheetSeekBar.disabled = !value;
    if (seekControl) seekControl.classList.toggle('is-disabled', !value);
    if (sheetSeekControl) sheetSeekControl.classList.toggle('is-disabled', !value);
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
    userWantsPlaying = true;
    clearTimeout(pauseFadeTimer);
    clearTimeout(networkRetryTimer);
    ensureAudioGraph();
    if (audioCtx && audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); } catch (_e) { /* Ignore. */ }
    }
    if (audioGraphReady && gainNode && audioCtx) {
      const now = audioCtx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(Math.max(0.001, gainNode.gain.value * 0.25), now);
      gainNode.gain.linearRampToValueAtTime(targetVolume, now + 0.22);
    } else {
      audio.volume = targetVolume;
    }
    try { await audio.play(); }
    catch (error) {
      if (error?.name === 'AbortError') return;
      if (audio.error) return;
      userWantsPlaying = false;
      showToast('Audio tidak dapat diputar. Pastikan sumber MP3 dapat diakses.');
    }
  }

  function smoothPause(durationMs = 180) {
    userWantsPlaying = false;
    clearTimeout(networkRetryTimer);
    clearTimeout(stallWatchTimer);
    if (audio.paused) return;
    clearTimeout(pauseFadeTimer);
    if (audioGraphReady && gainNode && audioCtx) {
      const now = audioCtx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0.001, now + durationMs / 1000);
      pauseFadeTimer = setTimeout(() => {
        audio.pause();
        if (gainNode && audioCtx) gainNode.gain.setValueAtTime(targetVolume, audioCtx.currentTime);
      }, durationMs);
    } else {
      audio.pause();
    }
  }

  function togglePlay() {
    triggerHaptic(10);
    if (audio.paused) tryPlay();
    else smoothPause(170);
  }

  function progress() {
    const elapsed = audio.currentTime || 0;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const sec = Math.floor(elapsed);
    if (ready && !audio.paused && !countedTrackSession && sec >= 12) {
      countedTrackSession = true;
      const track = currentTrack();
      if (track) {
        playCounts[track.id] = (Number(playCounts[track.id]) || 0) + 1;
        savePrefs();
        if (!document.hidden) renderPlaylist();
      }
    }
    if (ready && sec !== lastSavedSecond && sec % 10 === 0) {
      lastSavedSecond = sec;
      savePrefs();
      updateMediaPositionState();
    }
    // Skip DOM updates while app is minimized / screen is off to keep background audio ultra-light.
    if (document.hidden) return;
    if (isSeeking) {
      $('#totalTime').textContent = timeString(duration);
      if ($('#sheetTotalTime')) $('#sheetTotalTime').textContent = timeString(duration);
      return;
    }
    updateTimeDisplays(elapsed, duration);
    const percentage = duration ? clamp(elapsed / duration * 100, 0, 100) : 0;
    setSeekVisual(percentage);
    syncActiveLyric(elapsed);
    if ($('#shareMomentLabel')) {
      $('#shareMomentLabel').textContent = sec >= 3 ? timeString(sec) : 'Momen';
    }
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

  function buildLyricsFragment(sections, targetList) {
    const fragment = document.createDocumentFragment();
    let globalIdx = 0;
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
        line.dataset.lineIndex = String(globalIdx++);
        targetList.push({ element: line, text, time: null });
        wrapper.append(line);
      }
      fragment.append(wrapper);
    }
    return fragment;
  }

  function renderLyrics(sections) {
    lyricLines = [];
    sheetLyricLines = [];
    currentSections = sections;
    currentRawLyrics = sections.map((s) => `[${s.title}]\n${s.lines.join('\n')}`).join('\n\n');
    lastActiveLine = -1;
    followButton.hidden = true;
    followLyrics = true;
    updateFollowButton();
    lyricsContent.replaceChildren(buildLyricsFragment(sections, lyricLines));
    lyricsScroll.scrollTop = 0;
    if (sheetLyricsContent) {
      sheetLyricsContent.replaceChildren(buildLyricsFragment(sections, sheetLyricLines));
      if (sheetLyricsScroll) sheetLyricsScroll.scrollTop = 0;
    }
    lyricsTip.textContent = '↕ Scroll untuk membaca lirik';
  }

  function setLyricsMessage(message) {
    lyricLines = [];
    sheetLyricLines = [];
    currentSections = [];
    currentRawLyrics = '';
    lastActiveLine = -1;
    followButton.hidden = true;
    const makeMsg = () => {
      const p = document.createElement('p');
      p.className = 'lyrics-message';
      p.textContent = message;
      return p;
    };
    lyricsContent.replaceChildren(makeMsg());
    lyricsScroll.scrollTop = 0;
    if (sheetLyricsContent) {
      sheetLyricsContent.replaceChildren(makeMsg());
      if (sheetLyricsScroll) sheetLyricsScroll.scrollTop = 0;
    }
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
        for (const item of [lyricLines[i], sheetLyricLines[i]]) {
          if (!item) continue;
          item.time = entry.time;
          item.element.dataset.timed = 'true';
          item.element.dataset.time = String(entry.time);
          item.element.title = `Putar mulai ${timeString(entry.time)}`;
        }
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
    followButton.querySelector('span').textContent = followLyrics ? 'Ikuti' : 'Ikuti lagi';
  }

  function centerLyric(element, container = lyricsScroll) {
    if (!element || !container) return;
    const panel = container.getBoundingClientRect();
    const line = element.getBoundingClientRect();
    const offset = line.top - panel.top - (panel.height - line.height) / 2;
    container.scrollTo({ top: container.scrollTop + offset, behavior: 'smooth' });
  }

  function syncActiveLyric(seconds) {
    let matchedIndex = -1;
    for (let i = 0; i < lyricLines.length; i++) {
      const time = lyricLines[i].time;
      if (time !== null && time <= seconds + .07) matchedIndex = i;
      if (time !== null && time > seconds + .07) break;
    }
    if (matchedIndex === lastActiveLine) return;
    if (lastActiveLine >= 0) {
      lyricLines[lastActiveLine]?.element.classList.remove('active');
      sheetLyricLines[lastActiveLine]?.element.classList.remove('active');
    }
    if (matchedIndex >= 0) {
      const element = lyricLines[matchedIndex].element;
      element.classList.add('active');
      if (followLyrics && !audio.paused) centerLyric(element, lyricsScroll);
      const sheetEl = sheetLyricLines[matchedIndex]?.element;
      if (sheetEl) {
        sheetEl.classList.add('active');
        if (isSheetOpen && activeSheetTab === 'lyrics' && !audio.paused) centerLyric(sheetEl, sheetLyricsScroll);
      }
    }
    lastActiveLine = matchedIndex;
  }

  function updatePageLink(track) {
    try {
      history.replaceState({}, '', getTrackShareUrl(track));
    } catch (_e) { /* E.g. sandboxed local HTML preview. */ }
  }

  function preloadCover(path) {
    if (!path) return;
    const url = resolvePath(path);
    if (preloadedCovers.has(url)) return;
    preloadedCovers.add(url);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }

  function triggerTrackTransition() {
    const targets = [$('#heroCover'), $('#sheetCover'), $('#pageTitle')].filter(Boolean);
    targets.forEach((el) => el.classList.add('is-transitioning'));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        targets.forEach((el) => el.classList.remove('is-transitioning'));
      });
    });
  }

  function switchTrack(index, { autoplay = false, updateUrl = true, animate = false, fromEnded = false } = {}) {
    if (!tracks.length || index < 0 || index >= tracks.length) return;
    if (animate && !document.hidden) {
      triggerHaptic(12);
      triggerTrackTransition();
    }
    clearTimeout(networkRetryTimer);
    clearTimeout(stallWatchTimer);
    networkRetryCount = 0;
    activeIndex = index;
    countedTrackSession = false;
    userWantsPlaying = Boolean(autoplay);
    const track = currentTrack();
    const requestId = ++lyricRequest;
    // Keep background MediaSession focus continuous on auto-advance (do not strip src or pause first).
    if (!fromEnded && !autoplay) audio.pause();
    ready = false;
    audioFailed = false;
    populateTrackInfo(track);
    renderPlaylist();
    setReady(false);
    isSeeking = false;
    seekPointerId = null;
    activeSeekControl = null;
    if (seekControl) seekControl.classList.remove('is-seeking');
    if (sheetSeekControl) sheetSeekControl.classList.remove('is-seeking');
    updateTimeDisplays(0, 0);
    setSeekVisual(0);
    audioHint.textContent = `Memuat sumber musik “${track.title}”…`;
    loadLyricsForTrack(track, requestId);
    if (updateUrl) updatePageLink(track);
    audio.src = localAudioOverrides.get(track.id) || resolvePath(track.audio);
    audio.load();
    applyPlaybackSpeed(playbackSpeed, { silent: true });
    savePrefs();
    if (autoplay) tryPlay();
  }

  function computeNextIndex() {
    if (tracks.length <= 1) return 0;
    if (shuffleMode) {
      const candidates = tracks.map((_, i) => i).filter((i) => i !== activeIndex);
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return (activeIndex + 1) % tracks.length;
  }

  function refreshUpcomingTrack() {
    if (!tracks.length) return;
    upcomingIndex = computeNextIndex();
    const next = tracks[upcomingIndex];
    const upNextBtn = $('#upNextButton');
    if (!upNextBtn || !next) return;
    if (tracks.length <= 1) { upNextBtn.hidden = true; return; }
    upNextBtn.hidden = false;
    const nextCover = next.cover || 'assets/cover-lagu-kedua.webp';
    preloadCover(nextCover);
    $('#upNextCover').src = resolvePath(nextCover);
    $('#upNextTitle').textContent = next.title;
  }

  function nextTrack() {
    const target = upcomingIndex !== activeIndex ? upcomingIndex : computeNextIndex();
    switchTrack(target, { autoplay: true, animate: true });
  }
  function previousTrack() {
    if (ready && audio.currentTime > 3) { audio.currentTime = 0; progress(); return; }
    switchTrack((activeIndex - 1 + tracks.length) % tracks.length, { autoplay: true, animate: true });
  }

  function updateRepeatUi() {
    const labels = { off: 'Pengulangan mati', all: 'Ulang seluruh playlist', one: 'Ulang lagu ini' };
    for (const btn of [repeatButton, $('#sheetRepeatButton')]) {
      if (!btn) continue;
      btn.dataset.mode = repeatMode;
      btn.title = `Mode: ${labels[repeatMode]}`;
      btn.setAttribute('aria-label', `Mode: ${labels[repeatMode]}. Klik untuk mengubah.`);
      btn.setAttribute('aria-pressed', String(repeatMode !== 'off'));
      const idx = btn.querySelector('.repeat-index');
      if (idx) idx.textContent = repeatMode === 'one' ? '1' : '';
    }
  }

  function updateShuffleUi() {
    for (const btn of [shuffleButton, $('#sheetShuffleButton')]) {
      if (!btn) continue;
      btn.setAttribute('aria-pressed', String(shuffleMode));
      btn.title = shuffleMode ? 'Mode acak: aktif' : 'Mode acak: mati';
    }
    refreshUpcomingTrack();
  }

  function updateFavoriteUi(animate = false) {
    const track = currentTrack();
    if (!track) return;
    const isFav = favorites.has(track.id);
    const heroBtn = $('#heroFavoriteButton');
    const heroLabel = $('#heroFavoriteLabel');
    if (heroLabel) heroLabel.textContent = isFav ? 'Disukai' : 'Sukai';
    for (const btn of [heroBtn, $('#dockFavoriteButton'), $('#sheetFavoriteButton')]) {
      if (!btn) continue;
      btn.setAttribute('aria-pressed', String(isFav));
      btn.title = isFav ? 'Hapus dari favorit' : 'Simpan ke favorit';
      if (animate) {
        btn.classList.remove('fav-pop');
        void btn.offsetWidth;
        btn.classList.add('fav-pop');
      }
    }
  }

  function toggleFavorite() {
    triggerHaptic(14);
    const track = currentTrack();
    if (!track) return;
    if (favorites.has(track.id)) {
      favorites.delete(track.id);
      showToast(`“${track.title}” dihapus dari favorit.`);
    } else {
      favorites.add(track.id);
      showToast(`“${track.title}” disimpan ke favorit ♥`);
    }
    updateFavoriteUi(true);
    renderPlaylist();
    savePrefs();
  }

  async function copyTextSafe(text) {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true; }
      catch (_e) { /* Fall through to textarea fallback. */ }
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_e) { ok = false; }
    ta.remove();
    return ok;
  }

  async function copyFullLyrics() {
    const track = currentTrack();
    if (!track || !currentRawLyrics) {
      showToast('Lirik belum tersedia untuk disalin.');
      return;
    }
    const artist = track.artist || 'Zandevaa';
    const fullText = `${track.title} — ${artist}\n\n${currentRawLyrics}`;
    const ok = await copyTextSafe(fullText);
    showToast(ok ? `Lirik lengkap “${track.title}” berhasil disalin ♡` : 'Gagal menyalin lirik ke clipboard.');
  }

  async function shareCurrentTrack() {
    const track = currentTrack();
    const url = getTrackShareUrl(track);
    const shareTitle = `${track.title} — ${track.artist || 'Zandevaa'}`;
    const payload = { title: shareTitle, text: `${shareTitle} — Ada lagu dan cerita kecil untukmu. ♡`, url };
    try {
      if (navigator.share) { await navigator.share(payload); return; }
      if (await copyTextSafe(url)) { showToast('Tautan lagu ini berhasil disalin ♡'); return; }
      throw new Error('Clipboard tidak tersedia');
    } catch (e) { if (e.name !== 'AbortError') showToast('Salin URL browser untuk membagikan lagu ini.'); }
  }

  async function shareCurrentMoment() {
    const track = currentTrack();
    if (!track) return;
    const sec = Math.max(0, Math.floor(audio.currentTime || 0));
    const base = getTrackShareUrl(track);
    const url = sec > 0 ? `${base}#t=${sec}` : base;
    const shareTitle = `${track.title} — ${track.artist || 'Zandevaa'}`;
    const text = sec > 0
      ? `Dengerin momen di ${timeString(sec)} dari “${track.title}” — ${track.artist || 'Zandevaa'} ♡`
      : `${shareTitle} — Ada lagu dan cerita kecil untukmu. ♡`;
    try {
      if (navigator.share) { await navigator.share({ title: shareTitle, text, url }); return; }
      if (await copyTextSafe(url)) {
        showToast(sec > 0 ? `Tautan momen (${timeString(sec)}) berhasil disalin ♡` : 'Tautan lagu ini berhasil disalin ♡');
        return;
      }
      throw new Error('Clipboard tidak tersedia');
    } catch (e) { if (e.name !== 'AbortError') showToast('Salin URL browser untuk membagikan momen ini.'); }
  }

  function replyViaWhatsApp() {
    const track = currentTrack();
    const title = track?.title || 'lagu ini';
    const message = `Barusan dengerin “${title}” — ${track?.artist || 'Zandevaa'} 🎧\n`;
    const waNumber = String(window.ZANDEVAA_WA_NUMBER || '').replace(/[^\d]/g, '');
    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }

  function setCinemaMode(active) {
    isCinemaMode = Boolean(active);
    nowPlayingSheet?.classList.toggle('is-cinema', isCinemaMode);
    $('#cinemaModeButton')?.setAttribute('aria-pressed', String(isCinemaMode));
  }

  function attachDoubleTapSkip(targetEl, feedbackEl) {
    if (!targetEl) return;
    let lastTapTime = 0;
    let lastTapSide = '';
    let hideTimer = null;
    targetEl.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const now = Date.now();
      const rect = targetEl.getBoundingClientRect();
      const side = (event.clientX - rect.left) < rect.width / 2 ? 'left' : 'right';
      if (now - lastTapTime < 310 && side === lastTapSide) {
        lastTapTime = 0;
        if (!ready) return;
        const delta = side === 'left' ? -10 : 10;
        changeTime(delta);
        triggerHaptic(14);
        if (feedbackEl) {
          feedbackEl.textContent = side === 'left' ? '↺ -10 dtk' : '+10 dtk ↻';
          feedbackEl.classList.remove('align-left', 'align-right');
          feedbackEl.classList.add(side === 'left' ? 'align-left' : 'align-right', 'is-visible');
          clearTimeout(hideTimer);
          hideTimer = setTimeout(() => feedbackEl.classList.remove('is-visible'), 560);
        }
      } else {
        lastTapTime = now;
        lastTapSide = side;
      }
    });
  }

  // ─── Full-Screen Now Playing Sheet & Mini Dock ───
  function setSheetTab(tab) {
    activeSheetTab = tab === 'lyrics' ? 'lyrics' : 'player';
    const isLyrics = activeSheetTab === 'lyrics';
    $('#npPlayerPanel').hidden = isLyrics;
    $('#npLyricsPanel').hidden = !isLyrics;
    $('#tabPlayerBtn').classList.toggle('active', !isLyrics);
    $('#tabPlayerBtn').setAttribute('aria-selected', String(!isLyrics));
    $('#tabLyricsBtn').classList.toggle('active', isLyrics);
    $('#tabLyricsBtn').setAttribute('aria-selected', String(isLyrics));
    if (isLyrics) {
      setCinemaMode(false);
      if (!isVisualizerVisible()) stopVisualizerLoop();
      if (lastActiveLine >= 0) {
        requestAnimationFrame(() => centerLyric(sheetLyricLines[lastActiveLine]?.element, sheetLyricsScroll));
      }
    } else if (!audio.paused && isVisualizerVisible()) {
      startVisualizerLoop();
    }
  }

  function openNowPlayingSheet(tab = 'player') {
    if (!nowPlayingSheet) return;
    isSheetOpen = true;
    setCinemaMode(false);
    setSheetTab(tab);
    nowPlayingSheet.hidden = false;
    nowPlayingSheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sheet-open');
    requestAnimationFrame(() => {
      nowPlayingSheet.classList.add('is-open');
      syncAllMarquees();
    });
    if (!audio.paused && isVisualizerVisible()) startVisualizerLoop();
    else stopVisualizerLoop();
  }

  function closeNowPlayingSheet() {
    if (!nowPlayingSheet || !isSheetOpen) return;
    isSheetOpen = false;
    setCinemaMode(false);
    stopVisualizerLoop();
    nowPlayingSheet.classList.remove('is-open');
    nowPlayingSheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sheet-open');
    setTimeout(() => { if (!isSheetOpen) nowPlayingSheet.hidden = true; }, 320);
  }

  function toggleMiniDock() {
    isMiniDock = !isMiniDock;
    musicDock.classList.toggle('is-mini', isMiniDock);
    document.body.classList.toggle('dock-is-mini', isMiniDock);
    $('#miniToggleButton')?.setAttribute('aria-pressed', String(isMiniDock));
  }

  // ─── Sleep Timer ───
  function updateSleepUi() {
    const active = sleepMode !== 'off';
    let badgeText = '';
    let statusText = 'Otomatis hentikan musik dengan fade-out lembut.';
    if (sleepMode === 'end-of-track') {
      badgeText = '1♪';
      statusText = 'Musik akan berhenti otomatis setelah lagu ini selesai.';
    } else if (sleepMode === 'minutes') {
      const remainingSec = Math.max(0, Math.ceil((sleepEndTimestamp - Date.now()) / 1000));
      const mins = Math.ceil(remainingSec / 60);
      badgeText = `${mins}m`;
      statusText = `Musik akan berhenti dalam ${timeString(remainingSec)}.`;
    }
    for (const btn of [$('#sleepTimerButton'), $('#sheetSleepButton')]) {
      if (btn) btn.setAttribute('aria-pressed', String(active));
    }
    for (const badge of [$('#dockSleepBadge'), $('#sheetSleepBadge')]) {
      if (!badge) continue;
      badge.textContent = badgeText;
      badge.hidden = !active;
    }
    if ($('#sleepStatusText')) $('#sleepStatusText').textContent = statusText;
    sleepTimerModal?.querySelectorAll('.sleep-option').forEach((btn) => {
      const val = btn.dataset.sleep;
      const isSelected = (sleepMode === 'off' && val === 'off')
        || (sleepMode === 'end-of-track' && val === 'end-of-track')
        || (sleepMode === 'minutes' && btn.dataset.activeMinutes === 'true');
      btn.classList.toggle('active', isSelected);
    });
  }

  function setSleepTimer(value) {
    clearInterval(sleepTickInterval);
    sleepTickInterval = null;
    sleepTimerModal?.querySelectorAll('.sleep-option').forEach((b) => { delete b.dataset.activeMinutes; });

    if (value === 'off') {
      sleepMode = 'off';
      sleepEndTimestamp = 0;
      showToast('Sleep Timer dimatikan.');
    } else if (value === 'end-of-track') {
      sleepMode = 'end-of-track';
      sleepEndTimestamp = 0;
      showToast('Sleep Timer: berhenti setelah lagu ini selesai 🌙');
    } else {
      const mins = Number(value);
      sleepMode = 'minutes';
      sleepEndTimestamp = Date.now() + mins * 60 * 1000;
      const btn = sleepTimerModal?.querySelector(`.sleep-option[data-sleep="${mins}"]`);
      if (btn) btn.dataset.activeMinutes = 'true';
      showToast(`Sleep Timer diatur ${mins} menit 🌙`);
      sleepTickInterval = setInterval(() => {
        if (Date.now() >= sleepEndTimestamp) {
          clearInterval(sleepTickInterval);
          sleepTickInterval = null;
          sleepMode = 'off';
          sleepEndTimestamp = 0;
          smoothPause(2400);
          updateSleepUi();
          showToast('Sleep Timer selesai · Selamat beristirahat 🌙');
          return;
        }
        updateSleepUi();
      }, 1000);
    }
    updateSleepUi();
  }

  // ─── Share Lyric Card Studio (WA Status / IG Story) ───
  function getSelectableLines() {
    return currentSections.flatMap((sec) => sec.lines.map((line) => ({ section: sec.title, text: line })));
  }

  function loadCoverForCard(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function renderLyricCard() {
    if (!lyricCardCanvas) return;
    const track = currentTrack();
    if (!track) return;
    const isStory = lyricCardRatio === 'story';
    const W = 1080;
    const H = isStory ? 1920 : 1350;
    lyricCardCanvas.width = W;
    lyricCardCanvas.height = H;
    const ctx = lyricCardCanvas.getContext('2d');
    if (!ctx) return;

    const style = getComputedStyle(document.documentElement);
    const isLight = document.documentElement.dataset.themeMode === 'light';
    const bgTop = style.getPropertyValue('--bg-top').trim() || '#112848';
    const bgBottom = style.getPropertyValue('--bg-bottom').trim() || '#07101f';
    const pageCol = style.getPropertyValue('--page').trim() || '#0a1628';
    const accent = style.getPropertyValue('--accent').trim() || '#f1cfa8';
    const rose = style.getPropertyValue('--rose').trim() || '#f2968e';
    const ink = style.getPropertyValue('--ink').trim() || '#f2f5fa';
    const dim = style.getPropertyValue('--dim').trim() || '#a8b7cc';

    // Base ambient gradient
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, bgTop);
    bgGrad.addColorStop(0.55, pageCol);
    bgGrad.addColorStop(1, bgBottom);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Soft blurred cover art wash
    if (cardCoverImage) {
      ctx.save();
      ctx.globalAlpha = isLight ? 0.28 : 0.34;
      ctx.filter = 'blur(68px) saturate(1.5)';
      const scale = Math.max(W / cardCoverImage.width, H / cardCoverImage.height) * 1.15;
      const dw = cardCoverImage.width * scale;
      const dh = cardCoverImage.height * scale;
      ctx.drawImage(cardCoverImage, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.restore();
    }

    // Subtle overlay for contrast
    ctx.fillStyle = isLight ? 'rgba(248, 250, 255, 0.38)' : 'rgba(6, 12, 24, 0.42)';
    ctx.fillRect(0, 0, W, H);

    // Glass Lyric Card container
    const padX = 88;
    const cardW = W - padX * 2;
    const cardH = isStory ? 1160 : 940;
    const cardX = padX;
    const cardY = (H - cardH) / 2 - (isStory ? 20 : 10);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 52);
    ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.78)' : 'rgba(12, 22, 42, 0.68)';
    ctx.shadowColor = isLight ? 'rgba(18, 34, 66, 0.16)' : 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 70;
    ctx.shadowOffsetY = 26;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 52);
    ctx.strokeStyle = isLight ? 'rgba(20, 42, 84, 0.14)' : 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Header inside card: cover art + song title & artist
    const innerPad = 72;
    const artSize = 152;
    const artX = cardX + innerPad;
    const artY = cardY + innerPad;

    if (cardCoverImage) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(artX, artY, artSize, artSize, 26);
      ctx.clip();
      ctx.drawImage(cardCoverImage, artX, artY, artSize, artSize);
      ctx.restore();
    }

    ctx.fillStyle = ink;
    ctx.font = '700 44px "Playfair Display", Georgia, serif';
    const titleMaxW = cardW - innerPad * 2 - artSize - 36;
    const titleLines = wrapCanvasText(ctx, track.title, titleMaxW).slice(0, 2);
    titleLines.forEach((line, i) => {
      ctx.fillText(line, artX + artSize + 36, artY + 62 + i * 52);
    });

    ctx.fillStyle = dim;
    ctx.font = '600 28px "Manrope", system-ui, sans-serif';
    ctx.fillText(track.artist || 'Zandevaa', artX + artSize + 36, artY + 62 + titleLines.length * 52 + 8);

    // Decorative quote accent line
    const quoteTop = artY + artSize + 68;
    ctx.fillStyle = rose;
    ctx.font = 'italic 84px "Playfair Display", Georgia, serif';
    ctx.fillText('“', cardX + innerPad - 8, quoteTop + 42);

    // Selected lyrics text
    const allLines = getSelectableLines();
    const chosen = selectedCardLineIndices.length
      ? selectedCardLineIndices.map((idx) => allLines[idx]?.text).filter(Boolean)
      : [track.dedication || 'Ada cerita di balik setiap nada.'];

    const fontSize = chosen.length >= 4 ? 46 : chosen.length === 3 ? 52 : 58;
    const lineHeight = Math.round(fontSize * 1.42);
    ctx.font = `italic 500 ${fontSize}px "Playfair Display", Georgia, serif`;
    ctx.fillStyle = ink;

    const wrappedBlocks = chosen.flatMap((l) => wrapCanvasText(ctx, l, cardW - innerPad * 2));
    const maxLines = isStory ? 10 : 7;
    const visibleLines = wrappedBlocks.slice(0, maxLines);
    const availableH = (cardY + cardH - 135) - (quoteTop + 70);
    const totalTextH = visibleLines.length * lineHeight;
    let cursorY = quoteTop + 75 + Math.max(0, (availableH - totalTextH) / 2);

    for (const line of visibleLines) {
      ctx.fillText(line, cardX + innerPad, cursorY);
      cursorY += lineHeight;
    }

    // Card footer signature
    const footerY = cardY + cardH - 64;
    ctx.fillStyle = accent;
    ctx.font = '700 24px "Manrope", system-ui, sans-serif';
    ctx.fillText('✧  zandevaa / Music Stories', cardX + innerPad, footerY);
  }

  async function openLyricCardModal(startAtIndex = -1) {
    const track = currentTrack();
    if (!track) return;
    const allLines = getSelectableLines();
    selectedCardLineIndices = [];
    if (allLines.length) {
      let start = startAtIndex >= 0 && startAtIndex < allLines.length ? startAtIndex : -1;
      if (start < 0) {
        const chorusStart = allLines.findIndex((l) => /chorus|reff/i.test(l.section));
        start = chorusStart >= 0 ? chorusStart : 0;
      }
      const count = startAtIndex >= 0 ? 2 : 3;
      for (let i = start; i < Math.min(allLines.length, start + count); i++) selectedCardLineIndices.push(i);
    }

    const renderLineButtons = () => {
      const frag = document.createDocumentFragment();
      allLines.forEach((item, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `card-line-btn${selectedCardLineIndices.includes(idx) ? ' selected' : ''}`;
        btn.textContent = item.text;
        btn.addEventListener('click', () => {
          const pos = selectedCardLineIndices.indexOf(idx);
          if (pos >= 0) {
            selectedCardLineIndices.splice(pos, 1);
          } else {
            if (selectedCardLineIndices.length >= 4) {
              showToast('Maksimal 4 baris lirik per kartu.');
              return;
            }
            selectedCardLineIndices.push(idx);
            selectedCardLineIndices.sort((a, b) => a - b);
          }
          btn.classList.toggle('selected', selectedCardLineIndices.includes(idx));
          $('#selectedLinesCount').textContent = String(selectedCardLineIndices.length);
          renderLyricCard();
        });
        frag.append(btn);
      });
      lyricCardLinesEl.replaceChildren(frag);
      $('#selectedLinesCount').textContent = String(selectedCardLineIndices.length);
    };

    renderLineButtons();
    lyricCardModal.hidden = false;
    cardCoverImage = await loadCoverForCard(resolvePath(track.cover || 'assets/cover-lagu-kedua.png'));
    renderLyricCard();
  }

  function downloadLyricCard() {
    if (!lyricCardCanvas) return;
    const track = currentTrack();
    const link = document.createElement('a');
    link.download = `${track?.id || 'music-story'}-lyric-card.png`;
    link.href = lyricCardCanvas.toDataURL('image/png');
    link.click();
    showToast('Kartu lirik PNG berhasil diunduh ♡');
  }

  async function shareLyricCard() {
    if (!lyricCardCanvas) return;
    const track = currentTrack();
    try {
      const blob = await new Promise((resolve) => lyricCardCanvas.toBlob(resolve, 'image/png'));
      if (blob && navigator.canShare) {
        const file = new File([blob], `${track?.id || 'zandevaa'}-lyric-card.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${track.title} — ${track.artist || 'Zandevaa'}`,
            text: `${track.title} — ${track.artist || 'Zandevaa'}`
          });
          return;
        }
      }
      downloadLyricCard();
    } catch (e) {
      if (e.name !== 'AbortError') downloadLyricCard();
    }
  }

  // ─── Horizontal Swipe Helper (Next / Previous Track) ───
  function attachHorizontalSwipe(element, { onLeft, onRight, onUp, onDown, ignoreSelector } = {}) {
    if (!element) return;
    let startX = 0, startY = 0, tracking = false;
    element.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { tracking = false; return; }
      if (ignoreSelector && e.target.closest(ignoreSelector)) { tracking = false; return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    }, { passive: true });
    element.addEventListener('touchend', (e) => {
      if (!tracking || !e.changedTouches.length) return;
      tracking = false;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.35) {
        if (dx < 0 && onLeft) onLeft();
        else if (dx > 0 && onRight) onRight();
      } else if (Math.abs(dy) > 56 && Math.abs(dy) > Math.abs(dx) * 1.45) {
        if (dy < 0 && onUp) onUp();
        else if (dy > 0 && onDown) onDown();
      }
    }, { passive: true });
  }

  playlistList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-track-index]');
    if (!button) return;
    const index = Number(button.dataset.trackIndex);
    if (index === activeIndex) { togglePlay(); return; }
    switchTrack(index, { autoplay: true, animate: true });
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

  // ─── Tap-to-Sync .lrc Karaoke Creator Studio ───
  function formatLrcTimestamp(seconds) {
    const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    const cs = Math.floor((safe - Math.floor(safe)) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }

  function buildLrcOutputString() {
    const track = currentTrack();
    const header = [`[ti:${track?.title || ''}]`, `[ar:${track?.artist || 'Zandevaa'}]`];
    const body = syncTimedEntries.map((row) => `[${formatLrcTimestamp(row.time)}]${row.text}`);
    return [...header, ...body].join('\n');
  }

  function updateSyncUi() {
    const total = syncLines.length;
    const idx = syncTimedEntries.length;
    if ($('#syncProgressCount')) $('#syncProgressCount').textContent = `${idx}/${total}`;
    if ($('#syncNextLine')) {
      $('#syncNextLine').textContent = idx < total ? syncLines[idx] : '✓ Semua baris lirik sudah ditandai!';
    }
    if ($('#syncFollowingLine')) {
      $('#syncFollowingLine').textContent = idx + 1 < total ? `Berikutnya: ${syncLines[idx + 1]}` : '';
    }
    if ($('#syncTapBtn')) $('#syncTapBtn').disabled = idx >= total;
    if ($('#syncOutput')) {
      $('#syncOutput').value = buildLrcOutputString();
      $('#syncOutput').scrollTop = $('#syncOutput').scrollHeight;
    }
  }

  function startSyncClock() {
    if (syncClockRaf) return;
    const tick = () => {
      if (lrcSyncModal.hidden) { syncClockRaf = null; return; }
      if ($('#syncClock')) $('#syncClock').textContent = formatLrcTimestamp(audio.currentTime || 0);
      syncClockRaf = requestAnimationFrame(tick);
    };
    syncClockRaf = requestAnimationFrame(tick);
  }

  function openLrcSyncModal() {
    const lines = getSelectableLines().map((item) => item.text);
    if (!lines.length) {
      showToast('Belum ada lirik yang dimuat untuk disinkronisasi.');
      return;
    }
    syncLines = lines;
    syncTimedEntries = [];
    updateSyncUi();
    lrcSyncModal.hidden = false;
    startSyncClock();
  }

  function closeLrcSyncModal() {
    lrcSyncModal.hidden = true;
    if (syncClockRaf) { cancelAnimationFrame(syncClockRaf); syncClockRaf = null; }
  }

  function syncTapNextLine() {
    const idx = syncTimedEntries.length;
    if (idx >= syncLines.length) return;
    syncTimedEntries.push({ time: audio.currentTime || 0, text: syncLines[idx] });
    updateSyncUi();
  }

  audio.addEventListener('loadedmetadata', () => {
    setReady(true);
    applyPlaybackSpeed(playbackSpeed, { silent: true });
    const track = currentTrack();
    if (track && Number.isFinite(audio.duration) && audio.duration > 0) {
      const formatted = timeString(audio.duration);
      if (trackDurations.get(track.id) !== formatted) {
        trackDurations.set(track.id, formatted);
        renderPlaylist();
      }
    }
    if (pendingRestoreTime > 0 && Number.isFinite(audio.duration) && pendingRestoreTime < audio.duration - 2) {
      audio.currentTime = pendingRestoreTime;
      pendingRestoreTime = 0;
      if (pendingMomentToast) {
        showToast(pendingMomentToast);
        pendingMomentToast = '';
      }
    }
    progress();
    updateMediaPositionState();
  });
  audio.addEventListener('durationchange', progress);
  audio.addEventListener('timeupdate', progress);
  function recoverPlayback(reason) {
    if (!userWantsPlaying || !currentTrack()) return;
    if (networkRetryCount >= 3) return;
    networkRetryCount++;
    const resumeAt = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const src = localAudioOverrides.get(currentTrack().id) || resolvePath(currentTrack().audio);
    clearTimeout(networkRetryTimer);
    networkRetryTimer = setTimeout(() => {
      if (!userWantsPlaying) return;
      if (reason === 'error' || audio.error || audio.readyState === 0) {
        pendingRestoreTime = resumeAt;
        audio.src = src;
        audio.load();
      }
      audio.play().catch(() => { /* Retry will clear on next user interaction if blocked. */ });
    }, 900 * networkRetryCount);
  }

  audio.addEventListener('playing', () => {
    networkRetryCount = 0;
    clearTimeout(networkRetryTimer);
    clearTimeout(stallWatchTimer);
    updatePlayState();
  });
  audio.addEventListener('play', updatePlayState);
  audio.addEventListener('pause', () => {
    clearTimeout(stallWatchTimer);
    updatePlayState();
  });
  const watchForStall = () => {
    if (!userWantsPlaying || audio.paused || audio.ended) return;
    clearTimeout(stallWatchTimer);
    const snapTime = audio.currentTime;
    stallWatchTimer = setTimeout(() => {
      if (userWantsPlaying && !audio.paused && !audio.ended && Math.abs(audio.currentTime - snapTime) < 0.05) {
        recoverPlayback('stall');
      }
    }, 3500);
  };
  audio.addEventListener('stalled', watchForStall);
  audio.addEventListener('waiting', watchForStall);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopVisualizerLoop();
      savePrefs();
      // Keep audio flowing cleanly in background if user was playing.
      if (userWantsPlaying && audioGraphReady && audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => { /* Ignore. */ });
      }
    } else {
      if (audioGraphReady && audioCtx && audioCtx.state === 'suspended' && !audio.paused) {
        audioCtx.resume().catch(() => { /* Ignore. */ });
      }
      if (!audio.paused && isVisualizerVisible()) {
        startVisualizerLoop();
      }
      updateMediaPositionState();
    }
  });
  audio.addEventListener('ended', () => {
    clearTimeout(stallWatchTimer);
    clearTimeout(networkRetryTimer);
    if (sleepMode === 'end-of-track') {
      userWantsPlaying = false;
      sleepMode = 'off';
      updateSleepUi();
      updatePlayState();
      showToast('Sleep Timer selesai · Selamat beristirahat 🌙');
      return;
    }
    if (repeatMode === 'one') { audio.currentTime = 0; tryPlay(); return; }
    if (shuffleMode && tracks.length > 1) {
      const target = upcomingIndex !== activeIndex ? upcomingIndex : computeNextIndex();
      switchTrack(target, { autoplay: true, fromEnded: true });
      return;
    }
    if (activeIndex < tracks.length - 1) {
      switchTrack(activeIndex + 1, { autoplay: true, fromEnded: true });
      return;
    }
    if (repeatMode === 'all') {
      switchTrack(0, { autoplay: true, fromEnded: true });
      return;
    }
    userWantsPlaying = false;
    updatePlayState();
  });
  audio.addEventListener('error', () => {
    // Auto-recover transient mid-song network interruptions (MEDIA_ERR_NETWORK = 2)
    // instead of giving up and stopping playback.
    if (userWantsPlaying && audio.error?.code === 2 && networkRetryCount < 3) {
      recoverPlayback('error');
      return;
    }
    userWantsPlaying = false;
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

  function scrubToClientX(controlEl, clientX, { commit = false } = {}) {
    if (!ready || !Number.isFinite(audio.duration) || audio.duration <= 0 || !controlEl) return;
    const rect = controlEl.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const targetTime = ratio * audio.duration;
    pendingSeekTime = targetTime;
    setSeekVisual(ratio * 100);
    updateTimeDisplays(targetTime, audio.duration);
    const tipText = timeString(targetTime);
    if ($('#seekTooltip')) $('#seekTooltip').textContent = tipText;
    if ($('#sheetSeekTooltip')) $('#sheetSeekTooltip').textContent = tipText;
    syncActiveLyric(targetTime);
    if (commit) {
      audio.currentTime = targetTime;
      updateMediaPositionState();
    }
  }

  function bindSeekControl(controlEl, rangeEl) {
    if (!controlEl) return;
    controlEl.addEventListener('pointerdown', (event) => {
      if (!ready || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      triggerHaptic(8);
      isSeeking = true;
      seekPointerId = event.pointerId;
      activeSeekControl = controlEl;
      controlEl.classList.add('is-seeking');
      try { controlEl.setPointerCapture(event.pointerId); } catch (_e) { /* Optional. */ }
      scrubToClientX(controlEl, event.clientX, { commit: false });
    });
    controlEl.addEventListener('pointermove', (event) => {
      if (!isSeeking || event.pointerId !== seekPointerId || activeSeekControl !== controlEl) return;
      event.preventDefault();
      scrubToClientX(controlEl, event.clientX, { commit: false });
    });
    const finishSeek = (event) => {
      if (!isSeeking || event.pointerId !== seekPointerId || activeSeekControl !== controlEl) return;
      scrubToClientX(controlEl, event.clientX, { commit: true });
      isSeeking = false;
      seekPointerId = null;
      activeSeekControl = null;
      controlEl.classList.remove('is-seeking');
      try { controlEl.releasePointerCapture(event.pointerId); } catch (_e) { /* Optional. */ }
      progress();
    };
    controlEl.addEventListener('pointerup', finishSeek);
    controlEl.addEventListener('pointercancel', (event) => {
      if (!isSeeking || event.pointerId !== seekPointerId || activeSeekControl !== controlEl) return;
      if (Number.isFinite(pendingSeekTime)) audio.currentTime = pendingSeekTime;
      isSeeking = false;
      seekPointerId = null;
      activeSeekControl = null;
      controlEl.classList.remove('is-seeking');
      progress();
    });
    rangeEl?.addEventListener('input', () => {
      if (isSeeking || !ready || !Number.isFinite(audio.duration)) return;
      const pct = clamp(Number(rangeEl.value), 0, 100);
      audio.currentTime = pct / 100 * audio.duration;
      setSeekVisual(pct);
      progress();
      updateMediaPositionState();
    });
  }

  bindSeekControl(seekControl, seekBar);
  bindSeekControl(sheetSeekControl, sheetSeekBar);

  // Prevent mobile pinch-zoom gestures while preserving normal scroll & seek scrubbing.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  });
  document.addEventListener('touchmove', (event) => {
    if (event.touches.length > 1) event.preventDefault();
  }, { passive: false });

  volumeBar.addEventListener('input', () => setOutputVolume(Number(volumeBar.value)));

  const cycleRepeat = () => {
    repeatMode = { off: 'all', all: 'one', one: 'off' }[repeatMode];
    updateRepeatUi();
    savePrefs();
    showToast({ off: 'Pengulangan dimatikan', all: 'Ulangi seluruh playlist', one: 'Ulangi lagu ini' }[repeatMode]);
  };
  repeatButton.addEventListener('click', cycleRepeat);
  $('#sheetRepeatButton')?.addEventListener('click', cycleRepeat);

  const toggleShuffle = () => {
    shuffleMode = !shuffleMode;
    updateShuffleUi();
    savePrefs();
    showToast(shuffleMode ? 'Mode acak diaktifkan ⇄' : 'Mode acak dimatikan');
  };
  shuffleButton?.addEventListener('click', toggleShuffle);
  $('#sheetShuffleButton')?.addEventListener('click', toggleShuffle);

  // Favorites
  $('#heroFavoriteButton')?.addEventListener('click', toggleFavorite);
  $('#dockFavoriteButton')?.addEventListener('click', toggleFavorite);
  $('#sheetFavoriteButton')?.addEventListener('click', toggleFavorite);

  // Lyrics toolbar & copy full lyrics
  $('#copyLyricsButton')?.addEventListener('click', copyFullLyrics);
  $('#sheetCopyLyricsButton')?.addEventListener('click', copyFullLyrics);
  $('#focusLyricsButton')?.addEventListener('click', () => openNowPlayingSheet('lyrics'));
  $('#lyricCardButton')?.addEventListener('click', () => openLyricCardModal(-1));
  $('#sheetLyricCardButton')?.addEventListener('click', () => openLyricCardModal(-1));
  $('#topLyrics').addEventListener('click', () => {
    followLyrics = false;
    updateFollowButton();
    lyricsScroll.scrollTo({ top: 0, behavior: 'smooth' });
  });
  followButton.addEventListener('click', () => {
    followLyrics = !followLyrics;
    updateFollowButton();
    if (followLyrics && lastActiveLine >= 0) centerLyric(lyricLines[lastActiveLine].element, lyricsScroll);
  });

  const handleLyricLineClick = (event) => {
    const timed = event.target.closest('.lyric-line[data-time]');
    if (timed && !audioFailed) {
      audio.currentTime = Number(timed.dataset.time);
      followLyrics = true;
      updateFollowButton();
      progress();
      updateMediaPositionState();
      return;
    }
    const line = event.target.closest('.lyric-line[data-line-index]');
    if (!line) return;
    const idx = Number(line.dataset.lineIndex);
    if (!Number.isFinite(idx)) return;
    if (quotedLineIndex === idx) {
      hideQuoteQuickBar();
      return;
    }
    hideQuoteQuickBar();
    quotedLineIndex = idx;
    line.classList.add('quote-selected');
    if (event.currentTarget === sheetLyricsContent) {
      openLyricCardModal(idx);
      hideQuoteQuickBar();
      return;
    }
    if ($('#quoteQuickPreview')) $('#quoteQuickPreview').textContent = `“${line.textContent}”`;
    if ($('#quoteQuickBar')) $('#quoteQuickBar').hidden = false;
  };
  lyricsContent.addEventListener('click', handleLyricLineClick);
  sheetLyricsContent?.addEventListener('click', handleLyricLineClick);

  $('#quoteMakeCardBtn')?.addEventListener('click', () => {
    const idx = quotedLineIndex;
    hideQuoteQuickBar();
    openLyricCardModal(idx);
  });
  $('#quoteQuickClose')?.addEventListener('click', hideQuoteQuickBar);

  // Chapter Timeline click
  $('#chapterTimeline')?.addEventListener('click', (event) => {
    const pill = event.target.closest('.chapter-pill[data-chapter-index]');
    if (!pill) return;
    const idx = Number(pill.dataset.chapterIndex);
    if (idx === activeIndex) { togglePlay(); return; }
    switchTrack(idx, { autoplay: true, animate: true });
  });

  // Vinyl Mode toggles
  const handleVinylToggle = () => {
    triggerHaptic(10);
    applyVinylMode(!vinylMode);
  };
  $('#vinylToggleBtn')?.addEventListener('click', handleVinylToggle);
  $('#sheetVinylButton')?.addEventListener('click', handleVinylToggle);

  let resizeMarqueeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeMarqueeTimer);
    resizeMarqueeTimer = setTimeout(syncAllMarquees, 180);
  });

  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(type => {
    lyricsScroll.addEventListener(type, (event) => {
      if (type === 'keydown' && !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) return;
      if (!followButton.hidden) { followLyrics = false; updateFollowButton(); }
    }, { passive: true });
  });

  // Full-Screen Now Playing Sheet & Mini Dock controls
  const openPlayerFromDock = () => openNowPlayingSheet('player');
  $('#dockTrackInfo')?.addEventListener('click', openPlayerFromDock);
  $('#dockTrackInfo')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlayerFromDock(); }
  });
  $('#expandPlayerButton')?.addEventListener('click', openPlayerFromDock);
  $('#miniToggleButton')?.addEventListener('click', toggleMiniDock);
  $('#closeSheetButton')?.addEventListener('click', closeNowPlayingSheet);
  $('#npDragBar')?.addEventListener('click', closeNowPlayingSheet);
  $('#tabPlayerBtn')?.addEventListener('click', () => setSheetTab('player'));
  $('#tabLyricsBtn')?.addEventListener('click', () => setSheetTab('lyrics'));
  $('#sheetPlayButton')?.addEventListener('click', togglePlay);
  $('#sheetPrevButton')?.addEventListener('click', previousTrack);
  $('#sheetNextButton')?.addEventListener('click', nextTrack);
  $('#sheetLyricsPlayButton')?.addEventListener('click', togglePlay);
  $('#sheetLyricsPrevButton')?.addEventListener('click', previousTrack);
  $('#sheetLyricsNextButton')?.addEventListener('click', nextTrack);
  $('#upNextButton')?.addEventListener('click', nextTrack);

  // Share buttons, Share Moment, Cinema Mode, Double-Tap Skip & WA Reply
  $('#shareButton').addEventListener('click', shareCurrentTrack);
  $('#sheetShareButton')?.addEventListener('click', shareCurrentTrack);
  $('#shareMomentButton')?.addEventListener('click', shareCurrentMoment);
  $('#replyWaButton')?.addEventListener('click', replyViaWhatsApp);
  $('#cinemaModeButton')?.addEventListener('click', () => {
    setCinemaMode(!isCinemaMode);
    if (isCinemaMode) showToast('Mode Cinema aktif · ketuk layar untuk kembali');
  });
  nowPlayingSheet?.addEventListener('click', (event) => {
    if (!isCinemaMode) return;
    if (event.target.closest('#cinemaModeButton')) return;
    setCinemaMode(false);
  });
  attachDoubleTapSkip($('#heroCoverFrame'), $('#heroSkipFeedback'));
  attachDoubleTapSkip($('#sheetCoverStage'), $('#sheetSkipFeedback'));

  // Sleep Timer modal
  const openSleepModal = () => { updateSleepUi(); sleepTimerModal.hidden = false; };
  const closeSleepModal = () => { sleepTimerModal.hidden = true; };
  $('#sleepTimerButton')?.addEventListener('click', openSleepModal);
  $('#sheetSleepButton')?.addEventListener('click', openSleepModal);
  $('#closeSleepModal')?.addEventListener('click', closeSleepModal);
  sleepTimerModal?.addEventListener('click', (e) => { if (e.target === sleepTimerModal) closeSleepModal(); });
  $('#sleepOptions')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.sleep-option[data-sleep]');
    if (!btn) return;
    setSleepTimer(btn.dataset.sleep);
    closeSleepModal();
  });

  // Share Lyric Card Studio modal
  const closeLyricCard = () => { lyricCardModal.hidden = true; };
  $('#closeLyricCardModal')?.addEventListener('click', closeLyricCard);
  lyricCardModal?.addEventListener('click', (e) => { if (e.target === lyricCardModal) closeLyricCard(); });
  lyricCardModal?.querySelectorAll('.ratio-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      lyricCardRatio = btn.dataset.ratio === 'post' ? 'post' : 'story';
      lyricCardModal.querySelectorAll('.ratio-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderLyricCard();
    });
  });
  $('#resetLyricSelection')?.addEventListener('click', () => {
    selectedCardLineIndices = [];
    lyricCardLinesEl.querySelectorAll('.card-line-btn').forEach((b) => b.classList.remove('selected'));
    $('#selectedLinesCount').textContent = '0';
    renderLyricCard();
  });
  $('#downloadLyricCardBtn')?.addEventListener('click', downloadLyricCard);
  $('#shareLyricCardBtn')?.addEventListener('click', shareLyricCard);

  // Playlist filter (Semua / Favorit) & search
  $('#filterAllBtn')?.addEventListener('click', () => {
    playlistFilter = 'all';
    $('#filterAllBtn').classList.add('active');
    $('#filterAllBtn').setAttribute('aria-selected', 'true');
    $('#filterFavBtn')?.classList.remove('active');
    $('#filterFavBtn')?.setAttribute('aria-selected', 'false');
    renderPlaylist();
  });
  $('#filterFavBtn')?.addEventListener('click', () => {
    playlistFilter = 'favorites';
    $('#filterFavBtn').classList.add('active');
    $('#filterFavBtn').setAttribute('aria-selected', 'true');
    $('#filterAllBtn')?.classList.remove('active');
    $('#filterAllBtn')?.setAttribute('aria-selected', 'false');
    renderPlaylist();
  });
  $('#playlistSearch')?.addEventListener('input', (e) => {
    playlistQuery = e.target.value || '';
    renderPlaylist();
  });

  // Behind the Song optional Voice Note player
  $('#voiceNoteButton')?.addEventListener('click', async () => {
    const track = currentTrack();
    if (!track?.voiceNote || !voiceNoteAudio) return;
    const btn = $('#voiceNoteButton');
    const label = $('#voiceNoteLabel');
    if (!voiceNoteAudio.paused) {
      voiceNoteAudio.pause();
      btn.classList.remove('is-playing');
      if (label) label.textContent = 'Pesan Suara';
      return;
    }
    if (!audio.paused) smoothPause(140);
    voiceNoteAudio.src = resolvePath(track.voiceNote);
    try {
      await voiceNoteAudio.play();
      btn.classList.add('is-playing');
      if (label) label.textContent = 'Hentikan Pesan';
    } catch (_e) {
      showToast('Pesan suara tidak dapat diputar.');
    }
  });
  voiceNoteAudio?.addEventListener('ended', () => {
    $('#voiceNoteButton')?.classList.remove('is-playing');
    if ($('#voiceNoteLabel')) $('#voiceNoteLabel').textContent = 'Pesan Suara';
  });

  // Equalizer & Playback Mood modal
  const openEqModal = () => {
    applyEqPreset(eqPreset, { silent: true });
    applyPlaybackSpeed(playbackSpeed, { silent: true });
    eqModal.hidden = false;
  };
  const closeEqModal = () => { eqModal.hidden = true; };
  $('#eqButton')?.addEventListener('click', openEqModal);
  $('#sheetEqButton')?.addEventListener('click', openEqModal);
  $('#closeEqModal')?.addEventListener('click', closeEqModal);
  eqModal?.addEventListener('click', (e) => { if (e.target === eqModal) closeEqModal(); });
  $('#eqOptions')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.eq-option[data-eq]');
    if (!btn) return;
    ensureAudioGraph({ force: btn.dataset.eq !== 'normal' });
    applyEqPreset(btn.dataset.eq);
    closeEqModal();
  });
  $('#speedOptions')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.speed-pill[data-speed]');
    if (!btn) return;
    applyPlaybackSpeed(Number(btn.dataset.speed));
  });
  $('#ambientOptions')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.speed-pill[data-ambient]');
    if (!btn) return;
    setAmbientMode(btn.dataset.ambient);
  });
  $('#ambientVolumeBar')?.addEventListener('input', (e) => {
    ambientVolume = clamp(Number(e.target.value), 0.05, 0.7);
    if (ambientGain && ambientCtx && ambientMode !== 'off') {
      ambientGain.gain.setTargetAtTime(ambientVolume * (ambientMode === 'vinyl' ? 0.55 : 0.45), ambientCtx.currentTime, 0.04);
    }
  });

  // Playlist Discography Grid / List view toggle & Horizontal Scroll Arrows
  $('#playlistViewListBtn')?.addEventListener('click', () => applyPlaylistView('list'));
  $('#playlistViewGridBtn')?.addEventListener('click', () => applyPlaylistView('grid'));
  $('#playlistScrollPrev')?.addEventListener('click', () => {
    const step = Math.max(240, playlistList.clientWidth * 0.72);
    playlistList.scrollBy({ left: -step, behavior: 'smooth' });
  });
  $('#playlistScrollNext')?.addEventListener('click', () => {
    const step = Math.max(240, playlistList.clientWidth * 0.72);
    playlistList.scrollBy({ left: step, behavior: 'smooth' });
  });

  // Open Letter Welcome Gate
  $('#welcomePlayBtn')?.addEventListener('click', () => {
    triggerHaptic(12);
    dismissWelcomeGate({ autoplay: true });
  });
  $('#welcomeSkipBtn')?.addEventListener('click', () => dismissWelcomeGate({ autoplay: false }));

  // Desktop Keyboard Shortcuts Modal
  const openShortcutsModal = () => { if (shortcutsModal) shortcutsModal.hidden = false; };
  const closeShortcutsModal = () => { if (shortcutsModal) shortcutsModal.hidden = true; };
  $('#shortcutsHintBtn')?.addEventListener('click', openShortcutsModal);
  $('#closeShortcutsModal')?.addEventListener('click', closeShortcutsModal);
  shortcutsModal?.addEventListener('click', (e) => { if (e.target === shortcutsModal) closeShortcutsModal(); });

  // Tap-to-Sync .lrc Karaoke Creator Studio listeners
  $('#syncLrcButton')?.addEventListener('click', openLrcSyncModal);
  $('#closeLrcSyncModal')?.addEventListener('click', closeLrcSyncModal);
  lrcSyncModal?.addEventListener('click', (e) => { if (e.target === lrcSyncModal) closeLrcSyncModal(); });
  $('#syncPlayBtn')?.addEventListener('click', togglePlay);
  $('#syncBackBtn')?.addEventListener('click', () => changeTime(-3));
  $('#syncUndoBtn')?.addEventListener('click', () => {
    if (!syncTimedEntries.length) return;
    const removed = syncTimedEntries.pop();
    if (ready && Number.isFinite(removed.time)) {
      audio.currentTime = Math.max(0, removed.time - 1.5);
      progress();
    }
    updateSyncUi();
  });
  $('#syncResetBtn')?.addEventListener('click', () => {
    syncTimedEntries = [];
    if (ready) { audio.currentTime = 0; progress(); }
    updateSyncUi();
  });
  $('#syncTapBtn')?.addEventListener('click', syncTapNextLine);
  $('#syncApplyBtn')?.addEventListener('click', () => {
    if (!syncTimedEntries.length) { showToast('Tandai minimal 1 baris lirik terlebih dahulu.'); return; }
    applyLrc(syncTimedEntries);
    closeLrcSyncModal();
    showToast('Timestamp karaoke diterapkan langsung untuk preview ♪');
  });
  $('#syncCopyBtn')?.addEventListener('click', async () => {
    const text = buildLrcOutputString();
    const ok = await copyTextSafe(text);
    showToast(ok ? 'Isi file .lrc berhasil disalin ♡' : 'Gagal menyalin .lrc.');
  });
  $('#syncDownloadBtn')?.addEventListener('click', () => {
    if (!syncTimedEntries.length) { showToast('Tandai minimal 1 baris lirik terlebih dahulu.'); return; }
    const track = currentTrack();
    const lrcName = (track?.lrcFile || `lyrics/${track?.id || 'song'}.lrc`).split('/').pop();
    const blob = new Blob([buildLrcOutputString() + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = lrcName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`File ${lrcName} diunduh · simpan ke folder lyrics/`);
  });

  // PWA Service Worker registration & Install App prompt
  if (IS_HTTP && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(resolvePath('sw.js')).catch(() => { /* Optional offline support. */ });
    });
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (installAppButton) installAppButton.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (installAppButton) installAppButton.hidden = true;
    showToast('Music Stories berhasil dipasang di perangkatmu ♡');
  });
  installAppButton?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    try { await deferredInstallPrompt.userChoice; } catch (_e) { /* Ignore. */ }
    deferredInstallPrompt = null;
    installAppButton.hidden = true;
  });

  // Mobile Swipe Gestures (Cover, Now Playing Art, Dock, Sheet Close)
  attachHorizontalSwipe($('.cover-stage'), { onLeft: nextTrack, onRight: previousTrack });
  attachHorizontalSwipe($('#sheetCoverStage'), { onLeft: nextTrack, onRight: previousTrack });
  attachHorizontalSwipe(musicDock, {
    onLeft: nextTrack,
    onRight: previousTrack,
    onUp: () => openNowPlayingSheet('player'),
    ignoreSelector: '.seek-control, button, input'
  });
  attachHorizontalSwipe($('.np-topbar'), { onDown: closeNowPlayingSheet });
  attachHorizontalSwipe($('#npDragBar'), { onDown: closeNowPlayingSheet });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (welcomeGate && !welcomeGate.hidden) { dismissWelcomeGate({ autoplay: false }); return; }
      if (shortcutsModal && !shortcutsModal.hidden) { closeShortcutsModal(); return; }
      if (!lrcSyncModal.hidden) { closeLrcSyncModal(); return; }
      if (!eqModal.hidden) { closeEqModal(); return; }
      if (!lyricCardModal.hidden) { closeLyricCard(); return; }
      if (!sleepTimerModal.hidden) { closeSleepModal(); return; }
      if (isSheetOpen) { closeNowPlayingSheet(); return; }
    }
    if (!lrcSyncModal.hidden && event.code === 'Space') {
      event.preventDefault();
      syncTapNextLine();
      return;
    }
    const focus = document.activeElement;
    if (['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT'].includes(focus?.tagName) || focus === lyricsScroll || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === '?') {
      event.preventDefault();
      if (shortcutsModal?.hidden) openShortcutsModal();
      else closeShortcutsModal();
      return;
    }
    if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
    else if (event.code === 'ArrowRight') changeTime(10);
    else if (event.code === 'ArrowLeft') changeTime(-10);
    else if (event.key === 'n' || event.key === 'N') nextTrack();
    else if (event.key === 'p' || event.key === 'P') previousTrack();
    else if (event.key === 'v' || event.key === 'V') applyVinylMode(!vinylMode);
    else if (event.key === 'f' || event.key === 'F') toggleFavorite();
    else if (event.key === 'l' || event.key === 'L') {
      if (isSheetOpen) closeNowPlayingSheet();
      else openNowPlayingSheet('player');
    } else if (event.key === 'm' || event.key === 'M') {
      if (targetVolume > 0.01) {
        mutedBeforeVolume = targetVolume;
        volumeBar.value = '0';
        setOutputVolume(0);
        showToast('Audio dibisukan');
      } else {
        const restore = mutedBeforeVolume > 0.05 ? mutedBeforeVolume : 0.85;
        volumeBar.value = String(restore);
        setOutputVolume(restore);
        showToast('Audio disuarakan');
      }
    }
  });
  if ('mediaSession' in navigator) {
    const actions = {
      play: () => tryPlay(),
      pause: () => smoothPause(150),
      stop: () => smoothPause(150),
      previoustrack: previousTrack,
      nexttrack: nextTrack,
      seekbackward: (details) => changeTime(-(details.seekOffset || 10)),
      seekforward: (details) => changeTime(details.seekOffset || 10),
      seekto: (details) => { if (ready && details.seekTime !== undefined) { audio.currentTime = details.seekTime; progress(); updateMediaPositionState(); } }
    };
    Object.entries(actions).forEach(([name, handler]) => {
      try { navigator.mediaSession.setActionHandler(name, handler); } catch (_e) { /* Optional on browser. */ }
    });
  }
  window.addEventListener('beforeunload', () => {
    savePrefs();
    for (const url of localAudioOverrides.values()) URL.revokeObjectURL(url);
  });
  volumeBar.value = String(targetVolume);
  audio.volume = targetVolume;
  if (tracks.length) {
    const params = new URLSearchParams(location.search);
    const rawSongParam = params.get('song');
    const normalizedParam = rawSongParam ? rawSongParam.trim().toLowerCase() : '';
    const isCreatorSync = params.get('sync') === '1';
    if ($('#syncLrcButton')) $('#syncLrcButton').hidden = !isCreatorSync;

    // Support shared moment timestamp via #t=48 or ?t=48
    const hashTimeMatch = location.hash.match(/^#t=(\d+)$/i);
    const queryTimeParam = params.get('t');
    const sharedSec = hashTimeMatch ? Number(hashTimeMatch[1]) : (queryTimeParam && /^\d+$/.test(queryTimeParam) ? Number(queryTimeParam) : 0);

    let index = normalizedParam
      ? tracks.findIndex(track =>
        track.id.toLowerCase() === normalizedParam ||
        track.title.toLowerCase() === normalizedParam
      )
      : -1;
    // Restore last played song & timestamp if visiting root without explicit ?song= parameter.
    if (index < 0 && !normalizedParam && prefs.lastTrackId) {
      const savedIdx = tracks.findIndex((t) => t.id === prefs.lastTrackId);
      if (savedIdx >= 0) {
        index = savedIdx;
        if (!sharedSec && Number.isFinite(prefs.lastTime) && prefs.lastTime > 2) pendingRestoreTime = prefs.lastTime;
      }
    }
    if (sharedSec > 0) {
      pendingRestoreTime = sharedSec;
      pendingMomentToast = `Membuka momen di ${timeString(sharedSec)} · ketuk Play untuk mendengarkan ♪`;
    }
    updateRepeatUi();
    updateShuffleUi();
    updateSleepUi();
    applyEqPreset(eqPreset, { silent: true });
    applyPlaybackSpeed(playbackSpeed, { silent: true });
    applyVinylMode(vinylMode, { silent: true });
    applyPlaylistView(playlistView);
    switchTrack(index >= 0 ? index : 0, { updateUrl: IS_HTTP || index >= 0 });
    if (isCreatorSync) {
      setTimeout(() => openLrcSyncModal(), 450);
    } else {
      let alreadyOpened = false;
      try { alreadyOpened = sessionStorage.getItem('zandevaa_opened') === '1'; } catch (_e) { alreadyOpened = false; }
      if (params.get('open') === '1' || !alreadyOpened) {
        showWelcomeGateForTrack(currentTrack());
      }
    }
  } else {
    setLyricsMessage('Belum ada lagu. Tambahkan daftar lagu di playlist.js.');
    audioHint.textContent = 'Playlist masih kosong.';
    playButton.disabled = true;
    previousButton.disabled = true;
    nextButton.disabled = true;
  }
})();
