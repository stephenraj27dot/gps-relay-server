// ============================================================
// src/routes/api.js
// REST API endpoints (non-real-time)
// ============================================================
const express = require('express');
const router  = express.Router();
const { validateTenantParam } = require('../middleware/auth');
const { getCachedPositions }   = require('../services/locationService');
const logger = require('../utils/logger');

// Injected from app.js
let _pub = null;
let _io  = null;

function init(pub, io) {
  _pub = pub;
  _io  = io;
}

// ── Health check ─────────────────────────────────────────────
router.get('/health', (req, res) => {
  const sockets = _io ? _io.sockets.sockets.size : 0;
  res.json({
    status:      'online',
    uptime:      Math.floor(process.uptime()),
    connections: sockets,
    timestamp:   new Date().toISOString(),
    node_env:    process.env.NODE_ENV,
  });
});

// ── Get latest cached positions for a tenant (HTTP fallback) ─
router.get('/positions/:tenantId', validateTenantParam, async (req, res) => {
  try {
    if (!_pub) return res.status(503).json({ error: 'Redis not ready' });
    const positions = await getCachedPositions(_pub, req.tenantId);
    res.json({ tenantId: req.tenantId, positions });
  } catch (err) {
    logger.error('[API] /positions error', { message: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Force a bus offline (admin action) ───────────────────────
router.post('/trigger-offline/:tenantId/:busId', validateTenantParam, async (req, res) => {
  try {
    const { busId } = req.params;
    if (!busId) return res.status(400).json({ error: 'busId required' });

    if (_io) {
      _io.to(`tenant:${req.tenantId}`).emit('bus:offline', { busId, forced: true });
    }

    logger.info('[API] Bus forced offline', { tenantId: req.tenantId, busId });
    res.json({ success: true, tenantId: req.tenantId, busId });
  } catch (err) {
    logger.error('[API] trigger-offline error', { message: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = { router, init };
