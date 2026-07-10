// ===== INSTALL DULU =====
// npm install express body-parser sqlite3 cors http-proxy-middleware

const express = require('express');
const bodyParser = require('body-parser');
const { createProxyMiddleware } = require('http-proxy-middleware');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

// VPS ini RAM-nya kecil (~1GB) — batasi cache internal & concurrency sharp
// supaya tidak menumpuk memori tiap kali ada foto masuk dari ESP32-CAM.
// Tanpa ini, libvips (dipakai sharp) bisa cache banyak buffer gambar di
// memori dan lama-lama bikin proses Node.js OOM (killed oleh kernel).
sharp.cache(false);       // matikan cache operasi/hasil gambar
sharp.concurrency(1);     // proses 1 gambar sekaligus, jangan paralel

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'frontend/build')));

// ===== ESP32-CAM LOCAL STORAGE =====
const fs = require('fs');
const CAM_UPLOAD_DIR = path.join(__dirname, 'cam_photos');
if (!fs.existsSync(CAM_UPLOAD_DIR)) fs.mkdirSync(CAM_UPLOAD_DIR, { recursive: true });

console.log(`📷 ESP32-CAM photos dir: ${CAM_UPLOAD_DIR}`);

// ===== WATERMARK TANGGAL/JAM DI FOTO =====
// Timestamp diambil dari waktu server terima foto (bukan dari ESP32-CAM).
async function addTimestampWatermark(imageBuffer) {
    const timestamp = new Date().toLocaleString('id-ID', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    }).replace(/\./g, ':'); // id-ID kadang pakai titik buat jam, samakan jadi ':'

    // 1 instance sharp dipakai ulang (bukan 2 instance terpisah) — lebih hemat
    // memori, penting untuk VPS dengan RAM kecil.
    const image = sharp(imageBuffer);

    let meta;
    try {
        meta = await image.metadata();
    } catch (e) {
        // Kalau bukan gambar valid / gagal dibaca sharp, kembalikan buffer asli apa adanya
        console.error('[watermark] Gagal baca metadata gambar:', e.message);
        return imageBuffer;
    }

    const width  = meta.width  || 640;
    const height = meta.height || 480;
    const fontSize = Math.max(14, Math.round(width * 0.035)); // skala sesuai lebar foto
    const marginX = Math.round(fontSize * 0.5);
    const marginY = Math.round(fontSize * 0.5);
    const textY   = height - marginY;

    const svg = `
        <svg width="${width}" height="${height}">
            <style>
                .wmShadow { fill: black; font-size: ${fontSize}px; font-family: monospace, sans-serif; font-weight: bold; }
                .wm       { fill: white; font-size: ${fontSize}px; font-family: monospace, sans-serif; font-weight: bold; }
            </style>
            <text x="${marginX + 1}" y="${textY + 1}" class="wmShadow">${timestamp}</text>
            <text x="${marginX}"     y="${textY}"     class="wm">${timestamp}</text>
        </svg>
    `;

    try {
        return await image
            .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
            .jpeg({ quality: 90 })
            .toBuffer();
    } catch (e) {
        console.error('[watermark] Gagal proses watermark:', e.message);
        return imageBuffer; // fallback: simpan foto asli tanpa watermark daripada gagal total
    }
}

// POST /cam/upload — terima foto dari ESP32-CAM
const CAM_MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // 3MB — cukup longgar untuk foto ESP32-CAM (biasanya <500KB)

app.post('/cam/upload', (req, res) => {
    const filename = req.headers['x-filename'] || `photo_${Date.now()}.jpg`;
    const filepath = path.join(CAM_UPLOAD_DIR, filename);
    const chunks = [];
    let totalBytes = 0;
    let aborted = false;

    req.on('data', chunk => {
        totalBytes += chunk.length;
        if (totalBytes > CAM_MAX_UPLOAD_BYTES && !aborted) {
            aborted = true;
            console.error(`[cam-upload] Ditolak: ukuran melebihi ${CAM_MAX_UPLOAD_BYTES} bytes`);
            res.status(413).json({ success: false, error: 'File terlalu besar' });
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });

    req.on('end', async () => {
        if (aborted) return;
        const buf = Buffer.concat(chunks);
        const watermarked = await addTimestampWatermark(buf);
        fs.writeFile(filepath, watermarked, err => {
            if (err) {
                console.error('[cam-upload] Error:', err.message);
                return res.status(500).json({ success: false, error: err.message });
            }
            console.log(`[cam-upload] Tersimpan: ${filename} (${watermarked.length} bytes, watermark ✓)`);
            res.json({ success: true, filename });
        });
    });
});

// POST /cam/capture — trigger capture ke ESP32
const ESP32_CAM_IP   = process.env.ESP32_CAM_IP   || '192.168.18.133';
const ESP32_CAM_PORT = process.env.ESP32_CAM_PORT || '80';

app.post('/cam/capture', async (req, res) => {
    try {
        const http = require('http');
        const options = { hostname: ESP32_CAM_IP, port: parseInt(ESP32_CAM_PORT), path: '/capture', method: 'POST', timeout: 10000 };
        const espReq = http.request(options, espRes => {
            let data = '';
            espRes.on('data', chunk => data += chunk);
            espRes.on('end', () => {
                try { res.json(JSON.parse(data)); }
                catch { res.json({ success: true }); }
            });
        });
        espReq.on('error', () => res.status(502).json({ success: false, error: 'ESP32-CAM tidak terjangkau' }));
        espReq.on('timeout', () => { espReq.destroy(); res.status(504).json({ success: false, error: 'Timeout' }); });
        espReq.end();
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /cam/photos — list foto di VPS
app.get('/cam/photos', (req, res) => {
    fs.readdir(CAM_UPLOAD_DIR, (err, files) => {
        if (err) return res.json({ photos: [], count: 0 });
        const photos = files
            .filter(f => f.match(/\.(jpg|jpeg|png)$/i))
            .map(f => {
                const stat = fs.statSync(path.join(CAM_UPLOAD_DIR, f));
                return { name: f, size: stat.size, time: stat.mtimeMs };
            })
            .sort((a, b) => b.time - a.time);
        res.json({ photos, count: photos.length });
    });
});

// GET /cam/photo?file=photo_0001.jpg
app.get('/cam/photo', (req, res) => {
    const filename = req.query.file;
    if (!filename) return res.status(400).send('Parameter file dibutuhkan');
    const filepath = path.join(CAM_UPLOAD_DIR, path.basename(filename));
    if (!fs.existsSync(filepath)) return res.status(404).send('File tidak ditemukan');
    res.setHeader('Content-Type', 'image/jpeg');
    res.sendFile(filepath);
});

// DELETE /cam/delete?file=photo_0001.jpg
app.delete('/cam/delete', (req, res) => {
    const filename = req.query.file;
    if (!filename) return res.status(400).json({ success: false });
    const filepath = path.join(CAM_UPLOAD_DIR, path.basename(filename));
    fs.unlink(filepath, err => {
        if (err) return res.status(404).json({ success: false });
        res.json({ success: true });
    });
});

// GET /cam/status
app.get('/cam/status', (req, res) => {
    fs.readdir(CAM_UPLOAD_DIR, (err, files) => {
        const count = err ? 0 : files.filter(f => f.match(/\.(jpg|jpeg|png)$/i)).length;
        res.json({ status: 'online', photoCount: count, storage: 'vps' });
    });
});

// Database Setup
const db = new sqlite3.Database('./iot_data.db', (err) => {
    if (err) {
        console.error('❌ Error buka database:', err);
    } else {
        console.log('✅ Database connected');
        db.run(`CREATE TABLE IF NOT EXISTS sensor_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            temperature REAL,
            suhu REAL,
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
                // Migrasi: tambah kolom suhu jika belum ada (untuk database lama)
                db.run(`ALTER TABLE sensor_data ADD COLUMN suhu REAL`, (alterErr) => {
                    if (alterErr && !alterErr.message.includes('duplicate column')) {
                        console.error('❌ Error alter table (suhu):', alterErr);
                    } else if (!alterErr) {
                        console.log('✅ Kolom suhu berhasil ditambahkan');
                    }
                });
            }
        });
    }
});

// ===== WHITELIST FIELD PER DEVICE =====
const DEVICE_FIELDS = {
    'esp-main':      ['temperature', 'humidity'],
    'esp-suhu':      ['temp'],
    'esp-tds':       ['tds'],
    'esp-ph':        ['ph', 'alk', 'temp'],
    'esp-gas':       ['adc_raw', 'voltage', 'baseline_v', 'rs_ro_ratio', 'status', 'gas_hint'],
    'esp-turbidity': ['turbidity', 'tss', 'clarity', 'voltage'],
    'esp-pump':      ['pumping'],
};

// Semua kolom yang ada di tabel (selain id, device, timestamp)
const ALL_FIELDS = [
    'temperature', 'suhu', 'humidity', 'tds', 'ph', 'alk', 'temp',
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

        getLatestFromDevice('esp-suhu', (e2, suhuRow) => {
            if (e2) return res.status(500).json({ error: e2.message });

            getLatestFromDevice('esp-tds', (e3, tdsRow) => {
                if (e3) return res.status(500).json({ error: e3.message });

                getLatestFromDevice('esp-ph', (e4, ph) => {
                    if (e4) return res.status(500).json({ error: e4.message });

                    getLatestFromDevice('esp-gas', (e5, gas) => {
                        if (e5) return res.status(500).json({ error: e5.message });

                        getLatestFromDevice('esp-turbidity', (e6, turb) => {
                            if (e6) return res.status(500).json({ error: e6.message });

                            getLatestFromDevice('esp-pump', (e7, pump) => {
                                if (e7) return res.status(500).json({ error: e7.message });

                                const deviceAge = {
                                    'esp-main':      ageSeconds(main),
                                    'esp-suhu':      ageSeconds(suhuRow),
                                    'esp-tds':       ageSeconds(tdsRow),
                                    'esp-ph':        ageSeconds(ph),
                                    'esp-gas':       ageSeconds(gas),
                                    'esp-turbidity': ageSeconds(turb),
                                    'esp-pump':      ageSeconds(pump),
                                };

                                res.json({
                                    temperature: main?.temperature ?? null,
                                    // esp-suhu (DS18B20) mengirim field "temp", bukan "suhu"
                                    suhu:        suhuRow?.temp ?? null,
                                    humidity:    main?.humidity ?? null,
                                    tds:         tdsRow?.tds ?? null,
                                    ph:          ph?.ph ?? null,
                                    alk:         ph?.alk ?? null,
                                    // Suhu air berasal dari esp-suhu (DS18B20), bukan dari esp-ph
                                    temp:        suhuRow?.temp ?? null,

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

                                    timestamp: main?.timestamp ?? suhuRow?.timestamp ?? tdsRow?.timestamp ?? ph?.timestamp ?? gas?.timestamp ?? turb?.timestamp ?? pump?.timestamp ?? null,

                                    device_age: deviceAge,
                                    device_names: {
                                        env:       main      ? 'esp-main'      : null,
                                        suhu:      suhuRow   ? 'esp-suhu'      : null,
                                        tds:       tdsRow    ? 'esp-tds'       : null,
                                        water:     suhuRow   ? 'esp-suhu'      : null,
                                        ph:        ph        ? 'esp-ph'        : null,
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

        db.all(`SELECT temp AS suhu, timestamp FROM sensor_data WHERE device = 'esp-suhu' ORDER BY timestamp DESC LIMIT ?`, [limit], (e2, suhuRows) => {
            if (e2) return res.status(500).json({ error: e2.message });

            db.all(`SELECT tds, timestamp FROM sensor_data WHERE device = 'esp-tds' ORDER BY timestamp DESC LIMIT ?`, [limit], (e3, tdsRows) => {
                if (e3) return res.status(500).json({ error: e3.message });

                db.all(`SELECT ph, alk, temp, timestamp FROM sensor_data WHERE device = 'esp-ph' ORDER BY timestamp DESC LIMIT ?`, [limit], (e4, phRows) => {
                    if (e4) return res.status(500).json({ error: e4.message });

                    db.all(`SELECT adc_raw, voltage, baseline_v, rs_ro_ratio, status, gas_hint, timestamp FROM sensor_data WHERE device = 'esp-gas' ORDER BY timestamp DESC LIMIT ?`, [limit], (e5, gasRows) => {
                        if (e5) return res.status(500).json({ error: e5.message });

                        db.all(`SELECT turbidity, tss, clarity, voltage, timestamp FROM sensor_data WHERE device = 'esp-turbidity' ORDER BY timestamp DESC LIMIT ?`, [limit], (e6, turbRows) => {
                            if (e6) return res.status(500).json({ error: e6.message });

                            db.all(`SELECT pumping, timestamp FROM sensor_data WHERE device = 'esp-pump' ORDER BY timestamp DESC LIMIT ?`, [limit], (e7, pumpRows) => {
                                if (e7) return res.status(500).json({ error: e7.message });

                                res.json({
                                    environment: mainRows,
                                    suhu:        suhuRows,
                                    tds:         tdsRows,
                                    // Suhu air berasal dari esp-suhu (DS18B20), bukan dari esp-ph
                                    water:       suhuRows,
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
});

// 5. Get all data
app.get('/api/all', (req, res) => {
    db.all(`SELECT * FROM sensor_data ORDER BY timestamp DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});


// 7. Export CSV
const CSV_MAX_DAYS = 365;   // batas wajar; cegah query "semua data sejak awal" yang berat
const CSV_BATCH_SIZE = 500; // jumlah baris per batch — cukup kecil supaya tidak numpuk di memori,
                             // cukup besar supaya query tidak dipanggil berlebihan

app.get('/api/export/csv', (req, res) => {
    const device = req.query.device || null;
    const daysRequested = parseInt(req.query.days) || 30;
    const days = Math.min(Math.max(daysRequested, 1), CSV_MAX_DAYS);

    // Keyset pagination (WHERE id > ?) dipakai alih-alih OFFSET.
    // OFFSET di SQLite harus menghitung ulang & melompati N baris dari awal
    // setiap kali dipanggil — makin besar offset-nya, makin lambat. Untuk
    // ratusan ribu baris ini jadi sangat lambat (tiap batch makin lama).
    // Keyset pagination (lanjut dari id terakhir yang sudah dibaca) bisa
    // memakai index PRIMARY KEY langsung, jadi kecepatannya konsisten dari
    // batch pertama sampai terakhir.
    let baseQuery = `SELECT id, device, timestamp, temperature, suhu, humidity, tds, ph, alk, temp,
                        adc_raw, voltage, baseline_v, rs_ro_ratio, status, gas_hint,
                        turbidity, tss, clarity, pumping
                 FROM sensor_data
                 WHERE timestamp >= datetime('now', ?) AND id > ?`;
    const baseParams = [`-${days} days`];

    if (device) {
        baseQuery += ` AND device = ?`;
        baseParams.push(device);
    }
    baseQuery += ` ORDER BY id ASC LIMIT ?`;

    const headers = [
        'id','device','timestamp',
        'temperature','suhu','humidity',
        'tds','ph','alkalinity','water_temp',
        'adc_raw','voltage','baseline_v','rs_ro_ratio','gas_status','gas_hint',
        'turbidity','tss','clarity','pumping'
    ];

    const escape = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    };

    const filename = `sensor_data_${device || 'all'}_${new Date().toISOString().slice(0,10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (daysRequested > CSV_MAX_DAYS) {
        console.log(`[csv] days=${daysRequested} melebihi batas, dipangkas jadi ${CSV_MAX_DAYS}`);
    }

    // Helper: tunggu event 'drain' sebelum lanjut nulis, kalau buffer response penuh.
    // Ini backpressure yang SEBENARNYA berfungsi — sqlite3 package tidak punya
    // db.pause()/db.resume() (itu API dari library database lain seperti mysql),
    // jadi kita kontrol manual di sisi kita: baca 1 batch dari DB, tulis ke
    // response, TUNGGU sampai batch itu benar-benar terkirim baru baca batch
    // berikutnya. Ini mencegah data menumpuk di buffer memori Node.js seperti
    // yang menyebabkan crash 'FatalProcessOutOfMemory' sebelumnya.
    //
    // PENTING: listener 'drain'/'error' dibersihkan (removeListener) setelah
    // dipakai — dipanggil ratusan/ribuan kali per-export, kalau tidak
    // dibersihkan akan memicu MaxListenersExceededWarning dan membebani memori.
    function writeAndWaitDrain(chunk) {
        return new Promise((resolve, reject) => {
            const ok = res.write(chunk, (err) => {
                if (err) reject(err);
            });
            if (ok) {
                resolve();
            } else {
                const onDrain = () => { cleanup(); resolve(); };
                const onError = (err) => { cleanup(); reject(err); };
                const cleanup = () => {
                    res.removeListener('drain', onDrain);
                    res.removeListener('error', onError);
                };
                res.once('drain', onDrain);
                res.once('error', onError);
            }
        });
    }

    function fetchBatch(lastId) {
        return new Promise((resolve, reject) => {
            db.all(baseQuery, [...baseParams, lastId, CSV_BATCH_SIZE], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }

    let rowCount = 0;
    let clientAborted = false;
    req.on('close', () => { clientAborted = true; });

    (async () => {
        try {
            await writeAndWaitDrain(headers.join(',') + '\n');

            let lastId = 0;
            while (!clientAborted) {
                const rows = await fetchBatch(lastId);
                if (rows.length === 0) break;

                let batchText = '';
                for (const r of rows) {
                    batchText += [
                        r.id, r.device, r.timestamp,
                        r.temperature, r.suhu, r.humidity,
                        r.tds, r.ph, r.alk, r.temp,
                        r.adc_raw, r.voltage, r.baseline_v, r.rs_ro_ratio, r.status, r.gas_hint,
                        r.turbidity, r.tss, r.clarity, r.pumping
                    ].map(escape).join(',') + '\n';
                }
                await writeAndWaitDrain(batchText);

                rowCount += rows.length;
                lastId = rows[rows.length - 1].id;

                if (rows.length < CSV_BATCH_SIZE) break; // batch terakhir, sudah habis
            }

            res.end();
            console.log(`[csv] Export ${rowCount} rows (days=${days}${daysRequested > CSV_MAX_DAYS ? `, diminta ${daysRequested}` : ''}) → ${filename}${clientAborted ? ' [klien putus di tengah]' : ''}`);
        } catch (err) {
            console.error('❌ Error export CSV:', err.message);
            if (!res.headersSent) {
                res.status(500).json({ error: err.message });
            } else {
                res.end();
            }
        }
    })();
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


// 8. Count rows
app.get('/api/db/count', (req, res) => {
    db.get('SELECT COUNT(*) as count FROM sensor_data', (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ count: row.count });
    });
});

// 9. Clear database
app.delete('/api/db/clear', (req, res) => {
    db.run('DELETE FROM sensor_data', function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        db.run('VACUUM', () => {
            console.log(`[db] Cleared ${this.changes} rows`);
            res.json({ success: true, deleted: this.changes });
        });
    });
});

// Server Info
// Serve React app for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
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

app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ===== SERVER STARTED =====');
    console.log(`📍 Local:   http://localhost:${PORT}`);
    console.log(`📍 Network: http://${getLocalIP()}:${PORT}`);
    console.log(`📡 ESP Endpoint: http://${getLocalIP()}:${PORT}/data`);
    console.log(`🔍 Debug:   http://${getLocalIP()}:${PORT}/api/debug`);
    console.log('============================\n');
});