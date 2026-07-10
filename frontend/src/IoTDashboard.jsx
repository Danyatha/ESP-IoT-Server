import React, { useState, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import {
    Thermometer, Droplets, Activity, Beaker, FlaskConical, Waves, Wind, Eye, Zap,
    TrendingUp, TrendingDown, Minus, BarChart3, Download, FileDown, X, CheckCircle2, Loader2,
} from 'lucide-react';

const MAX_POINTS = 60;
const AGE_DELAYED = 60;
const AGE_OFFLINE = 120;
const PUMP_AGE_OFFLINE = 20;
const SERVER = 'http://202.10.40.22:3000'; // ganti satu baris ini jika IP/port berubah

/* ────────────────────────────────────────────────────────────────
   TEMA TERANG · FORMAL
   Palet instrumen laboratorium: latar terang, teks slate gelap,
   nilai angka monospace, aksen warna per sensor dengan kontras
   yang cukup di atas latar putih.
   ──────────────────────────────────────────────────────────────── */
const T = {
    bg:          '#eef2f7',
    panel:       '#ffffff',
    panelSubtle: '#f8fafc',
    border:      '#e2e8f0',
    borderMid:   '#cbd5e1',
    text:        '#1e293b',
    textMut:     '#64748b',
    textFaint:   '#94a3b8',
    brand:       '#0e7490',
    shadow:      '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)',
    shadowMd:    '0 4px 16px rgba(15,23,42,0.10)',
    ui:          "'Inter', -apple-system, 'Segoe UI', Roboto, system-ui, sans-serif",
    mono:        "'SF Mono', 'Roboto Mono', 'Consolas', monospace",
};
const C = {
    roomTemp:  '#c2410c',
    reactorTemp: '#9333ea',
    humid:     '#0369a1',
    tds:       '#6d28d9',
    ph:        '#0f766e',
    waterTemp: '#a16207',
    turb:      '#0e7490',
    gas:       '#c2410c',
    pumpOn:    '#15803d',
    ok:        '#15803d',
    warn:      '#b45309',
    danger:    '#b91c1c',
    neutral:   '#64748b',
};
// latar kartu bertint sangat tipis dari warna aksen
const tint = (hex, a = '0d') => hex + a;

/* ────────────────────────────────────────────────────────────────
   ANALISA REAL-TIME — statistik per parameter dari riwayat
   ──────────────────────────────────────────────────────────────── */
function analyze(arr) {
    if (!arr || arr.length === 0) return null;
    const n = arr.length;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    const cv = mean !== 0 ? (std / Math.abs(mean)) * 100 : 0;
    const current = arr[n - 1];
    const range = max - min;
    // tren via kemiringan regresi linear sederhana terhadap indeks
    let slope = 0;
    if (n >= 2) {
        const xm = (n - 1) / 2;
        let num = 0, den = 0;
        arr.forEach((y, i) => { num += (i - xm) * (y - mean); den += (i - xm) ** 2; });
        slope = den ? num / den : 0;
    }
    const roc = n >= 2 ? arr[n - 1] - arr[n - 2] : 0;
    const thr = (std * 0.08) || 1e-6;
    let trend = 'stabil';
    if (slope > thr) trend = 'naik';
    else if (slope < -thr) trend = 'turun';
    return { n, mean, min, max, std, cv, current, slope, roc, range, trend };
}

const fmt = (v, d = 1) => (v == null || Number.isNaN(v)) ? '--' : Number(v).toFixed(d);

/* ── Chart garis (gaya ECG) — disesuaikan untuk latar terang ── */
function ECGChart({ data, color, min, max }) {
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
                        stroke={i === 2 ? T.borderMid : T.border} strokeWidth="1"
                        strokeDasharray={i === 2 ? '0' : '4 4'} />
                    <text x={padLeft - 4} y={y + 4} textAnchor="end"
                        fontSize="9" fill={T.textFaint} fontFamily={T.mono}>
                        {val.toFixed(0)}
                    </text>
                </g>
            ))}
            {areaPoints && <polygon points={areaPoints} fill={color} fillOpacity="0.08" />}
            {polylinePoints && <polyline points={polylinePoints} fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.95" strokeLinecap="round" strokeLinejoin="round" />}
            {last && (
                <>
                    <circle cx={last.x} cy={last.y} r="5" fill={color} fillOpacity="0.2" />
                    <circle cx={last.x} cy={last.y} r="2.5" fill={color} />
                </>
            )}
        </svg>
    );
}

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
            <text x={padLeft - 4} y={padTop + chartH / 2 + 4} textAnchor="end" fontSize="8" fill={T.textFaint} fontFamily={T.mono}>ON</text>
            <text x={padLeft - 4} y={padTop + chartH + 4} textAnchor="end" fontSize="8" fill={T.textFaint} fontFamily={T.mono}>OFF</text>
            {filledData.map((val, i) => {
                if (val === null) return null;
                const x = padLeft + i * barW;
                const isOn = val === 1;
                return (
                    <rect key={i} x={x + 0.5}
                        y={isOn ? padTop : padTop + chartH * 0.6}
                        width={Math.max(barW - 1, 1)}
                        height={isOn ? chartH : chartH * 0.4}
                        fill={isOn ? color : '#e2e8f0'}
                        fillOpacity={isOn ? 0.85 : 1} rx="1" />
                );
            })}
        </svg>
    );
}

function gasStatusStyle(status) {
    if (!status) return { color: T.textFaint, border: T.border, bg: T.panelSubtle };
    const s = status.toUpperCase();
    if (s === 'NORMAL')  return { color: C.ok,     border: tint(C.ok, '55'),     bg: tint(C.ok, '12')     };
    if (s === 'WARNING') return { color: C.warn,   border: tint(C.warn, '55'),   bg: tint(C.warn, '14')   };
    if (s === 'DANGER')  return { color: C.danger, border: tint(C.danger, '55'), bg: tint(C.danger, '14') };
    return { color: T.textMut, border: T.border, bg: T.panelSubtle };
}

function turbidityStatusStyle(ntu) {
    if (ntu === null) return { color: T.textFaint, border: T.border, bg: T.panelSubtle, label: 'NO DATA' };
    if (ntu <= 1)  return { color: C.ok,     border: tint(C.ok, '55'),     bg: tint(C.ok, '12'),     label: 'SANGAT JERNIH' };
    if (ntu <= 4)  return { color: C.ph,     border: tint(C.ph, '55'),     bg: tint(C.ph, '12'),     label: 'JERNIH'        };
    if (ntu <= 25) return { color: C.warn,   border: tint(C.warn, '55'),   bg: tint(C.warn, '14'),   label: 'AGAK KERUH'    };
    if (ntu <= 50) return { color: C.gas,    border: tint(C.gas, '55'),    bg: tint(C.gas, '14'),    label: 'KERUH'         };
    return           { color: C.danger, border: tint(C.danger, '55'), bg: tint(C.danger, '14'), label: 'SANGAT KERUH'  };
}

function EspBadge({ label, ageSeconds }) {
    let color, text;
    if (ageSeconds === null)              { color = T.textFaint; text = 'NO DATA'; }
    else if (ageSeconds < AGE_DELAYED)    { color = C.ok;     text = `${ageSeconds}s`; }
    else if (ageSeconds < AGE_OFFLINE)    { color = C.warn;   text = `${ageSeconds}s`; }
    else                                  { color = C.danger; text = 'OFFLINE'; }
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
                width: 6, height: 6, borderRadius: '50%', background: color,
                animation: ageSeconds !== null && ageSeconds < AGE_DELAYED ? 'pulse 1.4s infinite' : 'none',
            }} />
            <span style={{ fontSize: '0.62rem', color: T.textMut, letterSpacing: '0.04em', fontFamily: T.mono }}>
                {label} · <span style={{ color }}>{text}</span>
            </span>
        </div>
    );
}

/* ── Indikator tren untuk tab analisa ── */
function TrendBadge({ trend }) {
    const map = {
        naik:   { Icon: TrendingUp,   color: C.danger, label: 'Naik'   },
        turun:  { Icon: TrendingDown, color: C.humid,  label: 'Turun'  },
        stabil: { Icon: Minus,        color: T.textMut, label: 'Stabil' },
    };
    const { Icon, color, label } = map[trend] || map.stabil;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color, fontSize: '0.72rem', fontWeight: 600 }}>
            <Icon size={13} /> {label}
        </span>
    );
}

/* ── Kartu statistik analisa per parameter ── */
function StatCard({ icon: Icon, label, unit, color, stats }) {
    const cell = (k, v, u = '') => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: '0.58rem', color: T.textFaint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{k}</span>
            <span style={{ fontSize: '0.92rem', fontWeight: 600, color: T.text, fontFamily: T.mono }}>
                {v}<span style={{ fontSize: '0.62rem', color: T.textFaint, marginLeft: 2 }}>{u}</span>
            </span>
        </div>
    );
    return (
        <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, boxShadow: T.shadow }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: tint(color, '16'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={15} color={color} />
                    </div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: T.text }}>{label}</span>
                </div>
                {stats ? <TrendBadge trend={stats.trend} /> : null}
            </div>
            {stats ? (
                <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
                        <span style={{ fontSize: '1.7rem', fontWeight: 700, color, fontFamily: T.mono, lineHeight: 1 }}>{fmt(stats.current, 2)}</span>
                        <span style={{ fontSize: '0.7rem', color: T.textFaint }}>{unit}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: stats.roc > 0 ? C.danger : stats.roc < 0 ? C.humid : T.textFaint, fontFamily: T.mono }}>
                            {stats.roc > 0 ? '▲' : stats.roc < 0 ? '▼' : '•'} {fmt(Math.abs(stats.roc), 2)}
                        </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                        {cell('Rata2', fmt(stats.mean, 2))}
                        {cell('Min', fmt(stats.min, 1))}
                        {cell('Maks', fmt(stats.max, 1))}
                        {cell('Std', fmt(stats.std, 2))}
                        {cell('CV', fmt(stats.cv, 1), '%')}
                        {cell('Rentang', fmt(stats.range, 1))}
                    </div>
                    <div style={{ marginTop: 10, fontSize: '0.6rem', color: T.textFaint }}>
                        Berdasarkan {stats.n} pembacaan terakhir
                    </div>
                </>
            ) : (
                <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textFaint, fontSize: '0.72rem' }}>
                    Menunggu data…
                </div>
            )}
        </div>
    );
}

/* ── Notifikasi progress unduhan ZIP (gaya Google Drive) ── */
function DownloadProgress({ state, onClose }) {
    if (!state) return null;
    const { phase, current, total, fileName, percent } = state;
    const done = phase === 'done';
    const error = phase === 'error';
    const title = error ? 'Unduhan gagal'
        : done ? 'Unduhan siap'
        : phase === 'zipping' ? 'Mengemas arsip ZIP'
        : 'Menyiapkan unduhan';
    const sub = error ? (fileName || 'Terjadi kesalahan')
        : done ? `${total} foto diunduh sebagai ZIP`
        : phase === 'zipping' ? 'Menggabungkan foto…'
        : `Mengambil ${current} dari ${total} foto`;
    const barColor = error ? C.danger : done ? C.ok : T.brand;
    return (
        <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 999, width: 340,
            background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12,
            boxShadow: '0 8px 28px rgba(15,23,42,0.18)', overflow: 'hidden',
            fontFamily: T.ui,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: tint(barColor, '16'), display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {done ? <CheckCircle2 size={19} color={C.ok} />
                        : error ? <X size={19} color={C.danger} />
                        : <Loader2 size={18} color={T.brand} style={{ animation: 'spin 0.9s linear infinite' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: T.text }}>{title}</div>
                    <div style={{ fontSize: '0.68rem', color: T.textMut, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: barColor, fontFamily: T.mono }}>
                    {Math.round(percent)}%
                </span>
                {(done || error) && (
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textFaint, padding: 2, display: 'flex' }}>
                        <X size={16} />
                    </button>
                )}
            </div>
            {/* nama file yang sedang diproses */}
            {!done && !error && fileName && (
                <div style={{ padding: '0 14px 8px 58px', fontSize: '0.64rem', color: T.textFaint, fontFamily: T.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {fileName}
                </div>
            )}
            {/* bar progress */}
            <div style={{ height: 4, background: T.border }}>
                <div style={{
                    height: '100%', width: `${percent}%`, background: barColor,
                    transition: 'width 0.25s ease', borderRadius: '0 2px 2px 0',
                }} />
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   KOMPONEN UTAMA
   ════════════════════════════════════════════════════════════════ */
export default function IoTDashboard() {
    const [latestData, setLatestData]             = useState(null);
    const [history, setHistory]                   = useState([]);
    const [connected, setConnected]               = useState(false);
    const [deviceAge, setDeviceAge]               = useState({});
    const [deviceNames, setDeviceNames]           = useState({ env: null, suhu: null, tds: null, water: null, ph: null, gas: null, turbidity: null, pump: null });

    const [tempHistory, setTempHistory]           = useState([]);
    const [suhuHistory, setSuhuHistory]           = useState([]);
    const [humidHistory, setHumidHistory]         = useState([]);
    const [tdsHistory, setTdsHistory]             = useState([]);
    const [phHistory, setPhHistory]               = useState([]);
    const [gasData, setGasData]                   = useState(null);
    const [rsRoHistory, setRsRoHistory]           = useState([]);
    const [turbidityData, setTurbidityData]       = useState(null);
    const [ntuHistory, setNtuHistory]             = useState([]);
    const [clarityHistory, setClarityHistory]     = useState([]);
    const [tssHistory, setTssHistory]             = useState([]);
    const [pumpHistory, setPumpHistory]           = useState([]);
    const [pumpStatus, setPumpStatus]             = useState(null);

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

    const [zipProgress, setZipProgress]           = useState(null);

    const [csvDevice, setCsvDevice]   = useState('all');
    const [csvDays, setCsvDays]       = useState(30);
    const [dbCount, setDbCount]       = useState(null);
    const [dbDeleting, setDbDeleting] = useState(false);
    const [manageMsg, setManageMsg]   = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(SERVER + "/api/latest");
                const data = await res.json();
                if (data) {
                    const newData = {
                        temperature: data.temperature != null ? parseFloat(Number(data.temperature).toFixed(1)) : null,
                        suhu:        data.suhu        != null ? parseFloat(Number(data.suhu).toFixed(1))        : null,
                        humidity:    data.humidity    != null ? parseFloat(Number(data.humidity).toFixed(1))    : null,
                        tds:         data.tds         != null ? parseFloat(Number(data.tds).toFixed(1))         : null,
                        ph:          data.ph          != null ? parseFloat(Number(data.ph).toFixed(2))          : null,
                        alkalinity:  data.alk         != null ? parseFloat(Number(data.alk).toFixed(0))         : null,
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
                    if (newData.suhu         != null) setSuhuHistory(prev => [...prev,  newData.suhu].slice(-MAX_POINTS));
                    if (newData.humidity    != null) setHumidHistory(prev => [...prev,  newData.humidity].slice(-MAX_POINTS));
                    if (newData.tds         != null) setTdsHistory(prev   => [...prev,  newData.tds].slice(-MAX_POINTS));
                    if (newData.ph          != null) setPhHistory(prev    => [...prev,  newData.ph].slice(-MAX_POINTS));
                    if (newData.turbidity   != null) setNtuHistory(prev   => [...prev,  newData.turbidity].slice(-MAX_POINTS));
                    if (newData.clarity     != null) setClarityHistory(prev => [...prev, newData.clarity].slice(-MAX_POINTS));
                    if (newData.tss         != null) setTssHistory(prev   => [...prev,  newData.tss].slice(-MAX_POINTS));
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
    const camApi = (path, opts) => fetch(SERVER + '/cam' + path, opts);
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
                name: typeof p.name === 'string' ? p.name : String(p.name),
                path: typeof p.name === 'string' ? p.name : String(p.name),
            })).sort((a, b) => (b.time || 0) - (a.time || 0));
            setCamPhotos(photos);
        } catch {}
    };
    const camCapture = async () => {
        setCamCapturing(true);
        try {
            const data = await camApi('/capture', { method: 'POST', signal: AbortSignal.timeout(15000) }).then(r => r.json());
            if (data.success) {
                showCamToast('Foto disimpan: ' + data.filename.split('/').pop());
                loadCamPhotos();
            } else {
                showCamToast(data.error || 'Gagal capture', 'error');
            }
        } catch { showCamToast('Timeout — ESP32 tidak merespons', 'error'); }
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
            const url = SERVER + '/cam/photo?file=' + encodeURIComponent(latest.name) + '&t=' + Date.now();
            setCamPreviewUrl(url);
            setCamPreviewFile(latest.name);
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
                const data = await camApi('/delete?file=' + encodeURIComponent(photo.name), { method: 'DELETE', signal: AbortSignal.timeout(5000) }).then(r => r.json());
                if (data.success) ok++;
            } catch {}
        }
        showCamToast(`Dihapus: ${ok} foto`);
        setCamSelected(new Set());
        setCamSelectMode(false);
        loadCamPhotos();
    };

    // ── Unduhan ZIP dengan progress bertahap (gaya Google Drive) ──
    const bulkDownload = async () => {
        if (!camSelected.size) return;
        const names = [...camSelected];
        const total = names.length;
        setZipProgress({ phase: 'fetching', current: 0, total, fileName: '', percent: 0 });

        const zip = new JSZip();
        const folder = zip.folder('photos');
        let done = 0;
        for (const name of names) {
            const photo = camPhotos.find(p => p.name === name);
            setZipProgress({ phase: 'fetching', current: done + 1, total, fileName: name, percent: Math.round((done / total) * 88) });
            if (photo) {
                try {
                    const res = await fetch(SERVER + '/cam/photo?file=' + encodeURIComponent(photo.path));
                    const blob = await res.blob();
                    folder.file(name, blob);
                } catch {}
            }
            done++;
        }
        setZipProgress({ phase: 'zipping', current: total, total, fileName: '', percent: 90 });
        try {
            const zipBlob = await zip.generateAsync({ type: 'blob' }, (meta) => {
                setZipProgress(p => p ? { ...p, phase: 'zipping', percent: 90 + Math.round((meta.percent || 0) * 0.1) } : p);
            });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(zipBlob);
            a.download = `photos_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`;
            a.click();
            URL.revokeObjectURL(a.href);
            setZipProgress({ phase: 'done', current: total, total, fileName: '', percent: 100 });
            setTimeout(() => setZipProgress(p => (p && p.phase === 'done' ? null : p)), 5000);
        } catch (e) {
            setZipProgress({ phase: 'error', current: total, total, fileName: 'Gagal membuat ZIP', percent: 100 });
        }
    };

    // ── ANALISA: hitung statistik tiap parameter dari riwayat ──
    const analysisRows = useMemo(() => ([
        { key: 'temperature', label: 'Suhu Ruang',  unit: '°C',  color: C.roomTemp,  icon: Thermometer,  data: tempHistory },
        { key: 'suhu',        label: 'Suhu Air (DS18B20)', unit: '°C', color: C.waterTemp, icon: Waves, data: suhuHistory },
        { key: 'humidity',    label: 'Kelembapan',  unit: '%',   color: C.humid,     icon: Droplets,     data: humidHistory },
        { key: 'tds',         label: 'TDS',         unit: 'ppm', color: C.tds,       icon: Beaker,       data: tdsHistory },
        { key: 'ph',          label: 'pH',          unit: '',    color: C.ph,        icon: FlaskConical, data: phHistory },
        { key: 'turbidity',   label: 'Turbiditas',  unit: 'NTU', color: C.turb,      icon: Eye,          data: ntuHistory },
        { key: 'tss',         label: 'TSS',         unit: 'mg/L',color: C.turb,      icon: Eye,          data: tssHistory },
        { key: 'clarity',     label: 'Kejernihan',  unit: '%',   color: C.ok,        icon: Eye,          data: clarityHistory },
        { key: 'rs_ro',       label: 'Gas Rs/Ro',   unit: '',    color: C.gas,       icon: Wind,         data: rsRoHistory },
    ].map(r => ({ ...r, stats: analyze(r.data) }))), [tempHistory, suhuHistory, humidHistory, tdsHistory, phHistory, ntuHistory, tssHistory, clarityHistory, rsRoHistory]);

    // ── Download analisa sebagai CSV (sisi klien, tanpa server) ──
    const downloadAnalysisCSV = () => {
        const head = ['Parameter', 'Satuan', 'Terkini', 'Rata2', 'Min', 'Maks', 'Std', 'CV_persen', 'Rentang', 'Tren', 'n'];
        const lines = [head.join(',')];
        analysisRows.forEach(r => {
            const s = r.stats;
            if (!s) return;
            lines.push([
                r.label, r.unit, fmt(s.current, 2), fmt(s.mean, 2), fmt(s.min, 2), fmt(s.max, 2),
                fmt(s.std, 3), fmt(s.cv, 1), fmt(s.range, 2), s.trend, s.n,
            ].join(','));
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `analisa_realtime_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    // ── Download snapshot riwayat tabel log (CSV, sisi klien) ──
    const downloadHistoryCSV = () => {
        if (!history.length) return;
        const head = ['Waktu', 'SuhuRuang', 'SuhuAir', 'Kelembapan', 'TDS', 'pH', 'Alkalinitas', 'Turbidity', 'TSS', 'Clarity', 'Pompa'];
        const lines = [head.join(',')];
        history.forEach(d => {
            lines.push([
                d.timestamp, d.temperature ?? '', d.suhu ?? '', d.humidity ?? '', d.tds ?? '',
                d.ph ?? '', d.alkalinity ?? '', d.turbidity ?? '', d.tss ?? '', d.clarity ?? '',
                d.pumping == null ? '' : (d.pumping === 1 ? 'ON' : 'OFF'),
            ].join(','));
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `log_sensor_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    // ── Rentang sumbu Y chart ──
    const tempMin      = tempHistory.length      > 0 ? Math.floor(Math.min(...tempHistory) - 2)      : 20;
    const tempMax      = tempHistory.length      > 0 ? Math.ceil(Math.max(...tempHistory) + 2)        : 40;
    const suhuMin       = suhuHistory.length      > 0 ? Math.floor(Math.min(...suhuHistory) - 2)      : 20;
    const suhuMax       = suhuHistory.length      > 0 ? Math.ceil(Math.max(...suhuHistory) + 2)        : 40;
    const humidMin     = humidHistory.length     > 0 ? Math.floor(Math.min(...humidHistory) - 5)     : 30;
    const humidMax     = humidHistory.length     > 0 ? Math.ceil(Math.max(...humidHistory) + 5)       : 90;
    const tdsMin       = tdsHistory.length       > 0 ? Math.floor(Math.min(...tdsHistory) - 20)      : 0;
    const tdsMax       = tdsHistory.length       > 0 ? Math.ceil(Math.max(...tdsHistory) + 20)        : 500;
    const phMin        = phHistory.length        > 0 ? Math.max(0, parseFloat((Math.min(...phHistory) - 0.5).toFixed(1))) : 0;
    const phMax        = phHistory.length        > 0 ? Math.min(14, parseFloat((Math.max(...phHistory) + 0.5).toFixed(1))) : 14;
    const rsRoMin      = rsRoHistory.length      > 0 ? Math.max(0, parseFloat((Math.min(...rsRoHistory) - 0.2).toFixed(2))) : 0;
    const rsRoMax      = rsRoHistory.length      > 0 ? parseFloat((Math.max(...rsRoHistory) + 0.2).toFixed(2))              : 5;
    const ntuMin       = ntuHistory.length       > 0 ? Math.max(0, Math.floor(Math.min(...ntuHistory) - 2)) : 0;
    const ntuMax       = ntuHistory.length       > 0 ? Math.ceil(Math.max(...ntuHistory) + 2)               : 100;

    const gasStyle  = gasStatusStyle(gasData?.status);
    const turbStyle = turbidityStatusStyle(latestData?.turbidity ?? null);

    const pumpAge        = deviceNames.pump ? (deviceAge[deviceNames.pump] ?? null) : null;
    const pumpNoData     = pumpAge === null;
    const pumpOn         = !pumpNoData && pumpAge < PUMP_AGE_OFFLINE;
    const pumpColor      = pumpNoData ? T.textFaint : pumpOn ? C.pumpOn : C.danger;
    const pumpLabel      = pumpNoData ? 'NO DATA' : pumpOn ? 'ON' : 'OFF';
    const pumpBorderColor = pumpNoData ? T.border : pumpOn ? tint(C.pumpOn, '44') : tint(C.danger, '44');
    const pumpBg         = pumpNoData ? T.panelSubtle : pumpOn ? tint(C.pumpOn, '0c') : tint(C.danger, '0c');

    const staleTag = (
        <span style={{ fontSize: '0.55rem', padding: '2px 6px', borderRadius: 4, border: `1px solid ${tint(C.danger, '55')}`, color: C.danger, letterSpacing: '0.06em', background: tint(C.danger, '0e') }}>STALE</span>
    );

    // ── Helper kartu sensor (kerangka konsisten) ──
    const sensorCard = (children) => (
        <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: '18px 18px 12px', boxShadow: T.shadow }}>
            {children}
        </div>
    );
    const cardHead = (Icon, color, title, stale) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: tint(color, '14'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={16} color={color} />
                </div>
                <span style={{ fontSize: '0.74rem', letterSpacing: '0.04em', color: T.text, fontWeight: 600 }}>{title}</span>
                {stale}
            </div>
        </div>
    );
    const waitBox = (h = 80) => (
        <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textFaint, fontSize: '0.72rem', letterSpacing: '0.04em' }}>Menunggu data…</div>
    );
    const footRange = (left, right, color) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: T.textFaint, marginTop: 6 }}>
            <span>{left}</span><span>{right}</span>
        </div>
    );
    const bigVal = (val, unit, color) => (
        <span style={{ fontSize: '1.9rem', fontWeight: 700, color, fontFamily: T.mono }}>
            {val ?? '--'}{unit && <span style={{ fontSize: '0.85rem', color: T.textFaint, marginLeft: 2 }}>{unit}</span>}
        </span>
    );

    const tabs = [['sensor', 'Sensor', Activity], ['analisa', 'Analisa', BarChart3], ['camera', 'Kamera', Eye], ['manage', 'Kelola', Download]];

    return (
        <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.ui }}>
            <style>{`
                @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
                @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.25} }
                @keyframes spin { to { transform: rotate(360deg) } }
                * { box-sizing: border-box; }
                button:focus-visible, a:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid ${T.brand}; outline-offset: 2px; }
            `}</style>

            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 28px', borderBottom: `1px solid ${T.border}`,
                background: T.panel, boxShadow: T.shadow, position: 'sticky', top: 0, zIndex: 50,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: tint(T.brand, '14'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Activity size={19} color={T.brand} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.92rem', fontWeight: 700, letterSpacing: '0.02em', color: T.text }}>Monitor BRCPF</span>
                        <span style={{ fontSize: '0.62rem', color: T.textMut, letterSpacing: '0.08em' }}>ESP8266 · Pemantauan Sensor Real-Time</span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <div style={{ display: 'none', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }} className="esp-badges">
                        <EspBadge label={deviceNames.env       ?? 'env'}       ageSeconds={deviceNames.env       ? (deviceAge[deviceNames.env]       ?? null) : null} />
                        <EspBadge label={deviceNames.suhu      ?? 'suhu'}      ageSeconds={deviceNames.suhu      ? (deviceAge[deviceNames.suhu]      ?? null) : null} />
                        <EspBadge label={deviceNames.tds       ?? 'tds'}       ageSeconds={deviceNames.tds       ? (deviceAge[deviceNames.tds]       ?? null) : null} />
                        <EspBadge label={deviceNames.ph        ?? 'ph'}        ageSeconds={deviceNames.ph        ? (deviceAge[deviceNames.ph]        ?? null) : null} />
                        <EspBadge label={deviceNames.gas       ?? 'gas'}       ageSeconds={deviceNames.gas       ? (deviceAge[deviceNames.gas]       ?? null) : null} />
                        <EspBadge label={deviceNames.turbidity ?? 'turbidity'} ageSeconds={deviceNames.turbidity ? (deviceAge[deviceNames.turbidity] ?? null) : null} />
                        <EspBadge label={deviceNames.pump      ?? 'pump'}      ageSeconds={deviceNames.pump      ? (deviceAge[deviceNames.pump]      ?? null) : null} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', letterSpacing: '0.04em', padding: '6px 12px', borderRadius: 20, background: connected ? tint(C.ok, '12') : tint(C.danger, '12'), border: `1px solid ${connected ? tint(C.ok, '40') : tint(C.danger, '40')}` }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? C.ok : C.danger, animation: 'pulse 1.4s infinite' }} />
                        <span style={{ color: connected ? C.ok : C.danger, fontWeight: 600 }}>{connected ? 'Server Terhubung' : 'Terputus'}</span>
                    </div>
                </div>
            </div>

            {/* TAB NAV */}
            <div style={{ display: 'flex', gap: 2, padding: '0 28px', borderBottom: `1px solid ${T.border}`, background: T.panel }}>
                {tabs.map(([id, label, Icon]) => (
                    <button key={id} onClick={() => { setActiveTab(id); if (id === 'camera') loadCamPhotos(); }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '13px 18px', border: 'none', cursor: 'pointer',
                            fontSize: '0.78rem', fontWeight: 600, fontFamily: T.ui,
                            background: 'transparent',
                            color: activeTab === id ? T.brand : T.textMut,
                            borderBottom: activeTab === id ? `2px solid ${T.brand}` : '2px solid transparent',
                            marginBottom: -1, transition: 'color .15s',
                        }}>
                        <Icon size={15} /> {label}
                    </button>
                ))}
            </div>

            {/* ── SENSOR TAB ── */}
            {activeTab === 'sensor' && <div style={{ padding: '22px 28px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 18, alignItems: 'start' }}>

                {sensorCard(<>
                    {cardHead(Thermometer, C.roomTemp, 'Suhu Ruang', deviceNames.env && deviceAge[deviceNames.env] >= AGE_OFFLINE && staleTag)}
                    <div style={{ textAlign: 'right', marginTop: -38, marginBottom: 8 }}>{bigVal(latestData?.temperature, '°C', C.roomTemp)}</div>
                    {tempHistory.length === 0 ? waitBox() : <ECGChart data={tempHistory} color={C.roomTemp} min={tempMin} max={tempMax} />}
                    {footRange(`${MAX_POINTS} pembacaan terakhir`, `min ${tempMin}° · maks ${tempMax}°`)}
                </>)}

                {sensorCard(<>
                    {cardHead(Waves, C.waterTemp, 'Suhu Air', deviceNames.suhu && deviceAge[deviceNames.suhu] >= AGE_OFFLINE && staleTag)}
                    <div style={{ textAlign: 'right', marginTop: -38, marginBottom: 8 }}>{bigVal(latestData?.suhu, '°C', C.waterTemp)}</div>
                    {suhuHistory.length === 0 ? waitBox() : <ECGChart data={suhuHistory} color={C.waterTemp} min={suhuMin} max={suhuMax} />}
                    {footRange(`${MAX_POINTS} pembacaan terakhir`, `min ${suhuMin}° · maks ${suhuMax}°`)}
                </>)}

                {sensorCard(<>
                    {cardHead(Droplets, C.humid, 'Kelembapan', deviceNames.env && deviceAge[deviceNames.env] >= AGE_OFFLINE && staleTag)}
                    <div style={{ textAlign: 'right', marginTop: -38, marginBottom: 8 }}>{bigVal(latestData?.humidity, '%', C.humid)}</div>
                    {humidHistory.length === 0 ? waitBox() : <ECGChart data={humidHistory} color={C.humid} min={humidMin} max={humidMax} />}
                    {footRange(`${MAX_POINTS} pembacaan terakhir`, `min ${humidMin}% · maks ${humidMax}%`)}
                </>)}

                {sensorCard(<>
                    {cardHead(Beaker, C.tds, 'TDS', deviceNames.tds && deviceAge[deviceNames.tds] >= AGE_OFFLINE && staleTag)}
                    <div style={{ textAlign: 'right', marginTop: -38, marginBottom: 8 }}>{bigVal(latestData?.tds, 'ppm', C.tds)}</div>
                    {tdsHistory.length === 0 ? waitBox() : <ECGChart data={tdsHistory} color={C.tds} min={tdsMin} max={tdsMax} />}
                    {footRange(`${MAX_POINTS} pembacaan terakhir`, `min ${tdsMin} · maks ${tdsMax} ppm`)}
                </>)}

                {sensorCard(<>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: tint(C.ph, '14'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FlaskConical size={16} color={C.ph} /></div>
                            <span style={{ fontSize: '0.74rem', letterSpacing: '0.04em', color: T.text, fontWeight: 600 }}>pH</span>
                            {deviceNames.ph && deviceAge[deviceNames.ph] >= AGE_OFFLINE && staleTag}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                            {bigVal(latestData?.ph, '', C.ph)}
                            {latestData?.alkalinity != null && <span style={{ fontSize: '0.68rem', color: T.textMut }}>Alk: {latestData.alkalinity} mg/L</span>}
                        </div>
                    </div>
                    {phHistory.length === 0 ? waitBox() : <ECGChart data={phHistory} color={C.ph} min={phMin} max={phMax} />}
                    {footRange(`${MAX_POINTS} pembacaan terakhir`, `min ${phMin} · maks ${phMax}`)}
                </>)}

                {/* Pompa */}
                <div style={{ background: pumpBg, border: `1px solid ${pumpBorderColor}`, borderRadius: 12, padding: '18px 18px 12px', boxShadow: T.shadow, transition: 'border .4s, background .4s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: tint(pumpColor, '16'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Zap size={16} color={pumpColor} /></div>
                            <span style={{ fontSize: '0.74rem', letterSpacing: '0.04em', color: T.text, fontWeight: 600 }}>Pompa Air · esp-pump</span>
                            {deviceNames.pump && deviceAge[deviceNames.pump] >= AGE_OFFLINE && staleTag}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: pumpColor, animation: pumpOn ? 'pulse 1s infinite' : 'none' }} />
                            <span style={{ fontSize: '1.7rem', fontWeight: 700, color: pumpColor, fontFamily: T.mono }}>{pumpLabel}</span>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                        {[
                            { label: 'Status', value: pumpLabel, unit: '' },
                            { label: 'Terakhir', value: pumpAge != null ? `${pumpAge}` : '--', unit: 's lalu' },
                            { label: 'Timeout', value: `${PUMP_AGE_OFFLINE}`, unit: 's' },
                        ].map(({ label, value, unit }) => (
                            <div key={label} style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 12px' }}>
                                <div style={{ fontSize: '0.55rem', color: T.textFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: pumpColor, fontFamily: T.mono, lineHeight: 1 }}>{value}<span style={{ fontSize: '0.66rem', color: T.textFaint, marginLeft: 2 }}>{unit}</span></div>
                            </div>
                        ))}
                    </div>
                    <div style={{ fontSize: '0.55rem', color: T.textMut, letterSpacing: '0.06em', marginBottom: 4 }}>LINIMASA POMPA · isi = ON · kosong = OFF</div>
                    {pumpHistory.length === 0 ? waitBox(60) : <PumpChart data={pumpHistory} color={C.pumpOn} />}
                    {footRange(`${MAX_POINTS} pembacaan terakhir`, '0 = OFF · 1 = ON')}
                </div>

                {/* Turbiditas */}
                <div style={{ gridColumn: '1 / -1', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: '18px 18px 12px', boxShadow: T.shadow }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: tint(C.turb, '14'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Eye size={16} color={C.turb} /></div>
                            <span style={{ fontSize: '0.74rem', letterSpacing: '0.04em', color: T.text, fontWeight: 600 }}>Turbiditas · SEN0175</span>
                            {deviceNames.turbidity && deviceAge[deviceNames.turbidity] >= AGE_OFFLINE && staleTag}
                        </div>
                        <span style={{ fontSize: '0.66rem', padding: '4px 12px', borderRadius: 20, fontWeight: 700, letterSpacing: '0.04em', color: turbStyle.color, border: `1px solid ${turbStyle.border}`, background: turbStyle.bg, animation: latestData?.turbidity > 50 ? 'blink 0.9s infinite' : 'none' }}>{turbStyle.label}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                        {[
                            { label: 'Turbidity', value: latestData?.turbidity ?? '--', unit: 'NTU' },
                            { label: 'TSS', value: latestData?.tss ?? '--', unit: 'mg/L' },
                            { label: 'Clarity', value: latestData?.clarity ?? '--', unit: '%' },
                            { label: 'Voltage', value: turbidityData?.voltage != null ? Number(turbidityData.voltage).toFixed(3) : '--', unit: 'V' },
                        ].map(({ label, value, unit }) => (
                            <div key={label} style={{ background: T.panelSubtle, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 14px' }}>
                                <div style={{ fontSize: '0.55rem', color: T.textFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: C.turb, fontFamily: T.mono, lineHeight: 1 }}>{value}<span style={{ fontSize: '0.66rem', color: T.textFaint, marginLeft: 2 }}>{unit}</span></div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                        <div>
                            <div style={{ fontSize: '0.55rem', color: T.textMut, letterSpacing: '0.06em', marginBottom: 4 }}>TURBIDITY (NTU)</div>
                            {ntuHistory.length === 0 ? waitBox() : <ECGChart data={ntuHistory} color={C.turb} min={ntuMin} max={ntuMax} />}
                        </div>
                        <div>
                            <div style={{ fontSize: '0.55rem', color: T.textMut, letterSpacing: '0.06em', marginBottom: 4 }}>CLARITY (%)</div>
                            {clarityHistory.length === 0 ? waitBox() : <ECGChart data={clarityHistory} color={C.ok} min={0} max={100} />}
                        </div>
                    </div>
                </div>

                {/* Gas */}
                <div style={{ gridColumn: '1 / -1', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: '18px 18px 12px', boxShadow: T.shadow }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: tint(C.gas, '14'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Wind size={16} color={C.gas} /></div>
                            <span style={{ fontSize: '0.74rem', letterSpacing: '0.04em', color: T.text, fontWeight: 600 }}>Gas · MiCS-5524</span>
                            {deviceNames.gas && deviceAge[deviceNames.gas] >= AGE_OFFLINE && staleTag}
                        </div>
                        <span style={{ fontSize: '0.66rem', padding: '4px 12px', borderRadius: 20, fontWeight: 700, letterSpacing: '0.04em', color: gasStyle.color, border: `1px solid ${gasStyle.border}`, background: gasStyle.bg, animation: gasData?.status === 'DANGER' ? 'blink 0.9s infinite' : 'none' }}>{gasData?.status ?? 'NO DATA'}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                        {[
                            { label: 'ADC Raw', value: gasData?.adc_raw ?? '--', unit: '' },
                            { label: 'Voltage', value: gasData?.voltage != null ? Number(gasData.voltage).toFixed(3) : '--', unit: 'V' },
                            { label: 'Baseline V', value: gasData?.baseline_v != null ? Number(gasData.baseline_v).toFixed(3) : '--', unit: 'V' },
                            { label: 'Rs/Ro', value: gasData?.rs_ro_ratio != null ? Number(gasData.rs_ro_ratio).toFixed(3) : '--', unit: '' },
                        ].map(({ label, value, unit }) => (
                            <div key={label} style={{ background: T.panelSubtle, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 14px' }}>
                                <div style={{ fontSize: '0.55rem', color: T.textFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: C.gas, fontFamily: T.mono, lineHeight: 1 }}>{value}<span style={{ fontSize: '0.66rem', color: T.textFaint, marginLeft: 2 }}>{unit}</span></div>
                            </div>
                        ))}
                    </div>
                    {gasData?.gas_hint && (
                        <div style={{ marginBottom: 14, padding: '9px 14px', background: tint(C.gas, '0c'), border: `1px solid ${tint(C.gas, '30')}`, borderRadius: 8, fontSize: '0.72rem', color: C.gas }}>
                            <span style={{ color: T.textMut, marginRight: 8 }}>Catatan gas ›</span>{gasData.gas_hint}
                        </div>
                    )}
                    {rsRoHistory.length === 0 ? waitBox() : <ECGChart data={rsRoHistory} color={C.gas} min={rsRoMin} max={rsRoMax} />}
                    {footRange(`${MAX_POINTS} pembacaan terakhir (Rs/Ro)`, `min ${rsRoMin} · maks ${rsRoMax}`)}
                </div>

                {/* Log Tabel */}
                <div style={{ gridColumn: '1 / -1', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: T.shadow }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: T.text }}>Log Sensor · {history.length} catatan</span>
                        <button onClick={downloadHistoryCSV} disabled={!history.length} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: tint(T.brand, '10'), border: `1px solid ${tint(T.brand, '40')}`, borderRadius: 6, color: T.brand, cursor: history.length ? 'pointer' : 'not-allowed', fontSize: '0.68rem', fontWeight: 600, fontFamily: T.ui, opacity: history.length ? 1 : 0.5 }}>
                            <FileDown size={13} /> Unduh CSV
                        </button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                            <thead>
                                <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.panelSubtle }}>
                                    {['Waktu', 'Suhu Ruang', 'Suhu Air', 'Kelembapan', 'TDS', 'pH', 'Alkalinitas', 'Turbidity', 'TSS', 'Clarity', 'Pompa', 'Status'].map(h => (
                                        <th key={h} style={{ padding: '9px 14px', textAlign: 'left', color: T.textMut, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {history.length > 0 ? [...history].reverse().map((d, i) => {
                                    const ts = turbidityStatusStyle(d.turbidity ?? null);
                                    const rowPumpOn = d.pumping === 1;
                                    const rowPumpColor = d.pumping == null ? T.textFaint : rowPumpOn ? C.ok : C.danger;
                                    return (
                                        <tr key={i} style={{ borderBottom: `1px solid ${T.border}`, background: i === 0 ? tint(T.brand, '08') : 'transparent' }}>
                                            <td style={{ padding: '9px 14px', color: T.textMut, whiteSpace: 'nowrap', fontFamily: T.mono }}>{d.timestamp}</td>
                                            <td style={{ padding: '9px 14px', color: i === 0 ? C.roomTemp : T.textMut, fontWeight: i === 0 ? 700 : 400, fontFamily: T.mono }}>{d.temperature ?? '--'}</td>
                                            <td style={{ padding: '9px 14px', color: i === 0 ? C.waterTemp : T.textMut, fontWeight: i === 0 ? 700 : 400, fontFamily: T.mono }}>{d.suhu ?? '--'}</td>
                                            <td style={{ padding: '9px 14px', color: i === 0 ? C.humid : T.textMut, fontWeight: i === 0 ? 700 : 400, fontFamily: T.mono }}>{d.humidity ?? '--'}</td>
                                            <td style={{ padding: '9px 14px', color: i === 0 ? C.tds : T.textMut, fontWeight: i === 0 ? 700 : 400, fontFamily: T.mono }}>{d.tds ?? '--'}</td>
                                            <td style={{ padding: '9px 14px', color: i === 0 ? C.ph : T.textMut, fontWeight: i === 0 ? 700 : 400, fontFamily: T.mono }}>{d.ph ?? '--'}</td>
                                            <td style={{ padding: '9px 14px', color: T.textMut, fontFamily: T.mono }}>{d.alkalinity != null ? `${d.alkalinity}` : '--'}</td>
                                            <td style={{ padding: '9px 14px', color: i === 0 ? C.turb : T.textMut, fontWeight: i === 0 ? 700 : 400, fontFamily: T.mono }}>{d.turbidity ?? '--'}</td>
                                            <td style={{ padding: '9px 14px', color: T.textMut, fontFamily: T.mono }}>{d.tss ?? '--'}</td>
                                            <td style={{ padding: '9px 14px', color: T.textMut, fontFamily: T.mono }}>{d.clarity != null ? `${d.clarity}%` : '--'}</td>
                                            <td style={{ padding: '9px 14px' }}>
                                                {d.pumping != null ? (
                                                    <span style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: 4, fontWeight: 700, color: rowPumpColor, border: `1px solid ${rowPumpColor}44`, background: `${rowPumpColor}11` }}>{rowPumpOn ? 'ON' : 'OFF'}</span>
                                                ) : <span style={{ color: T.textFaint }}>--</span>}
                                            </td>
                                            <td style={{ padding: '9px 14px' }}>
                                                <span style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: 4, border: `1px solid ${ts.border}`, color: ts.color, background: ts.bg }}>{d.turbidity != null ? ts.label : 'NORMAL'}</span>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr><td colSpan={13} style={{ padding: '28px', textAlign: 'center', color: T.textFaint, fontSize: '0.72rem' }}>Menunggu data dari ESP8266…</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>}

            {/* ── ANALISA TAB ── */}
            {activeTab === 'analisa' && <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: T.text }}>Analisa Data Real-Time</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '0.74rem', color: T.textMut }}>Statistik dihitung langsung dari {MAX_POINTS} pembacaan terakhir tiap parameter — diperbarui setiap 5 detik.</p>
                    </div>
                    <button onClick={downloadAnalysisCSV} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: T.brand, border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600, fontFamily: T.ui, boxShadow: T.shadow }}>
                        <Download size={15} /> Unduh Analisa (CSV)
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                    {analysisRows.map(r => (
                        <StatCard key={r.key} icon={r.icon} label={r.label} unit={r.unit} color={r.color} stats={r.stats} />
                    ))}
                </div>

                {/* Tabel ringkas */}
                <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: T.shadow }}>
                    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, fontSize: '0.72rem', fontWeight: 600, color: T.text }}>Ringkasan Statistik</div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                            <thead>
                                <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.panelSubtle }}>
                                    {['Parameter', 'Terkini', 'Rata-rata', 'Min', 'Maks', 'Std', 'CV %', 'Tren'].map(h => (
                                        <th key={h} style={{ padding: '9px 14px', textAlign: h === 'Parameter' ? 'left' : 'right', color: T.textMut, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {analysisRows.filter(r => r.stats).map(r => (
                                    <tr key={r.key} style={{ borderBottom: `1px solid ${T.border}` }}>
                                        <td style={{ padding: '9px 14px', color: T.text, fontWeight: 600 }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                                                <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: 'inline-block' }} />
                                                {r.label}<span style={{ color: T.textFaint, fontWeight: 400 }}> {r.unit}</span>
                                            </span>
                                        </td>
                                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: T.mono, fontWeight: 700, color: r.color }}>{fmt(r.stats.current, 2)}</td>
                                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: T.mono, color: T.text }}>{fmt(r.stats.mean, 2)}</td>
                                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: T.mono, color: T.textMut }}>{fmt(r.stats.min, 1)}</td>
                                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: T.mono, color: T.textMut }}>{fmt(r.stats.max, 1)}</td>
                                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: T.mono, color: T.textMut }}>{fmt(r.stats.std, 2)}</td>
                                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: T.mono, color: T.textMut }}>{fmt(r.stats.cv, 1)}</td>
                                        <td style={{ padding: '9px 14px', textAlign: 'right' }}><TrendBadge trend={r.stats.trend} /></td>
                                    </tr>
                                ))}
                                {analysisRows.every(r => !r.stats) && (
                                    <tr><td colSpan={8} style={{ padding: '28px', textAlign: 'center', color: T.textFaint }}>Menunggu data untuk dianalisa…</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style={{ fontSize: '0.66rem', color: T.textFaint, lineHeight: 1.6 }}>
                    Std = simpangan baku · CV = koefisien variasi (std ÷ rata-rata × 100%) sebagai ukuran kestabilan relatif · Tren ditentukan dari kemiringan regresi linear pembacaan terakhir.
                </div>
            </div>}

            {/* ── CAMERA TAB ── */}
            {activeTab === 'camera' && (
                <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {camToast && (
                        <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 999, background: T.panel, border: `1px solid ${camToast.type === 'error' ? tint(C.danger, '55') : tint(C.ok, '55')}`, borderRadius: 10, padding: '12px 16px', fontSize: '0.76rem', color: camToast.type === 'error' ? C.danger : C.ok, boxShadow: T.shadowMd, fontWeight: 500 }}>{camToast.msg}</div>
                    )}
                    {camLightbox && (
                        <div onClick={() => setCamLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src={camLightbox} alt="pratinjau" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} />
                            <span onClick={() => setCamLightbox(null)} style={{ position: 'absolute', top: 20, right: 24, fontSize: 28, color: '#fff', cursor: 'pointer' }}>✕</span>
                        </div>
                    )}

                    {/* Preview */}
                    <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, boxShadow: T.shadow }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                            <Eye size={16} color={T.brand} />
                            <span style={{ fontSize: '0.76rem', fontWeight: 600, color: T.text }}>Pratinjau Langsung</span>
                        </div>
                        <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', background: '#0f172a', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}`, aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {camPreviewUrl ? <img src={camPreviewUrl} alt="pratinjau" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div style={{ color: T.textFaint, fontSize: '0.72rem' }}>Tekan Mulai Pratinjau</div>}
                        </div>
                        {camPreviewFile && <div style={{ textAlign: 'center', marginTop: 8, fontSize: '0.66rem', color: T.textMut, fontFamily: T.mono }}>{camPreviewFile}</div>}
                        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
                            {!camPreviewTimer
                                ? <button onClick={startCamPreview} style={{ padding: '9px 18px', background: tint(C.ok, '12'), border: `1px solid ${tint(C.ok, '45')}`, borderRadius: 7, color: C.ok, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, fontFamily: T.ui }}>▶ Mulai</button>
                                : <button onClick={stopCamPreview} style={{ padding: '9px 18px', background: tint(C.danger, '12'), border: `1px solid ${tint(C.danger, '45')}`, borderRadius: 7, color: C.danger, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, fontFamily: T.ui }}>⏹ Berhenti</button>}
                            <button onClick={() => { camCapture(); setTimeout(fetchLatestPreview, 600); }} disabled={camCapturing} style={{ padding: '9px 18px', background: tint(T.brand, '10'), border: `1px solid ${tint(T.brand, '45')}`, borderRadius: 7, color: T.brand, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, fontFamily: T.ui, opacity: camCapturing ? 0.5 : 1 }}>{camCapturing ? '⏳ …' : '📷 Ambil & Tampilkan'}</button>
                        </div>
                        <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: '0.66rem', color: T.textMut }}>Interval:</span>
                                <select value={camPreviewInterval} onChange={e => changePreviewInterval(Number(e.target.value))} style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text, padding: '5px 8px', borderRadius: 6, fontSize: '0.72rem', fontFamily: T.ui }}>
                                    <option value={1000}>1 detik</option><option value={3000}>3 detik</option><option value={5000}>5 detik</option><option value={10000}>10 detik</option><option value={60000}>1 menit</option><option value={300000}>5 menit</option><option value={600000}>10 menit</option>
                                </select>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.68rem', color: T.textMut }}>
                                <input type="checkbox" checked={camAutoCapture} onChange={e => toggleAutoCapture(e.target.checked)} style={{ accentColor: T.brand, width: 14, height: 14 }} />
                                Auto-Capture <span style={{ color: camAutoCapture ? C.ok : T.textFaint, fontWeight: 600 }}>{camAutoCapture ? 'ON' : 'OFF'}</span>
                            </label>
                        </div>
                    </div>

                    {/* Galeri */}
                    <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, boxShadow: T.shadow }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: '0.76rem', fontWeight: 600, color: T.text }}>Galeri</span>
                                <span style={{ fontSize: '0.62rem', padding: '2px 8px', border: `1px solid ${T.border}`, borderRadius: 10, color: T.textMut }}>{camPhotos.length} foto</span>
                                {camSelected.size > 0 && <span style={{ fontSize: '0.62rem', padding: '2px 8px', border: `1px solid ${tint(T.brand, '45')}`, borderRadius: 10, color: T.brand }}>{camSelected.size} dipilih</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {camSelectMode && <>
                                    <button onClick={toggleSelectAll} style={{ padding: '6px 12px', background: tint(C.ok, '10'), border: `1px solid ${tint(C.ok, '35')}`, borderRadius: 6, color: C.ok, cursor: 'pointer', fontSize: '0.66rem', fontWeight: 600, fontFamily: T.ui }}>☑ Semua</button>
                                    <button onClick={bulkDownload} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: tint(T.brand, '10'), border: `1px solid ${tint(T.brand, '40')}`, borderRadius: 6, color: T.brand, cursor: 'pointer', fontSize: '0.66rem', fontWeight: 600, fontFamily: T.ui }}><Download size={12} /> Unduh ZIP</button>
                                    <button onClick={bulkDelete} style={{ padding: '6px 12px', background: tint(C.danger, '10'), border: `1px solid ${tint(C.danger, '35')}`, borderRadius: 6, color: C.danger, cursor: 'pointer', fontSize: '0.66rem', fontWeight: 600, fontFamily: T.ui }}>✕ Hapus</button>
                                </>}
                                <button onClick={() => { setCamSelectMode(s => !s); setCamSelected(new Set()); }} style={{ padding: '6px 12px', background: camSelectMode ? tint(C.danger, '10') : T.panelSubtle, border: `1px solid ${camSelectMode ? tint(C.danger, '35') : T.border}`, borderRadius: 6, color: camSelectMode ? C.danger : T.textMut, cursor: 'pointer', fontSize: '0.66rem', fontWeight: 600, fontFamily: T.ui }}>{camSelectMode ? '✕ Batal' : '☐ Pilih'}</button>
                                <button onClick={loadCamPhotos} style={{ padding: '6px 12px', background: T.panelSubtle, border: `1px solid ${T.border}`, borderRadius: 6, color: T.textMut, cursor: 'pointer', fontSize: '0.66rem', fontWeight: 600, fontFamily: T.ui }}>↻ Segarkan</button>
                            </div>
                        </div>
                        {camPhotos.length === 0
                            ? <div style={{ textAlign: 'center', padding: '40px 20px', color: T.textFaint, fontSize: '0.72rem' }}>Belum ada foto</div>
                            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                                {camPhotos.map(p => {
                                    const imgUrl = SERVER + '/cam/photo?file=' + encodeURIComponent(p.path);
                                    const sel = camSelected.has(p.name);
                                    return (
                                        <div key={p.name} style={{ background: T.panel, borderRadius: 10, overflow: 'hidden', border: `1px solid ${sel ? T.brand : T.border}`, transition: 'border-color .15s', boxShadow: T.shadow }}>
                                            <div onClick={() => camSelectMode ? toggleCamSelect(p.name) : setCamLightbox(imgUrl)} style={{ width: '100%', aspectRatio: '4/3', position: 'relative', overflow: 'hidden', background: '#0f172a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <img src={imgUrl} alt={p.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                                                {sel && <div style={{ position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: '50%', background: T.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff' }}>✓</div>}
                                            </div>
                                            <div style={{ padding: '8px 10px' }}>
                                                <div style={{ fontSize: '0.64rem', fontFamily: T.mono, color: T.textMut, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                                <div style={{ fontSize: '0.6rem', color: T.textFaint, marginBottom: 7 }}>{Math.round(p.size / 1024)} KB</div>
                                                <div style={{ display: 'flex', gap: 5 }}>
                                                    <a href={imgUrl} download={p.name} style={{ flex: 1, padding: '5px 6px', background: tint(T.brand, '10'), border: `1px solid ${tint(T.brand, '30')}`, borderRadius: 5, color: T.brand, fontSize: '0.62rem', fontWeight: 600, textAlign: 'center', textDecoration: 'none', fontFamily: T.ui }}>⬇ Unduh</a>
                                                    <button onClick={async () => {
                                                        if (!window.confirm('Hapus ' + p.name + '?')) return;
                                                        try {
                                                            const data = await camApi('/delete?file=' + encodeURIComponent(p.path), { method: 'DELETE' }).then(r => r.json());
                                                            if (data.success) { showCamToast('Dihapus: ' + p.name); loadCamPhotos(); }
                                                            else showCamToast('Gagal hapus', 'error');
                                                        } catch { showCamToast('Koneksi gagal', 'error'); }
                                                    }} style={{ flex: 1, padding: '5px 6px', background: tint(C.danger, '10'), border: `1px solid ${tint(C.danger, '30')}`, borderRadius: 5, color: C.danger, fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer', fontFamily: T.ui }}>✕ Hapus</button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>}
                    </div>
                </div>
            )}

            {/* ── MANAGE TAB ── */}
            {activeTab === 'manage' && (
                <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 760 }}>
                    {manageMsg && (
                        <div style={{ padding: '12px 16px', borderRadius: 10, fontSize: '0.76rem', fontWeight: 500, background: manageMsg.type === 'error' ? tint(C.danger, '10') : tint(C.ok, '10'), border: `1px solid ${manageMsg.type === 'error' ? tint(C.danger, '45') : tint(C.ok, '45')}`, color: manageMsg.type === 'error' ? C.danger : C.ok }}>{manageMsg.text}</div>
                    )}

                    {/* Export CSV server */}
                    <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: 22, boxShadow: T.shadow }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <Download size={16} color={T.brand} />
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: T.text }}>Ekspor Data Sensor (CSV)</span>
                        </div>
                        <p style={{ margin: '0 0 16px', fontSize: '0.72rem', color: T.textMut }}>Unduh seluruh riwayat dari database server, sesuai device dan rentang waktu.</p>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <span style={{ fontSize: '0.62rem', color: T.textMut, fontWeight: 600 }}>DEVICE</span>
                                <select value={csvDevice} onChange={e => setCsvDevice(e.target.value)} style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text, padding: '8px 10px', borderRadius: 7, fontSize: '0.74rem', fontFamily: T.ui }}>
                                    <option value="all">Semua Device</option>
                                    <option value="esp-main">esp-main (Suhu Ruang/Humidity)</option>
                                    <option value="esp-suhu">esp-suhu (Suhu Air · DS18B20)</option>
                                    <option value="esp-tds">esp-tds (TDS)</option>
                                    <option value="esp-ph">esp-ph (pH)</option>
                                    <option value="esp-gas">esp-gas (Gas)</option>
                                    <option value="esp-turbidity">esp-turbidity</option>
                                    <option value="esp-pump">esp-pump (Pompa)</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <span style={{ fontSize: '0.62rem', color: T.textMut, fontWeight: 600 }}>RENTANG</span>
                                <select value={csvDays} onChange={e => setCsvDays(Number(e.target.value))} style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text, padding: '8px 10px', borderRadius: 7, fontSize: '0.74rem', fontFamily: T.ui }}>
                                    <option value={1}>1 hari</option><option value={7}>7 hari</option><option value={30}>30 hari</option><option value={90}>90 hari</option><option value={9999}>Semua data</option>
                                </select>
                            </div>
                            <a href={`${SERVER}/api/export/csv?device=${csvDevice === 'all' ? '' : csvDevice}&days=${csvDays}`} download style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: T.brand, border: 'none', borderRadius: 8, color: '#fff', textDecoration: 'none', fontSize: '0.74rem', fontWeight: 600, fontFamily: T.ui, boxShadow: T.shadow }}>
                                <Download size={14} /> Unduh CSV
                            </a>
                        </div>
                        <div style={{ paddingTop: 14, borderTop: `1px solid ${T.border}`, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button onClick={downloadAnalysisCSV} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: T.panelSubtle, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, fontFamily: T.ui }}><FileDown size={13} /> Analisa real-time (CSV)</button>
                            <button onClick={downloadHistoryCSV} disabled={!history.length} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: T.panelSubtle, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, cursor: history.length ? 'pointer' : 'not-allowed', fontSize: '0.72rem', fontWeight: 600, fontFamily: T.ui, opacity: history.length ? 1 : 0.5 }}><FileDown size={13} /> Log layar ({history.length})</button>
                        </div>
                    </div>

                    {/* Clear DB */}
                    <div style={{ background: T.panel, border: `1px solid ${tint(C.danger, '30')}`, borderRadius: 12, padding: 22, boxShadow: T.shadow }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <X size={16} color={C.danger} />
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: C.danger }}>Kosongkan Database</span>
                        </div>
                        <p style={{ margin: '0 0 16px', fontSize: '0.72rem', color: T.textMut, lineHeight: 1.6 }}>Menghapus semua data sensor dari database secara permanen. Pastikan sudah mengekspor CSV sebelum melanjutkan.</p>
                        {dbCount !== null && (
                            <div style={{ fontSize: '0.72rem', color: C.danger, marginBottom: 12 }}>Total data: <strong>{dbCount.toLocaleString()}</strong> baris</div>
                        )}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button onClick={async () => {
                                try { const res = await fetch(SERVER + '/api/db/count').then(r => r.json()); setDbCount(res.count); }
                                catch { setManageMsg({ type: 'error', text: 'Gagal mengambil jumlah data' }); }
                            }} style={{ padding: '9px 16px', background: T.panelSubtle, border: `1px solid ${T.border}`, borderRadius: 7, color: T.textMut, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, fontFamily: T.ui }}>🔍 Cek Jumlah Data</button>
                            <button onClick={async () => {
                                if (!window.confirm('Yakin menghapus SEMUA data sensor? Aksi ini tidak bisa dibatalkan.')) return;
                                if (!window.confirm('Konfirmasi sekali lagi — semua data akan hilang permanen.')) return;
                                setDbDeleting(true);
                                try {
                                    const res = await fetch(SERVER + '/api/db/clear', { method: 'DELETE' }).then(r => r.json());
                                    if (res.success) { setDbCount(0); setManageMsg({ type: 'success', text: `Database dikosongkan. ${res.deleted} baris dihapus.` }); }
                                    else setManageMsg({ type: 'error', text: res.error || 'Gagal menghapus' });
                                } catch { setManageMsg({ type: 'error', text: 'Koneksi gagal' }); }
                                setDbDeleting(false);
                            }} disabled={dbDeleting} style={{ padding: '9px 16px', background: C.danger, border: 'none', borderRadius: 7, color: '#fff', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, fontFamily: T.ui, opacity: dbDeleting ? 0.5 : 1 }}>{dbDeleting ? '⏳ Menghapus…' : '🗑 Kosongkan Database'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Notifikasi progress unduhan ZIP (global) */}
            <DownloadProgress state={zipProgress} onClose={() => setZipProgress(null)} />
        </div>
    );
}