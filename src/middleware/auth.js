// ============================================================
// src/middleware/auth.js
// Tenant validation for Socket.IO connections
// Dev mode  → accepts ?tenant_id=MEC in handshake query
// Prod mode → validates Bearer JWT (tenant_id in payload)
// ============================================================
require('dotenv').config();
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'routeroyal_dev_secret';
const IS_DEV     = process.env.NODE_ENV !== 'production';

/**
 * Socket.IO middleware — attaches socket.tenantId or disconnects.
 */
function tenantAuthMiddleware(socket, next) {
  try {
    // ── Tenant ID in query string (all modes for now) ──────────
    if (socket.handshake.query.tenant_id) {
      const tenantId = String(socket.handshake.query.tenant_id).trim();
      if (tenantId) {
        socket.tenantId = tenantId;
        logger.debug('[Auth] Tenant from query', { tenantId });
        return next();
      }
    }

    // ── Production: Bearer JWT ─────────────────────────────────
    const authHeader = socket.handshake.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : socket.handshake.query.token;

    if (!token) {
      logger.warn('[Auth] Connection rejected — no tenant_id or token', {
        socketId: socket.id,
      });
      return next(new Error('TENANT_REQUIRED'));
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.tenant_id) {
      return next(new Error('INVALID_TOKEN'));
    }

    socket.tenantId = String(decoded.tenant_id).trim();
    logger.debug('[Auth] JWT verified', { tenantId: socket.tenantId });
    next();
  } catch (err) {
    logger.warn('[Auth] Token verification failed', { message: err.message });
    next(new Error('INVALID_TOKEN'));
  }
}

/**
 * Express middleware — validates tenant_id in REST requests.
 * Attach to any route that needs tenant context.
 */
function validateTenantParam(req, res, next) {
  const tenantId = req.params.tenantId || req.query.tenant_id;
  if (!tenantId || tenantId.trim() === '') {
    return res.status(400).json({ error: 'tenant_id is required' });
  }
  req.tenantId = tenantId.trim();
  next();
}

module.exports = { tenantAuthMiddleware, validateTenantParam };
