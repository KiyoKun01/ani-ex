// ─── Anime Detail Screen ─────────────────────────────────────────
// Rich info panel + styled episode list from AllAnime

import blessed from 'neo-blessed';
import {
  COLORS, BOX,
  createLoadingSpinner, createErrorBox,
  formatEpisodeItem, renderModeToggle, createSectionHeader,
} from './components.js';
import { getEpisodeList } from '../api/allanime.js';

/**
 * Show the anime detail screen
 */
export async function showDetailScreen(layout, navigate, data = {}) {
  const { screen, content, setTab, setStatus, setBreadcrumb } = layout;

  content.children.forEach(c => c.destroy());
  setBreadcrumb([data.animeName || 'Anime']);
  setStatus([['↑↓', 'Episodes'], ['Enter', 'Play'], ['Tab', 'Sub/Dub'], ['b', 'Back'], ['q', 'Quit']]);

  let currentMode = data.mode || 'sub';
  let episodes = [];

  // ─── Anime Info Card ───────────────────────────────────────────
  const infoCard = blessed.box({
    parent: content,
    top: 1,
    left: 2,
    width: '100%-4',
    height: 7,
    tags: true,
    style: {
      fg: COLORS.text,
      bg: COLORS.card,
      border: { fg: COLORS.accentDeep },
    },
    border: 'line',
  });

  function renderInfoCard() {
    const modeToggle = renderModeToggle(currentMode, data.subEpisodes, data.dubEpisodes);

    infoCard.setContent([
      '',
      `  {bold}{${COLORS.textBright}-fg}${BOX.star} ${data.animeName || 'Unknown Anime'}{/}`,
      `  {${COLORS.borderDim}-fg}${BOX.h.repeat(50)}{/}`,
      `  ${modeToggle}      {${COLORS.textMuted}-fg}Press Tab to toggle{/}`,
      '',
    ].join('\n'));
  }

  // ─── Episode Section Header ────────────────────────────────────
  const episodeHeader = blessed.box({
    parent: content,
    top: 9,
    left: 2,
    width: '100%-4',
    height: 1,
    tags: true,
    style: { fg: COLORS.text, bg: COLORS.bg },
  });

  // ─── Episode List ──────────────────────────────────────────────
  const episodeList = blessed.list({
    parent: content,
    top: 10,
    left: 2,
    width: '100%-4',
    height: '100%-13',
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
    },
  });

  // ─── Load Episodes ────────────────────────────────────────────
  async function loadEpisodes() {
    episodeList.clearItems();
    episodeHeader.setContent(`  ${createSectionHeader('Episodes (loading...)', '📺')}`);

    const spinner = createLoadingSpinner(content, `Loading ${currentMode.toUpperCase()} episodes...`);
    screen.render();

    try {
      episodes = await getEpisodeList(data.showId, currentMode);
      spinner.destroy();

      if (episodes.length === 0) {
        episodeHeader.setContent(`  ${createSectionHeader(`Episodes (0) [${currentMode.toUpperCase()}]`, '📺')}`);
        episodeList.addItem(`  {${COLORS.textMuted}-fg}No ${currentMode.toUpperCase()} episodes available{/}`);
        screen.render();
        return;
      }

      episodeHeader.setContent(
        `  ${createSectionHeader(`Episodes (${episodes.length}) [${currentMode.toUpperCase()}]`, '📺')}`
      );

      episodes.forEach((epNum, i) => {
        episodeList.addItem(formatEpisodeItem(epNum, i));
      });

      episodeList.select(0);
      episodeList.focus();
      screen.render();

    } catch (err) {
      spinner.destroy();
      episodeHeader.setContent(`  {${COLORS.error}-fg}${BOX.cross2} Error loading episodes{/}`);
      createErrorBox(content, `Failed to load episodes: ${err.message}`);
      screen.render();
    }
  }

  // ─── Event Handlers ───────────────────────────────────────────
  episodeList.on('select', (item, index) => {
    const text = item.getText();
    const match = text.match(/Episode\s+([\d.]+)/);
    if (!match) return;

    navigate('player', {
      showId: data.showId,
      animeName: data.animeName || 'Unknown',
      episodeNumber: match[1],
      mode: currentMode,
      subEpisodes: data.subEpisodes,
      dubEpisodes: data.dubEpisodes,
    });
  });

  screen.key(['tab'], () => {
    currentMode = currentMode === 'sub' ? 'dub' : 'sub';
    renderInfoCard();
    loadEpisodes();
  });

  screen.key(['b'], () => {
    navigate('search', { query: data.searchQuery || '', mode: currentMode });
  });

  screen.key(['/'], () => {
    navigate('search', {});
  });

  // ─── Initial Load ─────────────────────────────────────────────
  renderInfoCard();
  loadEpisodes();
}

export default { showDetailScreen };
