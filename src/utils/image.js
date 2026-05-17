// ─── Image Rendering Utility ─────────────────────────────────────
// Downloads anime poster from URL and renders via chafa for terminal display
// Uses half-block characters for maximum fidelity within blessed

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';

const CACHE_DIR = path.join(os.tmpdir(), 'aniex_img_cache');

// Ensure cache directory exists
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch { }

/**
 * Download an image URL to a temp file
 * @param {string} url - Image URL
 * @returns {Promise<string|null>} Path to downloaded file or null
 */
async function downloadImage(url) {
  if (!url) return null;
  try {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const ext = url.includes('.png') ? '.png' : '.jpg';
    const filePath = path.join(CACHE_DIR, `${hash}${ext}`);

    // Return cached if exists and less than 1 hour old
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (Date.now() - stat.mtimeMs < 3600000) return filePath;
    }

    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch {
    return null;
  }
}

/**
 * Strip non-SGR ANSI escape sequences from chafa output.
 * Keeps only color codes (\e[...m) and strips cursor moves,
 * cursor show/hide, title sets, etc. that break blessed.
 */
function cleanChafaOutput(raw) {
  // Remove cursor show/hide sequences: \e[?25h, \e[?25l
  let cleaned = raw.replace(/\x1b\[\?25[hl]/g, '');
  // Remove cursor position sequences: \e[row;colH or \e[row;colf
  cleaned = cleaned.replace(/\x1b\[\d+;\d+[Hf]/g, '');
  // Remove cursor movement: \e[nA/B/C/D
  cleaned = cleaned.replace(/\x1b\[\d*[ABCD]/g, '');
  // Remove erase sequences: \e[nJ, \e[nK
  cleaned = cleaned.replace(/\x1b\[\d*[JK]/g, '');
  // Remove scroll sequences
  cleaned = cleaned.replace(/\x1b\[\d*[ST]/g, '');
  // Remove title/window manipulation sequences: \e]...ST or \e]...BEL
  cleaned = cleaned.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
  // Remove any other CSI sequences that are NOT SGR (not ending with 'm')
  cleaned = cleaned.replace(/\x1b\[[\d;]*[A-HJKST]/g, '');
  return cleaned;
}

/**
 * Render an image using chafa as clean ANSI art string
 * Uses half-block symbols for best quality within character cells
 * @param {string} url - Image URL to render
 * @param {object} opts - { width, height } in terminal columns/rows
 * @returns {Promise<string>} ANSI art string
 */
export async function renderImage(url, opts = {}) {
  const width = opts.width || 20;
  const height = opts.height || 10;

  const filePath = await downloadImage(url);
  if (!filePath) return createPlaceholder(width, height);

  try {
    const result = execSync(
      `chafa --format=sixel "${filePath}" --size ${width}x${height} --stretch --color-space din99d --color-extractor median --dither none --animate off`,
      {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    const cleaned = cleanChafaOutput(result).trimEnd();
    return cleaned || createPlaceholder(width, height);
  } catch {
    return createPlaceholder(width, height);
  }
}

/**
 * Render from local file synchronously
 */
export function renderImageSync(filePath, opts = {}) {
  const width = opts.width || 20;
  const height = opts.height || 10;

  if (!filePath || !fs.existsSync(filePath)) {
    return createPlaceholder(width, height);
  }

  try {
    const result = execSync(
      `chafa --format=sixel "${filePath}" --size ${width}x${height} --stretch --color-space din99d --color-extractor median --dither none --animate off`,
      {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    return cleanChafaOutput(result).trimEnd() || createPlaceholder(width, height);
  } catch {
    return createPlaceholder(width, height);
  }
}

/**
 * Create a text placeholder when image can't be loaded
 */
function createPlaceholder(width, height) {
  const lines = [];
  const w = Math.min(width, 20);
  const h = Math.min(height, 8);

  lines.push('┌' + '─'.repeat(w - 2) + '┐');
  for (let i = 0; i < h - 2; i++) {
    if (i === Math.floor((h - 2) / 2)) {
      const label = ' No Image ';
      const pad = w - 2 - label.length;
      const left = Math.floor(pad / 2);
      const right = pad - left;
      lines.push('│' + ' '.repeat(left) + label + ' '.repeat(right) + '│');
    } else {
      lines.push('│' + ' '.repeat(w - 2) + '│');
    }
  }
  lines.push('└' + '─'.repeat(w - 2) + '┘');

  return lines.join('\n');
}

/**
 * Clean up cached images
 */
export function clearImageCache() {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    for (const f of files) {
      fs.unlinkSync(path.join(CACHE_DIR, f));
    }
  } catch { }
}

export default { renderImage, renderImageSync, clearImageCache };
