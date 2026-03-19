// ============================================================
// ecosystem.config.js — PM2 Cluster Configuration
// Run: pm2 start ecosystem.config.js
// ============================================================
module.exports = {
  apps: [
    {
      name:      'gps-relay',
      script:    'src/index.js',
      instances: 'max',          // use ALL CPU cores
      exec_mode: 'cluster',
      watch:     false,
      env: {
        NODE_ENV: 'production',
        PORT:     3001,
      },
      env_development: {
        NODE_ENV: 'dev',
        PORT:     3001,
      },
      // Auto-restart if memory exceeds 300MB
      max_memory_restart: '300M',
      // Log files
      out_file:   './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // Restart delay on crash
      restart_delay: 2000,
      max_restarts:  10,
    },
  ],
};
