import React, { useState, useEffect } from 'react';
import { Thermometer, Droplets, Activity, Beaker, FlaskConical, Waves, Wind, Eye, Zap } from 'lucide-react';

const MAX_POINTS = 60;
const AGE_DELAYED = 60;
const AGE_OFFLINE = 120;
const PUMP_AGE_OFFLINE = 20;

function ECGChart({ data, color, label, unit, min, max }) {
    const width = 600, height = 120;
    const padLeft = 40, padRight = 10, padTop = 10, padBottom = 10;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    const toY = (val) => {
        const range = max - min || 1;
        return padTop + chartH - ((val - min) / range) * chartH;
    };

    const filledData = Array(MAX_POINTS).fill(null).map((_, i) => {
        const offset = MAX_POINTS - data.length;
        return i >= offset ? data[i - offset] : null;
    });

    const validPoints = filledData
        .map((val, i) => val !== null ? { x: padLeft + (i / (MAX_POINTS - 1)) * chartW, y: toY(val) } : null)
        .filter(Boolean);

    const polylinePoints = validPoints.map(p => `${p.x},${p.y}`).join(' ');
    const areaPoints = validPoints.length > 1
        ? `${validPoints[0].x},${padTop + chartH} ${polylinePoints} ${validPoints[validPoints.length - 1].x},${padTop + chartH}`
        : '';

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(t => ({
        y: padTop + chartH * (1 - t),
        val: min + t * (max - min),
    }));

    const last = validPoints[validPoints.length - 1];

    return (
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            {gridLines.map(({ y, val }, i) => (
                <g key={i}>
                    <line x1={padLeft} y1={y} x2={width - padRight} y2={y}
                        stroke={color} strokeOpacity="0.12" strokeWidth="1"
                        strokeDasharray={i === 2 ? "0" : "4 4"} />
                    <text x={padLeft - 4} y={y + 4} textAnchor="end"
                        fontSize="9" fill={color} fillOpacity="0.5" fontFamily="monospace">
                        {val.toFixed(0)}
                    </text>
                </g>
            ))}
            {areaPoints && <polygon points={areaPoints} fill={color} fillOpacity="0.07" />}
            {polylinePoints && <polyline points={polylinePoints} fill="none" stroke={color} strokeWidth="5" strokeOpacity="0.12" strokeLinecap="round" strokeLinejoin="round" />}
            {polylinePoints && <polyline points={polylinePoints} fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.9" strokeLinecap="round" strokeLinejoin="round" />}
            {last && (
                <>
                    <circle cx={last.x} cy={last.y} r="5" fill={color} fillOpacity="0.25" />
                    <circle cx={last.x} cy={last.y} r="2.5" fill={color} />
                </>
            )}
        </svg>
    );
}

// Pump status bar chart — shows last N pumping states as colored bars
function PumpChart({ data, color }) {
    const width = 600, height = 60;
    const padLeft = 40, padRight = 10, padTop = 8, padBottom = 8;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    const filledData = Array(MAX_POINTS).fill(null).map((_, i) => {
        const offset = MAX_POINTS - data.length;
        return i >= offset ? data[i - offset] : null;
    });

    const barW = chartW / MAX_POINTS;

    return (
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            <text x={padLeft - 4} y={padTop + chartH / 2 + 4} textAnchor="end"
                fontSize="8" fill={color} fillOpacity="0.4" fontFamily="monospace">ON</text>
            <text x={padLeft - 4} y={padTop + chartH + 4} textAnchor="end"
                fontSize="8" fill={color} fillOpacity="0.4" fontFamily="monospace">OFF</text>
            {filledData.map((val, i) => {
                if (val === null) return null;
                const x = padLeft + i * barW;
                const isOn = val === 1;
                return (
                    <rect
                        key={i}
                        x={x + 0.5}
                        y={isOn ? padTop : padTop + chartH * 0.6}
                        width={Math.max(barW - 1, 1)}
                        height={isOn ? chartH : chartH * 0.4}
                        fill={isOn ? color : 'rgba(255,255,255,0.08)'}
                        fillOpacity={isOn ? 0.85 : 1}
                        rx="1"
                    />
                );
            })}
        </svg>
    );
}

function gasStatusStyle(status) {
    if (!status) return { color: 'rgba(255,255,255,0.3)', border: 'rgba(255,255,255,0.15)', bg: 'transparent' };
    const s = status.toUpperCase();
    if (s === 'NORMAL')  return { color: '#00ff82', border: 'rgba(0,255,130,0.3)',   bg: 'rgba(0,255,130,0.07)'  };
    if (s === 'WARNING') return { color: '#ffcc00', border: 'rgba(255,200,0,0.35)',  bg: 'rgba(255,200,0,0.07)'  };
    if (s === 'DANGER')  return { color: '#ff4444', border: 'rgba(255,68,68,0.4)',   bg: 'rgba(255,68,68,0.08)'  };
    return { color: '#aaaaaa', border: 'rgba(170,170,170,0.2)', bg: 'transparent' };
}

function turbidityStatusStyle(ntu) {
    if (ntu === null) return { color: 'rgba(255,255,255,0.3)', border: 'rgba(255,255,255,0.15)', bg: 'transparent', label: 'NO DATA' };
    if (ntu <= 1)  return { color: '#00ff82', border: 'rgba(0,255,130,0.3)',   bg: 'rgba(0,255,130,0.07)',   label: 'SANGAT JERNIH' };
    if (ntu <= 4)  return { color: '#00e5b0', border: 'rgba(0,229,176,0.3)',   bg: 'rgba(0,229,176,0.07)',   label: 'JERNIH'        };
    if (ntu <= 25) return { color: '#ffcc00', border: 'rgba(255,200,0,0.35)',  bg: 'rgba(255,200,0,0.07)',   label: 'AGAK KERUH'    };
    if (ntu <= 50) return { color: '#ff8c00', border: 'rgba(255,140,0,0.4)',   bg: 'rgba(255,140,0,0.08)',   label: 'KERUH'         };
    return           { color: '#ff4444', border: 'rgba(255,68,68,0.4)',   bg: 'rgba(255,68,68,0.08)',   label: 'SANGAT KERUH'  };
}

function EspBadge({ label, ageSeconds }) {
    let color, text;
    if (ageSeconds === null)              { color = '#555';    text = 'NO DATA'; }
    else if (ageSeconds < AGE_DELAYED)    { color = '#00ff82'; text = `${ageSeconds}s`; }
    else if (ageSeconds < AGE_OFFLINE)    { color = '#ffcc00'; text = `${ageSeconds}s`; }
    else                                  { color = '#ff4444'; text = 'OFFLINE';  }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: color, boxShadow: `0 0 6px ${color}`,
                animation: ageSeconds !== null && ageSeconds < AGE_DELAYED ? 'pulse 1.4s infinite' : 'none',
            }} />
            <span style={{ fontSize: '0.6rem', color, letterSpacing: '0.1em' }}>{label} · {text}</span>
        </div>
    );
}

export default function IoTDashboard() {
    const [latestData, setLatestData]             = useState(null);
    const [history, setHistory]                   = useState([]);
    const [connected, setConnected]               = useState(false);
    const [deviceAge, setDeviceAge]               = useState({});
    const [deviceNames, setDeviceNames]           = useState({ env: null, tds: null, water: null, gas: null, turbidity: null, pump: null });

    const [tempHistory, setTempHistory]           = useState([]);
    const [humidHistory, setHumidHistory]         = useState([]);
    const [tdsHistory, setTdsHistory]             = useState([]);
    const [phHistory, setPhHistory]               = useState([]);
    const [waterTempHistory, setWaterTempHistory] = useState([]);
    const [gasData, setGasData]                   = useState(null);
    const [rsRoHistory, setRsRoHistory]           = useState([]);
    const [turbidityData, setTurbidityData]       = useState(null);
    const [ntuHistory, setNtuHistory]             = useState([]);
    const [clarityHistory, setClarityHistory]     = useState([]);
    const [pumpHistory, setPumpHistory]           = useState([]);
    const [pumpStatus, setPumpStatus]             = useState(null); // null | 0 | 1

    // ── Tab & Camera ──
    const [activeTab, setActiveTab]               = useState('sensor');
    const [camPhotos, setCamPhotos]               = useState([]);
    const [camPreviewUrl, setCamPreviewUrl]       = useState(null);
    const [camPreviewFile, setCamPreviewFile]     = useState('');
    const [camPreviewTimer, setCamPreviewTimer]   = useState(null);
    const [camPreviewInterval, setCamPreviewInterval] = useState(5000);
    const [camAutoCapture, setCamAutoCapture]     = useState(false);
    const [camAutoCaptureTimer, setCamAutoCaptureTimer] = useState(null);
    const [camCapturing, setCamCapturing]         = useState(false);
    const [camFetching, setCamFetching]           = useState(false);
    const [camSelected, setCamSelected]           = useState(new Set());
    const [camSelectMode, setCamSelectMode]       = useState(false);
    const [camLightbox, setCamLightbox]           = useState(null);
    const [camToast, setCamToast]                 = useState(null);
    const camToastTimer                           = React.useRef(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch("http://localhost:3000/api/latest");
                const data = await res.json();

                if (data) {
                    const newData = {
                        temperature: data.temperature != null ? parseFloat(Number(data.temperature).toFixed(1)) : null,
                        humidity:    data.humidity    != null ? parseFloat(Number(data.humidity).toFixed(1))    : null,
                        tds:         data.tds         != null ? parseFloat(Number(data.tds).toFixed(1))         : null,
                        ph:          data.ph          != null ? parseFloat(Number(data.ph).toFixed(2))          : null,
                        alkalinity:  data.alk         != null ? parseFloat(Number(data.alk).toFixed(0))         : null,
                        waterTemp:   data.temp        != null ? parseFloat(Number(data.temp).toFixed(1))        : null,
                        turbidity:   data.turbidity?.turbidity != null ? parseFloat(Number(data.turbidity.turbidity).toFixed(2)) : null,
                        tss:         data.turbidity?.tss       != null ? parseFloat(Number(data.turbidity.tss).toFixed(2))       : null,
                        clarity:     data.turbidity?.clarity   != null ? parseFloat(Number(data.turbidity.clarity).toFixed(1))   : null,
                        pumping:     data.pumping != null ? Number(data.pumping) : null,
                        timestamp:   data.timestamp ? new Date(data.timestamp).toLocaleTimeString('id-ID') : '--',
                    };

                    setLatestData(newData);
                    setConnected(true);
                    setDeviceAge(data.device_age ?? {});
                    if (data.device_names) setDeviceNames(data.device_names);
                    setHistory(prev => [...prev, newData].slice(-10));

                    if (newData.temperature != null) setTempHistory(prev  => [...prev,  newData.temperature].slice(-MAX_POINTS));
                    if (newData.humidity    != null) setHumidHistory(prev => [...prev,  newData.humidity].slice(-MAX_POINTS));
                    if (newData.tds         != null) setTdsHistory(prev   => [...prev,  newData.tds].slice(-MAX_POINTS));
                    if (newData.ph          != null) setPhHistory(prev    => [...prev,  newData.ph].slice(-MAX_POINTS));
                    if (newData.waterTemp   != null) setWaterTempHistory(prev => [...prev, newData.waterTemp].slice(-MAX_POINTS));
                    if (newData.turbidity   != null) setNtuHistory(prev   => [...prev,  newData.turbidity].slice(-MAX_POINTS));
                    if (newData.clarity     != null) setClarityHistory(prev => [...prev, newData.clarity].slice(-MAX_POINTS));
                    if (newData.pumping     != null) {
                        setPumpStatus(newData.pumping);
                        setPumpHistory(prev => [...prev, newData.pumping].slice(-MAX_POINTS));
                    }

                    if (data.gas) {
                        setGasData(data.gas);
                        if (data.gas.rs_ro_ratio != null)
                            setRsRoHistory(prev => [...prev, parseFloat(Number(data.gas.rs_ro_ratio).toFixed(3))].slice(-MAX_POINTS));
                    }

                    if (data.turbidity) setTurbidityData(data.turbidity);
                }
            } catch (err) {
                setConnected(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    // ── Camera helpers ──
    const camApi = (path, opts) => fetch('http://localhost:3000/cam' + path, opts);

    const showCamToast = (msg, type = 'success') => {
        clearTimeout(camToastTimer.current);
        setCamToast({ msg, type });
        camToastTimer.current = setTimeout(() => setCamToast(null), 3000);
    };

    const loadCamPhotos = async () => {
        try {
            const data = await camApi('/photos', { signal: AbortSignal.timeout(6000) }).then(r => r.json());
            const photos = (data.photos || []).map(p => ({
                ...p,
                name: p.name.replace('/sdcard','').replace('/photos/',''),
                path: '/photos/' + p.name.replace('/sdcard','').replace('/photos/',''),
            })).sort((a, b) => b.name.localeCompare(a.name));
            setCamPhotos(photos);
        } catch {}
    };

    const camCapture = async () => {
        setCamCapturing(true);
        try {
            const data = await camApi('/capture', { method: 'POST', signal: AbortSignal.timeout(15000) }).then(r => r.json());
            if (data.success) {
                showCamToast('✓ Foto disimpan: ' + data.filename.split('/').pop());
                loadCamPhotos();
            } else {
                showCamToast(data.error || 'Gagal capture', 'error');
            }
        } catch { showCamToast('Timeout — ESP32 tidak response', 'error'); }
        finally { setCamCapturing(false); }
    };

    const fetchLatestPreview = async () => {
        if (camFetching) return;
        setCamFetching(true);
        try {
            const data = await camApi('/photos', { signal: AbortSignal.timeout(5000) }).then(r => r.json());
            const photos = (data.photos || []).sort((a, b) => b.name.localeCompare(a.name));
            if (!photos.length) { setCamFetching(false); return; }
            const latest = photos[0];
            const path = '/photos/' + latest.name.replace('/sdcard','').replace('/photos/','');
            const url = 'http://localhost:3000/cam/photo?file=' + encodeURIComponent(path) + '&t=' + Date.now();
            setCamPreviewUrl(url);
            setCamPreviewFile(latest.name.replace('/sdcard','').replace('/photos/',''));
        } catch {}
        setCamFetching(false);
    };

    const startCamPreview = () => {
        fetchLatestPreview();
        const t = setInterval(fetchLatestPreview, camPreviewInterval);
        setCamPreviewTimer(t);
    };

    const stopCamPreview = () => {
        clearInterval(camPreviewTimer);
        setCamPreviewTimer(null);
    };

    const toggleAutoCapture = (on) => {
        setCamAutoCapture(on);
        if (on) {
            camCapture();
            const t = setInterval(() => { camCapture(); fetchLatestPreview(); }, camPreviewInterval);
            setCamAutoCaptureTimer(t);
            if (!camPreviewTimer) startCamPreview();
        } else {
            clearInterval(camAutoCaptureTimer);
            setCamAutoCaptureTimer(null);
        }
    };

    const changePreviewInterval = (val) => {
        setCamPreviewInterval(val);
        if (camPreviewTimer) { clearInterval(camPreviewTimer); setCamPreviewTimer(setInterval(fetchLatestPreview, val)); }
        if (camAutoCaptureTimer) { clearInterval(camAutoCaptureTimer); setCamAutoCaptureTimer(setInterval(() => { camCapture(); fetchLatestPreview(); }, val)); }
    };

    const toggleCamSelect = (name) => {
        setCamSelected(prev => {
            const next = new Set(prev);
            next.has(name) ? next.delete(name) : next.add(name);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (camSelected.size === camPhotos.length) setCamSelected(new Set());
        else setCamSelected(new Set(camPhotos.map(p => p.name)));
    };

    const bulkDelete = async () => {
        if (!camSelected.size) return;
        if (!window.confirm(`Hapus ${camSelected.size} foto?`)) return;
        let ok = 0;
        for (const name of camSelected) {
            const photo = camPhotos.find(p => p.name === name);
            if (!photo) continue;
            try {
                const data = await camApi('/delete?file=' + encodeURIComponent(photo.path), { method: 'DELETE', signal: AbortSignal.timeout(5000) }).then(r => r.json());
                if (data.success) ok++;
            } catch {}
        }
        showCamToast(`Dihapus: ${ok} foto`);
        setCamSelected(new Set());
        setCamSelectMode(false);
        loadCamPhotos();
    };

    const bulkDownload = async () => {
        if (!camSelected.size) return;
        const JSZip = (await import('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js')).default;
        const zip = new JSZip();
        const folder = zip.folder('photos');
        let done = 0;
        for (const name of camSelected) {
            const photo = camPhotos.find(p => p.name === name);
            if (!photo) continue;
            try {
                const res = await fetch('/cam/photo?file=' + encodeURIComponent(photo.path));
                const blob = await res.blob();
                folder.file(name, blob);
                done++;
            } catch {}
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(zipBlob);
        a.download = `photos_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
        showCamToast(`✓ ZIP ${done} foto siap`);
    };

    const tempMin      = tempHistory.length      > 0 ? Math.floor(Math.min(...tempHistory) - 2)      : 20;
    const tempMax      = tempHistory.length      > 0 ? Math.ceil(Math.max(...tempHistory) + 2)        : 40;
    const humidMin     = humidHistory.length     > 0 ? Math.floor(Math.min(...humidHistory) - 5)     : 30;
    const humidMax     = humidHistory.length     > 0 ? Math.ceil(Math.max(...humidHistory) + 5)       : 90;
    const tdsMin       = tdsHistory.length       > 0 ? Math.floor(Math.min(...tdsHistory) - 20)      : 0;
    const tdsMax       = tdsHistory.length       > 0 ? Math.ceil(Math.max(...tdsHistory) + 20)        : 500;
    const phMin        = phHistory.length        > 0 ? Math.max(0, parseFloat((Math.min(...phHistory) - 0.5).toFixed(1))) : 0;
    const phMax        = phHistory.length        > 0 ? Math.min(14, parseFloat((Math.max(...phHistory) + 0.5).toFixed(1))) : 14;
    const waterTempMin = waterTempHistory.length > 0 ? Math.floor(Math.min(...waterTempHistory) - 2) : 20;
    const waterTempMax = waterTempHistory.length > 0 ? Math.ceil(Math.max(...waterTempHistory) + 2)   : 40;
    const rsRoMin      = rsRoHistory.length      > 0 ? Math.max(0, parseFloat((Math.min(...rsRoHistory) - 0.2).toFixed(2))) : 0;
    const rsRoMax      = rsRoHistory.length      > 0 ? parseFloat((Math.max(...rsRoHistory) + 0.2).toFixed(2))              : 5;
    const ntuMin       = ntuHistory.length       > 0 ? Math.max(0, Math.floor(Math.min(...ntuHistory) - 2)) : 0;
    const ntuMax       = ntuHistory.length       > 0 ? Math.ceil(Math.max(...ntuHistory) + 2)               : 100;

    const gasStyle  = gasStatusStyle(gasData?.status);
    const turbStyle = turbidityStatusStyle(latestData?.turbidity ?? null);

    // Pump ON/OFF ditentukan dari device_age, bukan dari nilai pumping field.
    // ESP hanya kirim 1 selama hidup; jika tidak kirim data > PUMP_AGE_OFFLINE detik = OFF.
    const pumpAge        = deviceNames.pump ? (deviceAge[deviceNames.pump] ?? null) : null;
    const pumpNoData     = pumpAge === null;
    const pumpOn         = !pumpNoData && pumpAge < PUMP_AGE_OFFLINE;
    const pumpColor      = pumpNoData ? '#555' : pumpOn ? '#00ff82' : '#ff4444';
    const pumpLabel      = pumpNoData ? 'NO DATA' : pumpOn ? 'ON' : 'OFF';
    const pumpBorderColor = pumpNoData
        ? 'rgba(255,255,255,0.1)'
        : pumpOn ? 'rgba(0,255,130,0.25)'
                 : 'rgba(255,68,68,0.25)';
    const pumpBg = pumpNoData
        ? 'rgba(255,255,255,0.02)'
        : pumpOn ? 'rgba(0,255,130,0.04)'
                 : 'rgba(255,68,68,0.04)';

    const staleTag = (
        <span style={{ fontSize: '0.55rem', padding: '2px 6px', borderRadius: 3, border: '1px solid rgba(255,68,68,0.4)', color: '#ff4444', letterSpacing: '0.1em' }}>STALE</span>
    );

    return (
        <div style={{ minHeight: '100vh', background: '#050e0b', color: '#d0ffe8', fontFamily: '"Courier New", monospace' }}>
            <style>{`
                @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
                @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.15} }
                @keyframes pumpglow { 0%,100%{box-shadow:0 0 12px #00ff82,0 0 24px rgba(0,255,130,0.3)} 50%{box-shadow:0 0 4px #00ff82} }
            `}</style>

            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 28px', borderBottom: '1px solid rgba(0,255,130,0.12)',
                background: 'rgba(0,15,10,0.95)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Activity size={20} color="#00ff82" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#00ff82' }}>
                        ESP8266 · IoT Monitor
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                        <EspBadge label={deviceNames.env       ?? 'env'}       ageSeconds={deviceNames.env       ? (deviceAge[deviceNames.env]       ?? null) : null} />
                        <EspBadge label={deviceNames.tds       ?? 'tds'}       ageSeconds={deviceNames.tds       ? (deviceAge[deviceNames.tds]       ?? null) : null} />
                        <EspBadge label={deviceNames.water     ?? 'water'}     ageSeconds={deviceNames.water     ? (deviceAge[deviceNames.water]     ?? null) : null} />
                        <EspBadge label={deviceNames.gas       ?? 'gas'}       ageSeconds={deviceNames.gas       ? (deviceAge[deviceNames.gas]       ?? null) : null} />
                        <EspBadge label={deviceNames.turbidity ?? 'turbidity'} ageSeconds={deviceNames.turbidity ? (deviceAge[deviceNames.turbidity] ?? null) : null} />
                        <EspBadge label={deviceNames.pump      ?? 'pump'}      ageSeconds={deviceNames.pump      ? (deviceAge[deviceNames.pump]      ?? null) : null} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.7rem', letterSpacing: '0.15em' }}>
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: connected ? '#00ff82' : '#ff4444',
                            boxShadow: connected ? '0 0 8px #00ff82' : '0 0 8px #ff4444',
                            animation: 'pulse 1.4s infinite',
                        }} />
                        <span style={{ color: connected ? '#00ff82' : '#ff4444' }}>
                            {connected ? 'SERVER OK' : 'DISCONNECTED'}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── TAB NAV ── */}
            <div style={{ display: 'flex', gap: 4, padding: '10px 28px 0', borderBottom: '1px solid rgba(0,255,130,0.1)', background: 'rgba(0,15,10,0.95)' }}>
                {[['sensor', '📡 Sensor'], ['camera', '📷 Camera']].map(([id, label]) => (
                    <button key={id} onClick={() => { setActiveTab(id); if (id === 'camera') loadCamPhotos(); }}
                        style={{
                            padding: '8px 20px', border: 'none', cursor: 'pointer',
                            fontSize: '0.7rem', letterSpacing: '0.15em', fontFamily: '"Courier New", monospace',
                            background: activeTab === id ? 'rgba(0,255,130,0.08)' : 'transparent',
                            color: activeTab === id ? '#00ff82' : 'rgba(0,255,130,0.35)',
                            borderBottom: activeTab === id ? '2px solid #00ff82' : '2px solid transparent',
                            transition: 'all .15s',
                        }}>{label}</button>
                ))}
            </div>

            {/* ── SENSOR TAB ── */}
            {activeTab === 'sensor' && <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Suhu Ruang */}
                <div style={{ background: 'rgba(255,90,30,0.04)', border: '1px solid rgba(255,90,30,0.2)', borderRadius: 8, padding: '16px 16px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Thermometer size={16} color="#ff6b35" />
                            <span style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: '#ff6b35', textTransform: 'uppercase' }}>Suhu Ruang</span>
                            {deviceNames.env && deviceAge[deviceNames.env] >= AGE_OFFLINE && staleTag}
                        </div>
                        <span style={{ fontSize: '2rem', fontWeight: 700, color: '#ff6b35', fontFamily: 'monospace' }}>
                            {latestData?.temperature ?? '--'}<span style={{ fontSize: '0.9rem', opacity: 0.6 }}>°C</span>
                        </span>
                    </div>
                    {tempHistory.length === 0
                        ? <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,107,53,0.3)', fontSize: '0.7rem', letterSpacing: '0.2em' }}>MENUNGGU DATA...</div>
                        : <ECGChart data={tempHistory} color="#ff6b35" label="SUHU RUANG" unit="°C" min={tempMin} max={tempMax} />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'rgba(255,107,53,0.3)', marginTop: 4, letterSpacing: '0.1em' }}>
                        <span>← {MAX_POINTS} pembacaan terakhir</span>
                        <span>min {tempMin}° · max {tempMax}°</span>
                    </div>
                </div>

                {/* Humidity */}
                <div style={{ background: 'rgba(0,180,255,0.04)', border: '1px solid rgba(0,180,255,0.2)', borderRadius: 8, padding: '16px 16px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Droplets size={16} color="#00b4ff" />
                            <span style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: '#00b4ff', textTransform: 'uppercase' }}>Humidity</span>
                            {deviceNames.env && deviceAge[deviceNames.env] >= AGE_OFFLINE && staleTag}
                        </div>
                        <span style={{ fontSize: '2rem', fontWeight: 700, color: '#00b4ff', fontFamily: 'monospace' }}>
                            {latestData?.humidity ?? '--'}<span style={{ fontSize: '0.9rem', opacity: 0.6 }}>%</span>
                        </span>
                    </div>
                    {humidHistory.length === 0
                        ? <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,180,255,0.3)', fontSize: '0.7rem', letterSpacing: '0.2em' }}>MENUNGGU DATA...</div>
                        : <ECGChart data={humidHistory} color="#00b4ff" label="HUMIDITY" unit="%" min={humidMin} max={humidMax} />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'rgba(0,180,255,0.3)', marginTop: 4, letterSpacing: '0.1em' }}>
                        <span>← {MAX_POINTS} pembacaan terakhir</span>
                        <span>min {humidMin}% · max {humidMax}%</span>
                    </div>
                </div>

                {/* TDS */}
                <div style={{ background: 'rgba(160,80,255,0.04)', border: '1px solid rgba(160,80,255,0.2)', borderRadius: 8, padding: '16px 16px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Beaker size={16} color="#a050ff" />
                            <span style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: '#a050ff', textTransform: 'uppercase' }}>TDS</span>
                            {deviceNames.tds && deviceAge[deviceNames.tds] >= AGE_OFFLINE && staleTag}
                        </div>
                        <span style={{ fontSize: '2rem', fontWeight: 700, color: '#a050ff', fontFamily: 'monospace' }}>
                            {latestData?.tds ?? '--'}<span style={{ fontSize: '0.9rem', opacity: 0.6 }}>ppm</span>
                        </span>
                    </div>
                    {tdsHistory.length === 0
                        ? <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(160,80,255,0.3)', fontSize: '0.7rem', letterSpacing: '0.2em' }}>MENUNGGU DATA...</div>
                        : <ECGChart data={tdsHistory} color="#a050ff" label="TDS" unit="ppm" min={tdsMin} max={tdsMax} />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'rgba(160,80,255,0.3)', marginTop: 4, letterSpacing: '0.1em' }}>
                        <span>← {MAX_POINTS} pembacaan terakhir</span>
                        <span>min {tdsMin} ppm · max {tdsMax} ppm</span>
                    </div>
                </div>

                {/* pH */}
                <div style={{ background: 'rgba(0,229,176,0.04)', border: '1px solid rgba(0,229,176,0.2)', borderRadius: 8, padding: '16px 16px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FlaskConical size={16} color="#00e5b0" />
                            <span style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: '#00e5b0', textTransform: 'uppercase' }}>pH</span>
                            {deviceNames.water && deviceAge[deviceNames.water] >= AGE_OFFLINE && staleTag}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
                            <span style={{ fontSize: '2rem', fontWeight: 700, color: '#00e5b0', fontFamily: 'monospace' }}>{latestData?.ph ?? '--'}</span>
                            {latestData?.alkalinity != null && (
                                <span style={{ fontSize: '0.7rem', color: 'rgba(0,229,176,0.5)', letterSpacing: '0.1em' }}>Alk: {latestData.alkalinity} mg/L</span>
                            )}
                        </div>
                    </div>
                    {phHistory.length === 0
                        ? <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,229,176,0.3)', fontSize: '0.7rem', letterSpacing: '0.2em' }}>MENUNGGU DATA...</div>
                        : <ECGChart data={phHistory} color="#00e5b0" label="PH" unit="" min={phMin} max={phMax} />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'rgba(0,229,176,0.3)', marginTop: 4, letterSpacing: '0.1em' }}>
                        <span>← {MAX_POINTS} pembacaan terakhir</span>
                        <span>min {phMin} · max {phMax}</span>
                    </div>
                </div>

                {/* Suhu Air */}
                <div style={{ background: 'rgba(255,200,0,0.04)', border: '1px solid rgba(255,200,0,0.2)', borderRadius: 8, padding: '16px 16px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Waves size={16} color="#ffc800" />
                            <span style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: '#ffc800', textTransform: 'uppercase' }}>Suhu Air</span>
                            {deviceNames.water && deviceAge[deviceNames.water] >= AGE_OFFLINE && staleTag}
                        </div>
                        <span style={{ fontSize: '2rem', fontWeight: 700, color: '#ffc800', fontFamily: 'monospace' }}>
                            {latestData?.waterTemp ?? '--'}<span style={{ fontSize: '0.9rem', opacity: 0.6 }}>°C</span>
                        </span>
                    </div>
                    {waterTempHistory.length === 0
                        ? <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,200,0,0.3)', fontSize: '0.7rem', letterSpacing: '0.2em' }}>MENUNGGU DATA...</div>
                        : <ECGChart data={waterTempHistory} color="#ffc800" label="SUHU AIR" unit="°C" min={waterTempMin} max={waterTempMax} />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'rgba(255,200,0,0.3)', marginTop: 4, letterSpacing: '0.1em' }}>
                        <span>← {MAX_POINTS} pembacaan terakhir</span>
                        <span>min {waterTempMin}° · max {waterTempMax}°</span>
                    </div>
                </div>

                {/* Pump Status */}
                <div style={{
                    background: pumpBg,
                    border: `1px solid ${pumpBorderColor}`,
                    borderRadius: 8, padding: '16px 16px 10px',
                    transition: 'border 0.4s, background 0.4s',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Zap size={16} color={pumpColor} />
                            <span style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: pumpColor, textTransform: 'uppercase' }}>
                                esp-pump · Pompa Air
                            </span>
                            {deviceNames.pump && deviceAge[deviceNames.pump] >= AGE_OFFLINE && staleTag}
                        </div>
                        {/* Big status badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: pumpColor,
                                boxShadow: pumpOn ? `0 0 12px ${pumpColor}, 0 0 24px rgba(0,255,130,0.3)` : 'none',
                                animation: pumpOn ? 'pulse 1s infinite' : 'none',
                            }} />
                            <span style={{
                                fontSize: '1.8rem', fontWeight: 700,
                                color: pumpColor, fontFamily: 'monospace',
                                letterSpacing: '0.1em',
                            }}>
                                {pumpLabel}
                            </span>
                        </div>
                    </div>

                    {/* Stats row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                        {[
                            { label: 'Status',    value: pumpLabel,                                              unit: '' },
                            { label: 'Last Seen', value: pumpAge != null ? `${pumpAge}` : '--',                  unit: 's ago' },
                            { label: 'Timeout',   value: `${PUMP_AGE_OFFLINE}`,                                  unit: 's' },
                        ].map(({ label, value, unit }) => (
                            <div key={label} style={{
                                background: `rgba(${pumpOn ? '0,255,130' : pumpNoData ? '100,100,100' : '255,68,68'},0.05)`,
                                border: `1px solid ${pumpBorderColor}`,
                                borderRadius: 6, padding: '10px 14px',
                            }}>
                                <div style={{ fontSize: '0.55rem', color: `${pumpColor}88`, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: pumpColor, fontFamily: 'monospace', lineHeight: 1 }}>
                                    {value}<span style={{ fontSize: '0.75rem', opacity: 0.55, marginLeft: 2 }}>{unit}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Bar timeline */}
                    <div style={{ fontSize: '0.55rem', color: `${pumpColor}66`, letterSpacing: '0.15em', marginBottom: 4 }}>
                        PUMP TIMELINE · hijau=ON · abu=OFF
                    </div>
                    {pumpHistory.length === 0
                        ? <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: `${pumpColor}44`, fontSize: '0.7rem', letterSpacing: '0.2em' }}>MENUNGGU DATA...</div>
                        : <PumpChart data={pumpHistory} color="#00ff82" />
                    }
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: `${pumpColor}44`, marginTop: 4, letterSpacing: '0.1em' }}>
                        <span>← {MAX_POINTS} pembacaan terakhir</span>
                        <span>0 = OFF · 1 = ON</span>
                    </div>
                </div>

                {/* Turbiditas */}
                <div style={{
                    background: latestData?.turbidity > 50 ? 'rgba(255,68,68,0.06)' :
                        latestData?.turbidity > 25 ? 'rgba(255,140,0,0.05)' : 'rgba(0,200,255,0.04)',
                    border: `1px solid ${turbStyle.border}`,
                    borderRadius: 8, padding: '16px 16px 10px',
                    transition: 'border 0.4s, background 0.4s',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Eye size={16} color="#00c8ff" />
                            <span style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: '#00c8ff', textTransform: 'uppercase' }}>SEN0175 · Turbiditas</span>
                            {deviceNames.turbidity && deviceAge[deviceNames.turbidity] >= AGE_OFFLINE && staleTag}
                        </div>
                        <span style={{
                            fontSize: '0.65rem', padding: '3px 10px', borderRadius: 3,
                            letterSpacing: '0.15em', fontWeight: 700,
                            color: turbStyle.color, border: `1px solid ${turbStyle.border}`, background: turbStyle.bg,
                            animation: latestData?.turbidity > 50 ? 'blink 0.8s infinite' : 'none',
                        }}>
                            {turbStyle.label}
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
                        {[
                            { label: 'Turbidity', value: latestData?.turbidity != null ? latestData.turbidity : '--', unit: 'NTU' },
                            { label: 'TSS',       value: latestData?.tss       != null ? latestData.tss       : '--', unit: 'mg/L' },
                            { label: 'Clarity',   value: latestData?.clarity   != null ? latestData.clarity   : '--', unit: '%' },
                            { label: 'Voltage',   value: turbidityData?.voltage != null ? Number(turbidityData.voltage).toFixed(3) : '--', unit: 'V' },
                        ].map(({ label, value, unit }) => (
                            <div key={label} style={{ background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.12)', borderRadius: 6, padding: '10px 14px' }}>
                                <div style={{ fontSize: '0.55rem', color: 'rgba(0,200,255,0.45)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#00c8ff', fontFamily: 'monospace', lineHeight: 1 }}>
                                    {value}<span style={{ fontSize: '0.75rem', opacity: 0.55, marginLeft: 2 }}>{unit}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ fontSize: '0.55rem', color: 'rgba(0,200,255,0.35)', letterSpacing: '0.15em', marginBottom: 4 }}>TURBIDITY (NTU)</div>
                    {ntuHistory.length === 0
                        ? <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,200,255,0.25)', fontSize: '0.7rem', letterSpacing: '0.2em' }}>MENUNGGU DATA...</div>
                        : <ECGChart data={ntuHistory} color="#00c8ff" label="NTU" unit="NTU" min={ntuMin} max={ntuMax} />}

                    <div style={{ fontSize: '0.55rem', color: 'rgba(0,255,130,0.35)', letterSpacing: '0.15em', margin: '10px 0 4px' }}>CLARITY (%)</div>
                    {clarityHistory.length === 0
                        ? <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,255,130,0.25)', fontSize: '0.7rem', letterSpacing: '0.2em' }}>MENUNGGU DATA...</div>
                        : <ECGChart data={clarityHistory} color="#00ff82" label="CLARITY" unit="%" min={0} max={100} />}

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'rgba(0,200,255,0.3)', marginTop: 4, letterSpacing: '0.1em' }}>
                        <span>← {MAX_POINTS} pembacaan terakhir</span>
                        <span>NTU min {ntuMin} · max {ntuMax}</span>
                    </div>
                </div>

                {/* MiCS-5524 Gas Sensor */}
                <div style={{
                    background: gasData?.status === 'DANGER' ? 'rgba(255,68,68,0.06)' :
                        gasData?.status === 'WARNING' ? 'rgba(255,200,0,0.05)' : 'rgba(255,140,0,0.04)',
                    border: `1px solid ${gasStyle.border}`,
                    borderRadius: 8, padding: '16px 16px 10px',
                    transition: 'border 0.4s, background 0.4s',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Wind size={16} color="#ff8c00" />
                            <span style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: '#ff8c00', textTransform: 'uppercase' }}>MiCS-5524 · Gas</span>
                            {deviceNames.gas && deviceAge[deviceNames.gas] >= AGE_OFFLINE && staleTag}
                        </div>
                        <span style={{
                            fontSize: '0.65rem', padding: '3px 10px', borderRadius: 3,
                            letterSpacing: '0.15em', fontWeight: 700,
                            color: gasStyle.color, border: `1px solid ${gasStyle.border}`, background: gasStyle.bg,
                            animation: gasData?.status === 'DANGER' ? 'blink 0.8s infinite' : 'none',
                        }}>
                            {gasData?.status ?? 'NO DATA'}
                        </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
                        {[
                            { label: 'ADC Raw',    value: gasData?.adc_raw    != null ? gasData.adc_raw                            : '--', unit: '' },
                            { label: 'Voltage',    value: gasData?.voltage    != null ? Number(gasData.voltage).toFixed(3)          : '--', unit: 'V' },
                            { label: 'Baseline V', value: gasData?.baseline_v != null ? Number(gasData.baseline_v).toFixed(3)       : '--', unit: 'V' },
                            { label: 'Rs/Ro',      value: gasData?.rs_ro_ratio != null ? Number(gasData.rs_ro_ratio).toFixed(3)     : '--', unit: '' },
                        ].map(({ label, value, unit }) => (
                            <div key={label} style={{ background: 'rgba(255,140,0,0.05)', border: '1px solid rgba(255,140,0,0.12)', borderRadius: 6, padding: '10px 14px' }}>
                                <div style={{ fontSize: '0.55rem', color: 'rgba(255,140,0,0.45)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ff8c00', fontFamily: 'monospace', lineHeight: 1 }}>
                                    {value}<span style={{ fontSize: '0.75rem', opacity: 0.55, marginLeft: 2 }}>{unit}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    {gasData?.gas_hint && (
                        <div style={{ marginBottom: 14, padding: '8px 14px', background: 'rgba(255,140,0,0.06)', border: '1px solid rgba(255,140,0,0.15)', borderRadius: 6, fontSize: '0.7rem', color: 'rgba(255,180,80,0.85)', letterSpacing: '0.1em' }}>
                            <span style={{ color: 'rgba(255,140,0,0.45)', marginRight: 8 }}>GAS HINT ›</span>
                            {gasData.gas_hint}
                        </div>
                    )}
                    {rsRoHistory.length === 0
                        ? <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,140,0,0.25)', fontSize: '0.7rem', letterSpacing: '0.2em' }}>MENUNGGU DATA...</div>
                        : <ECGChart data={rsRoHistory} color="#ff8c00" label="Rs/Ro RATIO" unit="" min={rsRoMin} max={rsRoMax} />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'rgba(255,140,0,0.3)', marginTop: 4, letterSpacing: '0.1em' }}>
                        <span>← {MAX_POINTS} pembacaan terakhir (Rs/Ro ratio)</span>
                        <span>min {rsRoMin} · max {rsRoMax}</span>
                    </div>
                </div>

                {/* Log Table */}
                <div style={{ border: '1px solid rgba(0,255,130,0.1)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(0,255,130,0.1)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'rgba(0,255,130,0.4)', textTransform: 'uppercase' }}>
                        Sensor Log · {history.length} records
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(0,255,130,0.08)' }}>
                                    {['Waktu', 'Suhu Ruang (°C)', 'Suhu Air (°C)', 'Kelembaban (%)', 'TDS (ppm)', 'pH', 'Alkalinitas', 'Turbidity (NTU)', 'TSS (mg/L)', 'Clarity (%)', 'Pompa', 'Status'].map(h => (
                                        <th key={h} style={{ padding: '8px 16px', textAlign: 'left', color: 'rgba(0,255,130,0.35)', fontWeight: 400, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {history.length > 0 ? [...history].reverse().map((d, i) => {
                                    const ts = turbidityStatusStyle(d.turbidity ?? null);
                                    const rowPumpOn = d.pumping === 1;
                                    const rowPumpColor = d.pumping === null ? 'rgba(255,255,255,0.2)' : rowPumpOn ? '#00ff82' : '#ff4444';
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid rgba(0,255,130,0.05)', background: i === 0 ? 'rgba(0,255,130,0.025)' : 'transparent' }}>
                                            <td style={{ padding: '8px 16px', color: 'rgba(200,255,220,0.45)', whiteSpace: 'nowrap' }}>{d.timestamp}</td>
                                            <td style={{ padding: '8px 16px', color: i === 0 ? '#ff6b35' : 'rgba(255,107,53,0.45)', fontWeight: i === 0 ? 700 : 400 }}>{d.temperature ?? '--'}</td>
                                            <td style={{ padding: '8px 16px', color: i === 0 ? '#ffc800' : 'rgba(255,200,0,0.45)', fontWeight: i === 0 ? 700 : 400 }}>{d.waterTemp ?? '--'}</td>
                                            <td style={{ padding: '8px 16px', color: i === 0 ? '#00b4ff' : 'rgba(0,180,255,0.45)', fontWeight: i === 0 ? 700 : 400 }}>{d.humidity ?? '--'}</td>
                                            <td style={{ padding: '8px 16px', color: i === 0 ? '#a050ff' : 'rgba(160,80,255,0.45)', fontWeight: i === 0 ? 700 : 400 }}>{d.tds ?? '--'}</td>
                                            <td style={{ padding: '8px 16px', color: i === 0 ? '#00e5b0' : 'rgba(0,229,176,0.45)', fontWeight: i === 0 ? 700 : 400 }}>{d.ph ?? '--'}</td>
                                            <td style={{ padding: '8px 16px', color: i === 0 ? '#00e5b0' : 'rgba(0,229,176,0.35)' }}>{d.alkalinity != null ? `${d.alkalinity} mg/L` : '--'}</td>
                                            <td style={{ padding: '8px 16px', color: i === 0 ? '#00c8ff' : 'rgba(0,200,255,0.45)', fontWeight: i === 0 ? 700 : 400 }}>{d.turbidity ?? '--'}</td>
                                            <td style={{ padding: '8px 16px', color: i === 0 ? '#00c8ff' : 'rgba(0,200,255,0.35)' }}>{d.tss != null ? `${d.tss}` : '--'}</td>
                                            <td style={{ padding: '8px 16px', color: i === 0 ? '#00ff82' : 'rgba(0,255,130,0.35)' }}>{d.clarity != null ? `${d.clarity}%` : '--'}</td>
                                            <td style={{ padding: '8px 16px' }}>
                                                {d.pumping != null ? (
                                                    <span style={{
                                                        fontSize: '0.6rem', padding: '2px 8px', borderRadius: 3,
                                                        letterSpacing: '0.1em', fontWeight: 700,
                                                        color: rowPumpColor,
                                                        border: `1px solid ${rowPumpColor}55`,
                                                        background: `${rowPumpColor}11`,
                                                    }}>
                                                        {rowPumpOn ? 'ON' : 'OFF'}
                                                    </span>
                                                ) : <span style={{ color: 'rgba(255,255,255,0.15)' }}>--</span>}
                                            </td>
                                            <td style={{ padding: '8px 16px' }}>
                                                <span style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: 3, letterSpacing: '0.1em', border: `1px solid ${ts.border}`, color: ts.color, background: ts.bg }}>
                                                    {d.turbidity != null ? ts.label : 'NORMAL'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={12} style={{ padding: '28px', textAlign: 'center', color: 'rgba(0,255,130,0.18)', fontSize: '0.7rem', letterSpacing: '0.2em' }}>
                                            MENUNGGU DATA DARI ESP8266...
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>}

            {/* ── CAMERA TAB ── */}
            {activeTab === 'camera' && (
                <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {camToast && (
                        <div style={{
                            position: 'fixed', bottom: 24, right: 24, zIndex: 999,
                            background: '#0d1a14', border: `1px solid ${camToast.type === 'error' ? '#ff4444' : '#00ff82'}`,
                            borderRadius: 8, padding: '12px 16px', fontSize: '0.75rem',
                            color: camToast.type === 'error' ? '#ff4444' : '#00ff82',
                            fontFamily: '"Courier New", monospace', letterSpacing: '0.05em',
                        }}>{camToast.msg}</div>
                    )}

                    {camLightbox && (
                        <div onClick={() => setCamLightbox(null)} style={{
                            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 200,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <img src={camLightbox} alt="preview" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} />
                            <span onClick={() => setCamLightbox(null)} style={{ position: 'absolute', top: 20, right: 24, fontSize: 28, color: 'rgba(0,255,130,0.4)', cursor: 'pointer' }}>✕</span>
                        </div>
                    )}

                    {/* Preview */}
                    <div style={{ background: 'rgba(0,200,130,0.03)', border: '1px solid rgba(0,255,130,0.15)', borderRadius: 8, padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                            <span style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: '#00ff82', textTransform: 'uppercase' }}>📷 Live Preview</span>
                        </div>
                        <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', background: '#000', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(0,255,130,0.15)', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {camPreviewUrl
                                ? <img src={camPreviewUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                : <div style={{ color: 'rgba(0,255,130,0.2)', fontSize: '0.7rem', letterSpacing: '0.2em' }}>TEKAN START PREVIEW</div>
                            }
                        </div>
                        {camPreviewFile && <div style={{ textAlign: 'center', marginTop: 8, fontSize: '0.65rem', color: 'rgba(0,255,130,0.35)', letterSpacing: '0.1em' }}>{camPreviewFile}</div>}

                        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
                            {!camPreviewTimer
                                ? <button onClick={startCamPreview} style={{ padding: '8px 18px', background: 'rgba(0,255,130,0.1)', border: '1px solid rgba(0,255,130,0.4)', borderRadius: 6, color: '#00ff82', cursor: 'pointer', fontSize: '0.7rem', letterSpacing: '0.1em', fontFamily: '"Courier New", monospace' }}>▶ START</button>
                                : <button onClick={stopCamPreview}  style={{ padding: '8px 18px', background: 'rgba(255,68,68,0.1)',  border: '1px solid rgba(255,68,68,0.4)',  borderRadius: 6, color: '#ff4444', cursor: 'pointer', fontSize: '0.7rem', letterSpacing: '0.1em', fontFamily: '"Courier New", monospace' }}>⏹ STOP</button>
                            }
                            <button onClick={() => { camCapture(); setTimeout(fetchLatestPreview, 600); }} disabled={camCapturing}
                                style={{ padding: '8px 18px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.4)', borderRadius: 6, color: '#3b82f6', cursor: 'pointer', fontSize: '0.7rem', letterSpacing: '0.1em', fontFamily: '"Courier New", monospace', opacity: camCapturing ? 0.5 : 1 }}>
                                {camCapturing ? '⏳...' : '📷 AMBIL & TAMPILKAN'}
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: '0.65rem', color: 'rgba(0,255,130,0.4)', letterSpacing: '0.1em' }}>INTERVAL:</span>
                                <select value={camPreviewInterval} onChange={e => changePreviewInterval(Number(e.target.value))}
                                    style={{ background: '#0d1a14', border: '1px solid rgba(0,255,130,0.2)', color: '#00ff82', padding: '4px 8px', borderRadius: 5, fontSize: '0.7rem', fontFamily: '"Courier New", monospace' }}>
                                    <option value={1000}>1 detik</option>
                                    <option value={3000}>3 detik</option>
                                    <option value={5000}>5 detik</option>
                                    <option value={10000}>10 detik</option>
                                    <option value={60000}>1 menit</option>
                                    <option value={300000}>5 menit</option>
                                    <option value={600000}>10 menit</option>
                                </select>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.65rem', letterSpacing: '0.1em', color: 'rgba(0,255,130,0.5)' }}>
                                <input type="checkbox" checked={camAutoCapture} onChange={e => toggleAutoCapture(e.target.checked)}
                                    style={{ accentColor: '#00ff82', width: 14, height: 14 }} />
                                AUTO-CAPTURE
                                <span style={{ color: camAutoCapture ? '#00ff82' : 'rgba(0,255,130,0.3)' }}>{camAutoCapture ? 'ON' : 'OFF'}</span>
                            </label>
                        </div>
                    </div>

                    {/* Gallery */}
                    <div style={{ background: 'rgba(0,200,130,0.03)', border: '1px solid rgba(0,255,130,0.15)', borderRadius: 8, padding: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: '#00ff82', textTransform: 'uppercase' }}>🖼 Galeri</span>
                                <span style={{ fontSize: '0.6rem', padding: '2px 8px', border: '1px solid rgba(0,255,130,0.2)', borderRadius: 10, color: 'rgba(0,255,130,0.5)', letterSpacing: '0.1em' }}>{camPhotos.length} foto</span>
                                {camSelected.size > 0 && <span style={{ fontSize: '0.6rem', padding: '2px 8px', border: '1px solid rgba(59,130,246,0.4)', borderRadius: 10, color: '#3b82f6', letterSpacing: '0.1em' }}>{camSelected.size} dipilih</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {camSelectMode && <>
                                    <button onClick={toggleSelectAll} style={{ padding: '5px 12px', background: 'rgba(0,255,130,0.08)', border: '1px solid rgba(0,255,130,0.3)', borderRadius: 5, color: '#00ff82', cursor: 'pointer', fontSize: '0.65rem', fontFamily: '"Courier New", monospace' }}>☑ SEMUA</button>
                                    <button onClick={bulkDownload}   style={{ padding: '5px 12px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 5, color: '#3b82f6', cursor: 'pointer', fontSize: '0.65rem', fontFamily: '"Courier New", monospace' }}>⬇ ZIP</button>
                                    <button onClick={bulkDelete}     style={{ padding: '5px 12px', background: 'rgba(255,68,68,0.08)',  border: '1px solid rgba(255,68,68,0.3)',  borderRadius: 5, color: '#ff4444', cursor: 'pointer', fontSize: '0.65rem', fontFamily: '"Courier New", monospace' }}>✕ HAPUS</button>
                                </>}
                                <button onClick={() => { setCamSelectMode(s => !s); setCamSelected(new Set()); }}
                                    style={{ padding: '5px 12px', background: camSelectMode ? 'rgba(255,68,68,0.08)' : 'rgba(0,255,130,0.05)', border: `1px solid ${camSelectMode ? 'rgba(255,68,68,0.3)' : 'rgba(0,255,130,0.2)'}`, borderRadius: 5, color: camSelectMode ? '#ff4444' : 'rgba(0,255,130,0.5)', cursor: 'pointer', fontSize: '0.65rem', fontFamily: '"Courier New", monospace' }}>
                                    {camSelectMode ? '✕ BATAL' : '☐ PILIH'}
                                </button>
                                <button onClick={loadCamPhotos} style={{ padding: '5px 12px', background: 'rgba(0,255,130,0.05)', border: '1px solid rgba(0,255,130,0.2)', borderRadius: 5, color: 'rgba(0,255,130,0.5)', cursor: 'pointer', fontSize: '0.65rem', fontFamily: '"Courier New", monospace' }}>↻ REFRESH</button>
                            </div>
                        </div>

                        {camPhotos.length === 0
                            ? <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(0,255,130,0.2)', fontSize: '0.7rem', letterSpacing: '0.2em' }}>BELUM ADA FOTO</div>
                            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                                {camPhotos.map(p => {
                                    const imgUrl = 'http://localhost:3000/cam/photo?file=' + encodeURIComponent(p.path);
                                    const sel = camSelected.has(p.name);
                                    return (
                                        <div key={p.name} style={{ background: '#0a1510', borderRadius: 8, overflow: 'hidden', border: `1px solid ${sel ? '#3b82f6' : 'rgba(0,255,130,0.12)'}`, transition: 'border-color .15s' }}>
                                            <div onClick={() => camSelectMode ? toggleCamSelect(p.name) : setCamLightbox(imgUrl)}
                                                style={{ width: '100%', aspectRatio: '4/3', position: 'relative', overflow: 'hidden', background: '#000', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <img src={imgUrl} alt={p.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display='none'; }} />
                                                {sel && <div style={{ position: 'absolute', top: 6, left: 6, width: 20, height: 20, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff' }}>✓</div>}
                                            </div>
                                            <div style={{ padding: '8px 10px' }}>
                                                <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: 'rgba(0,255,130,0.4)', marginBottom: 4 }}>{p.name}</div>
                                                <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,130,0.25)', marginBottom: 7 }}>{Math.round(p.size / 1024)} KB</div>
                                                <div style={{ display: 'flex', gap: 5 }}>
                                                    <a href={imgUrl} download={p.name} style={{ flex: 1, padding: '4px 6px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 4, color: '#3b82f6', fontSize: '0.6rem', textAlign: 'center', textDecoration: 'none', fontFamily: '"Courier New", monospace' }}>⬇ DL</a>
                                                    <button onClick={async () => {
                                                        if (!window.confirm('Hapus ' + p.name + '?')) return;
                                                        try {
                                                            const data = await camApi('/delete?file=' + encodeURIComponent(p.path), { method: 'DELETE' }).then(r => r.json());
                                                            if (data.success) { showCamToast('Dihapus: ' + p.name); loadCamPhotos(); }
                                                            else showCamToast('Gagal hapus', 'error');
                                                        } catch { showCamToast('Koneksi gagal', 'error'); }
                                                    }} style={{ flex: 1, padding: '4px 6px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.25)', borderRadius: 4, color: '#ff4444', fontSize: '0.6rem', cursor: 'pointer', fontFamily: '"Courier New", monospace' }}>✕</button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        }
                    </div>

                </div>
            )}

        </div>
    );
}