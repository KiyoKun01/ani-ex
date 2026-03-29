// ─── Main Layout Shell ───────────────────────────────────────────
// Persistent layout: Header, ContentArea, StatusBar
// Supports tab mode and breadcrumb mode for navigation context

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
    title: 'ANI-ME-CLI',
    fullUnicode: true,
    dockBorders: true,
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
    if (breadcrumbParts && breadcrumbParts.length > 0) {
      // Breadcrumb mode: ★ ANI-ME-CLI ▸ Naruto ▸ EP 01 [SUB]
      const logo = `{bold}{${COLORS.accent}-fg}${BOX.star} ANI-ME-CLI{/}`;
      const crumbs = breadcrumbParts.map(p =>
        `{${COLORS.textDim}-fg}${BOX.bullet}{/} {${COLORS.text}-fg}${p}{/}`
      ).join('  ');
      header.setContent(`  ${logo}  ${crumbs}`);
    } else {
      // Tab mode
      const logo = `{bold}{${COLORS.accent}-fg}${BOX.star} ANI-ME-CLI{/}`;
      const tabs = ['home', 'search'].map(t => {
        const label = t.charAt(0).toUpperCase() + t.slice(1);
        if (t === activeTab) {
          return `{${COLORS.accent}-bg}{#000-fg}{bold} ${label} {/}`;
        }
        return `{${COLORS.textMuted}-fg} ${label} {/}`;
      }).join('  ');

      header.setContent(`  ${logo}                              ${tabs}`);
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
    style: {
      fg: COLORS.text,
      bg: COLORS.bg,
    },
    tags: true,
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
      `{${COLORS.accent}-fg}{bold}${key}{/} {${COLORS.textDim}-fg}${label}{/}`
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
  screen.key(['q', 'C-c'], () => {
    screen.destroy();
    process.exit(0);
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
