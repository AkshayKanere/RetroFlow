const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const COLORS = {
  debug: '\x1b[90m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  reset: '\x1b[0m',
};

function getMinLevel() {
  const env = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[env] !== undefined ? LEVELS[env] : LEVELS.info;
}

function formatPrefix(level) {
  const ts = new Date().toISOString();
  const tag = level.toUpperCase();
  return `${COLORS[level]}[${ts}] [${tag}]${COLORS.reset}`;
}

export function debug(...args) {
  if (getMinLevel() > LEVELS.debug) return;
  console.debug(formatPrefix('debug'), ...args);
}

export function info(...args) {
  if (getMinLevel() > LEVELS.info) return;
  console.info(formatPrefix('info'), ...args);
}

export function warn(...args) {
  if (getMinLevel() > LEVELS.warn) return;
  console.warn(formatPrefix('warn'), ...args);
}

export function error(...args) {
  if (getMinLevel() > LEVELS.error) return;
  console.error(formatPrefix('error'), ...args);
}
