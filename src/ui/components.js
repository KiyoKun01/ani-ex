// ─── Reusable UI Components & Design System ─────────────────────
// Rich color system, box-drawing helpers, shared widgets

import blessed from 'neo-blessed';

// ─── Color Palette ───────────────────────────────────────────────
const COLORS = {
  // Backgrounds
  bg:         '#0a0a1a',
  surface:    '#12122a',
  surfaceAlt: '#1a1a3e',
  card:       '#16163a',

  // Borders
  border:     '#2d2d5e',
  borderDim:  '#1e1e44',
  borderGlow: '#7c3aed',

  // Accent (purple theme)
  accent:     '#e879f9',
  accentDim:  '#a855f7',
  accentDeep: '#7c3aed',
  accentGlow: '#c084fc',

  // Text
  text:       '#e2e8f0',
  textBright: '#f8fafc',
  textDim:    '#94a3b8',
  textMuted:  '#64748b',

  // Semantic
  highlight:  '#6c5ce7',
  highlightBg:'#2d1f6b',
  success:    '#34d399',
  warning:    '#fbbf24',
  error:      '#f87171',
  info:       '#38bdf8',
  rating:     '#fbbf24',

  // Gradient stops (for manual gradient text)
  grad1:      '#e879f9',
  grad2:      '#c084fc',
  grad3:      '#a78bfa',
  grad4:      '#818cf8',

  // Badge colors
  badgeSub:   '#34d399',
  badgeDub:   '#38bdf8',
  badgeTV:    '#a78bfa',
  badgeMovie: '#fb923c',
  badgeOVA:   '#f472b6',
};

// ─── Box-Drawing Helpers ─────────────────────────────────────────
const BOX = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
  dh: '═', dv: '║',
  dtl: '╔', dtr: '╗', dbl: '╚', dbr: '╝',
  cross: '┼', tee: '├', rtee: '┤',
  bullet: '▸', dot: '•', star: '★', diamond: '◆',
  arrowR: '→', arrowL: '←', arrowU: '↑', arrowD: '↓',
  play: '▶', pause: '⏸', stop: '⏹',
  check: '✓', cross2: '✗',
  block: '█', halfBlock: '▓', lightBlock: '░',
};

// ─── Section Header ──────────────────────────────────────────────
/**
 * Create a styled section divider
 * @param {string} title - Section title
 * @param {string} icon - Optional icon prefix
 * @returns {string} Formatted section header string for blessed tags
 */
function createSectionHeader(title, icon = '') {
  const iconStr = icon ? `${icon} ` : '';
  const line = BOX.h.repeat(50);
  return `{bold}{${COLORS.accent}-fg}${iconStr}${title}{/} {${COLORS.borderDim}-fg}${line}{/}`;
}

// ─── Anime Card (text-based) ─────────────────────────────────────
/**
 * Format a rich anime card line for list items
 * @param {object} anime - { name, subEpisodes, dubEpisodes, type, rating }
 * @param {number} index - Item index
 * @param {boolean} isSelected - Whether item is selected
 * @returns {string} Formatted card string for blessed tags
 */
function formatAnimeCard(anime, index, isSelected = false) {
  const pointer = isSelected ? `{bold}{${COLORS.accent}-fg}${BOX.bullet}{/}` : ' ';
  const num = String(index + 1).padStart(2, '0');
  const name = anime.name || anime.title || 'Unknown';
  const truncName = name.length > 42 ? name.slice(0, 39) + '...' : name;

  // Build badges
  const badges = [];
  if (anime.subEpisodes) {
    badges.push(`{${COLORS.badgeSub}-fg}SUB:${anime.subEpisodes}{/}`);
  }
  if (anime.dubEpisodes) {
    badges.push(`{${COLORS.badgeDub}-fg}DUB:${anime.dubEpisodes}{/}`);
  }
  const badgeStr = badges.length > 0 ? ` ${BOX.v} ${badges.join(' ')}` : '';

  return `  ${pointer} {${COLORS.textDim}-fg}${num}.{/} {${COLORS.textBright}-fg}${truncName}{/}${badgeStr}`;
}

// ─── Episode Item ────────────────────────────────────────────────
/**
 * Format a styled episode list item
 */
function formatEpisodeItem(epNum, index) {
  // Handle both plain numbers/strings AND episode objects from the provider layer
  let num, title;
  if (typeof epNum === 'object' && epNum !== null) {
    num = epNum.episodeString || epNum.number || String(index + 1);
    title = epNum.title || '';
  } else {
    num = epNum;
    title = '';
  }

  const padded = String(num).padStart(4, ' ');
  const isEven = index % 2 === 0;
  const prefix = isEven ? `{${COLORS.accent}-fg}${BOX.bullet}{/}` : `{${COLORS.accentDim}-fg}${BOX.dot}{/}`;
  const titleStr = title ? `  {${COLORS.textDim}-fg}${title.length > 35 ? title.slice(0, 32) + '...' : title}{/}` : '';
  return `  ${prefix} {${COLORS.textBright}-fg}Episode ${padded}{/}${titleStr}`;
}

// ─── Stream Quality Item ─────────────────────────────────────────
/**
 * Format a styled stream quality list item
 */
function formatStreamItem(stream, index) {
  const num = String(index + 1).padStart(2, '0');
  const quality = (stream.quality || 'auto').padEnd(8);
  const provider = (stream.provider || 'unknown').padEnd(12);

  // Type icon
  let typeIcon = '📹';
  if (stream.type === 'm3u8' || stream.type === 'hls') typeIcon = '🎬';
  else if (stream.type === 'mp4') typeIcon = '📹';

  // Quality color
  let qualityColor = COLORS.textDim;
  if (quality.includes('1080')) qualityColor = COLORS.success;
  else if (quality.includes('720')) qualityColor = COLORS.info;
  else if (quality.includes('480')) qualityColor = COLORS.warning;

  return `  {${COLORS.textDim}-fg}${num}.{/} ${typeIcon} {${qualityColor}-fg}{bold}${quality}{/} {${COLORS.textDim}-fg}${BOX.v}{/} {${COLORS.accentGlow}-fg}${provider}{/} {${COLORS.textDim}-fg}${BOX.v}{/} {${COLORS.textMuted}-fg}${stream.type || '?'}{/}`;
}

// ─── Mode Toggle (SUB/DUB) ──────────────────────────────────────
/**
 * Render SUB/DUB toggle string
 */
function renderModeToggle(mode, subCount = null, dubCount = null) {
  const subText = subCount !== null ? `SUB: ${subCount}` : 'SUB';
  const dubText = dubCount !== null ? `DUB: ${dubCount}` : 'DUB';

  const subLabel = mode === 'sub'
    ? `{${COLORS.badgeSub}-bg}{#000-fg}{bold} ${subText} {/}`
    : `{${COLORS.surfaceAlt}-bg}{${COLORS.textMuted}-fg} ${subText} {/}`;
  const dubLabel = mode === 'dub'
    ? `{${COLORS.badgeDub}-bg}{#000-fg}{bold} ${dubText} {/}`
    : `{${COLORS.surfaceAlt}-bg}{${COLORS.textMuted}-fg} ${dubText} {/}`;

  return `${subLabel} ${dubLabel}`;
}

// ─── Loading Spinner ─────────────────────────────────────────────
function createLoadingSpinner(parent, message = 'Loading...') {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIdx = 0;

  const box = blessed.box({
    parent,
    top: 'center',
    left: 'center',
    width: Math.max(message.length + 8, 30),
    height: 5,
    tags: true,
    style: {
      fg: COLORS.accent,
      bg: COLORS.surface,
      border: { fg: COLORS.accentDeep },
    },
    border: 'line',
  });

  function render() {
    box.setContent([
      '',
      `  {${COLORS.accent}-fg}${frames[frameIdx]}{/}  {${COLORS.text}-fg}${message}{/}`,
    ].join('\n'));
  }
  render();

  const interval = setInterval(() => {
    frameIdx = (frameIdx + 1) % frames.length;
    render();
    if (box.screen) box.screen.render();
  }, 80);

  box.on('destroy', () => clearInterval(interval));
  box._spinnerInterval = interval;

  return box;
}

// ─── Error Box ───────────────────────────────────────────────────
function createErrorBox(parent, message) {
  return blessed.box({
    parent,
    top: 'center',
    left: 'center',
    width: '70%',
    height: 7,
    tags: true,
    style: {
      fg: '#fff',
      bg: COLORS.surface,
      border: { fg: COLORS.error },
    },
    border: 'line',
    content: [
      '',
      `  {${COLORS.error}-fg}{bold}${BOX.cross2} Error{/}`,
      `  {${COLORS.text}-fg}${message}{/}`,
      '',
      `  {${COLORS.textDim}-fg}Press {bold}b{/bold} to go back or {bold}r{/bold} to retry{/}`,
    ].join('\n'),
  });
}

// ─── Info Box ────────────────────────────────────────────────────
function createInfoBox(parent, title, lines, options = {}) {
  const contentLines = [
    '',
    `  {bold}{${COLORS.accent}-fg}${title}{/}`,
    `  {${COLORS.borderDim}-fg}${BOX.h.repeat(40)}{/}`,
    ...lines.map(l => `  ${l}`),
    '',
  ];

  return blessed.box({
    parent,
    top: options.top || 1,
    left: options.left || 2,
    width: options.width || '100%-4',
    height: options.height || contentLines.length + 2,
    tags: true,
    style: {
      fg: COLORS.text,
      bg: COLORS.card,
      border: { fg: COLORS.border },
    },
    border: 'line',
    content: contentLines.join('\n'),
  });
}

// ─── Styled List ─────────────────────────────────────────────────
function createStyledList(parent, options = {}) {
  return blessed.list({
    parent,
    top: options.top || 0,
    left: options.left || 2,
    width: options.width || '100%-4',
    height: options.height || '100%-2',
    scrollable: true,
    mouse: true,
    keys: true,
    vi: true,
    tags: true,
    scrollbar: {
      ch: '▐',
      style: { bg: COLORS.accentDim },
    },
    style: {
      fg: COLORS.text,
      bg: COLORS.bg,
      selected: {
        fg: COLORS.textBright,
        bg: COLORS.highlightBg,
        bold: true,
      },
      item: {
        fg: COLORS.text,
        bg: COLORS.bg,
      },
    },
    ...options,
  });
}

// ─── Genre Tags ──────────────────────────────────────────────────
const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Isekai', 'Mecha', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports',
  'Supernatural', 'Thriller', 'Mystery',
];

function renderGenreTags(selectedGenre = null) {
  return GENRES.map(g => {
    if (g === selectedGenre) {
      return `{${COLORS.accent}-bg}{#000-fg}{bold} ${g} {/}`;
    }
    return `{${COLORS.surfaceAlt}-bg}{${COLORS.textDim}-fg} ${g} {/}`;
  }).join(' ');
}

// ─── Exports ─────────────────────────────────────────────────────
export {
  COLORS,
  BOX,
  GENRES,
  createSectionHeader,
  formatAnimeCard,
  formatEpisodeItem,
  formatStreamItem,
  renderModeToggle,
  createLoadingSpinner,
  createErrorBox,
  createInfoBox,
  createStyledList,
  renderGenreTags,
};
