// ─── HiAnime Direct Scraper ───────────────────────────────────────
// Uses the open-source HiAnime API (formerly AniWatch API) to fetch
// metadata, episodes, and stream URLs. No headless browser needed.

const HIANIME_INSTANCES = [
  'https://aniwatch-api-v2.vercel.app',
  'https://api-aniwatch.vercel.app',
];

const REQUEST_TIMEOUT = 10000;

/**
 * Try a fetch against multiple HiAnime instances until one succeeds.
 */
async function hianimeFetch(path) {
  let lastErr;
  for (const base of HIANIME_INSTANCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      const res = await fetch(`${base}${path}`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = await res.json();
      if (json.success !== false) return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('All HiAnime instances failed or timed out.');
}

/**
 * Search HiAnime for an anime
 * @param {string} query - Search term
 * @param {string} mode - 'sub' or 'dub' (HiAnime handles this automatically, but we keep the parameter for signature compatibility)
 * @returns {Promise<Array<{id, name, subEpisodes, dubEpisodes}>>}
 */
export async function search(query, mode = 'sub') {
  const encQuery = encodeURIComponent(query);
  const data = await hianimeFetch(`/api/v2/hianime/search?q=${encQuery}`);

  const animes = data?.data?.animes || [];
  
  return animes.map(a => ({
    id: a.id,
    name: a.name || a.jname,
    // HiAnime provides episodes in episodes.sub and episodes.dub
    subEpisodes: a.episodes?.sub || 0,
    dubEpisodes: a.episodes?.dub || 0,
  }));
}

/**
 * Get the list of episodes for an anime
 * @param {string} showId 
 * @returns {Promise<Array<{episodeString, title?, number?}>>}
 */
export async function getEpisodeList(showId) {
  const data = await hianimeFetch(`/api/v2/hianime/anime/${encodeURIComponent(showId)}/episodes`);
  const episodes = data?.data?.episodes || [];

  return episodes.map(ep => ({
    episodeString: String(ep.number),
    title: ep.title,
    number: ep.number,
    _hianimeId: ep.episodeId // keep internal ID for stream fetching
  }));
}

/**
 * Get playable stream URLs for a specific HiAnime episode.
 * Returns an array of available streams.
 *
 * @param {string} showId
 * @param {string|number} episodeString
 * @param {string} mode - 'sub' or 'dub'
 * @param {string} [animeName] - Not strictly needed anymore, but kept for signature matching
 * @returns {Promise<Array<{quality, url, type, provider, providerName, referer?}>>}
 */
export async function getPlayableStreams(showId, episodeString, mode = 'sub', animeName = '') {
  const epNum = parseInt(episodeString, 10);

  // 1. Get episode list to find the actual episodeId string needed by the streaming endpoint
  const episodes = await getEpisodeList(showId);
  if (!episodes.length) throw new Error(`HiAnime: No episodes found for this show.`);

  // Find the episode matching the requested number
  const episode = episodes.find(e => e.number === epNum) || episodes[epNum - 1];
  if (!episode) throw new Error(`HiAnime: Episode ${epNum} not found`);

  // 2. Fetch stream URLs
  // HiAnime uses specific servers: vidstreaming, megacloud, streamsb.
  // We'll try them in order of reliability.
  const servers = ['vidstreaming', 'megacloud', 'streamsb'];
  let streamsData = null;

  for (const server of servers) {
    try {
      const res = await hianimeFetch(`/api/v2/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episode._hianimeId)}&server=${server}&category=${mode}`);
      if (res?.data?.sources?.length > 0) {
        streamsData = res.data;
        break;
      }
    } catch {
      // ignore and try next server
    }
  }

  if (!streamsData || !streamsData.sources || !streamsData.sources.length) {
    throw new Error('HiAnime: No streams found for this episode');
  }

  // 3. Map to the expected UI shape
  const streams = streamsData.sources.map(src => ({
    quality: src.quality || 'auto',
    url: src.url,
    type: src.isM3U8 ? 'm3u8' : 'mp4',
    provider: 'hianime',
    providerName: 'HiAnime',
    referer: 'https://hianime.to/',
  }));

  // Sort: best quality first
  const qualityOrder = { '1080p': 4, '720p': 3, '480p': 2, '360p': 1, 'default': 0, 'auto': 0, 'backup': -1 };
  streams.sort((a, b) => (qualityOrder[b.quality] ?? 0) - (qualityOrder[a.quality] ?? 0));

  return streams;
}

export default {
  search,
  getEpisodeList,
  getPlayableStreams
};
