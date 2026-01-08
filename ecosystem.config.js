module.exports = {
  apps: [
    {
      name: 'oto-dial-backend',
      cwd: './backend',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      watch: false,
      ignore_watch: ['node_modules', 'logs', '*.log'],
      env_file: './.env'
    }
  ]
};

