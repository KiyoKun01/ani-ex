#!/usr/bin/env node
// ─── ANI-ME-CLI ─────────────────────────────────────────────────
// Anime streaming TUI — Entry point & Screen Manager
//
// Manages navigation stack and screen lifecycle.
// Screens: Home → Search → Detail → Player

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
  const screenKeys = ['/', 'b', 'left', 'right', 'up', 'down', 'enter', 'tab', 'r'];
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

    switch (prev.screen) {
      case 'home':
        showHomeScreen(layout, navigate);
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
    navigate('home');
  }
}

// ─── Initialize App ──────────────────────────────────────────────
const layout = createLayout();

// Register persistent global keybindings
// 'r' to refresh current screen
layout.screen.key(['r'], () => {
  navigate(currentScreen, currentData);
});

// ─── Startup ─────────────────────────────────────────────────────
console.clear();
navigate('home');
