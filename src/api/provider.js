// ─── AnimePahe Provider ──────────────────────────────────────────
// Primary provider using animepahe.pw

import pkg from '@consumet/extensions';
const { ANIME } = pkg;

class MyAnimePahe extends ANIME.AnimePahe {
  constructor() {
    super();
    this.baseUrl = 'https://animepahe.pw';
  }
  Headers(sessionId) {
    const headers = super.Headers(sessionId);
    if (headers) {
      headers.authority = 'animepahe.pw';
      headers.referer = sessionId ? `${this.baseUrl}/anime/${sessionId}` : `${this.baseUrl}`;
    }
    return headers;
  }
}

const pahe = new MyAnimePahe();

// ─── Unified Search ──────────────────────────────────────────────
export async function search(query, mode = 'sub') {
  try {
    const res = await pahe.search(query);
    if (res?.results?.length > 0) {
      return res.results.map(a => ({
        id: a.id,
        name: a.title,
        subEpisodes: a.episodes || 0,
        dubEpisodes: 0,
        _provider: 'animepahe',
      }));
    }
  } catch (err) {
    console.warn('AnimePahe search failed:', err.message);
  }
  return [];
}

// ─── Unified Episode List ────────────────────────────────────────
export async function getEpisodeList(showId, mode = 'sub', providerName = 'animepahe') {
  try {
    const info = await pahe.fetchAnimeInfo(showId);
    if (info?.episodes?.length > 0) {
      const episodes = info.episodes.map((ep, i) => ({
        episodeString: String(ep.number || i + 1),
        title: ep.title,
        number: ep.number || i + 1,
        _consumetId: ep.id,
        _provider: 'animepahe',
      }));

      const meta = {
        name: info.title,
        englishName: info.title,
        description: info.description,
        type: info.type,
        status: info.status,
        genres: (info.genres || []),
        studios: [],
        score: null,
        thumbnail: info.image,
      };

      return { episodes, meta };
    }
  } catch (err) {
    console.warn('AnimePahe episode fetch failed:', err.message);
  }

  return { episodes: [], meta: null };
}

// ─── Unified Stream Fetcher ──────────────────────────────────────
export async function getPlayableStreams(showId, episodeString, mode = 'sub', providerName = 'animepahe', consumetId = null) {
  if (consumetId) {
    try {
      const streamsData = await pahe.fetchEpisodeSources(consumetId);
      if (streamsData && streamsData.sources && streamsData.sources.length > 0) {
        let sources = streamsData.sources;
        const filtered = sources.filter(s => mode === 'dub' ? s.isDub : !s.isDub);
        if (filtered.length > 0) sources = filtered;

        return sources.map(src => ({
          quality: src.quality || 'auto',
          url: src.url,
          type: src.isM3U8 || src.url.includes('.m3u8') ? 'm3u8' : 'mp4',
          provider: 'animepahe',
          providerName: 'AnimePahe',
          referer: streamsData.headers?.Referer || 'https://kwik.cx/',
        }));
      }
    } catch (err) {
      console.warn('AnimePahe stream fetch failed:', err.message);
    }
  }
  return [];
}

export default {
  search,
  getEpisodeList,
  getPlayableStreams,
};
