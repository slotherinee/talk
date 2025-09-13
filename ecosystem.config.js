module.exports = {
  apps: [
    {
      name: "talk-app",
      script: "./server/server.js",
      cwd: "/root/projects/talk",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // PM2 options
      max_memory_restart: "1G",
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,
      // Auto restart options
      watch: false,
      ignore_watch: ["node_modules", "logs", "client/dist"],
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 5000,
    },
  ],
};
