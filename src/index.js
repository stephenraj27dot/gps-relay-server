// ============================================================
// src/index.js
// Server entry point
// ============================================================
require('dotenv').config();
const { httpServer } = require('./app');
const logger = require('./utils/logger');

const PORT = parseInt(process.env.PORT || '3001', 10);

httpServer.listen(PORT, () => {
  logger.ok(`[Server] ✅ GPS Relay running on port ${PORT}`);
  logger.ok(`[Server] Health: http://localhost:${PORT}/health`);
  logger.info(`[Server] Mode: ${process.env.NODE_ENV || 'dev'}`);
  logger.info(`[Server] PID: ${process.pid}`);
});

// ── Graceful shutdown ─────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.warn('[Server] SIGTERM received. Shutting down gracefully...');
  httpServer.close(() => {
    logger.info('[Server] HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.warn('[Server] SIGINT received. Shutting down...');
  httpServer.close(() => process.exit(0));
});

process.on('uncaughtException', (err) => {
  logger.error('[Server] Uncaught exception', { message: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('[Server] Unhandled rejection', { reason: String(reason) });
});
