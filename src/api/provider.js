// ─── Multi-Provider Streaming Layer ────────────────────────────────
// Unifies multiple anime providers into a single resilient API.
// Priority:
// 1. AnimeKai (via @consumet/extensions) — currently the most stable
// 2. Aniwave (aniwaves.ru scraper) — backup
// 3. Direct HiAnime API (last-resort fallback)
//
// AnimeKai's stream extraction has a bug in Consumet v1.8.8 where it
// tries to call /media/ on anikai.to instead of extracting the real
// megaup.cc URL from the iframe first. We patch that here.

import pkg from '@consumet/extensions';
const { ANIME } = pkg;
import aniwaveBackup from './aniwave.js';
import hianimeDirect from './hianime.js';

// ─── Constants ───────────────────────────────────────────────────
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const DEC_API = 'https://enc-dec.app/api/dec-mega';

// Instantiate Consumet providers
const animeKai = new ANIME.AnimeKai();

// ─── AnimeKai Stream Extraction (patched) ────────────────────────
// Consumet's built-in fetchEpisodeSources has a bug:
// It calls anikai.to/media/... which 404s. The correct flow is:
// 1. fetchEpisodeServers → get anikai.to/iframe/... URLs
// 2. Fetch the iframe HTML → extract real megaup.cc/e/... URL
// 3. Hit megaup.cc/media/... to get encrypted payload
// 4. POST to enc-dec.app/api/dec-mega to decrypt → m3u8 stream URLs
async function extractAnimeKaiStreams(episodeId, mode = 'sub') {
  const subOrDub = mode === 'dub' ? 'dub' : 'softsub';

  // Step 1: Get servers (iframe URLs)
  const servers = await animeKai.fetchEpisodeServers(episodeId, subOrDub);
  if (!servers || servers.length === 0) throw new Error('No servers found');

  const streams = [];

  for (const server of servers) {
    try {
      // Step 2: Fetch iframe page, extract real megaup URL
      const iframeRes = await fetch(server.url, {
        headers: { 'User-Agent': USER_AGENT, 'Referer': 'https://anikai.to/' },
        signal: AbortSignal.timeout(8000),
      });
      const html = await iframeRes.text();
      const megaupMatch = html.match(/src="(https:\/\/megaup\.[^"]+)"/);
      if (!megaupMatch) continue;

      const megaupUrl = megaupMatch[1].replace(/\?$/, '');
      const mediaUrl = megaupUrl.replace('/e/', '/media/');

      // Step 3: Get encrypted payload from megaup
      const mediaRes = await fetch(mediaUrl, {
        headers: { 'User-Agent': USER_AGENT, 'Referer': megaupUrl },
        signal: AbortSignal.timeout(8000),
      });
      const mediaData = await mediaRes.json();
      if (!mediaData.result) continue;

      // Step 4: Decrypt via enc-dec.app
      const decRes = await fetch(DEC_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: mediaData.result, agent: USER_AGENT }),
        signal: AbortSignal.timeout(8000),
      });
      const decData = await decRes.json();

      if (decData.result?.sources) {
        for (const src of decData.result.sources) {
          streams.push({
            quality: 'auto',
            url: src.file,
            type: src.file.includes('.m3u8') ? 'm3u8' : 'mp4',
            provider: 'animekai',
            providerName: `AnimeKai ${server.name}`,
            referer: megaupUrl,
            subtitles: (decData.result.tracks || []).map(t => ({
              url: t.file,
              lang: t.label,
              kind: t.kind,
            })),
          });
        }
      }

      // If we got streams from the first server, that's usually enough
      if (streams.length > 0) break;
    } catch {
      // Try next server
    }
  }

  return streams;
}

// ─── Unified Search ──────────────────────────────────────────────
export async function search(query, mode = 'sub') {
  // 1. Try AnimeKai
  try {
    const res = await animeKai.search(query);
    if (res?.results?.length > 0) {
      return res.results.map(a => ({
        id: a.id,
        name: a.title || a.name,
        subEpisodes: a.sub || a.episodes || 0,
        dubEpisodes: a.dub || 0,
        _provider: 'animekai',
      }));
    }
  } catch (err) {
    console.warn('AnimeKai search failed:', err.message);
  }

  // 2. Try Aniwave backup
  try {
    const results = await aniwaveBackup.search(query, mode);
    if (results.length > 0) return results;
  } catch (err) {
    console.warn('Aniwave search failed:', err.message);
  }

  // 3. Last-resort: direct HiAnime API
  const results = await hianimeDirect.search(query, mode);
  return results.map(r => ({ ...r, _provider: 'direct-hianime' }));
}

// ─── Unified Episode List ────────────────────────────────────────
export async function getEpisodeList(showId, mode = 'sub', providerName = 'animekai') {
  // AnimeKai path
  if (providerName === 'animekai') {
    try {
      const info = await animeKai.fetchAnimeInfo(showId);
      if (info?.episodes?.length > 0) {
        const episodes = info.episodes.map((ep, i) => ({
          episodeString: String(ep.number || i + 1),
          title: ep.title,
          number: ep.number || i + 1,
          _consumetId: ep.id,
          _provider: 'animekai',
        }));

        const meta = {
          name: info.title,
          englishName: info.title,
          description: info.description,
          type: info.type,
          status: info.status,
          // AnimeKai's genre array can contain extra metadata strings; filter to real genres
          genres: (info.genres || []).filter(g => !g.includes(':') && g.length < 25),
          studios: [],
          score: null,
          thumbnail: info.image,
        };

        return { episodes, meta };
      }
    } catch (err) {
      console.warn('AnimeKai episode fetch failed:', err.message);
    }
  }

  // Aniwave path
  if (providerName === 'aniwave') {
    try {
      return await aniwaveBackup.getEpisodeList(showId);
    } catch (err) {
      console.warn('Aniwave episode fetch failed:', err.message);
    }
  }

  // Fallback to direct HiAnime API
  try {
    const episodes = await hianimeDirect.getEpisodeList(showId);
    return { episodes, meta: null };
  } catch (err) {
    return { episodes: [], meta: null };
  }
}

// ─── Unified Stream Fetcher ──────────────────────────────────────
export async function getPlayableStreams(showId, episodeString, mode = 'sub', providerName = 'animekai', consumetId = null) {
  // AnimeKai path (with our patched extraction)
  if (consumetId && providerName === 'animekai') {
    try {
      const streams = await extractAnimeKaiStreams(consumetId, mode);
      if (streams.length > 0) return streams;
    } catch (err) {
      console.warn('AnimeKai stream fetch failed:', err.message);
    }
  }

  // Aniwave path
  if (providerName === 'aniwave') {
    try {
      const streams = await aniwaveBackup.getPlayableStreams(showId, episodeString, mode, consumetId);
      if (streams.length > 0) return streams;
    } catch (err) {
      console.warn('Aniwave stream fetch failed:', err.message);
    }
  }

  // Last-resort: direct HiAnime API
  return hianimeDirect.getPlayableStreams(showId, episodeString, mode);
}

export default {
  search,
  getEpisodeList,
  getPlayableStreams,
};
