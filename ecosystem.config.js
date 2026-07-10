module.exports = {
  apps: [{
    name: 'esp-iot-server',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    // 128MB kemarin ketara kekecilan — proses jadi gampang keburu "penuh"
    // heap-nya sendiri (apalagi saat load sharp/libvips di startup), sampai
    // bikin restart loop cepat. 256MB masih aman untuk VPS 1GB tapi tidak
    // terlalu ketat.
    node_args: '--max-old-space-size=256',
    min_uptime: '10s',       // proses harus jalan minimal 10 detik baru dianggap "stabil"
    max_restarts: 10,        // nyerah setelah 10x percobaan restart cepat (bukan 16 default)
    restart_delay: 3000,     // jeda 3 detik sebelum coba restart lagi
    kill_timeout: 8000,      // kasih waktu 8 detik buat graceful shutdown sebelum SIGKILL paksa
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      ESP32_CAM_IP: '192.168.18.133',
      ESP32_CAM_PORT: '80',
      UV_THREADPOOL_SIZE: '2'
    }
  }]
};