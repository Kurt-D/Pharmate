const currentDir = process.env.PHARMATE_CURRENT_DIR || '/var/www/pharmate/current';

module.exports = {
  apps: [
    {
      name: 'pharmate-server',
      script: './server/src/index.js',
      cwd: currentDir,
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      env_file: `${currentDir}/server/.env`,
      error_file: '/var/log/pm2/pharmate-error.log',
      out_file: '/var/log/pm2/pharmate-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
