// ─── Home Screen ─────────────────────────────────────────────────
// Premium CLI Home — fetches fresh content on every startup
// Uses chafa for anime poster rendering in spotlight

import blessed from 'neo-blessed';
import { COLORS, BOX, createLoadingSpinner } from './components.js';
import { getHomeData } from '../api/jikan.js';
import { renderImage } from '../utils/image.js';
import { search } from '../api/provider.js';
// ─── Constants ───────────────────────────────────────────────────
const ACCENT_COLORS = [
  '#e879f9', '#c084fc', '#a78bfa', '#818cf8', '#38bdf8',
  '#34d399', '#fbbf24', '#fb923c', '#f472b6', '#2dd4bf',
];
const CARD_W = 15;
const CARD_H = 15;
const CARD_GAP = 1;

const GRADIENT_COLORS = ['#e879f9', '#d946ef', '#c026d3', '#a855f7', '#8b5cf6', '#7c3aed'];

// ─── Tips ────────────────────────────────────────────────────────
const TIPS = [
  'Press / anywhere to quick-search anime on AnimePahe',
  'Use arrow keys to browse, Enter to select',
  'Press Tab to toggle SUB/DUB mode in episode view',
  'Press r to refresh the current screen',
  'Press b to go back to the previous screen',
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Late Night Anime Session';
  if (h < 12) return 'Good Morning, Otaku!';
  if (h < 17) return 'Good Afternoon!';
  if (h < 21) return 'Good Evening, Anime Fan!';
  return 'Night Owl Mode Activated';
}

function getRandomTip() {
  return TIPS[Math.floor(Math.random() * TIPS.length)];
}

// ─── Helpers ─────────────────────────────────────────────────────
function trunc(s, n) {
  if (!s) return ''.padEnd(n);
  return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n);
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

// ─── Section Divider ─────────────────────────────────────────────
function sectionDivider(title, w) {
  const lineLen = Math.max(0, w - title.length - 2);
  return `{bold}{${COLORS.accent}-fg} ${title} {/}{${COLORS.borderDim}-fg}${BOX.h.repeat(lineLen)}{/}`;
}

// ─── Image Caching & State Context ───────────────────────────────
const activeImages = [];
let currentScreen = null;
let renderTimer = null;
let cachedState = null;

function cleanupHome() {
  clearTimeout(renderTimer);
  activeImages.length = 0;
  if (currentScreen) {
    currentScreen.removeListener('render', paintAllImages);
    currentScreen = null;
  }
}

function paintAllImages() {
  if (!currentScreen) return;
  if (activeImages.length === 0) return;

  // Guard: if home screen boxes have been destroyed (navigated away),
  // clean up this listener so it doesn't corrupt other screens
  const firstImg = activeImages[0];
  if (!firstImg.box.parent) {
    clearTimeout(renderTimer);
    activeImages.length = 0;
    currentScreen.removeListener('render', paintAllImages);
    currentScreen = null;
    return;
  }

  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    const prog = currentScreen.program;
    const rows = currentScreen.height;
    const cols = currentScreen.width;
    const sysTop = 3;
    const sysBottom = rows - 3;

    for (const img of activeImages) {
      if (!img.art) continue;

      const lpos = img.box.lpos;
      if (!lpos) continue;

      const parentCard = img.box.parent;
      if (parentCard && parentCard.hidden) continue;

      const trueAbsTop = lpos.yi;
      const trueAbsLeft = lpos.xi;

      // Vertical bounds: Sixel cannot be easily clipped. If we draw an image
      // that extends past the physical bottom of the terminal, Windows Terminal
      // will scroll the buffer, which corrupts absolute cursor positioning for
      // everything drawn afterwards (the staircase effect).
      // Also prevent Sixel from drawing over the header/footer text.
      if (trueAbsTop < sysTop || trueAbsTop + img.h > sysBottom) continue;

      const contentBox = parentCard ? parentCard.parent : null;
      let minX = 0, maxX = cols;
      if (contentBox && contentBox.lpos) {
        minX = contentBox.lpos.xi;
        maxX = contentBox.lpos.xl;
      }

      if (trueAbsLeft < minX || trueAbsLeft + 14 > maxX) continue;

      // Use raw escape sequences to bypass blessed entirely:
      // 1. Position cursor at image origin (1-based for VT)
      // 2. Write Sixel data
      const vtRow = trueAbsTop + 1;  // VT100 is 1-based
      const vtCol = trueAbsLeft + 1;
      
      // Save cursor, position, write Sixel, restore cursor
      prog._write('\x1b7' + `\x1b[${vtRow};${vtCol}H` + img.art + '\x1b8');

      prog.x = -1;
      prog.y = -1;
    }
  }, 30);
}

// ─── Anime Card ──────────────────────────────────────────────────
function cardContent(anime, isLatest = false) {
  const name = trunc(anime.name, CARD_W - 2);
  let info = '';
  if (isLatest && anime.episode) {
    info = `{${COLORS.success}-fg}${BOX.play} EP ${anime.episode}{/}`;
  } else if (anime.score) {
    info = `{${COLORS.rating}-fg}${BOX.star} ${anime.score}{/}`;
  } else if (anime.type) {
    info = `{${COLORS.info}-fg}${anime.type}{/}`;
  }

  // 11 blank rows for the poster box to sit in, plus 2 rows for text
  return [
    ...Array(11).fill(''),
    `{${COLORS.textBright}-fg}${name}{/}`,
    `${info}`,
  ].join('\n');
}

function makeCards(parent, top, items, colorOffset, isLatest, screen, startX = 4) {
  return items.map((anime, i) => {
    const color = ACCENT_COLORS[(i + colorOffset) % ACCENT_COLORS.length];

    // Main card container
    const card = blessed.box({
      parent, top,
      left: startX + i * (CARD_W + CARD_GAP),
      width: CARD_W, height: CARD_H,
      tags: true,
      style: {
        fg: COLORS.text,
        bg: COLORS.card,
        border: { fg: COLORS.border },
      },
      border: 'line',
      content: cardContent(anime, isLatest),
    });

    // Poster viewport (child of the card)
    const posterW = CARD_W - 2;
    const posterH = 11;
    const posterBox = blessed.box({
      parent: card,
      top: 0, left: 0,
      width: posterW, height: posterH,
      tags: false,
    });

    if (anime.imageUrl) {
      // Pass posterH - 1 to chafa to give a 1-row safety margin. 
      // Sixel images can sometimes round up in pixel height and spill into the 
      // text row beneath them, erasing character cells (like 'e' or 'a').
      renderImage(anime.imageUrl, { width: posterW, height: posterH - 1 }).then(art => {
        if (!art || art.includes('No Image')) return;
        activeImages.push({ box: posterBox, art, h: posterH });
        screen.render();
      }).catch(() => { });
    }

    return card;
  });
}

// ─── Main Home Screen ────────────────────────────────────────────
export async function showHomeScreen(layout, navigate, data = {}) {
  const { screen, content, setTab, setStatus } = layout;
  content.children.forEach(c => c.destroy());
  setTab('home');
  setStatus([['↑↓', 'Section'], ['←→', 'Card'], ['Enter', 'Select'], ['/', 'Search'], ['q', 'Quit']]);

  // Handle global image caching and rendering hooks
  cleanupHome();
  currentScreen = screen;
  screen.on('render', paintAllImages);

  const contentW = screen.width || 80;
  
  // State variables
  let sec = 0, ci = [0, 0, 0];
  let tStartIndex = 0, lStartIndex = 0;
  let homeData = { spotlight: null, trending: [], latest: [] };
  let spotBox = null, tCards = [], lCards = [];
  let trendContainer = null, latestContainer = null;
  let tDivider = null, lDivider = null;

  // Restore state if returning from another screen
  if (data.fromBack && cachedState) {
    sec = cachedState.sec;
    ci = [...cachedState.ci];
    tStartIndex = cachedState.tStartIndex;
    lStartIndex = cachedState.lStartIndex;
    homeData = cachedState.homeData;
  } else {
    // ─── Loading ───────────────────────────────────────────────────
    const spinner = createLoadingSpinner(content, 'Fetching fresh anime data...');
    screen.render();

    try {
      homeData = await getHomeData();
    } catch {
      // silent fail
    }
    spinner.destroy();
  }

  const { spotlight, trending, latest } = homeData;

  // ─── Fallback if no data ───────────────────────────────────────
  if (!spotlight && trending.length === 0) {
    blessed.box({
      parent: content, top: 'center', left: 'center',
      width: 60, height: 9, tags: true, border: 'line',
      style: { fg: COLORS.text, bg: COLORS.card, border: { fg: COLORS.error } },
      content: [
        '',
        `  {${COLORS.error}-fg}{bold}${BOX.cross2} Connection Failed{/}`,
        '',
        `  {${COLORS.textDim}-fg}Could not reach MyAnimeList / Jikan API.{/}`,
        `  {${COLORS.textDim}-fg}Check your internet connection.{/}`,
        '',
        `  {${COLORS.textMuted}-fg}Press {bold}{${COLORS.accent}-fg}/{/}{${COLORS.textMuted}-fg} to search manually on AnimePahe{/}`,
      ].join('\n'),
    });
    screen.key(['/'], () => {
      cleanupHome();
      navigate('search', {});
    });
    screen.render();
    return;
  }

  let yOffset = 0;
  const marginL = 4;
  const spotW = spotlight ? 42 : 0;
  const trendX = spotlight ? marginL + spotW + 2 : marginL;
  const trendAvailW = Math.max(20, contentW - trendX - 2);

  // ─── Row 1: Spotlight (Left) + Trending (Right) ──────────────────
  if (spotlight) {
    blessed.box({
      parent: content, top: yOffset, left: marginL,
      width: spotW, height: 1, tags: true,
      style: { bg: COLORS.bg },
      content: sectionDivider(`${BOX.star} SPOTLIGHT`, spotW),
    });

    const posterW = 16;
    const posterH = 11;
    const spotH = CARD_H; // Align height with Trending cards (15)

    spotBox = blessed.box({
      parent: content, top: yOffset + 1, left: marginL,
      width: spotW, height: spotH, tags: true,
      style: {
        fg: COLORS.text, bg: COLORS.card,
        border: { fg: COLORS.accent },
      },
      border: 'line',
    });

    const posterBox = blessed.box({
      parent: spotBox,
      top: 0, left: 1,
      width: posterW, height: posterH,
      tags: false,
    });

    const infoW = spotW - posterW - 6;
    const score = spotlight.score ? `${BOX.star} ${spotlight.score}` : '';
    const type = spotlight.type || 'TV';
    const status = spotlight.status ? spotlight.status.replace('Currently ', '') : '';
    const meta = [score, type, status].filter(Boolean).join(`  {${COLORS.borderDim}-fg}${BOX.v}{/}  `);

    blessed.box({
      parent: spotBox,
      top: 0, left: posterW + 3,
      width: infoW, height: spotH - 2,
      tags: true,
      style: { bg: COLORS.card },
      content: [
        `{bold}{${COLORS.textBright}-fg}${trunc(spotlight.name, infoW)}{/}`,
        '',
        `{${COLORS.rating}-fg}${meta}{/}`,
        '',
        ...wrapText(spotlight.synopsis || '', infoW - 2).slice(0, 4).map(l => `{${COLORS.textDim}-fg}${l}{/}`),
      ].filter(l => l !== undefined).join('\n'),
    });

    if (spotlight.imageUrl) {
      // Pass posterH - 1 to chafa to give a 1-row safety margin.
      renderImage(spotlight.imageUrl, { width: posterW, height: posterH - 1 }).then(art => {
        if (!art || art.includes('No Image')) return;
        activeImages.push({ box: posterBox, art, h: posterH });
        screen.render();
      }).catch(() => { });
    }
  }

  // ─── Trending Section (Right side in Row 1) ──────────────────────
  if (trending.length > 0) {
    tDivider = blessed.box({
      parent: content, top: yOffset, left: trendX,
      width: trendAvailW, height: 1, tags: true,
      style: { bg: COLORS.bg },
      content: sectionDivider(`TRENDING NOW (${trending.length})`, trendAvailW),
    });

    trendContainer = blessed.box({
      parent: content, top: yOffset + 1, left: trendX,
      width: trendAvailW, height: CARD_H, tags: false
    });

    tCards = makeCards(trendContainer, 0, trending, 1, false, screen, 0);
  }

  // Finalize Row 1 height if either Spotlight or Trending exists
  if (spotlight || trending.length > 0) {
    yOffset += CARD_H + 2; 
  }

  // ─── Row 2: Latest Releases ──────────────────────────────────────
  if (latest.length > 0) {
    lDivider = blessed.box({
      parent: content, top: yOffset, left: 1,
      width: contentW - 2, height: 1, tags: true,
      style: { bg: COLORS.bg },
      content: sectionDivider(`LATEST RELEASES (${latest.length})`, contentW - 2),
    });

    latestContainer = blessed.box({
      parent: content, top: yOffset + 1, left: 0,
      width: contentW, height: CARD_H, tags: false
    });

    lCards = makeCards(latestContainer, 0, latest, 6, true, screen, 0);
    yOffset += CARD_H + 2;
  }

  // ─── Footer ────────────────────────────────────────────────────
  blessed.box({
    parent: content,
    top: yOffset, left: 1,
    width: contentW - 2, height: 3, tags: true,
    style: { bg: COLORS.bg },
    content: [
      `{center}{${COLORS.borderDim}-fg}${BOX.h.repeat(Math.max(10, contentW - 16))}{/}{/center}`,
      `{center}{${COLORS.textMuted}-fg}Powered by Jikan + AnimePahe  ${BOX.dot}  ${new Date().toLocaleTimeString()}{/}{/center}`,
    ].join('\n'),
  });

  // ─── Keyboard Navigation ──────────────────────────────────────
  function updateSelection() {
    let needsWipe = true; // Force wipe on all navigation (horiz/vert) to clear ghosts
    const termW = screen.width || 80;

    if (spotBox) {
      spotBox.style.border.fg = sec === 0 ? COLORS.accent : COLORS.border;
    }

    // Dynamic width recalculation
    const currentSpotW = spotlight ? 42 : 0;
    const currentTrendX = spotlight ? 4 + currentSpotW + 2 : 4;
    const dynamicTrendAvailW = Math.max(20, termW - currentTrendX - 2);

    if (trendContainer) trendContainer.width = dynamicTrendAvailW;
    if (latestContainer) latestContainer.width = termW;
    if (tDivider) {
      tDivider.width = dynamicTrendAvailW;
      tDivider.setContent(sectionDivider(`TRENDING NOW (${trending.length})`, dynamicTrendAvailW));
    }
    if (lDivider) {
      lDivider.width = termW - 2;
      lDivider.setContent(sectionDivider(`LATEST RELEASES (${latest.length})`, termW - 2));
    }

    // Trending carousal
    if (tCards.length > 0) {
      const cardBlock = CARD_W + CARD_GAP;
      const visibleCount = Math.floor((dynamicTrendAvailW + CARD_GAP) / cardBlock);
      const tPadding = Math.max(0, Math.floor((dynamicTrendAvailW - (visibleCount * cardBlock - CARD_GAP)) / 2));

      if (ci[1] < tStartIndex) tStartIndex = ci[1];
      else if (ci[1] >= tStartIndex + visibleCount) tStartIndex = ci[1] - visibleCount + 1;

      // Lock boundaries to prevent scrolling off grid
      tStartIndex = Math.max(0, Math.min(tStartIndex, tCards.length - visibleCount));
      if (visibleCount >= tCards.length) tStartIndex = 0;

      tCards.forEach((b, i) => {
        b.left = tPadding + (i - tStartIndex) * cardBlock;
        if (b.left < 0 || b.left + CARD_W > dynamicTrendAvailW) {
          b.hide();
        } else {
          b.show();
          b.style.border.fg = (sec === 1 && ci[1] === i) ? COLORS.accent : COLORS.border;
          b.style.bg = (sec === 1 && ci[1] === i) ? COLORS.surface : COLORS.card;
        }
      });
    }

    // Latest carousal
    if (lCards.length > 0) {
      const lAvail = termW;
      const cardBlock = CARD_W + CARD_GAP;
      const visibleCount = Math.floor((lAvail + CARD_GAP) / cardBlock);
      const lPadding = Math.max(0, Math.floor((lAvail - (visibleCount * cardBlock - CARD_GAP)) / 2));

      if (ci[2] < lStartIndex) lStartIndex = ci[2];
      else if (ci[2] >= lStartIndex + visibleCount) lStartIndex = ci[2] - visibleCount + 1;

      // Lock boundaries
      lStartIndex = Math.max(0, Math.min(lStartIndex, lCards.length - visibleCount));
      if (visibleCount >= lCards.length) lStartIndex = 0;

      lCards.forEach((b, i) => {
        b.left = lPadding + (i - lStartIndex) * cardBlock;
        if (b.left < 0 || b.left + CARD_W > lAvail) {
          b.hide();
        } else {
          b.show();
          b.style.border.fg = (sec === 2 && ci[2] === i) ? COLORS.accent : COLORS.border;
          b.style.bg = (sec === 2 && ci[2] === i) ? COLORS.surface : COLORS.card;
        }
      });
    }

    const sectionNames = ['Spotlight', 'Trending', 'Latest'];
    const currentItem = sec === 0 ? spotlight?.name : (sec === 1 ? trending[ci[1]]?.name : latest[ci[2]]?.name);
    setStatus([
      ['↑↓', sectionNames[sec] || 'Navigate'],
      ['←→', 'Card'],
      ['Enter', currentItem ? trunc(currentItem, 20) : 'Select'],
      ['/', 'Search'],
      ['q', 'Quit'],
    ]);

    // Force exact physical layout clears and cache invalidation over Sixel footprints
    if (needsWipe) {
      screen.clearRegion(0, screen.width, 0, screen.height);
      if (screen.lines) {
        screen.lines.forEach(line => {
          line.dirty = true;
        });
      }
    }

    // Save state so we can return exactly where we left off
    cachedState = {
      sec, ci: [...ci], tStartIndex, lStartIndex, homeData
    };

    screen.render();
  }

  const maxSec = latest.length > 0 ? 2 : (trending.length > 0 ? 1 : 0);

  screen.key(['up'], () => {
    // Navigating up from Latest drops back to the last active Row 1 item
    if (sec === 2) {
      sec = spotlight ? 0 : (trending.length > 0 ? 1 : 0);
    } else {
      sec = Math.max(0, sec - 1);
    }
    updateSelection();
  });

  screen.key(['down'], () => {
    // Navigating down from anywhere in Row 1 enters Row 2 (Latest)
    if (sec < 2 && latest.length > 0) {
      sec = 2;
    } else {
      sec = Math.min(maxSec, sec + 1);
    }
    updateSelection();
  });

  screen.key(['left'], () => {
    if (sec === 1) { // Left inside Trending goes to Spotlight if possible
      if (ci[1] > 0) {
        ci[1]--;
      } else if (spotlight) {
        sec = 0;
      }
    } else if (sec === 2) {
      ci[2] = Math.max(0, ci[2] - 1);
    }
    updateSelection();
  });

  screen.key(['right'], () => {
    if (sec === 0) { // Right from Spotlight goes to Trending
      if (trending.length > 0) {
        sec = 1;
      }
    } else if (sec === 1) {
      ci[1] = Math.min(trending.length - 1, ci[1] + 1);
    } else if (sec === 2) {
      ci[2] = Math.min(latest.length - 1, ci[2] + 1);
    }
    updateSelection();
  });

  let isNavigating = false;

  screen.key(['enter'], async () => {
    if (isNavigating) return;

    let anime;
    if (sec === 0) anime = spotlight;
    else if (sec === 1) anime = trending[ci[1]];
    else anime = latest[ci[2]];

    if (anime) {
      if (anime.id) {
        cleanupHome();
        // Latest items already have an AllAnime ID, navigate directly to details
        navigate('detail', { showId: anime.id, animeName: anime.name, mode: 'sub' });
      } else {
        isNavigating = true;
        const spinner = createLoadingSpinner(content, 'Resolving stream data...');
        screen.render();
        
        try {
          // Auto-resolve MAL title to AnimePahe showId
          const results = await search(anime.name, 'sub');
          spinner.destroy();
          cleanupHome();
          
          if (results && results.length > 0) {
            const match = results[0];
            navigate('detail', { 
              showId: match.id, 
              animeName: match.name, 
              subEpisodes: match.subEpisodes, 
              dubEpisodes: match.dubEpisodes, 
              mode: 'sub' 
            });
          } else {
            // Fallback to search screen if no direct match found
            navigate('search', { query: anime.name, mode: 'sub' });
          }
        } catch (err) {
          spinner.destroy();
          cleanupHome();
          navigate('search', { query: anime.name, mode: 'sub' });
        }
      }
    }
  });

  screen.key(['/'], () => {
    if (isNavigating) return;
    cleanupHome();
    navigate('search', {});
  });

  updateSelection();
}

export default { showHomeScreen };
