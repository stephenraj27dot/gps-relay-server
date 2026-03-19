// ============================================================
// src/utils/cleanup.js
// Periodic cleanup of stale Redis bus positions
// Runs every 60 seconds, removes entries older than TTL
// ============================================================
const logger = require('./logger');

/**
 * Start a background interval to clean stale positions from Redis.
 * @param {import('ioredis').Redis} pub
 */
function startCleanup(pub) {
  const STALE_TTL    = 5 * 60 * 1000; // 5 minutes in ms
  const SCAN_PATTERN = 'tenant:*:bus:*';

  const interval = setInterval(async () => {
    try {
      let cursor = '0';
      let cleaned = 0;
      const now = Date.now();

      do {
        const [nextCursor, keys] = await pub.scan(cursor, 'MATCH', SCAN_PATTERN, 'COUNT', 100);
        cursor = nextCursor;

        await Promise.all(keys.map(async (key) => {
          const ts = await pub.hget(key, 'timestamp');
          if (ts && now - parseInt(ts, 10) > STALE_TTL) {
            await pub.del(key);
            cleaned++;
            logger.debug('[Cleanup] Removed stale bus', { key });
          }
        }));
      } while (cursor !== '0');

      if (cleaned > 0) {
        logger.info(`[Cleanup] Removed ${cleaned} stale bus position(s)`);
      }
    } catch (err) {
      logger.error('[Cleanup] Error during cleanup', { message: err.message });
    }
  }, 60_000);

  // Don't prevent process exit
  interval.unref();
  logger.ok('[Cleanup] Stale position cleanup scheduler started (every 60s)');
}

module.exports = { startCleanup };
