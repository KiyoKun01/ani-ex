// ─── Home Screen ─────────────────────────────────────────────────
// Spotlight + Trending + Latest Episodes — all data from MyAnimeList
// Fetched fresh on every startup via Jikan API

import blessed from 'neo-blessed';
import { COLORS, BOX, createLoadingSpinner } from './components.js';
import { getHomeData } from '../api/mal.js';

const CARD_COLORS = ['#a855f7', '#38bdf8', '#34d399', '#fb923c', '#f472b6',
  '#e879f9', '#818cf8', '#fbbf24', '#f87171', '#2dd4bf'];
const CARD_W = 12;
const CARD_H = 6;
const CARD_GAP = 1;

function trunc(s, n) {
  if (!s) return ''.padEnd(n);
  return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n);
}

function cardContent(anime, color, isLatest = false) {
  const name = trunc(anime.name, 10);
  let info = '';
  if (isLatest && anime.episode) {
    info = `EP ${anime.episode}`;
  } else if (anime.score) {
    info = `${BOX.star} ${anime.score}`;
  } else if (anime.type) {
    info = anime.type;
  }
  return [
    `{${color}-fg}▓▓▓▓▓▓▓▓▓▓{/}`,
    `{${color}-fg}▓▓▓▓▓▓▓▓▓▓{/}`,
    `{${COLORS.textBright}-fg}${name}{/}`,
    `{${COLORS.rating}-fg}${info}{/}`,
  ].join('\n');
}

function spotlightContent(anime) {
  if (!anime) return '';
  const c = CARD_COLORS[0];
  const score = anime.score ? `${BOX.star} ${anime.score}` : '';
  const type = anime.type || 'TV';
  const eps = anime.episodes ? `${anime.episodes} eps` : '';
  const meta = [score, type, eps].filter(Boolean).join('  │  ');
  const desc = anime.synopsis ? anime.synopsis.slice(0, 100) : '';

  return [
    '',
    `  {${c}-fg}┌──────────┐{/}  {bold}{${COLORS.textBright}-fg}${anime.name}{/}`,
    `  {${c}-fg}│▓▓▓▓▓▓▓▓▓▓│{/}  {${COLORS.rating}-fg}${meta}{/}`,
    `  {${c}-fg}│▓▓▓▓▓▓▓▓▓▓│{/}  {${COLORS.textDim}-fg}"${trunc(desc, 55)}"{/}`,
    `  {${c}-fg}│▓▓ POSTER ▓│{/}`,
    `  {${c}-fg}│▓▓▓▓▓▓▓▓▓▓│{/}  {${COLORS.textMuted}-fg}Press Enter to search on AllAnime{/}`,
    `  {${c}-fg}└──────────┘{/}`,
    '',
  ].join('\n');
}

function makeCards(parent, top, items, colorOffset, isLatest) {
  return items.map((anime, i) => {
    const color = CARD_COLORS[(i + colorOffset) % CARD_COLORS.length];
    return blessed.box({
      parent, top,
      left: 3 + i * (CARD_W + CARD_GAP),
      width: CARD_W, height: CARD_H,
      tags: true,
      style: { fg: COLORS.text, bg: COLORS.card, border: { fg: COLORS.border } },
      border: 'line',
      content: cardContent(anime, color, isLatest),
    });
  });
}

export async function showHomeScreen(layout, navigate) {
  const { screen, content, setTab, setStatus } = layout;
  content.children.forEach(c => c.destroy());
  setTab('home');
  setStatus([['↑↓←→', 'Navigate'], ['Enter', 'Select'], ['/', 'Search'], ['q', 'Quit']]);

  let sec = 0, ci = [0, 0, 0];
  let homeData = { spotlight: null, trending: [], latest: [] };
  let spotBox = null, tCards = [], lCards = [];

  // Loading
  const spinner = createLoadingSpinner(content, 'Fetching from MyAnimeList...');
  screen.render();

  try {
    homeData = await getHomeData();
  } catch (err) {
    // silent fail — will show fallback
  }
  spinner.destroy();

  const { spotlight, trending, latest } = homeData;

  if (!spotlight && trending.length === 0) {
    blessed.box({
      parent: content, top: 'center', left: 'center',
      width: 50, height: 5, tags: true, border: 'line',
      style: { fg: COLORS.text, bg: COLORS.card, border: { fg: COLORS.border } },
      content: `\n  {${COLORS.warning}-fg}Could not load MAL data.{/}\n  {${COLORS.textDim}-fg}Press / to search manually{/}`,
    });
    screen.key(['/'], () => navigate('search', {}));
    screen.render();
    return;
  }

  // ─── Spotlight ──────────────────────────────────────────────────
  if (spotlight) {
    spotBox = blessed.box({
      parent: content, top: 1, left: 3,
      width: '100%-6', height: 10, tags: true,
      style: { fg: COLORS.text, bg: COLORS.card, border: { fg: COLORS.accent } },
      border: 'line',
      label: ` ${BOX.star} SPOTLIGHT `,
      content: spotlightContent(spotlight),
    });
  }

  // ─── Trending ───────────────────────────────────────────────────
  const tTop = 12;
  if (trending.length > 0) {
    blessed.box({
      parent: content, top: tTop, left: 3,
      width: '100%-6', height: 1, tags: true,
      style: { bg: COLORS.bg },
      content: `{bold}{${COLORS.accent}-fg}─── 🔥 Trending ${BOX.h.repeat(45)}{/}`,
    });
    tCards = makeCards(content, tTop + 1, trending, 1, false);
  }

  // ─── Latest Episodes ───────────────────────────────────────────
  const lTop = tTop + CARD_H + 2;
  if (latest.length > 0) {
    blessed.box({
      parent: content, top: lTop, left: 3,
      width: '100%-6', height: 1, tags: true,
      style: { bg: COLORS.bg },
      content: `{bold}{${COLORS.accent}-fg}─── ⏱ Latest Episodes ${BOX.h.repeat(39)}{/}`,
    });
    lCards = makeCards(content, lTop + 1, latest, 6, true);
  }

  // ─── Selection ──────────────────────────────────────────────────
  function updateSel() {
    if (spotBox) spotBox.style.border.fg = sec === 0 ? COLORS.accent : COLORS.border;
    tCards.forEach((b, i) => { b.style.border.fg = (sec === 1 && ci[1] === i) ? COLORS.accent : COLORS.border; });
    lCards.forEach((b, i) => { b.style.border.fg = (sec === 2 && ci[2] === i) ? COLORS.accent : COLORS.border; });
    screen.render();
  }

  const maxSec = latest.length > 0 ? 2 : (trending.length > 0 ? 1 : 0);

  screen.key(['up'], () => { sec = Math.max(0, sec - 1); updateSel(); });
  screen.key(['down'], () => { sec = Math.min(maxSec, sec + 1); updateSel(); });
  screen.key(['left'], () => {
    if (sec > 0) { ci[sec] = Math.max(0, ci[sec] - 1); updateSel(); }
  });
  screen.key(['right'], () => {
    if (sec > 0) {
      const max = (sec === 1 ? tCards : lCards).length - 1;
      ci[sec] = Math.min(max, ci[sec] + 1); updateSel();
    }
  });

  // Enter → search AllAnime by the MAL anime name
  screen.key(['enter'], () => {
    let anime;
    if (sec === 0) anime = spotlight;
    else if (sec === 1) anime = trending[ci[1]];
    else anime = latest[ci[2]];

    if (anime) {
      navigate('search', { query: anime.name, mode: 'sub' });
    }
  });

  screen.key(['/'], () => navigate('search', {}));

  updateSel();
}

export default { showHomeScreen };
