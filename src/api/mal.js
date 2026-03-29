// ─── MyAnimeList Data Fetcher ────────────────────────────────────
// Uses Jikan API (free MAL REST wrapper) for home screen data
// Fetched fresh on every startup: top airing, latest episodes

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/121.0';

async function jikanGet(path) {
  const res = await fetch(`${JIKAN_BASE}${path}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`Jikan ${res.status}: ${res.statusText}`);
  return res.json();
}

/**
 * Get top airing anime (for spotlight + trending)
 * @param {number} limit - Max results (default 15)
 * @returns {Promise<Array<{name, score, episodes, type, imageUrl, synopsis, malId}>>}
 */
export async function getTopAiring(limit = 15) {
  const data = await jikanGet(`/top/anime?filter=airing&limit=${limit}`);
  return (data?.data || []).map(a => ({
    name: a.title || a.title_english || 'Unknown',
    score: a.score || null,
    episodes: a.episodes || null,
    type: a.type || 'TV',
    imageUrl: a.images?.jpg?.image_url || null,
    synopsis: a.synopsis ? a.synopsis.slice(0, 150) + '...' : '',
    malId: a.mal_id,
    status: a.status || '',
    rating: a.rating || '',
  }));
}

/**
 * Get recently released episodes (for latest section)
 * @returns {Promise<Array<{name, episode, episodeTitle, malId, imageUrl}>>}
 */
export async function getLatestEpisodes() {
  const data = await jikanGet('/watch/episodes');
  return (data?.data || []).slice(0, 10).map(item => ({
    name: item.entry?.title || 'Unknown',
    malId: item.entry?.mal_id || null,
    imageUrl: item.entry?.images?.jpg?.image_url || null,
    episode: item.episodes?.[0]?.mal_id || null,
    episodeTitle: item.episodes?.[0]?.title || '',
  }));
}

/**
 * Get all home screen data in parallel
 * @returns {Promise<{spotlight, trending, latest}>}
 */
export async function getHomeData() {
  // Jikan has rate limits (3 req/sec), so we stagger slightly
  const [topResult, latestResult] = await Promise.allSettled([
    getTopAiring(15),
    new Promise(r => setTimeout(r, 400)).then(() => getLatestEpisodes()),
  ]);

  const topAnime = topResult.status === 'fulfilled' ? topResult.value : [];
  const latestEps = latestResult.status === 'fulfilled' ? latestResult.value : [];

  return {
    spotlight: topAnime[0] || null,
    trending: topAnime.slice(1, 6),
    latest: latestEps.slice(0, 5),
  };
}

export default { getTopAiring, getLatestEpisodes, getHomeData };
