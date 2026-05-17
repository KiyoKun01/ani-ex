// ─── Config Persistence ──────────────────────────────────────────
// Saves/loads user preferences (e.g. preferred player) to a JSON
// file in the user's home directory so settings survive restarts.

import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.aniex');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Default settings
const DEFAULTS = {
  player: 'mpv', // 'mpv' | 'vlc'
};

/**
 * Load config from disk, merging with defaults
 * @returns {object} The full config object
 */
export function loadConfig() {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return { ...DEFAULTS, ...JSON.parse(raw) };
    }
  } catch {
    // Silent fail — return defaults
  }
  return { ...DEFAULTS };
}

/**
 * Save a config key-value pair to disk
 * @param {string} key - Config key
 * @param {*} value - Config value
 */
export function saveConfig(key, value) {
  try {
    const config = loadConfig();
    config[key] = value;
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    return config;
  } catch {
    // Silent fail
    return null;
  }
}

/**
 * Get a single config value
 * @param {string} key
 * @param {*} fallback
 */
export function getConfig(key, fallback = null) {
  const config = loadConfig();
  return config[key] !== undefined ? config[key] : fallback;
}

export default { loadConfig, saveConfig, getConfig };
