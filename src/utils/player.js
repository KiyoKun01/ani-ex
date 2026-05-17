// ─── Video Player Launcher ───────────────────────────────────────
// Launches anime episodes via mpv (default) or VLC (fallback)
// Supports --referrer and subtitle tracks for AnimeKai streams

import { execSync, exec } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Check if a command exists on the system
 */
function hasCommand(cmd) {
  try {
    const isWin = process.platform === 'win32';
    execSync(`${isWin ? 'where' : 'which'} ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    if (cmd === 'vlc' && process.platform === 'win32') {
      return fs.existsSync('C:\\Program Files\\VideoLAN\\VLC\\vlc.exe') || 
             fs.existsSync('C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe');
    }
    return false;
  }
}

/**
 * Detect available player: mpv > vlc > none
 */
function detectPlayer() {
  if (hasCommand('mpv')) return 'mpv';
  if (hasCommand('vlc')) return 'vlc';
  return null;
}

/**
 * Launch video playback
 * @param {string} streamUrl - Streaming URL (m3u8 or mp4)
 * @param {string} title - Episode title for display
 * @param {object} options - { referer, subtitleUrl, subtitles, type, preferredPlayer }
 *   - subtitles: Array of {url, lang} from provider (AnimeKai sends these)
 *   - preferredPlayer: 'mpv' | 'vlc' (override auto-detect)
 */
export async function launchPlayer(streamUrl, title = 'Anime Episode', options = {}) {
  const player = options.preferredPlayer || detectPlayer();

  if (player === 'mpv') {
    return launchMpv(streamUrl, title, options);
  } else if (player === 'vlc') {
    return launchVlc(streamUrl, title, options);
  } else {
    throw new Error('No video player found. Install mpv (recommended) or VLC.');
  }
}

/**
 * Launch video in mpv player (default)
 */
function launchMpv(streamUrl, title, options = {}) {
  const args = [
    `"${streamUrl}"`,
    `--title="${title}"`,
    '--force-window=yes',
    '--keep-open=yes',
  ];

  // Add referrer header (required for m3u8 streams from AnimeKai/MegaUp)
  if (options.referer) {
    args.push(`--http-header-fields="Referer: ${options.referer}"`);
    args.push(`--referrer="${options.referer}"`);
  }

  // Add subtitle track if a single URL is provided
  if (options.subtitleUrl) {
    args.push(`--sub-file="${options.subtitleUrl}"`);
  }

  // Add multiple subtitle tracks from provider (AnimeKai returns these)
  if (options.subtitles && Array.isArray(options.subtitles)) {
    const englishSub = options.subtitles.find(s =>
      s.lang?.toLowerCase().includes('english') && s.kind !== 'thumbnails'
    );
    if (englishSub) {
      args.push(`--sub-file="${englishSub.url}"`);
    }
  }

  // Force HLS demuxer for m3u8
  if (options.type === 'm3u8' || streamUrl.includes('.m3u8')) {
    args.push('--demuxer-lavf-format=hls');
  }

  const cmd = `mpv ${args.join(' ')}`;
  const child = exec(cmd, { detached: true, stdio: 'ignore' });
  child.unref();

  return { player: 'mpv', pid: child.pid };
}

/**
 * Launch video in VLC player (fallback)
 */
function launchVlc(streamUrl, title, options = {}) {
  const args = [
    `"${streamUrl}"`,
    `--meta-title="${title}"`,
  ];

  // Add referrer for m3u8 streams
  if (options.referer) {
    args.push(`--http-referrer="${options.referer}"`);
  }

  // Add subtitle track
  if (options.subtitleUrl) {
    args.push(`--sub-file="${options.subtitleUrl}"`);
  }

  // Add English subtitle from provider subtitles array
  if (options.subtitles && Array.isArray(options.subtitles)) {
    const englishSub = options.subtitles.find(s =>
      s.lang?.toLowerCase().includes('english') && s.kind !== 'thumbnails'
    );
    if (englishSub) {
      args.push(`--sub-file="${englishSub.url}"`);
    }
  }

  let vlcExe = 'vlc';
  if (process.platform === 'win32') {
    try {
      execSync('where vlc', { stdio: 'ignore' });
    } catch {
      if (fs.existsSync('C:\\Program Files\\VideoLAN\\VLC\\vlc.exe')) {
        vlcExe = '"C:\\Program Files\\VideoLAN\\VLC\\vlc.exe"';
      } else if (fs.existsSync('C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe')) {
        vlcExe = '"C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe"';
      }
    }
  }

  const cmd = `${vlcExe} ${args.join(' ')}`;
  const child = exec(cmd, { detached: true, stdio: 'ignore' });
  child.unref();

  return { player: 'vlc', pid: child.pid };
}

export default { launchPlayer };
