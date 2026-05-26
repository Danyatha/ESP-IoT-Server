// ===== INSTALL DULU =====
// npm install express body-parser sqlite3 cors

const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const os = require('os');
const axios = require('axios');
const ESP32_CAM = 'http://192.168.18.133';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Database Setup
const db = new sqlite3.Database('./iot_data.db', (err) => {
    if (err) {
        console.error('❌ Error buka database:', err);
    } else {
        console.log('✅ Database connected');
        db.run(`CREATE TABLE IF NOT EXISTS sensor_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            temperature REAL,
            humidity REAL,
            tds REAL,
            ph REAL,
            alk REAL,
            temp REAL,
            adc_raw REAL,
            voltage REAL,
            baseline_v REAL,
            rs_ro_ratio REAL,
            status TEXT,
            gas_hint TEXT,
            turbidity REAL,
            tss REAL,
            clarity REAL,
            pumping INTEGER,
            device TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('❌ Error create table:', err);
            } else {
                // Migrasi: tambah kolom pumping jika belum ada (untuk database lama)
                db.run(`ALTER TABLE sensor_data ADD COLUMN pumping INTEGER`, (alterErr) => {
                    if (alterErr && !alterErr.message.includes('duplicate column')) {
                        console.error('❌ Error alter table:', alterErr);
                    } else if (!alterErr) {
                        console.log('✅ Kolom pumping berhasil ditambahkan');
                    }
                });
            }
        });
    }
});

// ===== WHITELIST FIELD PER DEVICE =====
const DEVICE_FIELDS = {
    'esp-main':      ['temperature', 'humidity'],
    'esp-tds':       ['tds'],
    'esp-ph':        ['ph', 'alk', 'temp'],
    'esp-gas':       ['adc_raw', 'voltage', 'baseline_v', 'rs_ro_ratio', 'status', 'gas_hint'],
    'esp-turbidity': ['turbidity', 'tss', 'clarity', 'voltage'],
    'esp-pump':      ['pumping'],
};

// Semua kolom yang ada di tabel (selain id, device, timestamp)
const ALL_FIELDS = [
    'temperature', 'humidity', 'tds', 'ph', 'alk', 'temp',
    'adc_raw', 'voltage', 'baseline_v', 'rs_ro_ratio',
    'status', 'gas_hint', 'turbidity', 'tss', 'clarity', 'pumping'
];

// ===== HELPER =====
function getLatestFromDevice(device, cb) {
    db.get(
        `SELECT * FROM sensor_data WHERE device = ? ORDER BY timestamp DESC LIMIT 1`,
        [device],
        cb
    );
}

function ageSeconds(row) {
    if (!row?.timestamp) return null;
    return Math.floor((Date.now() - new Date(row.timestamp + 'Z').getTime()) / 1000);
}

// ===== ROUTES =====

// 1. Endpoint untuk ESP8266 kirim data
app.post('/data', (req, res) => {
    const { device } = req.body;

    if (!device) {
        return res.status(400).json({ error: 'Field "device" wajib diisi' });
    }

    const allowedFields = DEVICE_FIELDS[device];
    if (!allowedFields) {
        return res.status(400).json({
            error: `Device "${device}" tidak dikenal. Daftar device valid: ${Object.keys(DEVICE_FIELDS).join(', ')}`
        });
    }

    // Ambil hanya field yang diizinkan untuk device ini
    const filtered = {};
    for (const field of allowedFields) {
        filtered[field] = req.body[field] ?? null;
    }

    // Validasi minimal satu field terisi
    const hasData = Object.values(filtered).some(v => v != null);
    if (!hasData) {
        return res.status(400).json({
            error: `Tidak ada field valid untuk device "${device}". Field yang diizinkan: ${allowedFields.join(', ')}`
        });
    }

    // Validasi pumping hanya boleh 0 atau 1
    if (device === 'esp-pump' && filtered.pumping != null) {
        const p = Number(filtered.pumping);
        if (p !== 0 && p !== 1) {
            return res.status(400).json({ error: 'Field "pumping" hanya boleh bernilai 0 atau 1' });
        }
        filtered.pumping = p;
    }

    const values = ALL_FIELDS.map(f => filtered[f] ?? null);

    const logStr = Object.entries(filtered)
        .filter(([_, v]) => v != null)
        .map(([k, v]) => `${k}:${v}`)
        .join(' ');
    console.log(`✅ [${device}] ${logStr}`);

    const placeholders = ALL_FIELDS.map(() => '?').join(', ');
    const columns = ALL_FIELDS.join(', ');
    const query = `INSERT INTO sensor_data (${columns}, device) VALUES (${placeholders}, ?)`;

    db.run(query, [...values, device], function (err) {
        if (err) {
            console.error('❌ Error simpan data:', err);
            return res.status(500).json({ error: 'Gagal simpan data' });
        }
        res.status(201).json({ success: true, id: this.lastID, message: 'Data berhasil disimpan' });
    });
});

// 2. Get latest data
app.get('/api/latest', (req, res) => {
    getLatestFromDevice('esp-main', (e1, main) => {
        if (e1) return res.status(500).json({ error: e1.message });

        getLatestFromDevice('esp-tds', (e2, tdsRow) => {
            if (e2) return res.status(500).json({ error: e2.message });

            getLatestFromDevice('esp-ph', (e3, ph) => {
                if (e3) return res.status(500).json({ error: e3.message });

                getLatestFromDevice('esp-gas', (e4, gas) => {
                    if (e4) return res.status(500).json({ error: e4.message });

                    getLatestFromDevice('esp-turbidity', (e5, turb) => {
                        if (e5) return res.status(500).json({ error: e5.message });

                        getLatestFromDevice('esp-pump', (e6, pump) => {
                            if (e6) return res.status(500).json({ error: e6.message });

                            const deviceAge = {
                                'esp-main':      ageSeconds(main),
                                'esp-tds':       ageSeconds(tdsRow),
                                'esp-ph':        ageSeconds(ph),
                                'esp-gas':       ageSeconds(gas),
                                'esp-turbidity': ageSeconds(turb),
                                'esp-pump':      ageSeconds(pump),
                            };

                            res.json({
                                temperature: main?.temperature ?? null,
                                humidity:    main?.humidity ?? null,
                                tds:         tdsRow?.tds ?? null,
                                ph:          ph?.ph ?? null,
                                alk:         ph?.alk ?? null,
                                temp:        ph?.temp ?? null,

                                gas: gas ? {
                                    adc_raw:     gas.adc_raw,
                                    voltage:     gas.voltage,
                                    baseline_v:  gas.baseline_v,
                                    rs_ro_ratio: gas.rs_ro_ratio,
                                    status:      gas.status,
                                    gas_hint:    gas.gas_hint,
                                } : null,

                                turbidity: turb ? {
                                    turbidity: turb.turbidity,
                                    tss:       turb.tss,
                                    clarity:   turb.clarity,
                                    voltage:   turb.voltage,
                                } : null,

                                pumping: pump?.pumping ?? null,

                                timestamp: main?.timestamp ?? tdsRow?.timestamp ?? ph?.timestamp ?? gas?.timestamp ?? turb?.timestamp ?? pump?.timestamp ?? null,

                                device_age: deviceAge,
                                device_names: {
                                    env:       main      ? 'esp-main'      : null,
                                    tds:       tdsRow    ? 'esp-tds'       : null,
                                    water:     ph        ? 'esp-ph'        : null,
                                    gas:       gas       ? 'esp-gas'       : null,
                                    turbidity: turb      ? 'esp-turbidity' : null,
                                    pump:      pump      ? 'esp-pump'      : null,
                                }
                            });
                        });
                    });
                });
            });
        });
    });
});

// 3. Debug — status online/offline tiap device
app.get('/api/debug', (req, res) => {
    const devices = Object.keys(DEVICE_FIELDS);
    const results = {};
    let done = 0;

    devices.forEach(device => {
        db.get(
            `SELECT device, timestamp, COUNT(*) as total_rows FROM sensor_data WHERE device = ? ORDER BY timestamp DESC LIMIT 1`,
            [device],
            (err, row) => {
                if (err) {
                    results[device] = { error: err.message };
                } else if (!row || !row.timestamp) {
                    results[device] = { status: 'NO DATA', total_rows: 0 };
                } else {
                    const age = Math.floor((Date.now() - new Date(row.timestamp + 'Z').getTime()) / 1000);
                    results[device] = {
                        status: age < 30 ? 'ONLINE' : age < 120 ? 'DELAYED' : 'OFFLINE',
                        last_seen:   row.timestamp,
                        age_seconds: age,
                        total_rows:  row.total_rows,
                    };
                }
                done++;
                if (done === devices.length) res.json(results);
            }
        );
    });
});

// 4. Get history
app.get('/api/history', (req, res) => {
    const limit = Math.max(1, Number(req.query.limit) || 20);

    db.all(`SELECT temperature, humidity, timestamp FROM sensor_data WHERE device = 'esp-main' ORDER BY timestamp DESC LIMIT ?`, [limit], (e1, mainRows) => {
        if (e1) return res.status(500).json({ error: e1.message });

        db.all(`SELECT tds, timestamp FROM sensor_data WHERE device = 'esp-tds' ORDER BY timestamp DESC LIMIT ?`, [limit], (e2, tdsRows) => {
            if (e2) return res.status(500).json({ error: e2.message });

            db.all(`SELECT ph, alk, temp, timestamp FROM sensor_data WHERE device = 'esp-ph' ORDER BY timestamp DESC LIMIT ?`, [limit], (e3, phRows) => {
                if (e3) return res.status(500).json({ error: e3.message });

                db.all(`SELECT adc_raw, voltage, baseline_v, rs_ro_ratio, status, gas_hint, timestamp FROM sensor_data WHERE device = 'esp-gas' ORDER BY timestamp DESC LIMIT ?`, [limit], (e4, gasRows) => {
                    if (e4) return res.status(500).json({ error: e4.message });

                    db.all(`SELECT turbidity, tss, clarity, voltage, timestamp FROM sensor_data WHERE device = 'esp-turbidity' ORDER BY timestamp DESC LIMIT ?`, [limit], (e5, turbRows) => {
                        if (e5) return res.status(500).json({ error: e5.message });

                        db.all(`SELECT pumping, timestamp FROM sensor_data WHERE device = 'esp-pump' ORDER BY timestamp DESC LIMIT ?`, [limit], (e6, pumpRows) => {
                            if (e6) return res.status(500).json({ error: e6.message });

                            res.json({
                                environment: mainRows,
                                tds:         tdsRows,
                                water:       phRows,
                                gas:         gasRows,
                                turbidity:   turbRows,
                                pump:        pumpRows,
                            });
                        });
                    });
                });
            });
        });
    });
});

// 5. Get all data
app.get('/api/all', (req, res) => {
    db.all(`SELECT * FROM sensor_data ORDER BY timestamp DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 6. Delete old data
app.delete('/api/cleanup', (req, res) => {
    const daysToKeep = parseInt(req.query.days, 10) || 7;
    if (isNaN(daysToKeep) || daysToKeep < 1) {
        return res.status(400).json({ error: 'Parameter days tidak valid' });
    }
    db.run(
        `DELETE FROM sensor_data WHERE timestamp < datetime('now', ?)`,
        [`-${daysToKeep} days`],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, deleted: this.changes, message: `Deleted data older than ${daysToKeep} days` });
        }
    );
});

// Server Info
app.get('/', (req, res) => {
    res.send(`
    <html>
    <head>
      <title>ESP8266 IoT Server</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; line-height: 1.6; }
        h1, h2 { color: #333; }
        .endpoint { background: #f4f4f4; padding: 15px; margin: 15px 0; border-radius: 6px; }
        code { background: #e0e0e0; padding: 3px 6px; border-radius: 4px; display: inline-block; }
      </style>
    </head>
    <body>
      <h1>🚀 ESP8266 IoT Server Running</h1>

      <h2>📡 POST Endpoint</h2>
      <div class="endpoint">
        <strong>POST /data</strong> — Kirim data sensor. Field <b>device</b> WAJIB.<br><br>
        <b>esp-main:</b>      <code>{ "temperature": 25.5, "humidity": 65.2, "device": "esp-main" }</code><br><br>
        <b>esp-tds:</b>       <code>{ "tds": 120.5, "device": "esp-tds" }</code><br><br>
        <b>esp-ph:</b>        <code>{ "ph": 7.12, "alk": 150.0, "temp": 28.5, "device": "esp-ph" }</code><br><br>
        <b>esp-gas:</b>       <code>{ "adc_raw": 512, "voltage": 2.31, "baseline_v": 1.95, "rs_ro_ratio": 1.18, "status": "WARNING", "gas_hint": "CO", "device": "esp-gas" }</code><br><br>
        <b>esp-turbidity:</b> <code>{ "turbidity": 3.25, "tss": 4.23, "clarity": 96.7, "voltage": 1.96, "device": "esp-turbidity" }</code><br><br>
        <b>esp-pump:</b>      <code>{ "pumping": 1, "device": "esp-pump" }</code> <span style="color:#888">(0 = OFF, 1 = ON)</span>
      </div>

      <h2>📊 GET Endpoints</h2>
      <div class="endpoint"><strong>GET /api/latest</strong> — Data terbaru tiap ESP</div>
      <div class="endpoint"><strong>GET /api/debug</strong> — 🔍 Status tiap ESP: online/offline, kapan terakhir kirim</div>
      <div class="endpoint"><strong>GET /api/history?limit=20</strong> — Riwayat data per jenis sensor</div>
      <div class="endpoint"><strong>GET /api/all</strong> — Seluruh data mentah dari database</div>
      <div class="endpoint"><strong>DELETE /api/cleanup?days=7</strong> — Hapus data lebih lama dari N hari</div>

      <h2>🌐 ESP8266 Endpoint</h2>
      <code>http://${getLocalIP()}:${PORT}/data</code>
    </body>
    </html>
    `);
});

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (let iface in interfaces) {
        for (let alias of interfaces[iface]) {
            if (alias.family === 'IPv4' && !alias.internal) return alias.address;
        }
    }
    return 'localhost';
}

process.on('SIGINT', () => {
    db.close((err) => {
        if (err) console.error(err);
        console.log('\n👋 Server closed');
        process.exit(0);
    });
});
// ===== CAMERA ROUTES (ESP32-CAM proxy) =====

// List photos
app.get('/cam/photos', async (req, res) => {
    try {
        const result = await axios.get(`${ESP32_CAM}/photos`, { timeout: 10000 });
        res.json(result.data);
    } catch (e) {
        res.status(502).json({ error: 'ESP32-CAM tidak bisa dihubungi', detail: e.message });
    }
});

// Capture photo
app.post('/cam/capture', async (req, res) => {
    try {
        const result = await axios.post(`${ESP32_CAM}/capture`, {}, { timeout: 15000 });
        res.json(result.data);
    } catch (e) {
        res.status(502).json({ error: 'ESP32-CAM tidak bisa dihubungi', detail: e.message });
    }
});

// Serve photo file
app.get('/cam/photo', async (req, res) => {
    try {
        const result = await axios.get(`${ESP32_CAM}/photo`, {
            params: req.query,
            responseType: 'stream',
            timeout: 10000,
        });
        res.setHeader('Content-Type', result.headers['content-type'] || 'image/jpeg');
        result.data.pipe(res);
    } catch (e) {
        res.status(502).json({ error: 'Gagal ambil foto', detail: e.message });
    }
});

// Delete photo
app.delete('/cam/delete', async (req, res) => {
    try {
        const result = await axios.delete(`${ESP32_CAM}/delete`, {
            params: req.query,
            timeout: 10000,
        });
        res.json(result.data);
    } catch (e) {
        res.status(502).json({ error: 'Gagal hapus foto', detail: e.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ===== SERVER STARTED =====');
    console.log(`📍 Local:   http://localhost:${PORT}`);
    console.log(`📍 Network: http://${getLocalIP()}:${PORT}`);
    console.log(`📡 ESP Endpoint: http://${getLocalIP()}:${PORT}/data`);
    console.log(`🔍 Debug:   http://${getLocalIP()}:${PORT}/api/debug`);
    console.log('============================\n');
});