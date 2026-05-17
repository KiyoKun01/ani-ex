// ─── Search Screen ───────────────────────────────────────────────
// Premium search experience with recent searches, tips, and rich results

import blessed from 'neo-blessed';
import {
  COLORS, BOX,
  createLoadingSpinner, createErrorBox,
  createSectionHeader, formatAnimeCard,
  renderModeToggle,
} from './components.js';
import { search, getHomeData } from '../api/provider.js';
import { getConfig, saveConfig } from '../utils/config.js';

// ─── Constants ───────────────────────────────────────────────────
const GRADIENT_COLORS = ['#e879f9', '#d946ef', '#c026d3', '#a855f7', '#8b5cf6', '#7c3aed'];
const MAX_RECENT = 5;

const SEARCH_TIPS = [
  'Try searching by Japanese or English title',
  'Use arrow keys to navigate results, Enter to select',
  'Press / anytime to focus the search bar',
  'Press b to go back, h to go home',
];

// ─── Section Divider (matching home style) ───────────────────────
function sectionDivider(title, w) {
  const lineLen = Math.max(0, w - title.length - 2);
  return `{bold}{${COLORS.accent}-fg} ${title} {/}{${COLORS.borderDim}-fg}${BOX.h.repeat(lineLen)}{/}`;
}

/**
 * Show the search screen
 */
export async function showSearchScreen(layout, navigate, initialData = {}) {
  const { screen, content, setTab, setStatus } = layout;

  content.children.forEach(c => c.destroy());
  setTab('search');

  let currentQuery = initialData.query || '';
  let currentMode = initialData.mode || 'sub';
  let results = [];
  let emptyStateElements = []; // Track empty state boxes for cleanup
  let inputFocused = false;

  const contentW = content.width || 80;
  let recentSearches = getConfig('recentSearches', []);
  let topSuggestions = ['Naruto', 'One Piece', 'Jujutsu Kaisen', 'Demon Slayer', 'Attack on Titan', 'Spy x Family'];

  // Async fetch top airing anime for suggestions
  async function loadTopAnime() {
    try {
      const data = await getHomeData();
      if (data && data.trending && data.trending.length > 0) {
        topSuggestions = data.trending.slice(0, 6).map(a => {
          let t = a.name || a.title || 'Unknown';
          return t.length > 20 ? t.slice(0, 17) + '...' : t;
        });
        // If empty state is currently showing, re-render it to update tags
        if (!currentQuery && emptyStateElements.length > 0) {
          showEmptyState();
          screen.render();
        }
      }
    } catch (e) {
      // Silently fall back to default suggestions
    }
  }
  loadTopAnime();

  function updateStatus() {
    if (inputFocused) {
      setStatus([['Esc', 'Exit Search'], ['Enter', 'Search']]);
    } else {
      const hints = [['/', 'Search'], ['↑↓', 'Results'], ['Enter', 'Select'], ['b', 'Back'], ['h', 'Home']];
      if (recentSearches.length > 0) hints.push(['c', 'Clear History']);
      setStatus(hints);
    }
  }
  updateStatus();
  const randomTip = SEARCH_TIPS[Math.floor(Math.random() * SEARCH_TIPS.length)];

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
      border: { fg: COLORS.accentDeep },
    },
    border: 'line',
  });

  // Compute numeric width safely (avoiding NaN if container width is a string like '100%-4')
  let sWidth = typeof searchContainer.width === 'number' 
    ? searchContainer.width 
    : (typeof content.width === 'number' ? content.width - 4 : 76);
  const inputWidth = Math.max(20, sWidth - 2 - 1 - 2);

  const searchInput = blessed.textbox({
    parent: searchContainer,
    top: 0,
    left: 1,
    width: inputWidth,
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

  // ─── Results Info ──────────────────────────────────────────────
  const resultsInfo = blessed.box({
    parent: content,
    top: 5,
    left: 2,
    width: '100%-4',
    height: 1,
    tags: true,
    style: { fg: COLORS.textDim, bg: COLORS.bg },
    content: '',
  });

  // ─── Separator ─────────────────────────────────────────────────
  const separator = blessed.box({
    parent: content,
    top: 6,
    left: 2,
    width: '100%-4',
    height: 1,
    tags: true,
    style: { bg: COLORS.bg },
    content: `  {${COLORS.borderDim}-fg}${BOX.h.repeat(Math.max(10, contentW - 8))}{/}`,
  });

  // ─── Results List ──────────────────────────────────────────────
  const resultsList = blessed.list({
    parent: content,
    top: 7,
    left: 2,
    width: '100%-4',
    height: '100%-10',
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

  // ─── Empty State (shown when no query) ─────────────────────────
  function showEmptyState() {
    destroyEmptyState();

    let yPos = 5;

    // Greeting + tip banner (matching home screen style)
    const h = new Date().getHours();
    let greeting = 'Search for Your Anime';
    if (h < 6) greeting = 'Late Night Search Session';
    else if (h < 12) greeting = 'What Are You Watching Today?';
    else if (h < 17) greeting = 'Afternoon Anime Hunt';
    else if (h < 21) greeting = 'Evening Discovery Mode';
    else greeting = 'Night Owl Search';

    const greetingBox = blessed.box({
      parent: content,
      top: yPos,
      left: 4,
      width: contentW - 8,
      height: 3,
      tags: true,
      style: { bg: COLORS.bg },
      content: [
        `{bold}{${COLORS.grad1}-fg}${BOX.star}{/} {bold}{${COLORS.textBright}-fg}${greeting}{/}`,
        `{${COLORS.textDim}-fg}${BOX.bullet} ${randomTip}{/}`,
      ].join('\n'),
    });
    emptyStateElements.push(greetingBox);
    yPos += 4;

    // Recent Searches section
    if (recentSearches.length > 0) {
      const recentDivider = blessed.box({
        parent: content,
        top: yPos,
        left: 4,
        width: contentW - 8,
        height: 1,
        tags: true,
        style: { bg: COLORS.bg },
        content: sectionDivider(`RECENT SEARCHES (${recentSearches.length})  {${COLORS.textMuted}-fg}press c to clear{/}`, contentW - 8),
      });
      emptyStateElements.push(recentDivider);
      yPos += 1;

      recentSearches.forEach((q, i) => {
        const recentItem = blessed.box({
          parent: content,
          top: yPos,
          left: 6,
          width: contentW - 12,
          height: 1,
          tags: true,
          style: { bg: COLORS.bg },
          content: `  {${COLORS.accentDim}-fg}${BOX.bullet}{/} {${COLORS.text}-fg}${q}{/}  {${COLORS.textMuted}-fg}— press / and type to search{/}`,
        });
        emptyStateElements.push(recentItem);
        yPos += 1;
      });

      yPos += 1;
    }

    // Quick Search Suggestions section
    const suggestDivider = blessed.box({
      parent: content,
      top: yPos,
      left: 4,
      width: contentW - 8,
      height: 1,
      tags: true,
      style: { bg: COLORS.bg },
      content: sectionDivider('SUGGESTIONS', contentW - 8),
    });
    emptyStateElements.push(suggestDivider);
    yPos += 1;

    const suggestionTags = topSuggestions.map(s =>
      `{${COLORS.surfaceAlt}-bg}{${COLORS.textDim}-fg} ${s} {/}`
    ).join('  ');

    const suggestBox = blessed.box({
      parent: content,
      top: yPos,
      left: 6,
      width: contentW - 12,
      height: 2,
      tags: true,
      style: { bg: COLORS.bg },
      content: `  ${suggestionTags}`,
    });
    emptyStateElements.push(suggestBox);

    // Hide results UI when showing empty state
    resultsInfo.hide();
    separator.hide();
    resultsList.hide();
  }

  function clearContentArea() {
    // Force blessed to clear the content region to prevent overlap
    const lpos = content.lpos;
    if (lpos && screen.clearRegion) {
      screen.clearRegion(lpos.xi, lpos.xl, lpos.yi, lpos.yl);
    }
    if (screen.lines) {
      screen.lines.forEach(line => { line.dirty = true; });
    }
  }

  function destroyEmptyState() {
    emptyStateElements.forEach(el => { try { el.destroy(); } catch {} });
    emptyStateElements = [];
    clearContentArea();
  }

  function showResultsUI() {
    destroyEmptyState();
    resultsInfo.show();
    separator.show();
    resultsList.show();
    clearContentArea();
  }

  // ─── Save Recent Search ────────────────────────────────────────
  function addRecentSearch(query) {
    if (!query) return;
    let recent = getConfig('recentSearches', []);
    // Remove duplicate if exists, add to front
    recent = recent.filter(q => q.toLowerCase() !== query.toLowerCase());
    recent.unshift(query);
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
    saveConfig('recentSearches', recent);
  }

  // ─── Data Fetching ─────────────────────────────────────────────
  async function doSearch() {
    if (!currentQuery) {
      showEmptyState();
      screen.render();
      return;
    }

    showResultsUI();
    resultsList.clearItems();
    resultsInfo.setContent(`  {${COLORS.accent}-fg}⠋{/} {${COLORS.text}-fg}Searching "${currentQuery}"...{/}`);
    screen.render();

    try {
      results = await search(currentQuery, currentMode);
      addRecentSearch(currentQuery);

      if (results.length === 0) {
        resultsInfo.setContent(`  {${COLORS.warning}-fg}${BOX.cross2} No results found for "${currentQuery}"{/}`);
        screen.render();
        return;
      }

      resultsInfo.setContent(
        `  {${COLORS.success}-fg}${BOX.check}{/} {${COLORS.text}-fg}Found {bold}${results.length}{/bold} results for "{bold}${currentQuery}{/bold}"{/}`
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
    // Escape pressed — unfocus search bar
    inputFocused = false;
    updateStatus();
    if (results.length > 0) {
      resultsList.focus();
    }
    screen.render();
  });

  searchInput.on('focus', () => {
    inputFocused = true;
    updateStatus();
    screen.render();
  });

  searchInput.on('blur', () => {
    inputFocused = false;
    updateStatus();
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


  screen.key(['b'], () => {
    if (!inputFocused) layout.goBack();
  });

  screen.key(['h'], () => {
    if (!inputFocused) navigate('home', {});
  });

  // Clear search history
  screen.key(['c'], () => {
    if (!inputFocused && recentSearches.length > 0) {
      saveConfig('recentSearches', []);
      recentSearches = [];
      updateStatus();
      if (!currentQuery) {
        showEmptyState();
      }
      screen.render();
    }
  });

  screen.key(['/'], () => {
    searchInput.focus();
    screen.render();
  });

  // ─── Initial Load ──────────────────────────────────────────────
  if (currentQuery) {
    doSearch();
  } else {
    showEmptyState();
    searchInput.focus();
    screen.render();
  }
}

export default { showSearchScreen };
