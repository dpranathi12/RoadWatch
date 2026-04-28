// ============================================================
//  RoadWatch — Main Application v6
//  Leaflet.js + OpenStreetMap  |  Google Maps-style navigation UI
// ============================================================
(function () {
  'use strict';

  const D = window.RW_DATA;
  const M = window.RW_MAP;

  // ─── App State ─────────────────────────────────────────
  let currentPage   = 'home';
  let mainMap       = null;
  let markerResult  = null;
  let gpsTracker    = null;
  let simTracker    = null;
  let userLat       = null;
  let userLng       = null;
  let rainMode      = false;
  let rainAnimId    = null;
  let rainCtrl      = null;
  let alertsEnabled = false;
  let lastAlertedId = null;
  let bumpCooldown  = false;

  // Sensor (auto-detect) state
  const S = window.RW_SENSOR;
  let sensorRunning     = false;
  let autoMarkers       = {};         // id → Leaflet marker
  let waveCtx           = null;       // canvas 2D context for oscilloscope
  let waveRaf           = null;       // requestAnimationFrame id
  let waveHistory       = new Array(200).fill(0);  // ring buffer copy for drawing
  let waveHistHead      = 0;

  // ─── Router ────────────────────────────────────────────
  function navigate(page) {
    currentPage = page;
    document.querySelectorAll('.nav-link').forEach(el =>
      el.classList.toggle('active', el.dataset.page === page));
    document.body.classList.toggle('fullmap-mode', page === 'risk-map');
    if (page !== 'risk-map') window.scrollTo({ top: 0, behavior: 'smooth' });
    render();
  }

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  function timeAgo(d) {
    const m = Math.floor((Date.now() - new Date(d)) / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function fmtDate(s) {
    return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function animCount(el, target, dur = 1200) {
    const t0 = performance.now();
    function step(now) {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = Math.round((1 - (1 - p) ** 3) * target);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ── Rain mode ──────────────────────────────────────────
  function initRain() {
    const cv = document.getElementById('rain-canvas');
    if (!cv) return { start() {}, stop() {} };
    const ctx = cv.getContext('2d');
    let drops = [];
    const resize = () => { cv.width = innerWidth; cv.height = innerHeight; };
    resize(); window.addEventListener('resize', resize);
    const mk = () => ({ x: Math.random() * cv.width, y: Math.random() * -cv.height,
      spd: 5 + Math.random() * 9, len: 12 + Math.random() * 22,
      op: .08 + Math.random() * .22, w: .5 + Math.random() * 1.2 });
    for (let i = 0; i < 220; i++) { const d = mk(); d.y = Math.random() * cv.height; drops.push(d); }
    function draw() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = '#88c4f5'; ctx.lineCap = 'round';
      drops.forEach(d => {
        ctx.beginPath(); ctx.lineWidth = d.w; ctx.globalAlpha = d.op;
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 1.5, d.y + d.len); ctx.stroke();
        d.y += d.spd; d.x += .6;
        if (d.y > cv.height) Object.assign(d, mk());
      });
      ctx.globalAlpha = 1; rainAnimId = requestAnimationFrame(draw);
    }
    return {
      start() { cv.classList.add('active'); document.body.classList.add('rain-mode'); draw(); },
      stop()  { cv.classList.remove('active'); document.body.classList.remove('rain-mode');
                if (rainAnimId) { cancelAnimationFrame(rainAnimId); rainAnimId = null; }
                ctx.clearRect(0, 0, cv.width, cv.height); },
    };
  }

  // ══════════════════════════════════════════════════════
  //  SHARED SNIPPETS
  // ══════════════════════════════════════════════════════
  function weatherHTML() {
    return rainMode
      ? `<div class="weather-widget rainy"><div class="weather-icon">🌧️</div>
          <div class="weather-info"><div class="weather-temp">24°C — Heavy Rain</div>
          <div class="weather-condition">Hyderabad · Humidity 94% · Visibility low</div></div>
          <div class="weather-alert"><span>⚠️</span> Pothole risk HIGH</div></div>`
      : `<div class="weather-widget"><div class="weather-icon">☀️</div>
          <div class="weather-info"><div class="weather-temp">35°C — Clear</div>
          <div class="weather-condition">Hyderabad · Humidity 58% · Visibility good</div></div></div>`;
  }

  function tickerHTML() {
    const dangerous = D.getAllPotholes().filter(p => p.severity === 'dangerous' && p.status !== 'repaired');
    const msgs = dangerous.map(p => `⚠️ ${p.description.substring(0, 48)}… (${p.lat.toFixed(3)}, ${p.lng.toFixed(3)})`);
    const t = (msgs.join('  ·  ') + '  ·  ' + msgs.join('  ·  '));
    return `<div class="notif-ticker"><div class="notif-ticker-icon">🔴</div>
      <div class="notif-ticker-text"><span>${t}</span></div></div>`;
  }

  // ══════════════════════════════════════════════════════
  //  PAGE: HOME
  // ══════════════════════════════════════════════════════
  function renderHome() {
    const s = D.getStats();
    return `<section class="page page--home fade-in">
      <div class="hero-banner"><div class="hero-content">
        <div class="hero-badge">🛡️ Live Road Safety Platform</div>
        <h1>RoadWatch</h1>
        <p class="hero-sub">Real-time pothole detection powered by OpenStreetMap.<br>Your safety co-pilot for Indian roads.</p>
        <div class="hero-stats">
          <div class="stat-card"><span class="stat-num" data-count="${s.total}">0</span><span class="stat-label">Reported</span></div>
          <div class="stat-card stat-card--danger"><span class="stat-num" data-count="${s.dangerous}">0</span><span class="stat-label">Dangerous</span></div>
          <div class="stat-card stat-card--rain"><span class="stat-num" data-count="${s.rainHazards}">0</span><span class="stat-label">Rain Hazards</span></div>
          <div class="stat-card stat-card--fixed"><span class="stat-num" data-count="${s.repaired}">0</span><span class="stat-label">Repaired</span></div>
        </div>
        <div class="hero-actions">
          <button class="btn btn--primary btn--lg" onclick="window.__nav('risk-map')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
            Open Live Map
          </button>
          <button class="btn btn--secondary" onclick="window.__nav('report')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            Report Pothole
          </button>
        </div>
        ${rainMode ? `<div class="rain-warning-banner">🌧️ <strong>Rain Mode Active</strong> — ${s.rainHazards} potholes currently invisible. Drive with extreme caution!</div>` : ''}
      </div></div>
      ${weatherHTML()} ${tickerHTML()}
      <div class="home-map-section">
        <div class="section-header">
          <h2>📍 Live Road Map</h2>
          <div class="section-legend">
            <span class="leg-dot leg-dot--green"></span>Minor
            <span class="leg-dot leg-dot--yellow"></span>Medium
            <span class="leg-dot leg-dot--red"></span>Dangerous
          </div>
        </div>
        <div id="home-map" class="map-container"></div>
      </div>
      <div class="bump-detector" id="bump-detector">
        <div class="bump-icon">📱</div>
        <div class="bump-info"><div class="bump-title">Motion Sensor Active</div>
          <div class="bump-sub" id="bump-sub">Monitoring for road bumps…</div></div>
        <div class="bump-indicator"><div class="bump-bar" id="bump-bar" style="width:5%"></div></div>
        <button class="bump-btn" id="bump-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>Simulate Bump</button>
      </div>
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon feature-icon--blue"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg></div>
          <h3>Real-Time GPS Tracking</h3>
          <p>Live blue dot tracks your location. Proximity alerts fire within 50 m of any pothole.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon feature-icon--amber"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
          <h3>Severity Markers</h3>
          <p>Google-style drop pins — 🔴 Red = Dangerous · 🟠 Orange = Medium · 🟢 Green = Minor</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon feature-icon--green"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg></div>
          <h3>OpenStreetMap</h3>
          <p>Roads, street names, shops, hospitals, landmarks — all visible. No API key needed.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon feature-icon--rose"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>
          <h3>Bump Detection</h3>
          <p>Motion sensor concept — accelerometer auto-detects jolts and marks potholes.</p>
        </div>
      </div>
    </section>`;
  }

  function setupHome() {
    // Animate counters
    $$('[data-count]').forEach(el => animCount(el, +el.dataset.count));

    // CartoDB Voyager — full road detail, works from file://
    mainMap = M.initMap('home-map', { center: [20.5937, 78.9629], zoom: 5, tile: 'standard' });
    if (!mainMap) return;
    markerResult = M.plotPotholes(mainMap, D.getAllPotholes(), {
      userLat, userLng,
      onMarkerClick: p => showDetail(p),
    });
    window.__showDetail = id => { const p = D.getPotholeById(id); if (p) showDetail(p); };

    // Real GPS on home
    if (navigator.geolocation) {
      alert("Allow location access");
      gpsTracker = M.startRealTracking(mainMap, {
        followUser: true,
        onPositionUpdate(lat, lng) { 
          userLat = lat; userLng = lng; 
          mainMap.setView([lat, lng], 17);
          if (markerResult) M.clearMarkers(markerResult);
          markerResult = M.plotPotholes(mainMap, D.getAllPotholes(), {
            userLat, userLng,
            onMarkerClick: p => showDetail(p),
          });
        },
        onNearbyPothole(p, dist) {
          if (lastAlertedId === p.id) return;
          lastAlertedId = p.id;
          showAlert(p, Math.round(dist));
          setTimeout(() => { lastAlertedId = null; }, 12000);
        },
      });
    }

    setupBump();
  }

  function setupBump() {
    const btn = document.getElementById('bump-btn');
    const sub = document.getElementById('bump-sub');
    const bar = document.getElementById('bump-bar');
    if (!btn) return;
    const idle = setInterval(() => {
      if (!document.getElementById('bump-bar')) { clearInterval(idle); return; }
      bar.style.width = (4 + Math.random() * 10) + '%';
      bar.style.background = 'linear-gradient(90deg,#43A047,#66BB6A)';
    }, 200);
    btn.addEventListener('click', () => {
      if (bumpCooldown) return;
      bumpCooldown = true; btn.disabled = true;
      let f = 0;
      const iv = setInterval(() => {
        if (!document.getElementById('bump-bar')) { clearInterval(iv); return; }
        const v = f < 5 ? 20 + f * 16 : Math.max(5, 100 - (f - 5) * 18);
        bar.style.width = v + '%';
        bar.style.background = `linear-gradient(90deg,${v > 70 ? '#E53935' : v > 40 ? '#FB8C00' : '#43A047'},${v > 70 ? '#EF9A9A' : '#FFF9C4'})`;
        f++;
        if (f > 12) {
          clearInterval(iv);
          bar.style.width = '5%'; bar.style.background = 'linear-gradient(90deg,#43A047,#66BB6A)';
          const np = D.addPothole({ lat: userLat + (Math.random() - .5) * .001, lng: userLng + (Math.random() - .5) * .001,
            severity: D.SEVERITY.MEDIUM, rainHazard: rainMode, reporter: 'AutoSensor',
            description: `Auto-detected bump at (${userLat.toFixed(4)},${userLng.toFixed(4)}) via motion sensor.` });
          if (sub) sub.textContent = `⚠️ Bump detected! Auto-reported as #${np.id}`;
          showToast(`📱 Bump detected! Auto-reported pothole #${np.id}`, 'success');
          setTimeout(() => { bumpCooldown = false; btn.disabled = false;
            if (sub) sub.textContent = 'Monitoring for road bumps…'; }, 4000);
        }
      }, 80);
    });
  }

  // ══════════════════════════════════════════════════════
  //  PAGE: DETECT
  // ══════════════════════════════════════════════════════
  function renderDetect() {
    return `<section class="page page--detect fade-in">
      <div class="page-header"><h2>📱 Motion Sensor Detection</h2>
        <p>Simulate automatic bump detection using mobile accelerometer</p></div>
      <div class="sensor-layout">
        <div class="sensor-panel">
          <div class="sensor-header">
            <div class="sensor-status-dot" id="sensor-dot"></div>
            <h3>Accelerometer Feed</h3>
            <span class="sensor-badge" id="sensor-badge">INACTIVE</span>
          </div>
          <div class="accel-display" id="accel-display">
            <div class="accel-axis"><span class="axis-label">X</span>
              <div class="axis-bar-track"><div class="axis-bar axis-bar--x" id="axis-x" style="width:50%"></div></div>
              <span class="axis-val" id="axis-x-val">0.0</span></div>
            <div class="accel-axis"><span class="axis-label">Y</span>
              <div class="axis-bar-track"><div class="axis-bar axis-bar--y" id="axis-y" style="width:50%"></div></div>
              <span class="axis-val" id="axis-y-val">0.0</span></div>
            <div class="accel-axis"><span class="axis-label">Z (Vertical)</span>
              <div class="axis-bar-track"><div class="axis-bar axis-bar--z" id="axis-z" style="width:50%"></div></div>
              <span class="axis-val" id="axis-z-val">9.8</span></div>
          </div>
          <div class="bump-threshold"><span>Bump threshold: <strong>±3.5 m/s²</strong></span></div>
        </div>
        <div class="sensor-panel">
          <div class="sensor-header"><h3>Detection Log</h3><span class="sensor-badge sensor-badge--live">LIVE</span></div>
          <div class="detect-log" id="detect-log"><div class="log-empty">🛣️ Start simulation to see bump events…</div></div>
        </div>
      </div>
      <div class="sensor-controls">
        <button class="btn btn--primary btn--lg" id="start-sensor-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16 10,8"/></svg>Start Simulation</button>
        <button class="btn btn--outline btn--lg" id="trigger-bump-btn" disabled>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>Trigger Bump</button>
      </div>
      <div class="ai-detect-section">
        <div class="section-header" style="margin-top:40px">
          <h2>🔍 AI Image Analysis</h2><span class="section-hint">Upload a road photo for severity classification</span></div>
        <div class="detect-layout">
          <div class="upload-area" id="upload-area">
            <div class="upload-placeholder" id="upload-placeholder">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <p>Drag &amp; drop an image<br>or <span class="upload-browse">browse files</span></p><small>JPG, PNG up to 10 MB</small>
            </div>
            <img id="upload-preview" class="upload-preview hidden" alt="Preview"/>
            <input type="file" id="file-input" accept="image/*" hidden/>
          </div>
          <div class="detect-result hidden" id="detect-result"><h3>Analysis Result</h3><div class="result-card" id="result-card"></div></div>
        </div>
        <div class="analysis-progress hidden" id="analysis-progress">
          <div class="progress-steps" id="progress-steps">
            <div class="progress-step" data-step="1"><div class="step-dot">1</div><span class="step-label">Upload</span></div>
            <div class="progress-step" data-step="2"><div class="step-dot">2</div><span class="step-label">Processing</span></div>
            <div class="progress-step" data-step="3"><div class="step-dot">3</div><span class="step-label">Analysis</span></div>
            <div class="progress-step" data-step="4"><div class="step-dot">4</div><span class="step-label">Result</span></div>
          </div>
          <div class="progress-bar-track"><div class="progress-bar-fill" id="progress-bar" style="width:0%"></div></div>
        </div>
        <button class="btn btn--primary btn--lg" id="detect-btn" disabled style="margin-top:16px">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Analyze Image</button>
      </div>
    </section>`;
  }

  function setupDetect() {
    // Sensor sim
    const startBtn = document.getElementById('start-sensor-btn');
    const trigBtn  = document.getElementById('trigger-bump-btn');
    const dot      = document.getElementById('sensor-dot');
    const badge    = document.getElementById('sensor-badge');
    if (!startBtn) return;
    let running = false, sv = null, lc = 0;
    const ua = (x, y, z) => {
      ['x','y','z'].forEach((a, i) => {
        const v = [x,y,z][i], el = document.getElementById(`axis-${a}`), ve = document.getElementById(`axis-${a}-val`);
        if (!el) return;
        el.style.width = Math.min(100, Math.max(0, 50 + v * 5)) + '%';
        if (ve) ve.textContent = v.toFixed(2);
        el.style.background = (a === 'z' ? Math.abs(v - 9.8) : Math.abs(v)) > 3.5 ? '#E53935' : '#1A73E8';
      });
    };
    const addLog = (type, x, y, z) => {
      const el = document.getElementById('detect-log'); if (!el) return;
      el.querySelector('.log-empty')?.remove();
      const item = document.createElement('div'); item.className = `log-item log-item--${type}`;
      const now  = new Date().toLocaleTimeString('en-IN', { hour12: false });
      item.innerHTML = `<span class="log-dot log-dot--${type}"></span><span class="log-time">${now}</span>
        <span class="log-msg">${type === 'bump' ? '🚨 BUMP DETECTED' : '✅ Road smooth'}</span>
        <span class="log-vals">x=${x.toFixed(1)} y=${y.toFixed(1)} z=${z.toFixed(1)}</span>`;
      el.insertBefore(item, el.firstChild);
      if (++lc > 12) el.lastChild?.remove();
    };
    startBtn.addEventListener('click', () => {
      if (running) {
        clearInterval(sv); running = false;
        dot.classList.remove('active'); badge.textContent = 'INACTIVE'; badge.className = 'sensor-badge'; trigBtn.disabled = true;
        startBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16 10,8"/></svg> Start Simulation`;
      } else {
        running = true; dot.classList.add('active'); badge.textContent = 'ACTIVE'; badge.className = 'sensor-badge sensor-badge--live'; trigBtn.disabled = false;
        startBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6"/></svg> Stop`;
        sv = setInterval(() => { const x = (Math.random() - .5) * 1.2, y = (Math.random() - .5) * 1.0, z = 9.8 + (Math.random() - .5) * .6; ua(x, y, z); if (Math.random() < .08) addLog('smooth', x, y, z); }, 150);
      }
    });
    trigBtn.addEventListener('click', () => {
      if (!running) return;
      const x = (Math.random() > .5 ? 1 : -1) * (4 + Math.random() * 4), y = (Math.random() > .5 ? 1 : -1) * (3.5 + Math.random() * 3), z = 9.8 + (Math.random() > .5 ? 1 : -1) * (4.5 + Math.random() * 4);
      ua(x, y, z); addLog('bump', x, y, z);
      const ad = document.getElementById('accel-display');
      if (ad) { ad.style.borderColor = '#E53935'; ad.style.boxShadow = '0 0 20px rgba(229,57,53,.4)'; setTimeout(() => { ad.style.borderColor = ''; ad.style.boxShadow = ''; }, 600); }
      showToast('📱 Bump detected via accelerometer!', 'success');
    });
    // Image detect
    const input = document.getElementById('file-input'), preview = document.getElementById('upload-preview'),
          ph    = document.getElementById('upload-placeholder'), area = document.getElementById('upload-area'),
          btn   = document.getElementById('detect-btn'), rd = document.getElementById('detect-result'),
          rc    = document.getElementById('result-card'), pw = document.getElementById('analysis-progress'),
          pb    = document.getElementById('progress-bar'), steps = document.querySelectorAll('.progress-step');
    if (!area) return;
    area.addEventListener('click', () => input.click());
    area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
    area.addEventListener('dragleave', () => area.classList.remove('dragover'));
    area.addEventListener('drop', e => { e.preventDefault(); area.classList.remove('dragover'); if (e.dataTransfer.files.length) hf(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => { if (input.files.length) hf(input.files[0]); });
    let uf = null;
    function hf(f) { uf = f; const r = new FileReader(); r.onload = e => { preview.src = e.target.result; preview.classList.remove('hidden'); ph.classList.add('hidden'); btn.disabled = false; }; r.readAsDataURL(f); }
    function ss(n) { steps.forEach((s, i) => { s.classList.remove('active', 'done'); if (i + 1 < n) s.classList.add('done'); else if (i + 1 === n) s.classList.add('active'); }); pb.style.width = ((n - 1) / (steps.length - 1) * 100) + '%'; }
    btn.addEventListener('click', () => {
      if (!uf) return; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Analyzing…`;
      rd.classList.add('hidden'); pw.classList.remove('hidden');
      ss(1); setTimeout(() => ss(2), 600); setTimeout(() => ss(3), 1400); setTimeout(() => ss(4), 2200);
      setTimeout(() => {
        pb.style.width = '100%'; steps.forEach(s => { s.classList.remove('active'); s.classList.add('done'); });
        const svs = [D.SEVERITY.MINOR, D.SEVERITY.MEDIUM, D.SEVERITY.DANGEROUS],
              sv  = svs[Math.floor(Math.random() * svs.length)],
              conf = (70 + Math.random() * 28).toFixed(1),
              col  = { minor: '#43A047', medium: '#FB8C00', dangerous: '#E53935' }[sv];
        const det = { minor: { depth: '2-3 cm', width: '15-20 cm', risk: 'Low risk.' },
                      medium: { depth: '5-8 cm', width: '30-50 cm', risk: 'Moderate risk. Can cause tyre damage.' },
                      dangerous: { depth: '10-15 cm', width: '60-100 cm', risk: 'High risk! Can cause accidents.' } };
        rc.innerHTML = `<div class="result-severity" style="--sev-color:${col}">
          <div class="result-sev-badge" style="background:${col}">${D.SEVERITY_LABELS[sv]}</div>
          <div class="result-confidence">${conf}% confidence</div></div>
          <div class="result-details">
            <div class="result-detail"><strong>Depth:</strong> ${det[sv].depth}</div>
            <div class="result-detail"><strong>Width:</strong> ${det[sv].width}</div>
            <div class="result-detail"><strong>Risk:</strong> ${det[sv].risk}</div>
            ${sv === 'dangerous' ? '<div class="result-rain-warn">🌧️ Extremely dangerous during rain!</div>' : ''}
          </div>
          <button class="btn btn--primary btn--sm" onclick="window.__nav('report')">Report This Pothole →</button>`;
        rd.classList.remove('hidden'); btn.disabled = false;
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Analyze Again`;
      }, 2800);
    });
  }

  // ══════════════════════════════════════════════════════
  //  PAGE: REPORT
  // ══════════════════════════════════════════════════════
  function renderReport() {
    return `<section class="page page--report fade-in">
      <div class="page-header"><h2>📝 Report a Pothole</h2><p>Help make roads safer by reporting potholes in your area</p></div>
      <form class="report-form" id="report-form">
        <div class="form-grid">
          <div class="form-group form-group--full">
            <label>Upload Photo</label>
            <div class="report-upload" id="report-upload-area">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>Click or drag to upload</span>
              <img id="report-preview" class="report-preview hidden" alt="Preview"/>
            </div>
            <input type="file" id="report-image" accept="image/*" hidden/>
          </div>
          <div class="form-group">
            <label for="report-severity">Severity</label>
            <select id="report-severity">
              <option value="minor">🟢 Minor</option>
              <option value="medium" selected>🟠 Medium</option>
              <option value="dangerous">🔴 Dangerous</option>
            </select>
          </div>
          <div class="form-group">
            <label>Rain Hazard?</label>
            <label class="toggle-label"><input type="checkbox" id="report-rain" checked/>
              <span class="toggle-slider"></span><span>Hidden during rain</span></label>
          </div>
          <div class="form-group form-group--full">
            <label for="report-desc">Description <small>(optional)</small></label>
            <textarea id="report-desc" rows="3" placeholder="Describe the pothole location, size, road conditions…"></textarea>
          </div>
          <div class="form-group form-group--full">
            <label>GPS Location</label>
            <div class="gps-display">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/></svg>
              <span id="gps-coords">Acquiring location…</span>
            </div>
          </div>
          <div class="form-group form-group--full">
            <label>Pin Location on Map</label>
            <div id="report-map" class="map-container map-container--small"></div>
            <small class="map-hint">Tap on map to mark pothole location</small>
          </div>
        </div>
        <button type="submit" class="btn btn--primary btn--lg">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Submit Report
        </button>
      </form>
    </section>`;
  }

  function setupReport() {
    let rLat = userLat || 20.5937, rLng = userLng || 78.9629;
    const coordsEl = document.getElementById('gps-coords');

    // Report map
    const rMap = M.initMap('report-map', { center: [rLat, rLng], zoom: 17 });
    if (!rMap) return;

    // Custom Layer Control
    if (rMap._rwTileLayer) rMap.removeLayer(rMap._rwTileLayer);
    
    const normalMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(rMap);
    const satMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '&copy; Esri' });

    L.control.layers({
      "Normal Map": normalMap,
      "Satellite View": satMap
    }).addTo(rMap);

    // Draggable pin marker with clear highlighted red drop pin
    const pinSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="54" viewBox="0 0 40 54">
      <defs><filter id="dsr" x="-30%" y="-20%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="rgba(0,0,0,0.35)"/></filter></defs>
      <path d="M20 0C8.95 0 0 8.95 0 20C0 35 20 54 20 54C20 54 40 35 40 20C40 8.95 31.05 0 20 0Z" fill="#E53935" filter="url(#dsr)"/>
      <circle cx="20" cy="20" r="10" fill="white"/>
      <circle cx="20" cy="20" r="4" fill="#E53935"/>
    </svg>`;

    const pinMarker = L.marker([rLat, rLng], {
      draggable: true,
      icon: L.divIcon({
        className: '',
        html: pinSVG,
        iconSize: [40, 54], iconAnchor: [20, 54],
      }),
    }).addTo(rMap);

    const update = latlng => {
      rLat = latlng.lat; rLng = latlng.lng;
      if (coordsEl) coordsEl.textContent = `${rLat.toFixed(6)}, ${rLng.toFixed(6)}`;
    };
    pinMarker.on('dragend', () => update(pinMarker.getLatLng()));
    rMap.on('click', e => { 
      pinMarker.setLatLng(e.latlng); 
      update(e.latlng); 
      rMap.panTo(e.latlng, { animate: true, duration: 0.5 });
    });

    // Try real GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        rLat = pos.coords.latitude; rLng = pos.coords.longitude;
        rMap.setView([rLat, rLng], 17);
        pinMarker.setLatLng([rLat, rLng]);
        if (coordsEl) coordsEl.textContent = `${rLat.toFixed(6)}, ${rLng.toFixed(6)}`;
      }, () => {
        if (coordsEl) coordsEl.textContent = `${rLat.toFixed(6)}, ${rLng.toFixed(6)} (default)`;
      }, { timeout: 5000 });
    } else {
      if (coordsEl) coordsEl.textContent = `${rLat.toFixed(6)}, ${rLng.toFixed(6)} (default)`;
    }

    // Image upload
    const imgInput  = document.getElementById('report-image');
    const uploadArea = document.getElementById('report-upload-area');
    const imgPrev   = document.getElementById('report-preview');
    let reportImg = null;
    uploadArea.addEventListener('click', () => imgInput.click());
    imgInput.addEventListener('change', () => {
      if (!imgInput.files.length) return;
      const r = new FileReader();
      r.onload = e => { imgPrev.src = e.target.result; imgPrev.classList.remove('hidden'); reportImg = e.target.result; };
      r.readAsDataURL(imgInput.files[0]);
    });

    document.getElementById('report-form').addEventListener('submit', e => {
      e.preventDefault();
      const entry = D.addPothole({
        lat: rLat, lng: rLng,
        severity:   document.getElementById('report-severity').value,
        rainHazard: document.getElementById('report-rain').checked,
        description: document.getElementById('report-desc').value || 'Pothole reported via RoadWatch',
        reporter: 'You', image: reportImg,
      });
      showToast(`✅ Pothole #${entry.id} reported! Complaint forwarded to: ${entry.authority}`, 'success');
      setTimeout(() => navigate('risk-map'), 1500);
    });
  }

  // ══════════════════════════════════════════════════════
  //  PAGE: LIVE MAP  (full-screen, Google Maps-style UI)
  // ══════════════════════════════════════════════════════
  function renderRiskMap() {
    const active = D.getAllPotholes().filter(p => p.status !== 'repaired').length;
    return `<section class="page page--risk page--fullmap fade-in">
      <div class="gmap-shell" id="gmap-shell">

        <!-- Full-screen map -->
        <div id="risk-map" class="gmap-canvas"></div>

        <!-- Top overlay bar -->
        <div class="gmap-topbar">
          <div class="gmap-topbar-left">
            <div class="gmap-brand-pill">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
              RoadWatch Live Map
            </div>
            ${rainMode ? `<div class="gmap-rain-badge">🌧 Rain Mode</div>` : ''}
          </div>
          <div class="gmap-legend-bar">
            <span class="gmap-leg-item"><span class="gmap-leg-dot" style="background:#E53935"></span>Dangerous</span>
            <span class="gmap-leg-item"><span class="gmap-leg-dot" style="background:#FB8C00"></span>Medium</span>
            <span class="gmap-leg-item"><span class="gmap-leg-dot" style="background:#43A047"></span>Minor</span>
            <span class="gmap-leg-item"><span class="gmap-leg-dot" style="background:#1A73E8"></span>You</span>
          </div>
        </div>

        <!-- Left FAB toolbar -->
        <div class="gmap-fab-bar">
          <button class="gmap-fab gmap-fab--gps" id="fab-gps" title="Toggle GPS">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/></svg>
            <span>GPS</span>
          </button>
          <button class="gmap-fab" id="fab-center" title="Centre on me">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
            <span>Centre</span>
          </button>
          <button class="gmap-fab" id="fab-route" title="Show safe routes">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <span>Route</span>
          </button>
          <button class="gmap-fab" id="fab-alerts" title="Toggle proximity alerts">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span>Alerts</span>
          </button>
        </div>

        <!-- Map tile switcher -->
        <div class="gmap-style-switcher">
          <button class="gmap-style-btn active" data-tile="standard">🗺 Standard</button>
          <button class="gmap-style-btn" data-tile="detailed">🔍 Detailed</button>
          <button class="gmap-style-btn" data-tile="positron">☀️ Minimal</button>
          <button class="gmap-style-btn" data-tile="satellite">🛰 Satellite</button>
        </div>

        <!-- GPS HUD -->
        <div class="gmap-hud" id="gmap-hud">
          <div class="gmap-hud-row">
            <div class="gmap-hud-dot" id="hud-dot"></div>
            <span class="gmap-hud-label" id="hud-status">GPS Off</span>
          </div>
          <div class="gmap-hud-coords" id="hud-coords">—</div>
          <div class="gmap-hud-speed-row">
            <span class="gmap-hud-speed" id="hud-speed">--</span>
            <span class="gmap-hud-unit">km/h</span>
          </div>
        </div>

        <!-- Pothole count chip -->
        <div class="gmap-count-badge">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          ${active} active potholes
        </div>

      </div>

      <!-- Detail side panel -->
      <div class="gmap-detail-panel hidden" id="gmap-detail-panel">
        <button class="gmap-detail-close" onclick="window.__closeDetail()">✕</button>
        <div id="detail-content"></div>
      </div>

      <!-- Proximity alert feed -->
      <div class="gmap-prox-feed hidden" id="gmap-prox-feed">
        <div class="gmap-prox-header">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          Proximity Alerts
          <button class="gmap-prox-clear" id="prox-clear">Clear</button>
        </div>
        <div class="gmap-prox-list" id="prox-list">
          <div class="gmap-prox-empty">Enable GPS &amp; Alerts to see warnings…</div>
        </div>
      </div>

    </section>`;
  }

  function setupRiskMap() {
    // CartoDB Voyager as default — full road/shop/label detail, works from file://
    mainMap = M.initMap('risk-map', { center: [20.5937, 78.9629], zoom: 5, tile: 'standard' });
    if (!mainMap) return;

    const potholes = D.getAllPotholes().filter(p => p.status !== 'repaired');

    markerResult = M.plotPotholes(mainMap, potholes, {
      userLat, userLng,
      onMarkerClick: p => showDetail(p),
    });

    window.__showDetail = id => { const p = D.getPotholeById(id); if (p) showDetail(p); };
    window.__closeDetail = closeDetail;

    // ── Tile switcher ───────────────────────────────────
    document.querySelectorAll('.gmap-style-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.gmap-style-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        mainMap.switchTile(this.dataset.tile);
      });
    });

    // ── HUD helpers ─────────────────────────────────────
    const hudDot    = document.getElementById('hud-dot');
    const hudStatus = document.getElementById('hud-status');
    const hudCoords = document.getElementById('hud-coords');
    const hudSpeed  = document.getElementById('hud-speed');

    function updateHud(lat, lng, spd) {
      userLat = lat; userLng = lng;
      if (hudCoords) hudCoords.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (hudSpeed)  hudSpeed.textContent  = spd != null ? spd : '--';
    }

    // ── GPS FAB ─────────────────────────────────────────
    const fabGps = document.getElementById('fab-gps');
    let gpsOn = false, usingReal = false;

    function startGPS() {
      fabGps.classList.add('active');
      if (hudDot)    hudDot.classList.add('active');
      if (hudStatus) hudStatus.textContent = 'Acquiring…';

      gpsTracker = M.startRealTracking(mainMap, {
        followUser: true,
        onPositionUpdate(lat, lng, spd) {
          usingReal = true;
          if (hudStatus) hudStatus.textContent = '🔵 Real GPS';
          updateHud(lat, lng, spd);
          
          if (markerResult) M.clearMarkers(markerResult);
          markerResult = M.plotPotholes(mainMap, D.getAllPotholes().filter(p => p.status !== 'repaired'), {
            userLat, userLng,
            onMarkerClick: p => showDetail(p),
          });
        },
        onNearbyPothole(p, d) {
          if (!alertsEnabled || lastAlertedId === p.id) return;
          lastAlertedId = p.id;
          addProxItem(p, Math.round(d));
          showAlert(p, Math.round(d));
          setTimeout(() => { lastAlertedId = null; }, 15000);
        },
        onError() { if (hudStatus) hudStatus.textContent = 'GPS Error'; },
      });
    }

    function stopGPS() {
      fabGps.classList.remove('active');
      usingReal = false;
      if (gpsTracker)  { gpsTracker.stop();  gpsTracker = null; }
      if (hudDot)    hudDot.classList.remove('active');
      if (hudStatus) hudStatus.textContent = 'GPS Off';
      if (hudCoords) hudCoords.textContent = '—';
      if (hudSpeed)  hudSpeed.textContent  = '--';
    }

    fabGps.addEventListener('click', () => {
      gpsOn = !gpsOn;
      if (gpsOn) { alert("Allow location access"); startGPS(); showToast('📍 GPS activated', 'success'); }
      else       { stopGPS();  showToast('🛑 GPS stopped', 'info'); }
    });

    // Auto-start GPS
    gpsOn = true; alert("Allow location access"); startGPS();

    // ── Centre FAB ──────────────────────────────────────
    document.getElementById('fab-center').addEventListener('click', () => {
      mainMap.flyTo([userLat, userLng], 17, { animate: true, duration: 1 });
    });

    // ── Route FAB ───────────────────────────────────────
    const fabRoute = document.getElementById('fab-route');
    let routeOn = false, routeLayers = [];
    fabRoute.addEventListener('click', () => {
      if (routeOn) {
        routeLayers.forEach(l => mainMap.removeLayer(l));
        routeLayers = []; routeOn = false;
        fabRoute.classList.remove('active');
        showToast('Route hidden', 'info');
      } else {
        routeLayers = M.drawSafeRoutes(mainMap, D.getMockRoutes());
        routeOn = true; fabRoute.classList.add('active');
        showToast('✅ Safe route in green · Risky in red', 'success');
      }
    });

    // ── Alerts FAB ──────────────────────────────────────
    const fabAlerts = document.getElementById('fab-alerts');
    const proxFeed  = document.getElementById('gmap-prox-feed');
    fabAlerts.addEventListener('click', () => {
      alertsEnabled = !alertsEnabled;
      fabAlerts.classList.toggle('active', alertsEnabled);
      if (proxFeed) proxFeed.classList.toggle('hidden', !alertsEnabled);
      showToast(alertsEnabled ? '🔔 Proximity alerts ON (50 m)' : '🔕 Alerts disabled', alertsEnabled ? 'success' : 'info');
      if (alertsEnabled) {
        setTimeout(() => {
          const demo = potholes.find(p => p.severity === 'dangerous');
          if (demo) { addProxItem(demo, 42); showAlert(demo, 42); }
        }, 2000);
      }
    });

    // ── Prox clear ──────────────────────────────────────
    document.getElementById('prox-clear')?.addEventListener('click', () => {
      const l = document.getElementById('prox-list');
      if (l) l.innerHTML = '<div class="gmap-prox-empty">Feed cleared…</div>';
    });
  }

  // ── Add proximity feed item ────────────────────────────
  function addProxItem(p, dist) {
    const list = document.getElementById('prox-list'); if (!list) return;
    list.querySelector('.gmap-prox-empty')?.remove();
    const colors = { dangerous: '#E53935', medium: '#FB8C00', minor: '#43A047' };
    const item = document.createElement('div');
    item.className = 'gmap-prox-item';
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    item.innerHTML = `
      <div class="gmap-prox-dot" style="background:${colors[p.severity]}"></div>
      <div class="gmap-prox-info">
        <div class="gmap-prox-title">${D.SEVERITY_LABELS[p.severity]} — <strong>${dist}m</strong></div>
        <div class="gmap-prox-desc">${p.description.substring(0, 52)}…</div>
      </div>
      <div class="gmap-prox-time">${now}</div>`;
    list.insertBefore(item, list.firstChild);
    if (list.children.length > 5) list.lastChild?.remove();
  }

  // ── Pothole detail side panel ──────────────────────────
  function showDetail(p) {
    const panel   = document.getElementById('gmap-detail-panel');
    const content = document.getElementById('detail-content');
    if (!panel || !content) return;

    const colors  = { dangerous: '#E53935', medium: '#FB8C00', minor: '#43A047' };
    const color   = colors[p.severity];
    const dist    = D.distanceMeters(userLat, userLng, p.lat, p.lng);
    const distTxt = dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`;
    const status  = { pending: '🟡 Pending', in_progress: '🔵 In Progress', repaired: '✅ Repaired' };

    content.innerHTML = `
      <div class="detail-sev-stripe" style="background:${color}"></div>
      <div class="detail-body">
        <div class="detail-header">
          <span class="detail-badge detail-badge--${p.severity}">${D.SEVERITY_LABELS[p.severity]}</span>
          <span class="detail-dist">📍 ${distTxt} away</span>
        </div>
        <h3 class="detail-title">Pothole #${p.id}</h3>
        <p class="detail-desc">${p.description}</p>
        <div class="detail-meta-grid">
          <div class="detail-meta-item">
            <div class="detail-meta-label">Reporter</div>
            <div class="detail-meta-val">👤 ${p.reporter}</div>
          </div>
          <div class="detail-meta-item">
            <div class="detail-meta-label">Reports</div>
            <div class="detail-meta-val">👥 ${p.reporterCount || 1}</div>
          </div>
          <div class="detail-meta-item">
            <div class="detail-meta-label">Status</div>
            <div class="detail-meta-val">${status[p.status] || p.status}</div>
          </div>
          <div class="detail-meta-item">
            <div class="detail-meta-label">Reported</div>
            <div class="detail-meta-val">${timeAgo(p.reportedAt)}</div>
          </div>
          <div class="detail-meta-item detail-meta-item--full">
            <div class="detail-meta-label">Responsible Authority</div>
            <div class="detail-meta-val">🏛️ <strong>${p.authority || 'Unknown Local Body'}</strong></div>
          </div>
          <div class="detail-meta-item detail-meta-item--full">
            <div class="detail-meta-label">Coordinates</div>
            <div class="detail-meta-val detail-meta-val--mono">${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</div>
          </div>
        </div>
        ${p.rainHazard ? `<div class="detail-rain-warn"><span>🌧️</span> <span>Becomes <strong>invisible</strong> under rainwater — extreme caution!</span></div>` : ''}
        <div class="detail-actions">
          <button class="btn btn--primary btn--sm" onclick="window.__nav('report')">Report Similar</button>
          <button class="btn btn--outline btn--sm" onclick="window.__closeDetail()">Close</button>
        </div>
      </div>`;

    panel.classList.remove('hidden');
    requestAnimationFrame(() => panel.classList.add('visible'));
  }

  function closeDetail() {
    const panel = document.getElementById('gmap-detail-panel');
    if (!panel) return;
    panel.classList.remove('visible');
    setTimeout(() => panel.classList.add('hidden'), 300);
  }

  // ══════════════════════════════════════════════════════
  //  PAGE: DASHBOARD
  // ══════════════════════════════════════════════════════
  function renderDashboard() {
    const potholes = D.getAllPotholes();
    const s = D.getStats();
    const activity = potholes.slice(0, 6).map(p => {
      const t = p.status === 'repaired' ? 'success' : p.status === 'in_progress' ? '' : p.severity === 'dangerous' ? 'danger' : 'warning';
      const act = p.status === 'repaired' ? 'repaired' : p.status === 'in_progress' ? 'marked in progress' : 'reported';
      return `<div class="activity-item activity-item--${t}">
        <div class="activity-content">
          <div class="activity-text"><strong>${p.reporter}</strong> ${act} a <strong>${D.SEVERITY_LABELS[p.severity]}</strong> pothole ${p.rainHazard ? '🌧' : ''} <span class="reporter-count-chip">👥 ${p.reporterCount || 1}</span></div>
          <div class="activity-time">${timeAgo(p.reportedAt)} · ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</div>
        </div></div>`;
    }).join('');
    const rows = potholes.map(p => `<tr>
      <td>#${p.id}</td>
      <td><span class="severity-badge severity-badge--${p.severity}">${D.SEVERITY_LABELS[p.severity]}</span>${p.rainHazard ? '<span class="rain-chip">💧</span>' : ''}</td>
      <td class="td-desc">${p.description.substring(0, 60)}${p.description.length > 60 ? '…' : ''}</td>
      <td><span style="font-size:12px;padding:3px 6px;background:#f1f5f9;border-radius:4px;font-weight:600;color:#334155;white-space:nowrap">${p.authority || 'Unknown'}</span></td>
      <td>${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</td>
      <td><span class="reporter-count-chip">👥 ${p.reporterCount || 1}</span></td>
      <td>${timeAgo(p.reportedAt)}</td>
      <td><select class="status-select status-select--${p.status}" data-id="${p.id}">
        <option value="pending"     ${p.status === 'pending'      ? 'selected' : ''}>Pending</option>
        <option value="in_progress" ${p.status === 'in_progress'  ? 'selected' : ''}>In Progress</option>
        <option value="repaired"    ${p.status === 'repaired'     ? 'selected' : ''}>Repaired</option>
      </select></td></tr>`).join('');

    return `<section class="page page--dashboard fade-in">
      <div class="page-header"><h2>📊 Admin Dashboard</h2><p>Monitor and manage all pothole reports in real time</p></div>
      <div class="dash-stats">
        <div class="dash-stat-card"><span class="dash-stat-num" data-count="${s.total}">0</span><span class="dash-stat-label">Total</span></div>
        <div class="dash-stat-card dash-stat-card--danger"><span class="dash-stat-num" data-count="${s.dangerous}">0</span><span class="dash-stat-label">Dangerous</span></div>
        <div class="dash-stat-card dash-stat-card--pending"><span class="dash-stat-num" data-count="${s.pending}">0</span><span class="dash-stat-label">Pending</span></div>
        <div class="dash-stat-card dash-stat-card--repaired"><span class="dash-stat-num" data-count="${s.repaired}">0</span><span class="dash-stat-label">Repaired</span></div>
      </div>
      <div class="dash-charts">
        <div class="chart-card"><h3>Severity Distribution</h3><div class="chart-container"><canvas id="chart-severity"></canvas></div></div>
        <div class="chart-card"><h3>Reports Timeline</h3><div class="chart-container"><canvas id="chart-timeline"></canvas></div></div>
      </div>
      <div class="activity-feed"><h3>📋 Recent Activity</h3><div class="activity-list">${activity}</div></div>
      <div class="table-wrapper">
        <table class="dash-table">
          <thead><tr><th>ID</th><th>Severity</th><th>Description</th><th>Authority</th><th>Location</th><th>Reports</th><th>Time</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
  }

  function setupDashboard() {
    $$('[data-count]').forEach(el => animCount(el, +el.dataset.count));
    document.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', function () {
        D.updatePotholeStatus(+this.dataset.id, this.value);
        this.className = `status-select status-select--${this.value}`;
        showToast(`Pothole #${this.dataset.id} → ${D.STATUS_LABELS[this.value]}`, 'success');
      });
    });
    setupCharts();
  }

  function setupCharts() {
    if (typeof Chart === 'undefined') return;
    const p = D.getAllPotholes();
    const minor = p.filter(x => x.severity === 'minor').length,
          medium = p.filter(x => x.severity === 'medium').length,
          dangerous = p.filter(x => x.severity === 'dangerous').length;
    Chart.defaults.color = '#8891ab'; Chart.defaults.borderColor = 'rgba(255,255,255,.06)';
    const sc = document.getElementById('chart-severity');
    if (sc) new Chart(sc, { type: 'doughnut', data: { labels: ['Minor','Medium','Dangerous'],
      datasets: [{ data: [minor,medium,dangerous], backgroundColor: ['#43A047','#FB8C00','#E53935'],
      borderColor: 'rgba(12,15,26,.8)', borderWidth: 3, hoverOffset: 8 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { size: 12, family: 'Inter' } } } },
        animation: { animateRotate: true, duration: 1400 } } });
    const tc = document.getElementById('chart-timeline');
    if (tc) {
      const days = {}; p.forEach(x => { const d = fmtDate(x.reportedAt); days[d] = (days[d] || 0) + 1; });
      const labels = Object.keys(days).slice(-7), values = labels.map(l => days[l]);
      new Chart(tc, { type: 'bar', data: { labels, datasets: [{ label: 'Reports', data: values,
        backgroundColor: 'rgba(26,115,232,.5)', borderColor: 'rgba(26,115,232,.9)',
        borderWidth: 1, borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false,
          scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,.04)' } },
                    x: { grid: { display: false } } },
          plugins: { legend: { display: false } }, animation: { duration: 1200 } } });
    }
  }

  // ══════════════════════════════════════════════════════
  //  RENDER ENGINE
  // ══════════════════════════════════════════════════════
  const pages = {
    home:      { render: renderHome,      setup: setupHome },
    detect:    { render: renderDetect,    setup: setupDetect },
    report:    { render: renderReport,    setup: setupReport },
    'risk-map':{ render: renderRiskMap,   setup: setupRiskMap },
    dashboard: { render: renderDashboard, setup: setupDashboard },
  };

  function render() {
    // Teardown previous map/trackers
    if (gpsTracker)  { gpsTracker.stop();  gpsTracker = null; }
    if (simTracker)  { simTracker.stop();   simTracker = null; }
    if (markerResult){ M.clearMarkers(markerResult); markerResult = null; }
    if (mainMap)     { mainMap.remove(); mainMap = null; }

    const main = document.getElementById('main-content');
    if (!main) return;
    const pg = pages[currentPage];
    main.innerHTML = pg.render();
    requestAnimationFrame(() => pg.setup());
  }

  // ══════════════════════════════════════════════════════
  //  ALERT POPUP & TOAST
  // ══════════════════════════════════════════════════════
  function showAlert(p, dist) {
    document.querySelector('.rw-alert-overlay')?.remove();
    const colors = { dangerous: '#E53935', medium: '#FB8C00', minor: '#43A047' };
    const color  = colors[p.severity];
    const el = document.createElement('div');
    el.className = 'rw-alert-overlay';
    el.innerHTML = `
      <div class="rw-alert-card" style="--alert-color:${color}">
        <div class="alert-icon-wrap" style="background:${color}20;border-color:${color}">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h3 style="color:${color}">⚠️ Pothole Ahead!</h3>
        ${dist ? `<div class="alert-distance"><strong>${dist}m</strong> ahead</div>` : ''}
        <p class="alert-severity"><strong>${D.SEVERITY_LABELS[p.severity]}</strong> · 👥 ${p.reporterCount || 1} reports</p>
        ${p.rainHazard ? `<p class="alert-rain">🌧️ <strong>Hidden under water</strong> — invisible to drivers!</p>` : ''}
        <p class="alert-desc">${p.description}</p>
        <div class="alert-actions">
          <button class="btn btn--primary" onclick="this.closest('.rw-alert-overlay').remove()">✓ Got it — Drive Safe</button>
          <button class="btn btn--outline btn--sm" onclick="this.closest('.rw-alert-overlay').remove()">Dismiss</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
    setTimeout(() => { if (el.parentNode) el.remove(); }, 10000);
  }

  function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `rw-toast rw-toast--${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
  }

  // ══════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════
  function init() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', e => { e.preventDefault(); navigate(link.dataset.page); });
    });

    const burger  = document.getElementById('burger');
    const navMenu = document.getElementById('nav-links');
    if (burger) {
      burger.addEventListener('click', () => { navMenu.classList.toggle('open'); burger.classList.toggle('open'); });
      navMenu.addEventListener('click', () => { navMenu.classList.remove('open'); burger.classList.remove('open'); });
    }

    rainCtrl = initRain();
    document.getElementById('rain-toggle')?.addEventListener('click', () => {
      rainMode = !rainMode;
      document.getElementById('rain-toggle').classList.toggle('active', rainMode);
      rainMode ? rainCtrl.start() : rainCtrl.stop();
      showToast(rainMode ? '🌧️ Rain Mode activated!' : '☀️ Rain Mode deactivated', 'info');
      render();
    });

    window.__nav = navigate;
    render();
  }

  document.addEventListener('DOMContentLoaded', init);

})();
