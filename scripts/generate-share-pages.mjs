#!/usr/bin/env node
/**
 * Generate static per-song share pages (song/<id>/index.html) and sync root index.html OG metadata.
 * WhatsApp, Telegram, Facebook, etc. read static HTML meta tags without executing JavaScript,
 * so each song gets its own static share URL with "<Judul Lagu> — <Artis>" metadata.
 *
 * Usage:
 *   node scripts/generate-share-pages.mjs
 *   SITE_URL=https://custom-domain.com/ node scripts/generate-share-pages.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PLAYLIST_PATH = path.join(ROOT_DIR, 'playlist.js');
const INDEX_PATH = path.join(ROOT_DIR, 'index.html');
const SONG_DIR = path.join(ROOT_DIR, 'song');

function detectSiteUrl() {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/+$/, '') + '/';
  }
  const cnamePath = path.join(ROOT_DIR, 'CNAME');
  if (fs.existsSync(cnamePath)) {
    const domain = fs.readFileSync(cnamePath, 'utf8').trim();
    if (domain) return `https://${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/`;
  }
  try {
    const remote = execSync('git remote get-url origin', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
    const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/i);
    if (match) {
      const [, owner, repo] = match;
      if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
        return `https://${owner}.github.io/`;
      }
      return `https://${owner}.github.io/${repo}/`;
    }
  } catch (_e) {
    // Fallback below.
  }
  return 'https://fauzanmsc.github.io/zandevaa-music/';
}

function loadTracks() {
  const code = fs.readFileSync(PLAYLIST_PATH, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox, { filename: 'playlist.js' });
  const tracks = sandbox.window.PLAYLIST_TRACKS;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new Error('window.PLAYLIST_TRACKS tidak ditemukan atau kosong di playlist.js');
  }
  return tracks.filter((t) => t && t.id && t.title);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveOgImage(track, siteUrl) {
  const candidates = [];
  if (track.ogImage) candidates.push(track.ogImage);
  candidates.push(`assets/og/${track.id}.jpg`);
  candidates.push(`assets/og/${track.id}.png`);
  if (track.cover) {
    if (/\.webp$/i.test(track.cover)) {
      candidates.push(track.cover.replace(/\.webp$/i, '.jpg'));
      candidates.push(track.cover.replace(/\.webp$/i, '.png'));
    }
    candidates.push(track.cover);
  }
  candidates.push('assets/cover.jpg');

  for (const candidate of candidates) {
    if (/^https?:\/\//i.test(candidate)) return candidate;
    const localPath = path.join(ROOT_DIR, candidate);
    if (fs.existsSync(localPath)) {
      return new URL(candidate.split('/').map(encodeURIComponent).join('/'), siteUrl).href;
    }
  }
  return new URL('assets/cover.jpg', siteUrl).href;
}

function buildShareMetaBlock({ title, description, imageUrl, pageUrl }) {
  return [
    `  <!-- SHARE_META_START -->`,
    `  <meta name="description" content="${escapeHtml(description)}" />`,
    `  <meta property="og:type" content="website" />`,
    `  <meta property="og:title" content="${escapeHtml(title)}" />`,
    `  <meta property="og:description" content="${escapeHtml(description)}" />`,
    `  <meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
    `  <meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
    `  <meta property="og:locale" content="id_ID" />`,
    `  <meta name="twitter:card" content="summary_large_image" />`,
    `  <meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `  <meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`,
    `  <title>${escapeHtml(title)}</title>`,
    `  <!-- SHARE_META_END -->`,
  ].join('\n');
}

function buildSongPageHtml(track, siteUrl) {
  const artist = track.artist || 'Zandevaa';
  const fullTitle = `${track.title} — ${artist}`;
  const description = track.description || `Dengarkan "${track.title}" oleh ${artist} lengkap dengan liriknya.`;
  const encodedId = encodeURIComponent(track.id);
  const pageUrl = new URL(`song/${encodedId}/`, siteUrl).href;
  const imageUrl = resolveOgImage(track, siteUrl);
  const redirectTarget = `../../?song=${encodedId}`;

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#061226" />
${buildShareMetaBlock({ title: fullTitle, description, imageUrl, pageUrl })}
  <link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg" />
  <link rel="canonical" href="${escapeHtml(pageUrl)}" />
  <script>
    window.location.replace(${JSON.stringify(redirectTarget)} + window.location.hash);
  </script>
</head>
<body style="background:#061226;color:#eff2f6;font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px;">
  <main>
    <p style="margin:0 0 12px;color:#a1aec1;font-size:14px;">Membuka lagu…</p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;">${escapeHtml(fullTitle)}</h1>
    <a href="${escapeHtml(redirectTarget)}" style="color:#f1d3aa;text-decoration:underline;">Klik di sini jika halaman tidak terbuka otomatis</a>
  </main>
</body>
</html>
`;
}

function syncRootIndex(firstTrack, siteUrl) {
  const indexHtml = fs.readFileSync(INDEX_PATH, 'utf8');
  const artist = firstTrack.artist || 'Zandevaa';
  const fullTitle = `${firstTrack.title} — ${artist}`;
  const description = firstTrack.description || `Dengarkan "${firstTrack.title}" oleh ${artist} lengkap dengan liriknya.`;
  const imageUrl = resolveOgImage(firstTrack, siteUrl);
  const metaBlock = buildShareMetaBlock({ title: fullTitle, description, imageUrl, pageUrl: siteUrl });

  const markerRegex = /[ \t]*<!-- SHARE_META_START -->[\s\S]*?<!-- SHARE_META_END -->/;
  if (!markerRegex.test(indexHtml)) {
    throw new Error('Marker <!-- SHARE_META_START --> ... <!-- SHARE_META_END --> tidak ditemukan di index.html');
  }
  const updated = indexHtml.replace(markerRegex, metaBlock);
  fs.writeFileSync(INDEX_PATH, updated, 'utf8');
}

function main() {
  const siteUrl = detectSiteUrl();
  const tracks = loadTracks();
  const validIds = new Set(tracks.map((t) => t.id));

  fs.mkdirSync(SONG_DIR, { recursive: true });

  // Clean up stale generated folders if a track id was removed or renamed.
  for (const entry of fs.readdirSync(SONG_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && !validIds.has(entry.name)) {
      fs.rmSync(path.join(SONG_DIR, entry.name), { recursive: true, force: true });
      console.log(`Removed stale share page: song/${entry.name}/`);
    }
  }

  for (const track of tracks) {
    const trackDir = path.join(SONG_DIR, track.id);
    fs.mkdirSync(trackDir, { recursive: true });
    const html = buildSongPageHtml(track, siteUrl);
    fs.writeFileSync(path.join(trackDir, 'index.html'), html, 'utf8');
    console.log(`Generated: song/${track.id}/index.html -> "${track.title} — ${track.artist || 'Zandevaa'}"`);
  }

  syncRootIndex(tracks[0], siteUrl);
  console.log(`Updated: index.html default OG title -> "${tracks[0].title} — ${tracks[0].artist || 'Zandevaa'}"`);
  console.log(`Base site URL: ${siteUrl}`);
}

main();

