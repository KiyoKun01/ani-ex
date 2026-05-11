// ─── Main Layout Shell ───────────────────────────────────────────
// Persistent layout: Header, ContentArea, StatusBar
// Premium design with gradient header and animated status bar

import blessed from 'neo-blessed';
import { COLORS, BOX } from './components.js';

/**
 * Create the main application layout
 * Returns { screen, header, content, statusBar, setTab, setStatus, setBreadcrumb }
 */
export function createLayout() {
  // ─── Screen ────────────────────────────────────────────────────
  const screen = blessed.screen({
    smartCSR: true,
    title: 'ANI-ME-CLI — Anime in Your Terminal',
    fullUnicode: true,
    dockBorders: true,
    resizeTimeout: 300,
    style: { bg: COLORS.bg },
  });

  // ─── Header Bar ────────────────────────────────────────────────
  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    style: {
      fg: '#fff',
      bg: COLORS.surfaceAlt,
      border: { fg: COLORS.accentDeep },
    },
    border: { type: 'line', bottom: true, top: false, left: false, right: false },
    tags: true,
  });

  let activeTab = 'home';
  let breadcrumbParts = null;

  function renderHeader() {
    const w = screen.width || 80;

    if (breadcrumbParts && breadcrumbParts.length > 0) {
      // Breadcrumb mode: ★ ANI-ME-CLI ▸ Naruto ▸ EP 01 [SUB]
      const logo = `{bold}{${COLORS.accent}-fg}${BOX.star} ANI-ME-CLI{/}`;
      const crumbs = breadcrumbParts.map(p =>
        `{${COLORS.textDim}-fg}${BOX.bullet}{/} {${COLORS.text}-fg}${p}{/}`
      ).join('  ');
      header.setContent(`  ${logo}  ${crumbs}`);
    } else {
      // Tab mode with richer styling
      const logo = `{bold}{${COLORS.accent}-fg}${BOX.star}{/} {bold}{${COLORS.grad1}-fg}A{${COLORS.grad2}-fg}N{${COLORS.grad3}-fg}I{/}{${COLORS.textDim}-fg}-{/}{bold}{${COLORS.grad2}-fg}M{${COLORS.grad3}-fg}E{/}{${COLORS.textDim}-fg}-{/}{bold}{${COLORS.grad4}-fg}C{${COLORS.grad3}-fg}L{${COLORS.grad2}-fg}I{/}`;
      const tabs = ['home', 'search'].map(t => {
        const icons = { home: BOX.diamond, search: BOX.bullet };
        const label = t.charAt(0).toUpperCase() + t.slice(1);
        if (t === activeTab) {
          return `{${COLORS.accent}-bg}{#000-fg}{bold} ${icons[t]} ${label} {/}`;
        }
        return `{${COLORS.textMuted}-fg} ${icons[t]} ${label} {/}`;
      }).join('  ');

      // Right-align version
      const version = `{${COLORS.textMuted}-fg}v1.0{/}`;
      const spacer = ' '.repeat(Math.max(1, w - 50));

      header.setContent(`  ${logo}  ${BOX.v}  ${tabs}${spacer}${version} `);
    }
  }

  function setTab(tab) {
    activeTab = tab;
    breadcrumbParts = null;
    renderHeader();
  }

  function setBreadcrumb(parts) {
    breadcrumbParts = parts;
    renderHeader();
  }

  // ─── Content Area ──────────────────────────────────────────────
  const content = blessed.box({
    parent: screen,
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-6',
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: '▐',
      style: { bg: COLORS.accentDim },
    },
    style: {
      fg: COLORS.text,
      bg: COLORS.bg,
    },
    tags: true,
    keys: true,
    mouse: true,
  });

  // ─── Status Bar ────────────────────────────────────────────────
  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    style: {
      fg: COLORS.textDim,
      bg: COLORS.surfaceAlt,
      border: { fg: COLORS.accentDeep },
    },
    border: { type: 'line', top: true, bottom: false, left: false, right: false },
    tags: true,
    content: formatStatusHints([
      ['↑↓', 'Navigate'], ['Enter', 'Select'], ['/', 'Search'], ['q', 'Quit'],
    ]),
  });

  /**
   * Format status bar hints with key-icon styling
   * @param {Array<[string, string]>} hints - [[key, label], ...]
   */
  function formatStatusHints(hints) {
    return '  ' + hints.map(([key, label]) =>
      `{${COLORS.accent}-fg}{bold}[${key}]{/} {${COLORS.textDim}-fg}${label}{/}`
    ).join(`  {${COLORS.borderDim}-fg}${BOX.v}{/}  `);
  }

  function setStatus(hints) {
    if (typeof hints === 'string') {
      statusBar.setContent(`  ${hints}`);
    } else if (Array.isArray(hints)) {
      statusBar.setContent(formatStatusHints(hints));
    }
  }

  // ─── Global Keybindings ────────────────────────────────────────
  screen.key(['q', 'C-c'], async () => {
    screen.destroy();
    process.exit(0);
  });

  // Handle resize — only update header content here;
  // the global resize handler in index.js manages the full re-render
  screen.on('resize', () => {
    renderHeader();
  });

  // Initialize header
  renderHeader();

  return {
    screen,
    header,
    content,
    statusBar,
    setTab,
    setStatus,
    setBreadcrumb,
  };
}

export default { createLayout };
