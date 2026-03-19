// ============================================================
// src/config/db.js
// PostgreSQL connection pool (used ONLY for history logging)
// Real-time tracking NEVER uses this — Redis only!
// ============================================================
require('dotenv').config();
const { Pool } = require('pg');
const logger = require('../utils/logger');

let pool = null;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('password@localhost')) {
      logger.warn('[DB] DATABASE_URL not configured. History logging disabled.');
      return null;
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pool.on('error', (err) => logger.error('[DB] Pool error', { message: err.message }));
    pool.on('connect', () => logger.ok('[DB] PostgreSQL connected'));
  }
  return pool;
}

/**
 * Run a query. Returns null if DB not configured.
 * NEVER call this from WebSocket handlers directly.
 * Use locationService.saveHistoryAsync() instead.
 */
async function query(text, params) {
  const p = getPool();
  if (!p) return null;
  try {
    return await p.query(text, params);
  } catch (err) {
    logger.error('[DB] Query error', { message: err.message, query: text });
    return null;
  }
}

module.exports = { query, getPool };
