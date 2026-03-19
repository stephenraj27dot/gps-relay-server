// ============================================================
// src/handlers/socketHandlers.js
// All WebSocket event logic in one place
//
// Rules enforced here:
//   ❌ NO database calls (history is fire-and-forget via service)
//   ❌ NO loops or heavy computation
//   ✅ All events validate tenant_id (attached by auth middleware)
//   ✅ All real-time data flows through Redis
// ============================================================
const logger = require('../utils/logger');
const {
  getChannel,
  publishLocation,
  cacheLocation,
  markBusOffline,
  getCachedPositions,
  saveHistoryAsync,
} = require('../services/locationService');

/**
 * Register all socket event handlers.
 * @param {import('socket.io').Socket} socket
 * @param {import('ioredis').Redis} pub  - Redis publish client
 */
function registerHandlers(socket, pub) {
  const tenantId = socket.tenantId; // set by auth middleware

  // ──────────────────────────────────────────────────────────
  // DRIVER: sends GPS coordinates every 2-3 seconds
  // ──────────────────────────────────────────────────────────
  socket.on('driver:gps', async ({ busId, driverId, lat, lng, speed, routeName }) => {
    if (!busId || lat == null || lng == null) {
      logger.warn('[Socket] driver:gps — missing fields', { tenantId, busId });
      return;
    }

    const payload = {
      busId,
      driverId:  driverId || busId,
      lat:       parseFloat(lat),
      lng:       parseFloat(lng),
      speed:     parseFloat(speed) || 0,
      routeName: routeName || '',
      timestamp: Date.now(),
    };

    // Pin driver to a room so admin can push messages to one driver
    socket.join(`driver:${tenantId}:${driverId || busId}`);

    // 1. Cache latest position in Redis (with TTL)
    await cacheLocation(pub, tenantId, busId, payload);

    // 2. Publish to tenant-specific bus channel → all passengers receive
    await publishLocation(pub, tenantId, busId, payload);

    // 3. Async history save — fire-and-forget, NEVER blocks
    saveHistoryAsync(tenantId, busId, payload.lat, payload.lng, payload.speed);
  });

  // ──────────────────────────────────────────────────────────
  // Backward-compat alias: send_location (old frontend format)
  // ──────────────────────────────────────────────────────────
  socket.on('send_location', async ({ bus_id, lat, lng, speed, routeName }) => {
    if (!bus_id || lat == null || lng == null) return;

    const payload = {
      busId:     bus_id,
      lat:       parseFloat(lat),
      lng:       parseFloat(lng),
      speed:     parseFloat(speed) || 0,
      routeName: routeName || '',
      timestamp: Date.now(),
    };

    await cacheLocation(pub, tenantId, bus_id, payload);
    await publishLocation(pub, tenantId, bus_id, payload);
    saveHistoryAsync(tenantId, bus_id, payload.lat, payload.lng, payload.speed);
  });

  // ──────────────────────────────────────────────────────────
  // DRIVER: trip ended / app closed
  // ──────────────────────────────────────────────────────────
  socket.on('driver:offline', async ({ busId, driverId }) => {
    if (!busId) return;

    await markBusOffline(pub, tenantId, busId);

    // Notify all passengers in this tenant that bus is offline
    const offlinePayload = JSON.stringify({ busId, driverId, timestamp: Date.now() });
    await pub.publish(getChannel(tenantId, busId), offlinePayload);

    logger.info('[Socket] Driver went offline', { tenantId, busId });
  });

  // ──────────────────────────────────────────────────────────
  // PASSENGER: joins tenant room → receives ALL buses
  // ──────────────────────────────────────────────────────────
  socket.on('passenger:join', async ({ busId } = {}) => {
    // Join broad tenant room
    socket.join(`tenant:${tenantId}`);

    // Optionally also join a specific bus room
    if (busId) {
      socket.join(getChannel(tenantId, busId));
    }

    logger.info('[Socket] Passenger joined', { tenantId, busId: busId || 'ALL' });

    // Immediately send current positions snapshot from Redis cache
    const positions = await getCachedPositions(pub, tenantId);
    socket.emit('bus:positions:init', positions);
  });

  // ──────────────────────────────────────────────────────────
  // Backward-compat: join_bus (old frontend format)
  // ──────────────────────────────────────────────────────────
  socket.on('join_bus', ({ bus_id }) => {
    if (!bus_id) return;
    const channel = getChannel(tenantId, bus_id);
    socket.join(channel);
    logger.debug('[Socket] Client joined bus channel', { channel });
  });

  // ──────────────────────────────────────────────────────────
  // Cleanup on disconnect
  // ──────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    logger.debug('[Socket] Client disconnected', { socketId: socket.id, tenantId, reason });
  });
}

module.exports = { registerHandlers };
