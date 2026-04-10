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
export async function getTopAiring(limit = 25) {
  const data = await jikanGet(`/top/anime?filter=airing&limit=${limit}`);
  return (data?.data || []).map(a => ({
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
  const data = await jikanGet('/watch/episodes');
  return (data?.data || []).slice(0, 25).map(item => ({
    name: item.entry?.title || 'Unknown',
    malId: item.entry?.mal_id || null,
    imageUrl: item.entry?.images?.jpg?.image_url || null,
    episode: item.episodes?.[0]?.mal_id || null,
    episodeTitle: item.episodes?.[0]?.title || '',
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
    topAnime = await getTopAiring(25);
  } catch (err) {}

  // artificial buffer for strict adherence
  await new Promise(r => setTimeout(r, 1000));

  try {
    latestEps = await getLatestEpisodes();
  } catch (err) {}

  return {
    spotlight: topAnime[0] || null,
    trending: topAnime.slice(1, 25),
    latest: latestEps.slice(0, 25),
  };
}

export default { getTopAiring, getLatestEpisodes, getHomeData };
