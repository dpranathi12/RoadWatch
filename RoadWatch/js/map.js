// ============================================================
//  RoadWatch — Map Engine v5
//  Leaflet.js + OpenStreetMap  (free, no API key needed)
//  Google Maps-style UI: SVG pins, GPS dot, tile switcher
// ============================================================
(function () {
  'use strict';

  const D = window.RW_DATA;

  // ── Tile layers ─────────────────────────────────────────
  // All tiles use CartoDB/Esri CDNs — work from file:// with no HTTP referer.
  // They are all powered by OpenStreetMap data (roads, shops, landmarks, etc.)
  const TILES = {
    // Default: CartoDB Voyager — full detail, Google Maps look-alike
    standard: {
      url:     'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      attr:    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      label:   '🗺 Standard',
      maxZoom: 20,
    },
    // Detailed OSM labels (more POI icons — hospitals, schools, shops)
    detailed: {
      url:     'https://tile.openstreetmap.bzh/br/{z}/{x}/{y}.png',
      attr:    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      label:   '🔍 Detailed',
      maxZoom: 19,
    },
    // Clean light — CartoDB Positron (minimal, very readable)
    positron: {
      url:     'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      attr:    '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      label:   '☀️ Minimal',
      maxZoom: 20,
    },
    // Satellite from Esri (works without referer)
    satellite: {
      url:     'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attr:    '&copy; Esri &mdash; Source: Esri, USGS, NOAA',
      label:   '🛰 Satellite',
      maxZoom: 19,
    },
  };

  // ── Severity colours ───────────────────────────────────
  const SEV_FILL = {
    dangerous: '#E53935',
    medium:    '#FB8C00',
    minor:     '#43A047',
  };

  // ── Build SVG pin icon (Google-Maps teardown shape) ────
  function makePinIcon(severity, count, pulse = false) {
    const fill   = SEV_FILL[severity] || '#757575';
    const label  = count > 9 ? '9+' : String(count || 1);
    const size   = severity === 'dangerous' ? 40 : 34;
    const half   = size / 2;
    const pulseEl = pulse
      ? `<circle cx="${half}" cy="${half * 0.85}" r="${half - 2}" fill="none"
           stroke="${fill}" stroke-width="2" opacity="0.5">
           <animate attributeName="r" from="${half - 4}" to="${half + 6}" dur="1.2s" repeatCount="indefinite"/>
           <animate attributeName="opacity" from="0.6" to="0" dur="1.2s" repeatCount="indefinite"/>
         </circle>`
      : '';

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size * 1.35)}" viewBox="0 0 40 54">
      <defs>
        <filter id="ds" x="-30%" y="-20%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.28)"/>
        </filter>
      </defs>
      ${pulseEl}
      <path d="M20 0C8.95 0 0 8.95 0 20C0 35 20 54 20 54C20 54 40 35 40 20C40 8.95 31.05 0 20 0Z"
            fill="${fill}" filter="url(#ds)"/>
      <circle cx="20" cy="20" r="11" fill="white"/>
      <text x="20" y="24.5" font-family="Inter,Arial,sans-serif" font-size="${label.length > 1 ? 9 : 11}"
            font-weight="800" fill="${fill}" text-anchor="middle">${label}</text>
    </svg>`;

    return L.divIcon({
      className: '',
      html: svg,
      iconSize:   [size, Math.round(size * 1.35)],
      iconAnchor: [half, Math.round(size * 1.35)],
      popupAnchor:[0, -Math.round(size * 1.35) + 4],
    });
  }

  // ── Blue GPS dot (Google Maps style) ──────────────────
  function makeUserIcon(isReal = true) {
    const color = isReal ? '#1A73E8' : '#9C27B0';
    const html = `
      <div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center">
        <div style="position:absolute;width:40px;height:40px;border-radius:50%;background:${color};
                    opacity:0.18;transform:translate(-50%,-50%);top:50%;left:50%;
                    animation:gpsPulse 2s ease-out infinite"></div>
        <div style="position:absolute;width:24px;height:24px;border-radius:50%;background:${color};
                    opacity:0.12;animation:gpsPulse 2s ease-out infinite 0.6s"></div>
        <div style="width:18px;height:18px;border-radius:50%;background:${color};
                    border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);position:relative;z-index:2"></div>
      </div>`;
    return L.divIcon({
      className: '',
      html,
      iconSize:   [22, 22],
      iconAnchor: [11, 11],
    });
  }

  // ── Auto-detected pothole marker (sensor origin) ────────
  // Uses a distinct diamond/radar shape + confidence badge
  function makeAutoDetectIcon(severity, confidence) {
    const fill = SEV_FILL[severity] || '#757575';
    const conf = Math.min(confidence, 9);
    const size = 36;
    // Pulsing ring intensity based on confidence
    const dur  = Math.max(0.6, 1.8 - conf * 0.15) + 's';
    const svg  = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size*1.4)}" viewBox="0 0 40 56">
      <defs>
        <filter id="dsa" x="-30%" y="-20%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.3)"/>
        </filter>
      </defs>
      <!-- Pulsing confidence ring -->
      <circle cx="20" cy="19" r="17" fill="none" stroke="${fill}" stroke-width="2" opacity="0.45">
        <animate attributeName="r"       from="14" to="22" dur="${dur}" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.5" to="0"  dur="${dur}" repeatCount="indefinite"/>
      </circle>
      <!-- Diamond body -->
      <path d="M20 0C8.95 0 0 8.95 0 20C0 35 20 56 20 56C20 56 40 35 40 20C40 8.95 31.05 0 20 0Z"
            fill="${fill}" filter="url(#dsa)" opacity="0.92"/>
      <!-- Inner circle with sensor icon -->
      <circle cx="20" cy="20" r="11" fill="white"/>
      <!-- Sensor wave icon -->
      <text x="20" y="16" font-family="Arial" font-size="7" fill="${fill}" text-anchor="middle" opacity="0.8">📱</text>
      <!-- Confidence number -->
      <text x="20" y="26" font-family="Inter,Arial,sans-serif" font-size="9"
            font-weight="900" fill="${fill}" text-anchor="middle">${conf}x</text>
    </svg>`;
    return L.divIcon({
      className: '',
      html:       svg,
      iconSize:   [size, Math.round(size * 1.4)],
      iconAnchor: [size / 2, Math.round(size * 1.4)],
      popupAnchor:[0, -Math.round(size * 1.4) + 4],
    });
  }

  // Plot a single auto-detected pothole and return its marker
  function plotAutoDetected(map, det, opts = {}) {
    if (!map) return null;
    const icon   = makeAutoDetectIcon(det.severity, det.confidence);
    const marker = L.marker([det.lat, det.lng], {
      icon,
      zIndexOffset: 800,
      riseOnHover: true,
    }).addTo(map);

    const fill   = SEV_FILL[det.severity];
    const popup  = L.popup({ maxWidth: 280, className: 'rw-popup-clean', closeButton: true })
      .setContent(`
        <div style="font-family:'Inter',Arial,sans-serif;min-width:210px">
          <div style="height:4px;background:${fill};border-radius:4px 4px 0 0;margin:-1px -1px 12px"></div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <span style="background:${fill}18;color:${fill};padding:4px 12px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase">${det.severity}</span>
            <span style="background:#E3F2FD;color:#1565C0;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:700">📱 Auto-Detected</span>
          </div>
          <p style="font-size:13px;color:#212121;margin:0 0 10px;line-height:1.5">${det.description}</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
            <div style="background:#F5F5F5;border-radius:7px;padding:7px 10px">
              <div style="font-size:10px;color:#777;font-weight:600;text-transform:uppercase;margin-bottom:2px">Confidence</div>
              <div style="font-size:14px;font-weight:900;color:${fill}">${det.confidence}x</div>
            </div>
            <div style="background:#F5F5F5;border-radius:7px;padding:7px 10px">
              <div style="font-size:10px;color:#777;font-weight:600;text-transform:uppercase;margin-bottom:2px">Peak G</div>
              <div style="font-size:13px;font-weight:700;color:#212121">${det.peakAcc.toFixed(1)} m/s²</div>
            </div>
          </div>
          <div style="font-size:11px;color:#1A73E8;font-weight:600">Source: ${det.source === 'real' ? '📱 Real accelerometer' : '🧪 Simulated sensor'}</div>
        </div>`);
    marker.bindPopup(popup);
    marker._rwDetId = det.id;
    if (opts.onClick) marker.on('click', () => opts.onClick(det));
    return marker;
  }

  // Update an existing auto-detect marker icon (confidence changed)
  function updateAutoMarker(marker, det) {
    if (!marker) return;
    marker.setIcon(makeAutoDetectIcon(det.severity, det.confidence));
  }


  // ── Popup HTML ──────────────────────────────────────
  function buildPopup(p, userLat, userLng) {
    const fill    = SEV_FILL[p.severity];
    const labels  = { dangerous: 'Dangerous', medium: 'Medium', minor: 'Minor' };
    const status  = { pending: 'Pending', in_progress: 'In Progress', repaired: 'Repaired' };
    const dist    = userLat != null
      ? D.distanceMeters(userLat, userLng, p.lat, p.lng)
      : null;
    const distTxt = dist != null
      ? (dist < 1000 ? Math.round(dist) + ' m away' : (dist / 1000).toFixed(1) + ' km away')
      : '';

    return `
      <div style="font-family:'Inter',Arial,sans-serif;min-width:210px;max-width:260px">
        <div style="height:4px;background:${fill};border-radius:4px 4px 0 0;margin:-1px -1px 12px"></div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
          <span style="background:${fill}18;color:${fill};padding:4px 12px;border-radius:999px;
                       font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
                       border:1.5px solid ${fill}40">
            ${labels[p.severity] || p.severity}
          </span>
          ${p.rainHazard ? `<span style="background:#FFF3E0;color:#E65100;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:600">💧 Rain Hazard</span>` : ''}
        </div>
        <p style="font-size:13px;color:#212121;margin:0 0 10px;line-height:1.55;font-weight:500">
          ${p.description}
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
          <div style="background:#F5F5F5;border-radius:7px;padding:7px 10px">
            <div style="font-size:10px;color:#757575;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Reports</div>
            <div style="font-size:14px;font-weight:800;color:#212121">👥 ${p.reporterCount || 1}</div>
          </div>
          <div style="background:#F5F5F5;border-radius:7px;padding:7px 10px">
            <div style="font-size:10px;color:#757575;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Status</div>
            <div style="font-size:12px;font-weight:700;color:#212121">${status[p.status] || p.status}</div>
          </div>
        </div>
        <div style="font-size:11px;color:#475569;font-weight:600;margin-bottom:8px;background:#f8fafc;padding:5px 8px;border-radius:6px;border:1px solid #e2e8f0;">
          🏛️ ${p.authority || 'Unknown Authority'}
        </div>
        ${distTxt ? `<div style="font-size:11px;color:#1A73E8;font-weight:600;margin-bottom:8px">📍 ${distTxt}</div>` : ''}
        <button onclick="window.__showDetail(${p.id})"
          style="width:100%;padding:9px;background:#1A73E8;color:#fff;border:none;border-radius:8px;
                 font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;
                 transition:background .15s">
          View Full Details →
        </button>
      </div>`;
  }

  // Simulated GPS path (kept for reference but unused now)
  const SIM_PATH = [];

  // ═══════════════════════════════════════════════════════
  //  initMap
  // ═══════════════════════════════════════════════════════
  function initMap(containerId, opts = {}) {
    const center  = opts.center && opts.center[0] != null ? opts.center  : [20.5937, 78.9629];
    const zoom    = opts.zoom    || 16;
    const tileKey = opts.tile    || 'standard';  // CartoDB Voyager by default
    const t       = TILES[tileKey] || TILES.standard;

    const map = L.map(containerId, {
      center, zoom,
      zoomControl:      false,
      attributionControl: true,
    });

    // Zoom control bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Tile layer
    const tileLayer = L.tileLayer(t.url, {
      attribution: t.attr,
      maxZoom:     t.maxZoom,
      subdomains:  'abc',
    }).addTo(map);

    map._rwTileLayer = tileLayer;
    map._rwTileKey   = tileKey;

    // Switch tile helper
    map.switchTile = function (key) {
      const nt = TILES[key] || TILES.standard;
      if (map._rwTileLayer) map._rwTileLayer.remove();
      map._rwTileLayer = L.tileLayer(nt.url, {
        attribution: nt.attr,
        maxZoom:     nt.maxZoom,
        subdomains:  'abc',
      }).addTo(map);
      map._rwTileKey = key;
    };

    return map;
  }

  // ═══════════════════════════════════════════════════════
  //  plotPotholes
  // ═══════════════════════════════════════════════════════
  function plotPotholes(map, potholes, opts = {}) {
    const markers = [];
    const group   = L.layerGroup().addTo(map);

    potholes.forEach((p, i) => {
      const icon = makePinIcon(p.severity, p.reporterCount || 1, p.rainHazard);
      const m    = L.marker([p.lat, p.lng], {
        icon,
        zIndexOffset: p.severity === 'dangerous' ? 500 : p.severity === 'medium' ? 300 : 100,
        riseOnHover: true,
      });

      const popup = L.popup({
        maxWidth:      280,
        className:     'rw-popup-clean',
        closeButton:   true,
        autoClose:     true,
      }).setContent(buildPopup(p, opts.userLat, opts.userLng));

      m.bindPopup(popup);

      m.on('click', () => {
        if (opts.onMarkerClick) opts.onMarkerClick(p);
      });

      m._rwPothole = p;
      group.addLayer(m);
      markers.push(m);
    });

    return { markers, group };
  }

  // ── Clear markers ──────────────────────────────────────
  function clearMarkers(result) {
    if (!result) return;
    if (result.group) result.group.clearLayers();
  }

  // ═══════════════════════════════════════════════════════
  //  Safe routes overlay
  // ═══════════════════════════════════════════════════════
  function drawSafeRoutes(map, routes) {
    const layers = [];
    routes.forEach(r => {
      const latlngs = r.waypoints.map(([lat, lng]) => [lat, lng]);
      const isSafe  = r.danger_score <= 3;
      const line    = L.polyline(latlngs, {
        color:   r.color,
        weight:  isSafe ? 7 : 5,
        opacity: isSafe ? 0.9 : 0.7,
        dashArray: isSafe ? null : '10, 8',
        lineCap:   'round',
        lineJoin:  'round',
      }).addTo(map);
      line.bindTooltip(
        `<b style="color:${r.color}">${r.name}</b><br><span style="font-size:12px">${r.label}</span>`,
        { sticky: true, className: 'rw-route-tip' }
      );
      layers.push(line);
    });
    return layers;
  }

  // ═══════════════════════════════════════════════════════
  //  Real GPS tracking
  // ═══════════════════════════════════════════════════════
  function startRealTracking(map, opts = {}) {
    if (!navigator.geolocation) {
      opts.onError && opts.onError('Geolocation not supported');
      return null;
    }

    let marker = null, accCircle = null, firstFix = true, alerted = new Set();

    const watchId = navigator.geolocation.watchPosition(pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;
      const spd = pos.coords.speed != null ? (pos.coords.speed * 3.6).toFixed(0) : null;

      if (!marker) {
        marker    = L.marker([lat, lng], { icon: makeUserIcon(true), zIndexOffset: 1000 }).addTo(map);
        accCircle = L.circle([lat, lng], {
          radius:      acc,
          color:       '#1A73E8',
          fillColor:   '#1A73E8',
          fillOpacity: 0.08,
          weight:      1.5,
          opacity:     0.4,
        }).addTo(map);
      } else {
        marker.setLatLng([lat, lng]);
        accCircle.setLatLng([lat, lng]);
        accCircle.setRadius(acc);
      }

      if (firstFix || opts.followUser) {
        map.flyTo([lat, lng], firstFix ? 17 : map.getZoom(), { animate: true, duration: 1 });
        firstFix = false;
      }

      // Proximity check
      D.getAllPotholes().forEach(p => {
        if (p.status === 'repaired') return;
        const d = D.distanceMeters(lat, lng, p.lat, p.lng);
        if (d <= 50 && !alerted.has(p.id)) {
          alerted.add(p.id);
          opts.onNearbyPothole && opts.onNearbyPothole(p, d);
          setTimeout(() => alerted.delete(p.id), 30000);
        }
      });

      opts.onPositionUpdate && opts.onPositionUpdate(lat, lng, spd);
    },
    err => { opts.onError && opts.onError(err.message); },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 });

    return {
      stop() {
        navigator.geolocation.clearWatch(watchId);
        if (marker)    map.removeLayer(marker);
        if (accCircle) map.removeLayer(accCircle);
      },
    };
  }

  // ═══════════════════════════════════════════════════════
  //  Simulated tracking
  // ═══════════════════════════════════════════════════════
  function startSimulatedTracking(map, opts = {}) {
    let idx = 0, marker = null, alerted = new Set();

    function tick() {
      if (idx >= SIM_PATH.length) idx = 0;
      const [lat, lng] = SIM_PATH[idx];
      const spd = (18 + Math.random() * 25).toFixed(0);

      if (!marker) {
        marker = L.marker([lat, lng], {
          icon: makeUserIcon(false), zIndexOffset: 1000,
        }).addTo(map);
      } else {
        marker.setLatLng([lat, lng]);
      }

      D.getAllPotholes().forEach(p => {
        if (p.status === 'repaired') return;
        const d = D.distanceMeters(lat, lng, p.lat, p.lng);
        if (d <= 50 && !alerted.has(p.id)) {
          alerted.add(p.id);
          opts.onNearbyPothole && opts.onNearbyPothole(p, d);
          setTimeout(() => alerted.delete(p.id), 20000);
        }
      });

      opts.onPositionUpdate && opts.onPositionUpdate(lat, lng, spd);
      idx++;
    }

    tick();
    const iv = setInterval(tick, 2500);

    return {
      stop() {
        clearInterval(iv);
        if (marker) map.removeLayer(marker);
      },
    };
  }

  // ── Exports ───────────────────────────────────────────
  window.RW_MAP = {
    initMap,
    plotPotholes,
    clearMarkers,
    drawSafeRoutes,
    startRealTracking,
    startSimulatedTracking,
    plotAutoDetected,
    updateAutoMarker,
    makePinIcon,
    TILES,
  };

})();
