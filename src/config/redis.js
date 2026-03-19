// ============================================================
// src/config/redis.js
// Two separate Redis clients: pub (publish) + sub (subscribe)
// Rule: NEVER use same connection for both pub and sub
// ============================================================
require('dotenv').config();
const Redis = require('ioredis');
const logger = require('../utils/logger');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

function createClient(role) {
  const client = new Redis(REDIS_URL, {
    retryStrategy: (times) => {
      const delay = Math.min(times * 200, 3000);
      logger.warn(`[Redis:${role}] Retrying connection... attempt ${times}`, { delay });
      return delay;
    },
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
  });

  client.on('connect', () => logger.ok(`[Redis:${role}] Connected to ${REDIS_URL}`));
  client.on('error',   (err) => logger.error(`[Redis:${role}] Error`, { message: err.message }));
  client.on('close',   () => logger.warn(`[Redis:${role}] Connection closed`));

  return client;
}

// pub  → used to PUBLISH location updates
// sub  → used to SUBSCRIBE to channels (psubscribe)
const pub = createClient('pub');
const sub = createClient('sub');

module.exports = { pub, sub };
