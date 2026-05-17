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
      let offset = 0;
      if (info.episodes[0]?.number > 1) {
        offset = info.episodes[0].number - 1;
      }

      const episodes = info.episodes.map((ep, i) => {
        const relativeNum = ep.number !== undefined ? ep.number - offset : i + 1;
        return {
          episodeString: String(relativeNum),
          title: ep.title,
          number: relativeNum,
          _consumetId: ep.id,
          _provider: 'animepahe',
        };
      });

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

let cachedHomeData = null;
let homeDataPromise = null;

export async function getHomeData(forceRefresh = false) {
  if (forceRefresh) {
    cachedHomeData = null;
    homeDataPromise = null;
  }
  if (cachedHomeData) return cachedHomeData;
  if (homeDataPromise) return homeDataPromise;

  homeDataPromise = (async () => {
    let latestRaw = [];
    try {
      const [p1, p2, p3, p4, p5, p6, p7, p8] = await Promise.all([
        pahe.client.get(`${pahe.baseUrl}/api?m=airing&page=1`, { headers: pahe.Headers() }),
        pahe.client.get(`${pahe.baseUrl}/api?m=airing&page=2`, { headers: pahe.Headers() }),
        pahe.client.get(`${pahe.baseUrl}/api?m=airing&page=3`, { headers: pahe.Headers() }),
        pahe.client.get(`${pahe.baseUrl}/api?m=airing&page=4`, { headers: pahe.Headers() }),
        pahe.client.get(`${pahe.baseUrl}/api?m=airing&page=5`, { headers: pahe.Headers() }),
        pahe.client.get(`${pahe.baseUrl}/api?m=airing&page=6`, { headers: pahe.Headers() }),
        pahe.client.get(`${pahe.baseUrl}/api?m=airing&page=7`, { headers: pahe.Headers() }),
        pahe.client.get(`${pahe.baseUrl}/api?m=airing&page=8`, { headers: pahe.Headers() })
      ]);
      
      const raw = [
        ...(p1?.data?.data || []),
        ...(p2?.data?.data || []),
        ...(p3?.data?.data || []),
        ...(p4?.data?.data || []),
        ...(p5?.data?.data || []),
        ...(p6?.data?.data || []),
        ...(p7?.data?.data || []),
        ...(p8?.data?.data || [])
      ];
      
      latestRaw = raw.map(a => ({
        id: a.anime_session,
        name: a.anime_title,
        episode: a.episode,
        imageUrl: a.snapshot
      }));
    } catch (err) {
      console.warn("AnimePahe home fetch failed:", err);
    }

    const seen = new Set();
    const deduped = [];
    for (const a of latestRaw) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        deduped.push(a);
      }
    }

    // Fetch actual posters instead of episode snapshots (in parallel)
    await Promise.all(deduped.map(async (a) => {
      try {
        const info = await pahe.fetchAnimeInfo(a.id);
        if (info) {
          if (info.image) a.imageUrl = info.image; // Overwrite snapshot with actual poster
          a.synopsis = info.description ? info.description.replace(/<[^>]*>?/gm, '').trim() : '';
          a.status = info.status || 'Airing';
          a.type = info.type || 'TV';

          // Normalize episode number if this is a later season
          if (info.episodes && info.episodes.length > 0) {
            let offset = 0;
            if (info.episodes[0]?.number > 1) {
              offset = info.episodes[0].number - 1;
            }
            if (a.episode) {
              a.episode = a.episode - offset;
            }
          }
        }
      } catch(e) {}
    }));

    const spotlights = deduped.slice(0, 5).map(a => ({ ...a, type: a.type || 'TV', status: a.status || 'Airing' }));
    
    const rem = deduped.slice(5);
    const mid = Math.floor(rem.length / 2);
    const latest = rem.slice(0, mid);
    const trending = rem.slice(mid).map(a => ({ ...a, type: a.type || 'TV' }));

    cachedHomeData = { spotlights, trending, latest };
    return cachedHomeData;
  })();

  return homeDataPromise;
}

export default {
  search,
  getEpisodeList,
  getPlayableStreams,
  getHomeData,
};
