// ============================================================
// src/app.js
// Express + Socket.IO bootstrap
// Wires together: auth middleware, socket handlers, API routes,
//                 Redis subscriber, cleanup scheduler
// ============================================================
require('dotenv').config();
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');

const logger  = require('./utils/logger');
const { startCleanup }        = require('./utils/cleanup');
const { pub, sub }            = require('./config/redis');
const { tenantAuthMiddleware } = require('./middleware/auth');
const { registerHandlers }    = require('./handlers/socketHandlers');
const api                     = require('./routes/api');

// ── Express setup ─────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ── HTTP + Socket.IO server ───────────────────────────────────
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout:  60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

// ── Socket.IO auth middleware (runs on every connection) ──────
io.use(tenantAuthMiddleware);

// ── Socket.IO connection handler ─────────────────────────────
io.on('connection', (socket) => {
  logger.info('[App] Client connected', {
    socketId: socket.id,
    tenantId: socket.tenantId,
  });
  registerHandlers(socket, pub);
});

// ── Redis subscriber: forward channel messages to Socket.IO rooms
sub.psubscribe('tenant_*', (err) => {
  if (err) {
    logger.error('[App] Redis psubscribe failed', { message: err.message });
  } else {
    logger.ok('[App] Redis subscribed to pattern: tenant_*');
  }
});

sub.on('pmessage', (pattern, channel, message) => {
  // channel format: tenant_{tenantId}_bus_{busId}
  // Broadcast to all sockets in that room
  try {
    const data = JSON.parse(message);

    // Parse busId from channel to determine event type
    const isOffline = data.hasOwnProperty('driverId') && !data.hasOwnProperty('lat');

    if (isOffline) {
      io.to(channel).emit('bus:offline', data);
      // Also emit to broad tenant room
      const tenantId = channel.split('_bus_')[0].replace('tenant_', '');
      io.to(`tenant:${tenantId}`).emit('bus:offline', data);
    } else {
      io.to(channel).emit('location_update', data);  // fine-grained (join_bus subscribers)
      // Also emit to broad tenant room (passenger:join subscribers)
      const tenantId = channel.split('_bus_')[0].replace('tenant_', '');
      io.to(`tenant:${tenantId}`).emit('bus:position', data);
    }
  } catch (err) {
    logger.error('[App] pmessage parse error', { channel, message: err.message });
  }
});

// ── REST API routes ───────────────────────────────────────────
api.init(pub, io);
app.use('/', api.router);

// ── Stale cleanup scheduler ───────────────────────────────────
startCleanup(pub);

module.exports = { app, httpServer, io };
