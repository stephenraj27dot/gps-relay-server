const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000
});

// In-memory GPS store: { tenantId: { driverId: { lat, lng, speed, routeName, timestamp } } }
const busPositions = {};

// Health check endpoint
app.get('/health', (req, res) => res.json({ 
  status: 'online', 
  drivers: Object.values(busPositions).reduce((acc, t) => acc + Object.keys(t).length, 0),
  tenants: Object.keys(busPositions).length,
  uptime: process.uptime()
}));

// Get current positions for a tenant (HTTP fallback)
app.get('/positions/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  res.json(busPositions[tenantId] || {});
});

io.on('connection', (socket) => {
  console.log(`[GPS-Relay] Client connected: ${socket.id}`);

  // ===== DRIVER: sends GPS update =====
  socket.on('driver:gps', ({ tenantId, driverId, lat, lng, speed, routeName }) => {
    if (!tenantId || !driverId || lat == null || lng == null) return;

    if (!busPositions[tenantId]) busPositions[tenantId] = {};
    busPositions[tenantId][driverId] = { lat, lng, speed: speed || 0, routeName, timestamp: Date.now(), isActive: true };

    // Join driver room
    socket.join(`driver:${driverId}`);

    // Broadcast to ALL passengers in this tenant room instantly
    io.to(`tenant:${tenantId}`).emit('bus:position', {
      driverId,
      lat,
      lng,
      speed: speed || 0,
      routeName,
      timestamp: Date.now()
    });
  });

  // ===== DRIVER: trip ended =====
  socket.on('driver:offline', ({ tenantId, driverId }) => {
    if (busPositions[tenantId]?.[driverId]) {
      busPositions[tenantId][driverId].isActive = false;
    }
    io.to(`tenant:${tenantId}`).emit('bus:offline', { driverId });
    console.log(`[GPS-Relay] Driver ${driverId} went offline.`);
  });

  // ===== PASSENGER: joins tenant room =====
  socket.on('passenger:join', ({ tenantId }) => {
    if (!tenantId) return;
    socket.join(`tenant:${tenantId}`);
    console.log(`[GPS-Relay] Passenger joined tenant room: ${tenantId}`);

    // Immediately send current bus positions
    if (busPositions[tenantId]) {
      socket.emit('bus:positions:init', busPositions[tenantId]);
    } else {
      socket.emit('bus:positions:init', {});
    }
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    console.log(`[GPS-Relay] Client disconnected: ${socket.id}`);
  });
});

// Auto-cleanup stale positions (older than 5 minutes)
setInterval(() => {
  const now = Date.now();
  const staleThreshold = 5 * 60 * 1000;
  for (const tenantId in busPositions) {
    for (const driverId in busPositions[tenantId]) {
      if (now - busPositions[tenantId][driverId].timestamp > staleThreshold) {
        delete busPositions[tenantId][driverId];
        console.log(`[GPS-Relay] Cleaned up stale driver: ${driverId}`);
      }
    }
  }
}, 60000);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`[GPS-Relay] ✅ Server running on port ${PORT}`);
  console.log(`[GPS-Relay] Health check: http://localhost:${PORT}/health`);
});
