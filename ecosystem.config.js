module.exports = {
  apps: [{
    name: 'esp-iot-server',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    node_args: '--max-old-space-size=128',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      ESP32_CAM_IP: '192.168.18.133',
      ESP32_CAM_PORT: '80',
      UV_THREADPOOL_SIZE: '2'
    }
  }]
};