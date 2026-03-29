// ─── Video Player Launcher ───────────────────────────────────────
// Launches anime episodes via mpv or browser fallback
// Supports --referrer and --sub-file for AllAnime streams

import { execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import open from 'open';

/**
 * Check if mpv is installed
 */
function hasMpv() {
  try {
    execSync('mpv --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Launch video playback
 * @param {string} streamUrl - Streaming URL (m3u8 or mp4)
 * @param {string} title - Episode title for display
 * @param {object} options - { referer, subtitleUrl, type }
 */
export async function launchPlayer(streamUrl, title = 'Anime Episode', options = {}) {
  if (hasMpv()) {
    return launchMpv(streamUrl, title, options);
  } else {
    return launchBrowser(streamUrl, title, options);
  }
}

/**
 * Launch video in mpv player
 */
function launchMpv(streamUrl, title, options = {}) {
  const args = [`"${streamUrl}"`, `--title="${title}"`];

  // Add referrer header if present (required for m3u8 streams)
  if (options.referer) {
    args.push(`--http-header-fields="Referer: ${options.referer}"`);
    args.push(`--referrer="${options.referer}"`);
  }

  // Add subtitle track if available
  if (options.subtitleUrl) {
    args.push(`--sub-file="${options.subtitleUrl}"`);
  }

  // Force demuxer for m3u8
  if (options.type === 'm3u8' || streamUrl.includes('.m3u8')) {
    args.push('--demuxer-lavf-format=hls');
  }

  const cmd = `mpv ${args.join(' ')}`;
  const child = exec(cmd, { detached: true, stdio: 'ignore' });
  child.unref();

  return { player: 'mpv', pid: child.pid };
}

/**
 * Launch video in browser with HTML5 player (fallback)
 */
async function launchBrowser(streamUrl, title, options = {}) {
  const subtitleTrack = options.subtitleUrl
    ? `<track kind="captions" src="${options.subtitleUrl}" srclang="en" label="English" default>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — ANI-ME-CLI</title>
  <link href="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls-ui.css" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0f;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: 'Segoe UI', sans-serif;
    }
    h1 {
      color: #e879f9;
      margin-bottom: 16px;
      font-size: 1.2rem;
      letter-spacing: 1px;
    }
    video {
      width: 90vw;
      max-width: 960px;
      background: #000;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <h1>▶ ${title}</h1>
  <video id="player" controls>
    ${subtitleTrack}
  </video>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
  <script>
    const video = document.getElementById('player');
    const url = '${streamUrl}';
    if (url.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      video.src = url;
    }
  </script>
</body>
</html>`;

  const filePath = path.join(process.cwd(), 'videoPlayer.html');
  fs.writeFileSync(filePath, html);
  await open(filePath);

  return { player: 'browser', path: filePath };
}

export default { launchPlayer };
