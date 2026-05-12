// ─── Anime Detail Screen ─────────────────────────────────────────
// Rich info panel + styled episode list from AnimePahe

import blessed from 'neo-blessed';
import {
  COLORS, BOX,
  createLoadingSpinner, createErrorBox,
  formatEpisodeItem, renderModeToggle, createSectionHeader,
} from './components.js';
import { getEpisodeList } from '../api/provider.js';
import { renderImage } from '../utils/image.js';

// ─── Image Caching Context ───────────────────────────────────────
const activeImages = [];
let currentScreen = null;
let renderTimer = null;

function cleanupDetail() {
  clearTimeout(renderTimer);
  activeImages.length = 0;
  if (currentScreen) {
    currentScreen.removeListener('render', paintDetailImages);
    currentScreen = null;
  }
}

function paintDetailImages() {
  if (!currentScreen || activeImages.length === 0) return;
  const firstImg = activeImages[0];
  if (!firstImg.box.parent) {
    cleanupDetail();
    return;
  }

  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    const prog = currentScreen.program;
    const sysTop = 1;

    for (const img of activeImages) {
      if (!img.art) continue;
      const parentCard = img.box.parent;
      if (!parentCard || parentCard.hidden) continue;

      const contentBox = parentCard.parent;
      let trueAbsTop = img.box.lpos ? img.box.lpos.yi : null;
      let trueAbsLeft = img.box.lpos ? img.box.lpos.xi : null;

      if (trueAbsTop === null || trueAbsLeft === null) continue;

      const lines = img.art.split('\n');
      const maxH = Math.min(lines.length, img.h);

      for (let i = 0; i < maxH; i++) {
        const renderY = trueAbsTop + i;
        prog.cursorPos(renderY, trueAbsLeft);
        prog._write('\x1b[0m' + lines[i] + '\x1b[0m');
      }
    }
  }, 30);
}

function wrapText(text, maxWidth) {
  if (!text) return [];
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Show the anime detail screen
 */
export async function showDetailScreen(layout, navigate, data = {}) {
  const { screen, content, setTab, setStatus, setBreadcrumb } = layout;

  content.children.forEach(c => c.destroy());
  setBreadcrumb([data.animeName || 'Anime']);
  setStatus([['↑↓', 'Episodes'], ['Enter', 'Play'], ['Tab', 'Sub/Dub'], ['b', 'Back'], ['h', 'Home']]);

  let currentMode = data.mode || 'sub';
  let episodes = [];
  let animeMeta = null;

  cleanupDetail();
  currentScreen = screen;
  screen.on('render', paintDetailImages);

  // ─── Anime Info Card ───────────────────────────────────────────
  const infoCard = blessed.box({
    parent: content,
    top: 1,
    left: 2,
    width: '100%-4',
    height: 15, // Expanded for detail banner
    tags: true,
    style: {
      fg: COLORS.text,
      bg: COLORS.card,
      border: { fg: COLORS.accentDeep },
    },
    border: 'line',
  });

  const posterBox = blessed.box({
    parent: infoCard,
    top: 0, left: 1,
    width: 18, height: 13,
    tags: false,
  });

  function renderInfoCard() {
    const modeToggle = renderModeToggle(currentMode, data.subEpisodes, data.dubEpisodes);

    if (!animeMeta) {
      infoCard.setContent([
        '',
        `  {bold}{${COLORS.textBright}-fg}${BOX.star} ${data.animeName || 'Unknown Anime'}{/}`,
        `  {${COLORS.borderDim}-fg}${BOX.h.repeat(50)}{/}`,
        `  ${modeToggle}      {${COLORS.textMuted}-fg}Press Tab to toggle{/}`,
      ].join('\n'));
      return;
    }

    const primaryTitle = data.animeName || animeMeta.name || animeMeta.englishName || 'Unknown Anime';
    const rawEnglish = animeMeta.englishName || '';
    const secondaryTitle = (rawEnglish && rawEnglish.toLowerCase() !== primaryTitle.toLowerCase()) 
                            ? `{${COLORS.textDim}-fg}(${rawEnglish}){/}` 
                            : '';

    const type = animeMeta.type ? `{${COLORS.info}-fg}${animeMeta.type}{/}` : '';
    const score = animeMeta.score ? `{${COLORS.rating}-fg}${BOX.star} ${animeMeta.score}{/}` : '';
    const status = animeMeta.status ? `{${COLORS.success}-fg}${animeMeta.status}{/}` : '';
    const genres = (animeMeta.genres || []).slice(0, 4).join(', ');
    const studios = (animeMeta.studios || []).slice(0, 2).join(', ');

    // 18 chars for poster + 3 padding = 21 left margin
    const rightMargin = 22;
    const descWidth = Math.max(20, infoCard.width - rightMargin - 4);
    const wrappedDesc = wrapText(animeMeta.description, descWidth);
    const descLines = wrappedDesc.slice(0, 4).map(l => ' '.repeat(rightMargin) + `{${COLORS.textDim}-fg}${l}{/}`);

    infoCard.setContent([
      ' '.repeat(rightMargin) + `{bold}{${COLORS.textBright}-fg}${primaryTitle}{/} ${secondaryTitle}  ${type}  ${score}`,
      ' '.repeat(rightMargin) + `{${COLORS.borderDim}-fg}${BOX.h.repeat(descWidth)}{/}`,
      ...descLines,
      ' '.repeat(rightMargin),
      ' '.repeat(rightMargin) + `{${COLORS.textMuted}-fg}Genres: {/}{${COLORS.text}-fg}${genres}{/}`,
      ' '.repeat(rightMargin) + `{${COLORS.textMuted}-fg}Studio: {/}{${COLORS.text}-fg}${studios}{/}    ${status}`,
      '',
      ' '.repeat(rightMargin) + `${modeToggle}   {${COLORS.textMuted}-fg}Tab to toggle{/}`,
    ].join('\n'));

    // Fetch and render thumbnail if available
    if (animeMeta.thumbnail && activeImages.length === 0) {
      renderImage(animeMeta.thumbnail, { width: 18, height: 13 }).then(art => {
        if (!art) return;
        if (art.includes('No Image')) {
          posterBox.setContent(`{${COLORS.textDim}-fg}${art}{/}`);
          screen.render();
          return;
        }
        activeImages.push({ box: posterBox, art, h: 13 });
        screen.render();
      }).catch(() => { });
    }
  }

  // ─── Episode Section Header ────────────────────────────────────
  const episodeHeader = blessed.box({
    parent: content,
    top: 17, // Shifted down for expanded info banner
    left: 2,
    width: '100%-4',
    height: 1,
    tags: true,
    style: { fg: COLORS.text, bg: COLORS.bg },
  });

  // ─── Episode List ──────────────────────────────────────────────
  const episodeList = blessed.list({
    parent: content,
    top: 18, // Shifted down
    left: 2,
    width: '100%-4',
    height: '100%-21',
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
      const result = await getEpisodeList(data.showId, currentMode, data.providerName);
      episodes = result.episodes || result;
      animeMeta = result.meta || data;
      
      renderInfoCard();
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

    const selectedEp = episodes[index] || {};

    cleanupDetail();
    navigate('player', {
      showId: data.showId,
      animeName: data.animeName || 'Unknown',
      episodeNumber: match[1],
      mode: currentMode,
      subEpisodes: data.subEpisodes,
      dubEpisodes: data.dubEpisodes,
      providerName: selectedEp._provider || data.providerName,
      consumetId: selectedEp._consumetId || null
    });
  });

  screen.key(['tab'], () => {
    currentMode = currentMode === 'sub' ? 'dub' : 'sub';
    renderInfoCard();
    loadEpisodes();
  });

  screen.key(['b'], () => {
    cleanupDetail();
    navigate('search', { query: data.searchQuery || '', mode: currentMode });
  });

  screen.key(['h'], () => {
    cleanupDetail();
    navigate('home', {});
  });

  screen.key(['/'], () => {
    cleanupDetail();
    navigate('search', {});
  });

  // ─── Initial Load ─────────────────────────────────────────────
  renderInfoCard();
  loadEpisodes();
}

export default { showDetailScreen };
