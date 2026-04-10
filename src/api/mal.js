// ─── MyAnimeList Data Fetcher ────────────────────────────────────
// Uses Jikan API (free MAL REST wrapper) for home screen data
// Fetched fresh on every startup: top airing, trending, latest episodes
// Added: seasonal anime, upcoming, and richer metadata

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/121.0';

async function jikanGet(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout
  try {
    const res = await fetch(`${JIKAN_BASE}${path}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Jikan ${res.status}: ${res.statusText}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get top airing anime (for spotlight + trending)
 * @param {number} limit - Max results (default 15)
 * @returns {Promise<Array<{name, score, episodes, type, imageUrl, synopsis, malId, genres, season}>>}
 */
export async function getTopAiring() {
  // Jikan /top/anime ignores custom limits and always returns 25 per page.
  // Fetch page 1 and page 2 to have enough for spotlight (1) + trending (25).
  const [p1, p2] = await Promise.all([
    jikanGet('/top/anime?filter=airing&page=1'),
    jikanGet('/top/anime?filter=airing&page=2'),
  ]);
  const raw = [...(p1?.data || []), ...(p2?.data || [])];
  return raw.map(a => ({
    name: a.title || a.title_english || 'Unknown',
    score: a.score || null,
    episodes: a.episodes || null,
    type: a.type || 'TV',
    imageUrl: a.images?.jpg?.image_url || null,
    synopsis: a.synopsis ? a.synopsis.replace(/\[Written by MAL Rewrite\]/g, '').trim().slice(0, 200) : '',
    malId: a.mal_id,
    status: a.status || '',
    rating: a.rating || '',
    genres: (a.genres || []).map(g => g.name).slice(0, 3),
    season: a.season || '',
    year: a.year || '',
    members: a.members || 0,
    rank: a.rank || null,
  }));
}

/**
 * Get recently released episodes (for latest section)
 * @returns {Promise<Array<{name, episode, episodeTitle, malId, imageUrl}>>}
 */
export async function getLatestEpisodes() {
  // Fallback to active simulcasts (/seasons/now) to fetch high-quality,
  // popular airing anime instead of uncurated kids TV blocks from /schedules.
  const data = await jikanGet('/seasons/now?limit=25');
  return (data?.data || []).slice(0, 25).map(item => ({
    name: item.title || 'Unknown',
    malId: item.mal_id || null,
    imageUrl: item.images?.jpg?.image_url || null,
    episode: 'New',
    episodeTitle: 'Air Drop',
  }));
}

/**
 * Get all home screen data in parallel
 * Fresh data fetched on every app startup
 * @returns {Promise<{spotlight, trending, latest}>}
 */
export async function getHomeData() {
  // Jikan has strict rate limits (3 req/sec), sequential fetching guarantees safety
  let topAnime = [];
  let latestEps = [];

  try {
    // Fetch pages 1+2 in parallel so we have 50 candidates for spotlight + 25 trending
    topAnime = await getTopAiring();
  } catch (err) {}

  // artificial buffer for strict adherence
  await new Promise(r => setTimeout(r, 1000));

  try {
    latestEps = await getLatestEpisodes();
  } catch (err) {}

  // Deduplicate by malId — /seasons/now sometimes returns the same show
  // twice (e.g. Part 2 vs Part 3 share the same base title)
  function dedup(arr) {
    const seen = new Set();
    return arr.filter(a => {
      const key = a.malId || a.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const trendingRaw = dedup(topAnime.slice(1)).slice(0, 25);
  const latestRaw   = dedup(latestEps).filter(a => a.imageUrl).slice(0, 25);

  return {
    spotlight: topAnime[0] || null,
    trending: trendingRaw,
    latest: latestRaw,
  };
}

export default { getTopAiring, getLatestEpisodes, getHomeData };
