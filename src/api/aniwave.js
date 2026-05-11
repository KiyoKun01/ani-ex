// ─── Aniwave Backup Scraper ──────────────────────────────────────
// Scrapes aniwaves.ru (Aniwave/9anime clone) as a fallback provider.
// Uses cheerio to parse search results, episode lists, and stream URLs.
// This site uses the same AJAX patterns as the original 9anime/Aniwave.

import * as cheerio from 'cheerio';

const ANIWAVE_BASES = [
  'https://aniwaves.ru',
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT = 10000;

/**
 * Fetch with timeout and headers
 */
async function aniwaveFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': ANIWAVE_BASES[0] + '/',
        ...options.headers,
      },
      ...options,
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Try fetching from multiple base URLs until one works
 */
async function aniwaveGet(path) {
  let lastErr;
  for (const base of ANIWAVE_BASES) {
    try {
      const res = await aniwaveFetch(`${base}${path}`);
      if (!res.ok) continue;
      return { base, text: await res.text() };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('All Aniwave instances failed.');
}

/**
 * Search for anime on Aniwave
 */
export async function search(query, mode = 'sub') {
  const { text } = await aniwaveGet(`/filter?keyword=${encodeURIComponent(query)}`);
  const $ = cheerio.load(text);
  const results = [];

  $('.flw-item').each((i, el) => {
    const $el = $(el);
    const link = $el.find('.film-name a');
    const href = link.attr('href') || '';
    const id = href.replace('/watch/', '').replace(/^\//, '');
    if (!id) return;

    const subText = $el.find('.tick-sub').text().trim();
    const dubText = $el.find('.tick-dub').text().trim();

    results.push({
      id,
      name: link.text().trim(),
      subEpisodes: parseInt(subText) || 0,
      dubEpisodes: parseInt(dubText) || 0,
      _provider: 'aniwave',
    });
  });

  return results;
}

/**
 * Get episode list for an anime
 */
export async function getEpisodeList(showId) {
  const { base, text } = await aniwaveGet(`/watch/${showId}`);
  const $ = cheerio.load(text);

  // Extract data-id for AJAX episode fetch
  const dataId = $('[data-id]').first().attr('data-id');
  if (!dataId) {
    throw new Error('Aniwave: Could not find anime data-id');
  }

  // Fetch episodes via AJAX
  const ajaxRes = await aniwaveFetch(`${base}/ajax/episode/list/${dataId}`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  const ajaxData = await ajaxRes.json();
  const $$ = cheerio.load(ajaxData.result || ajaxData.html || '');

  const episodes = [];
  $$('.ep-item, a[data-num]').each((i, el) => {
    const $ep = $$(el);
    const num = $ep.attr('data-num') || $ep.attr('data-number') || String(i + 1);
    const title = $ep.attr('title') || $ep.text().trim() || `Episode ${num}`;
    const epId = $ep.attr('data-id') || $ep.attr('data-ids') || '';

    episodes.push({
      episodeString: String(num),
      title,
      number: parseInt(num) || i + 1,
      _aniwaveEpId: epId,
      _provider: 'aniwave',
    });
  });

  // Basic metadata from the page
  const meta = {
    name: $('h1.title, .film-name').first().text().trim(),
    englishName: $('h1.title, .film-name').first().text().trim(),
    description: $('.film-description, .desc').first().text().trim().slice(0, 300),
    type: $('.item:contains("Type") .name').text().trim() || 'TV',
    status: $('.item:contains("Status") .name').text().trim(),
    genres: [],
    studios: [],
    score: null,
    thumbnail: $('img.film-poster-img, .poster img').first().attr('src') || null,
  };

  $('.item:contains("Genre") a, .genre a').each((i, el) => {
    meta.genres.push($(el).text().trim());
  });

  return { episodes, meta };
}

/**
 * Get playable streams for an episode
 */
export async function getPlayableStreams(showId, episodeString, mode = 'sub', aniwaveEpId = '') {
  if (!aniwaveEpId) {
    // If we don't have the episode ID, fetch it
    const { episodes } = await getEpisodeList(showId);
    const ep = episodes.find(e => e.episodeString === episodeString) || episodes[parseInt(episodeString) - 1];
    if (!ep) throw new Error(`Aniwave: Episode ${episodeString} not found`);
    aniwaveEpId = ep._aniwaveEpId;
  }

  // Fetch server list
  const { base } = await aniwaveGet(`/watch/${showId}`);
  const serverRes = await aniwaveFetch(`${base}/ajax/server/list/${aniwaveEpId}`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  const serverData = await serverRes.json();
  const $ = cheerio.load(serverData.result || serverData.html || '');

  const serverType = mode === 'dub' ? 'dub' : 'sub';
  const serverItems = $(`.server-item[data-type="${serverType}"], .type[data-type="${serverType}"] .server-item`);

  const streams = [];

  // Try each server
  for (let i = 0; i < serverItems.length && i < 3; i++) {
    const serverId = $(serverItems[i]).attr('data-id') || $(serverItems[i]).attr('data-link-id');
    if (!serverId) continue;

    try {
      const sourceRes = await aniwaveFetch(`${base}/ajax/server/${serverId}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      const sourceData = await sourceRes.json();
      const embedUrl = sourceData.result?.url || sourceData.result?.link || '';

      if (embedUrl) {
        streams.push({
          quality: 'auto',
          url: embedUrl,
          type: embedUrl.includes('.m3u8') ? 'm3u8' : 'embed',
          provider: 'aniwave',
          providerName: `Aniwave Server ${i + 1}`,
          referer: `${base}/`,
        });
      }
    } catch {
      // Try next server
    }
  }

  return streams;
}

export default {
  search,
  getEpisodeList,
  getPlayableStreams,
};
