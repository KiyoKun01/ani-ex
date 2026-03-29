// ─── Image Rendering Utility ─────────────────────────────────────
// Downloads anime poster from URL and converts to ANSI art for terminal display

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Render an image URL as ANSI art string for embedding in blessed boxes
 * @param {string} url - Image URL to render
 * @param {object} opts - Options { width, height } in terminal columns/rows
 * @returns {Promise<string>} ANSI art string
 */
export async function renderImage(url, opts = {}) {
  const width = opts.width || 30;
  const height = opts.height || 15;

  try {
    // Download image to temp file
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    const tmpPath = path.join(os.tmpdir(), `animecli_${Date.now()}.jpg`);
    fs.writeFileSync(tmpPath, buffer);

    // Use terminal-image to render
    const terminalImage = await import('terminal-image');
    const rendered = await terminalImage.default.file(tmpPath, {
      width,
      height,
      preserveAspectRatio: true
    });

    // Clean up temp file
    try { fs.unlinkSync(tmpPath); } catch { }

    return rendered;
  } catch (err) {
    // Return a placeholder box on failure
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

export default { renderImage };
