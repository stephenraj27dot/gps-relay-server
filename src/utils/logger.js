// ============================================================
// src/utils/logger.js
// Lightweight structured logger
// ============================================================
const isDev = process.env.NODE_ENV !== 'production';

const colors = {
  reset: '\x1b[0m',
  info:  '\x1b[36m',  // cyan
  warn:  '\x1b[33m',  // yellow
  error: '\x1b[31m',  // red
  debug: '\x1b[35m',  // magenta
  ok:    '\x1b[32m',  // green
};

function format(level, message, meta = {}) {
  const ts = new Date().toISOString();
  if (isDev) {
    const color = colors[level] || colors.reset;
    const tag = `[${level.toUpperCase().padEnd(5)}]`;
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${color}${ts} ${tag}${colors.reset} ${message}${metaStr}`;
  }
  return JSON.stringify({ ts, level, message, ...meta });
}

const logger = {
  info:  (msg, meta) => console.log(format('info',  msg, meta)),
  warn:  (msg, meta) => console.warn(format('warn', msg, meta)),
  error: (msg, meta) => console.error(format('error', msg, meta)),
  debug: (msg, meta) => isDev && console.log(format('debug', msg, meta)),
  ok:    (msg, meta) => console.log(format('ok',   msg, meta)),
};

module.exports = logger;
