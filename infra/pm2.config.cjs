module.exports = {
  apps: [
    {
      name: 'pharmate-server',
      script: './server/src/index.js',
      cwd: '/var/www/pharmate',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      env_file: '/var/www/pharmate/server/.env',
      error_file: '/var/log/pm2/pharmate-error.log',
      out_file: '/var/log/pm2/pharmate-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
