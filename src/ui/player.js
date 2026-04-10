// ─── Episode Player Screen ───────────────────────────────────────
// Auto-fetches streams, shows styled quality picker with provider badges

import blessed from 'neo-blessed';
import {
  COLORS, BOX,
  createLoadingSpinner, createErrorBox,
  createSectionHeader, formatStreamItem,
} from './components.js';
import { getPlayableStreams } from '../api/allanime.js';
import { launchPlayer } from '../utils/player.js';

/**
 * Show the episode player selection screen
 */
export async function showPlayerScreen(layout, navigate, data = {}) {
  const { screen, content, setStatus, setBreadcrumb } = layout;

  content.children.forEach(c => c.destroy());
  const modeLabel = (data.mode || 'sub').toUpperCase();
  setBreadcrumb([
    data.animeName || 'Anime',
    `EP ${data.episodeNumber || '?'} [${modeLabel}]`,
  ]);
  setStatus([['↑↓', 'Select quality'], ['Enter', 'Play'], ['b', 'Back'], ['h', 'Home']]);

  // ─── Now Playing Card ──────────────────────────────────────────
  const nowPlayingCard = blessed.box({
    parent: content,
    top: 1,
    left: 2,
    width: '100%-4',
    height: 5,
    tags: true,
    style: {
      fg: COLORS.text,
      bg: COLORS.card,
      border: { fg: COLORS.accentDeep },
    },
    border: 'line',
    content: [
      '',
      `  {bold}{${COLORS.textBright}-fg}${BOX.play} Now Playing{/}`,
      `  {${COLORS.text}-fg}${data.animeName || 'Unknown'}{/}  {${COLORS.textDim}-fg}${BOX.bullet}{/}  {${COLORS.accent}-fg}Episode ${data.episodeNumber || '?'}{/}  {${COLORS.textDim}-fg}${BOX.bullet}{/}  {${modeLabel === 'SUB' ? COLORS.badgeSub : COLORS.badgeDub}-fg}${modeLabel}{/}`,
    ].join('\n'),
  });

  // ─── Loading Streams ───────────────────────────────────────────
  const spinner = createLoadingSpinner(content, 'Fetching streams from all providers...');
  screen.render();

  try {
    const streams = await getPlayableStreams(data.showId, String(data.episodeNumber), data.mode || 'sub');
    spinner.destroy();

    if (streams.length === 0) {
      createErrorBox(content, 'No playable streams found for this episode');
      screen.render();

      screen.key(['b'], () => {
        navigate('detail', {
          showId: data.showId,
          animeName: data.animeName,
          subEpisodes: data.subEpisodes,
          dubEpisodes: data.dubEpisodes,
          mode: data.mode,
        });
      });
      return;
    }

    // ─── Quality Section ──────────────────────────────────────────
    const qualityHeader = blessed.box({
      parent: content,
      top: 7,
      left: 2,
      width: '100%-4',
      height: 1,
      tags: true,
      style: { fg: COLORS.text, bg: COLORS.bg },
      content: `  ${createSectionHeader(`Select Quality (${streams.length} sources)`, '🎬')}`,
    });

    // ─── Column Headers ───────────────────────────────────────────
    const colHeaders = blessed.box({
      parent: content,
      top: 8,
      left: 2,
      width: '100%-4',
      height: 1,
      tags: true,
      style: { bg: COLORS.bg },
      content: `      {${COLORS.textMuted}-fg}${'#'.padEnd(4)} ${'Quality'.padEnd(11)} ${BOX.v} ${'Provider'.padEnd(14)} ${BOX.v} Type{/}`,
    });

    const separatorLine = blessed.box({
      parent: content,
      top: 9,
      left: 2,
      width: '100%-4',
      height: 1,
      tags: true,
      style: { bg: COLORS.bg },
      content: `  {${COLORS.borderDim}-fg}${BOX.h.repeat(60)}{/}`,
    });

    // ─── Stream List ──────────────────────────────────────────────
    const streamList = blessed.list({
      parent: content,
      top: 10,
      left: 2,
      width: '100%-4',
      height: '100%-14',
      scrollable: true,
      mouse: true,
      keys: true,
      vi: true,
      tags: true,
      scrollbar: {
        ch: '▐',
        style: { bg: COLORS.accentDim },
      },
      style: {
        fg: COLORS.text,
        bg: COLORS.bg,
        selected: {
          fg: COLORS.textBright,
          bg: COLORS.highlightBg,
          bold: true,
        },
      },
    });

    streams.forEach((stream, i) => {
      streamList.addItem(formatStreamItem(stream, i));
    });

    streamList.select(0);
    streamList.focus();

    // ─── Play on Select ───────────────────────────────────────────
    streamList.on('select', async (item, index) => {
      const selected = streams[index];
      if (!selected) return;

      const statusBox = createLoadingSpinner(content, 'Launching player...');
      screen.render();

      try {
        const title = `${data.animeName} - EP ${data.episodeNumber}`;
        await launchPlayer(selected.url, title, {
          referer: selected.referer || null,
          subtitleUrl: selected.subtitleUrl || null,
          type: selected.type,
        });

        statusBox.destroy();

        // Success indicator
        const playbackInfo = blessed.box({
          parent: content,
          bottom: 1,
          left: 2,
          width: '100%-4',
          height: 3,
          tags: true,
          style: {
            fg: COLORS.success,
            bg: COLORS.card,
            border: { fg: COLORS.success },
          },
          border: 'line',
          content: `  {bold}${BOX.play} Playing:{/} ${title} {${COLORS.textDim}-fg}${BOX.v}{/} ${selected.quality} {${COLORS.textDim}-fg}${BOX.v}{/} ${selected.provider}`,
        });
        screen.render();

      } catch (err) {
        statusBox.destroy();
        createErrorBox(content, `Player error: ${err.message}`);
        screen.render();
      }
    });

    // ─── Key Handlers ─────────────────────────────────────────────
    screen.key(['b'], () => {
      navigate('detail', {
        showId: data.showId,
        animeName: data.animeName,
        subEpisodes: data.subEpisodes,
        dubEpisodes: data.dubEpisodes,
        mode: data.mode,
      });
    });

    screen.key(['h'], () => {
      navigate('home', {});
    });

    screen.render();

  } catch (err) {
    spinner.destroy();
    createErrorBox(content, `Failed to fetch streams: ${err.message}`);
    screen.render();

    screen.key(['b'], () => {
      navigate('detail', {
        showId: data.showId,
        animeName: data.animeName,
        subEpisodes: data.subEpisodes,
        dubEpisodes: data.dubEpisodes,
        mode: data.mode,
      });
    });

    screen.key(['h'], () => {
      navigate('home', {});
    });
  }
}

export default { showPlayerScreen };
