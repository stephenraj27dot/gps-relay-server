// ============================================================
// src/services/locationService.js
// Core business logic for GPS location handling
//
// Rules:
//   ✅ Redis for real-time publish + cache
//   ✅ DB history is fire-and-forget (never blocks WS events)
//   ❌ No blocking calls inside any function here
// ============================================================
const logger = require('../utils/logger');
const { query } = require('../config/db');

// Redis key format for cached positions
// key:  tenant:{tenantId}:bus:{busId}
// type: Redis HASH  {lat, lng, speed, routeName, timestamp, isActive}
const TTL_SECONDS = 5 * 60; // 5 minutes

/**
 * Channel name — MANDATORY format: tenant_{tenantId}_bus_{busId}
 */
function getChannel(tenantId, busId) {
  return `tenant_${tenantId}_bus_${busId}`;
}

/**
 * Cache key in Redis for a specific bus
 */
function getCacheKey(tenantId, busId) {
  return `tenant:${tenantId}:bus:${busId}`;
}

/**
 * Tenant-wide pattern key for scanning all buses of a tenant
 */
function getTenantPattern(tenantId) {
  return `tenant:${tenantId}:bus:*`;
}

/**
 * Publish location update to Redis channel.
 * Called by driver:gps handler.
 */
async function publishLocation(pub, tenantId, busId, payload) {
  const channel = getChannel(tenantId, busId);
  const message = JSON.stringify(payload);
  await pub.publish(channel, message);
  logger.debug('[LocationService] Published', { channel, payload });
}

/**
 * Cache the latest position in Redis with TTL.
 * Stored as HASH for atomic field updates.
 */
async function cacheLocation(pub, tenantId, busId, payload) {
  const key = getCacheKey(tenantId, busId);
  const data = {
    lat:       String(payload.lat),
    lng:       String(payload.lng),
    speed:     String(payload.speed || 0),
    routeName: payload.routeName || '',
    timestamp: String(payload.timestamp || Date.now()),
    isActive:  '1',
  };
  await pub.hset(key, data);
  await pub.expire(key, TTL_SECONDS);
}

/**
 * Mark a bus as inactive in the cache (driver offline).
 * Does NOT delete — keeps last known location visible.
 */
async function markBusOffline(pub, tenantId, busId) {
  const key = getCacheKey(tenantId, busId);
  const exists = await pub.exists(key);
  if (exists) {
    await pub.hset(key, 'isActive', '0');
    await pub.expire(key, TTL_SECONDS);
  }
}

/**
 * Get all cached bus positions for a tenant.
 * Used for: passenger:join initial snapshot + /positions REST endpoint.
 */
async function getCachedPositions(pub, tenantId) {
  const pattern = getTenantPattern(tenantId);
  const keys = await pub.keys(pattern);
  if (!keys.length) return {};

  const positions = {};
  await Promise.all(
    keys.map(async (key) => {
      const busId = key.split(':bus:')[1];
      const data  = await pub.hgetall(key);
      if (data && data.lat) {
        positions[busId] = {
          lat:       parseFloat(data.lat),
          lng:       parseFloat(data.lng),
          speed:     parseFloat(data.speed || 0),
          routeName: data.routeName || '',
          timestamp: parseInt(data.timestamp || '0', 10),
          isActive:  data.isActive === '1',
        };
      }
    })
  );
  return positions;
}

/**
 * Fire-and-forget history insert.
 * Errors are logged only — never throws, never blocks.
 */
function saveHistoryAsync(tenantId, busId, lat, lng, speed) {
  setImmediate(async () => {
    try {
      await query(
        `INSERT INTO location_history (tenant_id, bus_id, lat, lng, speed, recorded_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [tenantId, busId, lat, lng, speed || 0]
      );
    } catch (err) {
      // Silent fail — history is non-critical
      logger.debug('[LocationService] History insert skipped', { message: err?.message });
    }
  });
}

module.exports = {
  getChannel,
  publishLocation,
  cacheLocation,
  markBusOffline,
  getCachedPositions,
  saveHistoryAsync,
};
