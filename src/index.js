#!/usr/bin/env node
// ─── ANI-ME-CLI ─────────────────────────────────────────────────
// Anime streaming TUI — Entry point & Screen Manager
//
// Manages navigation stack and screen lifecycle.
// Screens: Home → Search → Detail → Player

// Force truecolor mode to prevent neo-blessed from using the 256-color palette,
// which gets overwritten by Sixel graphics in many terminal emulators (like Windows Terminal),
// causing text to become black or invisible after resizing or drawing images.
process.env.COLORTERM = 'truecolor';

import { createLayout } from './ui/layout.js';
import { showHomeScreen } from './ui/home.js';
import { showSearchScreen } from './ui/search.js';
import { showDetailScreen } from './ui/detail.js';
import { showPlayerScreen } from './ui/player.js';

// ─── Navigation Stack ────────────────────────────────────────────
const history = [];
let currentScreen = null;
let currentData = null;

/**
 * Clean up screen-level key listeners from the blessed screen
 * to prevent event handler stacking across navigations
 */
function cleanupKeyListeners(screen) {
  const screenKeys = ['/', 'b', 'h', 'left', 'right', 'up', 'down', 'enter', 'tab', 'r'];
  screenKeys.forEach(key => {
    screen.removeAllListeners(`key ${key}`);
  });
}

/**
 * Navigate to a screen, pushing current onto history
 * @param {string} screenName - 'home' | 'search' | 'detail' | 'player'
 * @param {object} data - Screen-specific data
 */
function navigate(screenName, data = {}) {
  // Save current screen to history for back navigation
  if (currentScreen && screenName !== currentScreen) {
    history.push({ screen: currentScreen, data: currentData });
  }

  currentScreen = screenName;
  currentData = data;

  // Remove previous screen-level key listeners to prevent stacking
  cleanupKeyListeners(layout.screen);

  // Wipe the entire terminal to clear raw image pixels (chafa writes
  // directly to the terminal, bypassing blessed's internal buffer).
  // This deep clear specifically guarantees no scrolling artifacts pile up.
  console.clear();
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
  layout.screen.program.clear();
  layout.screen.clearRegion(0, layout.screen.width, 0, layout.screen.height);
  if (layout.screen.lines) {
    layout.screen.lines.forEach(line => { line.dirty = true; });
  }

  // Route to the correct screen
  switch (screenName) {
    case 'home':
      history.length = 0;
      showHomeScreen(layout, navigate);
      break;

    case 'search':
      showSearchScreen(layout, navigate, data);
      break;

    case 'detail':
      showDetailScreen(layout, navigate, data);
      break;

    case 'player':
      showPlayerScreen(layout, navigate, data);
      break;

    default:
      showHomeScreen(layout, navigate);
  }
}

/**
 * Go back to previous screen in history
 */
function goBack() {
  if (history.length > 0) {
    const prev = history.pop();
    currentScreen = prev.screen;
    currentData = prev.data;
    cleanupKeyListeners(layout.screen);

    // Wipe raw terminal pixels (same as navigate)
    console.clear();
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
    layout.screen.program.clear();
    layout.screen.clearRegion(0, layout.screen.width, 0, layout.screen.height);
    if (layout.screen.lines) {
      layout.screen.lines.forEach(line => { line.dirty = true; });
    }

    switch (prev.screen) {
      case 'home':
        showHomeScreen(layout, navigate, { fromBack: true });
        break;
      case 'search':
        showSearchScreen(layout, navigate, prev.data);
        break;
      case 'detail':
        showDetailScreen(layout, navigate, prev.data);
        break;
      case 'player':
        showPlayerScreen(layout, navigate, prev.data);
        break;
    }
  } else {
    navigate('home', { fromBack: true });
  }
}

// ─── Initialize App ──────────────────────────────────────────────
const layout = createLayout();

// Register persistent global keybindings
// 'r' to refresh current screen
layout.screen.key(['r'], () => {
  navigate(currentScreen, currentData);
});

// ─── Resize Handler (Gemini CLI approach: full re-render) ────────
// Instead of patching positions on resize, completely rebuild the
// current screen from scratch with the new terminal dimensions.
// This mirrors the Gemini CLI's React/Ink pattern where a terminal
// size change triggers a full component tree re-render.
let resizeTimer = null;
layout.screen.on('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!currentScreen) return;

    // Clean up existing key listeners to prevent stacking
    cleanupKeyListeners(layout.screen);

    // Full terminal wipe to clear any raw pixel artifacts
    // (chafa images write directly to stdout, bypassing blessed)
    console.clear();
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');

    // Force blessed to redraw its entire internal buffer to the physical screen
    // by marking all lines as dirty.
    if (layout.screen.lines) {
      layout.screen.lines.forEach(line => { line.dirty = true; });
    }

    // Re-render current screen preserving state
    switch (currentScreen) {
      case 'home':
        // Use fromBack: true to rebuild from cached data (no re-fetch)
        showHomeScreen(layout, navigate, { fromBack: true });
        break;
      case 'search':
        showSearchScreen(layout, navigate, currentData);
        break;
      case 'detail':
        showDetailScreen(layout, navigate, currentData);
        break;
      case 'player':
        showPlayerScreen(layout, navigate, currentData);
        break;
      default:
        showHomeScreen(layout, navigate);
    }
  }, 150); // 150ms debounce prevents rebuild storms during active dragging
});

// ─── Startup ─────────────────────────────────────────────────────
console.clear();
navigate('home');
