// ─── Search Screen ───────────────────────────────────────────────
// Styled search bar + genre tags + rich result cards using AnimePahe

import blessed from 'neo-blessed';
import {
  COLORS, BOX, GENRES,
  createLoadingSpinner, createErrorBox,
  createSectionHeader, formatAnimeCard,
  renderModeToggle, renderGenreTags,
} from './components.js';
import { search } from '../api/provider.js';
/**
 * Show the search screen
 */
export async function showSearchScreen(layout, navigate, initialData = {}) {
  const { screen, content, setTab, setStatus } = layout;

  content.children.forEach(c => c.destroy());
  setTab('search');
  setStatus([['Type', 'Search'], ['↑↓', 'Results'], ['Enter', 'Select'], ['Tab', 'Sub/Dub'], ['b', 'Back'], ['h', 'Home']]);

  let currentQuery = initialData.query || '';
  let currentMode = initialData.mode || 'sub';
  let results = [];

  // ─── Search Bar Container ──────────────────────────────────────
  const searchContainer = blessed.box({
    parent: content,
    top: 1,
    left: 2,
    width: '100%-4',
    height: 3,
    tags: true,
    style: {
      bg: COLORS.card,
      border: { fg: COLORS.border },
    },
    border: 'line',
  });

  const searchIcon = blessed.box({
    parent: searchContainer,
    top: 0,
    left: 1,
    width: 4,
    height: 1,
    tags: true,
    style: { bg: COLORS.card },
    content: `{${COLORS.accent}-fg}🔍{/}`,
  });

  const searchInput = blessed.textbox({
    parent: searchContainer,
    top: 0,
    left: 5,
    width: '60%-8',
    height: 1,
    inputOnFocus: true,
    style: {
      fg: '#fff',
      bg: COLORS.surfaceAlt,
      focus: {
        fg: '#fff',
        bg: '#2a2a5e',
      },
    },
    value: currentQuery,
  });

  // Mode toggle inside search bar (right side)
  const modeBox = blessed.box({
    parent: searchContainer,
    top: 0,
    right: 1,
    width: 24,
    height: 1,
    tags: true,
    style: { bg: COLORS.card },
  });

  function updateModeToggle() {
    modeBox.setContent(renderModeToggle(currentMode));
  }

  // ─── Genre Tag Bar ─────────────────────────────────────────────
  const genreBar = blessed.box({
    parent: content,
    top: 5,
    left: 2,
    width: '100%-4',
    height: 2,
    tags: true,
    scrollable: true,
    style: { bg: COLORS.bg },
    content: `  {${COLORS.textMuted}-fg}Genres:{/} ${renderGenreTags()}`,
  });

  // ─── Results Info ──────────────────────────────────────────────
  const resultsInfo = blessed.box({
    parent: content,
    top: 7,
    left: 2,
    width: '100%-4',
    height: 1,
    tags: true,
    style: { fg: COLORS.textDim, bg: COLORS.bg },
    content: `  {${COLORS.textMuted}-fg}Type a query and press Enter to search...{/}`,
  });

  // ─── Separator ─────────────────────────────────────────────────
  const separator = blessed.box({
    parent: content,
    top: 8,
    left: 2,
    width: '100%-4',
    height: 1,
    tags: true,
    style: { bg: COLORS.bg },
    content: `  {${COLORS.borderDim}-fg}${BOX.h.repeat(70)}{/}`,
  });

  // ─── Results List ──────────────────────────────────────────────
  const resultsList = blessed.list({
    parent: content,
    top: 9,
    left: 2,
    width: '100%-4',
    height: '100%-12',
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

  // ─── Data Fetching ─────────────────────────────────────────────
  async function doSearch() {
    if (!currentQuery) {
      resultsInfo.setContent(`  {${COLORS.textMuted}-fg}Type a query and press Enter to search...{/}`);
      screen.render();
      return;
    }

    resultsList.clearItems();
    resultsInfo.setContent(`  {${COLORS.accent}-fg}⠋{/} {${COLORS.text}-fg}Searching "${currentQuery}"...{/}`);
    screen.render();

    try {
      results = await search(currentQuery, currentMode);

      if (results.length === 0) {
        resultsInfo.setContent(`  {${COLORS.warning}-fg}${BOX.cross2} No results found for "${currentQuery}"{/}`);
        screen.render();
        return;
      }

      resultsInfo.setContent(
        `  {${COLORS.success}-fg}${BOX.check}{/} {${COLORS.text}-fg}Found {bold}${results.length}{/bold} results for "{bold}${currentQuery}{/bold}" {/} {${COLORS.textMuted}-fg}[${currentMode.toUpperCase()}]{/}`
      );

      results.forEach((anime, i) => {
        resultsList.addItem(formatAnimeCard(anime, i));
      });

      resultsList.select(0);
      resultsList.focus();
      screen.render();

    } catch (err) {
      resultsInfo.setContent(`  {${COLORS.error}-fg}${BOX.cross2} Error: ${err.message}{/}`);
      screen.render();
    }
  }

  // ─── Event Handlers ────────────────────────────────────────────
  searchInput.on('submit', (value) => {
    currentQuery = (value || '').trim();
    doSearch();
  });

  searchInput.on('cancel', () => {
    resultsList.focus();
  });

  resultsList.on('select', (item, index) => {
    const anime = results[index];
    if (anime && anime.id) {
      navigate('detail', {
        showId: anime.id,
        animeName: anime.name,
        subEpisodes: anime.subEpisodes,
        dubEpisodes: anime.dubEpisodes,
        mode: currentMode,
        searchQuery: currentQuery,
        providerName: anime._provider,
      });
    }
  });

  // Tab to toggle sub/dub mode
  screen.key(['tab'], () => {
    currentMode = currentMode === 'sub' ? 'dub' : 'sub';
    updateModeToggle();
    if (currentQuery) doSearch();
    else screen.render();
  });

  screen.key(['b'], () => {
    navigate('home', {});
  });

  screen.key(['h'], () => {
    navigate('home', {});
  });

  screen.key(['/'], () => {
    searchInput.focus();
    screen.render();
  });

  // ─── Initial Load ──────────────────────────────────────────────
  updateModeToggle();
  if (currentQuery) {
    doSearch();
  } else {
    searchInput.focus();
    screen.render();
  }
}

export default { showSearchScreen };
