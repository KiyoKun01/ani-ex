// ─── AllAnime Direct Scraper ─────────────────────────────────────
// Ports ani-cli's bash scraping approach to Node.js
// GraphQL queries → api.allanime.day → decrypt URLs → fetch streams
// No external API server needed.

const ALLANIME_API = 'https://api.allanime.day/api';
const ALLANIME_REFERER = 'https://allmanga.to';
const ALLANIME_BASE = 'allanime.day';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';

// ─── Hex Substitution Cipher ─────────────────────────────────────
// Ported directly from ani-cli's provider_init sed chain
const HEX_MAP = {
  '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G',
  '70': 'H', '71': 'I', '72': 'J', '73': 'K', '74': 'L', '75': 'M', '76': 'N',
  '77': 'O', '68': 'P', '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T', '6d': 'U',
  '6e': 'V', '6f': 'W', '60': 'X', '61': 'Y', '62': 'Z',
  '59': 'a', '5a': 'b', '5b': 'c', '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g',
  '50': 'h', '51': 'i', '52': 'j', '53': 'k', '54': 'l', '55': 'm', '56': 'n',
  '57': 'o', '48': 'p', '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u',
  '4e': 'v', '4f': 'w', '40': 'x', '41': 'y', '42': 'z',
  '08': '0', '09': '1', '0a': '2', '0b': '3', '0c': '4', '0d': '5', '0e': '6',
  '0f': '7', '00': '8', '01': '9',
  '15': '-', '16': '.', '67': '_', '46': '~',
  '02': ':', '17': '/', '07': '?', '1b': '#',
  '63': '[', '65': ']', '78': '@', '19': '!',
  '1c': '$', '1e': '&', '10': '(', '11': ')',
  '12': '*', '13': '+', '14': ',', '03': ';',
  '05': '=', '1d': '%',
};

/**
 * Decrypt an AllAnime obfuscated URL
 * Hex pairs are substituted using the cipher map
 */
export function decryptUrl(encrypted) {
  let result = '';
  for (let i = 0; i < encrypted.length; i += 2) {
    const hexPair = encrypted.substring(i, i + 2).toLowerCase();
    if (HEX_MAP[hexPair] !== undefined) {
      result += HEX_MAP[hexPair];
    } else {
      result += hexPair; // keep unknown pairs as-is
    }
  }
  // ani-cli appends .json to /clock paths (e.g. /apivtwo/clock?id=... → /apivtwo/clock.json?id=...)
  result = result.replace(/\/clock(\?|$)/, '/clock.json$1');
  return result;
}

// ─── GraphQL Queries ─────────────────────────────────────────────
// Ported directly from ani-cli bash script

const SEARCH_GQL = `query(
  $search: SearchInput
  $limit: Int
  $page: Int
  $translationType: VaildTranslationTypeEnumType
  $countryOrigin: VaildCountryOriginEnumType
) {
  shows(
    search: $search
    limit: $limit
    page: $page
    translationType: $translationType
    countryOrigin: $countryOrigin
  ) {
    edges {
      _id
      name
      availableEpisodes
      __typename
    }
  }
}`;

const EPISODES_GQL = `query ($showId: String!) {
  show(_id: $showId) {
    _id
    availableEpisodesDetail
  }
}`;

const EPISODE_SOURCES_GQL = `query (
  $showId: String!,
  $translationType: VaildTranslationTypeEnumType!,
  $episodeString: String!
) {
  episode(
    showId: $showId
    translationType: $translationType
    episodeString: $episodeString
  ) {
    episodeString
    sourceUrls
  }
}`;

// ─── HTTP Helper ─────────────────────────────────────────────────

async function gqlRequest(variables, query) {
  const url = new URL(ALLANIME_API);
  url.searchParams.set('variables', JSON.stringify(variables));
  url.searchParams.set('query', query);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      'Referer': ALLANIME_REFERER,
    },
  });

  if (!res.ok) throw new Error(`AllAnime API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function httpGet(url, referer = ALLANIME_REFERER) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Referer': referer,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.text();
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Search for anime
 * @param {string} query - Search term
 * @param {string} mode - 'sub' or 'dub'
 * @returns {Promise<Array<{id, name, subEpisodes, dubEpisodes}>>}
 */
export async function search(query, mode = 'sub') {
  const data = await gqlRequest({
    search: { allowAdult: false, allowUnknown: false, query },
    limit: 40,
    page: 1,
    translationType: mode,
    countryOrigin: 'ALL',
  }, SEARCH_GQL);

  const edges = data?.data?.shows?.edges || [];
  return edges
    .filter(e => {
      const eps = e.availableEpisodes || {};
      return (eps[mode] || 0) > 0;
    })
    .map(e => ({
      id: e._id,
      name: e.name,
      subEpisodes: e.availableEpisodes?.sub || 0,
      dubEpisodes: e.availableEpisodes?.dub || 0,
    }));
}

/**
 * Get episode list for a show
 * @param {string} showId - AllAnime show ID
 * @param {string} mode - 'sub' or 'dub'
 * @returns {Promise<number[]>} sorted episode numbers
 */
export async function getEpisodeList(showId, mode = 'sub') {
  const data = await gqlRequest({ showId }, EPISODES_GQL);
  const detail = data?.data?.show?.availableEpisodesDetail || {};
  const episodes = detail[mode] || [];
  return episodes.map(e => parseFloat(e)).sort((a, b) => a - b);
}

/**
 * Get episode source URLs (encrypted) from all providers
 * @param {string} showId - AllAnime show ID
 * @param {string} episodeString - Episode number as string
 * @param {string} mode - 'sub' or 'dub'
 * @returns {Promise<Array<{provider, url}>>} decrypted source URLs
 */
export async function getEpisodeSources(showId, episodeString, mode = 'sub') {
  const data = await gqlRequest({
    showId,
    translationType: mode,
    episodeString: String(episodeString),
  }, EPISODE_SOURCES_GQL);

  const sourceUrls = data?.data?.episode?.sourceUrls || [];
  const sources = [];

  // Provider patterns matching ani-cli's provider_init regex
  const providerPatterns = [
    { name: 'wixmp',      regex: /Default/ },
    { name: 'youtube',    regex: /Yt-mp4/ },
    { name: 'sharepoint', regex: /S-mp4/ },
    { name: 'hianime',    regex: /Luf-Mp4/ },
  ];

  for (const src of sourceUrls) {
    const sourceName = src.sourceName || '';
    const sourceUrl = src.sourceUrl || '';

    // sourceUrl starts with '--' followed by encrypted hex
    if (sourceUrl.startsWith('--')) {
      const encrypted = sourceUrl.substring(2);
      const decrypted = decryptUrl(encrypted);

      // Match to a known provider
      let providerName = 'unknown';
      for (const p of providerPatterns) {
        if (p.regex.test(sourceName)) {
          providerName = p.name;
          break;
        }
      }

      sources.push({
        provider: providerName,
        name: sourceName,
        url: decrypted,
      });
    }
  }

  return sources;
}

/**
 * Fetch actual stream links from an embed/source URL
 * @param {string} sourceUrl - Decrypted source URL
 * @returns {Promise<Array<{quality, url, type, subtitleUrl?, referer?}>>}
 */
export async function getStreamLinks(sourceUrl) {
  const links = [];

  try {
    // Construct full URL if relative
    let fullUrl = sourceUrl;
    if (sourceUrl.startsWith('/')) {
      fullUrl = `https://${ALLANIME_BASE}${sourceUrl}`;
    }

    const response = await httpGet(fullUrl, ALLANIME_REFERER);
    let data;
    try {
      data = JSON.parse(response);
    } catch {
      // Response might not be JSON (could be m3u8 directly)
      if (response.includes('#EXTM3U')) {
        links.push({ quality: 'auto', url: fullUrl, type: 'm3u8' });
        return links;
      }
      return links;
    }

    // Parse the JSON response for links
    // AllAnime returns { links: [{ link, resolutionStr, ... }] } or
    // { links: [{ hls, url, hardsub_lang, ... }] }
    if (data.links && Array.isArray(data.links)) {
      for (const item of data.links) {
        if (item.link) {
          const quality = item.resolutionStr || 'default';
          const url = item.link;

          // Check if it's an m3u8 master playlist
          if (url.includes('.m3u8') || url.includes('master.m3u8')) {
            // Try to parse the m3u8 for quality variants
            const m3u8Links = await parseM3u8(url, item.Referer || ALLANIME_REFERER);
            if (m3u8Links.length > 0) {
              links.push(...m3u8Links);
            } else {
              links.push({ quality, url, type: 'm3u8', referer: item.Referer || null });
            }
          } else if (url.includes('repackager.wixmp.com')) {
            // wixmp multi-quality MP4
            links.push({ quality, url, type: 'mp4' });
          } else {
            links.push({ quality, url, type: item.mp4 ? 'mp4' : 'hls' });
          }
        }

        // HLS format (hianime provider)
        if (item.hls && item.url && item.hardsub_lang === 'en-US') {
          links.push({ quality: 'hardsub', url: item.url, type: 'hls' });
        }
      }
    }

    // Check for subtitles
    if (data.subtitles && Array.isArray(data.subtitles)) {
      for (const sub of data.subtitles) {
        if (sub.lang === 'en' && sub.src) {
          links.forEach(l => { l.subtitleUrl = sub.src; });
        }
      }
    }

    // YouTube-style links
    if (sourceUrl.includes('tools.fast4speed.rsvp')) {
      links.push({ quality: 'Yt', url: sourceUrl, type: 'yt', referer: ALLANIME_REFERER });
    }

  } catch (err) {
    // Silently skip failed providers
    // console.error(`Failed to fetch links from ${sourceUrl}: ${err.message}`);
  }

  return links;
}

/**
 * Parse an m3u8 master playlist for quality variants
 */
async function parseM3u8(m3u8Url, referer) {
  const links = [];

  try {
    const content = await httpGet(m3u8Url, referer);

    if (!content.includes('#EXTM3U')) return links;

    const lines = content.split('\n');
    const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('#EXT-X-STREAM-INF')) {
        // Extract resolution
        const resMatch = line.match(/RESOLUTION=\d+x(\d+)/);
        const quality = resMatch ? `${resMatch[1]}p` : 'auto';
        const bandMatch = line.match(/BANDWIDTH=(\d+)/);

        // Next line is the URL
        const nextLine = (lines[i + 1] || '').trim();
        if (nextLine && !nextLine.startsWith('#')) {
          const streamUrl = nextLine.startsWith('http') ? nextLine : baseUrl + nextLine;
          links.push({
            quality,
            url: streamUrl,
            type: 'm3u8',
            referer,
            bandwidth: bandMatch ? parseInt(bandMatch[1]) : 0,
          });
        }
      }
    }

    // Sort by quality (highest first)
    links.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));

  } catch {
    // If we can't parse, return the master URL as-is
    links.push({ quality: 'auto', url: m3u8Url, type: 'm3u8', referer });
  }

  return links;
}

/**
 * High-level: get all playable streams for an episode
 * Fetches sources from all providers in parallel, returns sorted by quality
 * @param {string} showId
 * @param {string} episodeString
 * @param {string} mode - 'sub' or 'dub'
 * @returns {Promise<Array<{quality, url, type, provider, subtitleUrl?, referer?}>>}
 */
export async function getPlayableStreams(showId, episodeString, mode = 'sub') {
  const sources = await getEpisodeSources(showId, episodeString, mode);

  // Fetch links from all providers in parallel (like ani-cli does)
  const results = await Promise.allSettled(
    sources.map(async (src) => {
      const links = await getStreamLinks(src.url);
      return links.map(l => ({ ...l, provider: src.provider, providerName: src.name }));
    })
  );

  const allLinks = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allLinks.push(...result.value);
    }
  }

  // Sort: prefer higher quality, m3u8 over mp4
  allLinks.sort((a, b) => {
    const qA = parseInt(a.quality) || 0;
    const qB = parseInt(b.quality) || 0;
    return qB - qA;
  });

  return allLinks;
}

export default {
  search,
  getEpisodeList,
  getEpisodeSources,
  getStreamLinks,
  getPlayableStreams,
  decryptUrl,
};
