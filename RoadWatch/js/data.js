// ============================================================
//  RoadWatch — Mock Data Layer  (Enhanced v2)
//  Potholes around Hyderabad / Almasguda area
// ============================================================

const SEVERITY = { MINOR: 'minor', MEDIUM: 'medium', DANGEROUS: 'dangerous' };
const STATUS   = { PENDING: 'pending', IN_PROGRESS: 'in_progress', REPAIRED: 'repaired' };

// Colour palette per severity
const SEVERITY_COLORS = {
  [SEVERITY.MINOR]:     '#22c55e',   // green
  [SEVERITY.MEDIUM]:    '#eab308',   // yellow
  [SEVERITY.DANGEROUS]: '#ef4444',   // red
};

const SEVERITY_LABELS = {
  [SEVERITY.MINOR]:     'Minor',
  [SEVERITY.MEDIUM]:    'Medium',
  [SEVERITY.DANGEROUS]: 'Dangerous',
};

const STATUS_LABELS = {
  [STATUS.PENDING]:     'Pending',
  [STATUS.IN_PROGRESS]: 'In Progress',
  [STATUS.REPAIRED]:    'Repaired',
};

// ---------- routes (mock) ----------
// Each route has waypoints [lat,lng] and a pothole_proximity_score (lower = safer)
const MOCK_ROUTES = [
  {
    id: 'route-a',
    name: 'Route A (Safer)',
    color: '#22c55e',
    waypoints: [
      [17.326, 78.448],
      [17.328, 78.450],
      [17.330, 78.453],
      [17.332, 78.455],
      [17.336, 78.458],
      [17.340, 78.461],
      [17.344, 78.463],
      [17.346, 78.464],
    ],
    danger_score: 2,
    label: '2 potholes nearby — Safer',
  },
  {
    id: 'route-b',
    name: 'Route B (Riskier)',
    color: '#ef4444',
    waypoints: [
      [17.326, 78.448],
      [17.328, 78.451],
      [17.331, 78.452],
      [17.334, 78.452],
      [17.337, 78.453],
      [17.340, 78.455],
      [17.343, 78.460],
      [17.346, 78.464],
    ],
    danger_score: 7,
    label: '7 potholes nearby — Avoid',
  },
];

// ---------- sample potholes (Hyderabad / Almasguda area) ----------
let potholeData = [
  {
    id: 1,
    lat: 17.3350,
    lng: 78.4520,
    severity: SEVERITY.DANGEROUS,
    status: STATUS.PENDING,
    description: 'Large pothole on Almasguda main road, completely filled with water during rain. Multiple two-wheeler accidents reported.',
    reportedAt: '2026-04-05T08:30:00',
    rainHazard: true,
    reporter: 'Rahul M.',
    reporterCount: 12,
    image: null,
  },
  {
    id: 2,
    lat: 17.3380,
    lng: 78.4560,
    severity: SEVERITY.MEDIUM,
    status: STATUS.IN_PROGRESS,
    description: 'Medium-sized pothole near Almasguda colony bus stop. Gets hidden under rainwater.',
    reportedAt: '2026-04-04T14:15:00',
    rainHazard: true,
    reporter: 'Priya S.',
    reporterCount: 7,
    image: null,
  },
  {
    id: 3,
    lat: 17.3310,
    lng: 78.4480,
    severity: SEVERITY.MINOR,
    status: STATUS.REPAIRED,
    description: 'Small crack in asphalt near Rajiv Gandhi Nagar junction.',
    reportedAt: '2026-04-02T10:00:00',
    rainHazard: false,
    reporter: 'Amit K.',
    reporterCount: 3,
    image: null,
  },
  {
    id: 4,
    lat: 17.3420,
    lng: 78.4440,
    severity: SEVERITY.DANGEROUS,
    status: STATUS.PENDING,
    description: 'Deep pothole on Balapur-Almasguda stretch. Caused tyre burst for two-wheelers during monsoon.',
    reportedAt: '2026-04-06T17:45:00',
    rainHazard: true,
    reporter: 'Sneha D.',
    reporterCount: 19,
    image: null,
  },
  {
    id: 5,
    lat: 17.3290,
    lng: 78.4550,
    severity: SEVERITY.MEDIUM,
    status: STATUS.PENDING,
    description: 'Uneven road surface with shallow pothole near Meerpet X-roads. Risk increases after heavy rain.',
    reportedAt: '2026-04-06T09:20:00',
    rainHazard: true,
    reporter: 'Vikram J.',
    reporterCount: 5,
    image: null,
  },
  {
    id: 6,
    lat: 17.3370,
    lng: 78.4610,
    severity: SEVERITY.DANGEROUS,
    status: STATUS.IN_PROGRESS,
    description: 'Dangerous cavity near Jillelguda bus stand. Several near-misses reported during evening rain.',
    reportedAt: '2026-04-03T19:30:00',
    rainHazard: true,
    reporter: 'Meera P.',
    reporterCount: 23,
    image: null,
  },
  {
    id: 7,
    lat: 17.3340,
    lng: 78.4500,
    severity: SEVERITY.MINOR,
    status: STATUS.PENDING,
    description: 'Small pothole on internal colony road near Karmanghat. Minimal risk.',
    reportedAt: '2026-04-07T06:10:00',
    rainHazard: false,
    reporter: 'Arjun R.',
    reporterCount: 2,
    image: null,
  },
  {
    id: 8,
    lat: 17.3400,
    lng: 78.4490,
    severity: SEVERITY.MEDIUM,
    status: STATUS.PENDING,
    description: 'Moderate pothole near school zone on Balapur main road. Invisible during waterlogging.',
    reportedAt: '2026-04-07T11:00:00',
    rainHazard: true,
    reporter: 'Kavita N.',
    reporterCount: 9,
    image: null,
  },
  {
    id: 9,
    lat: 17.3260,
    lng: 78.4580,
    severity: SEVERITY.DANGEROUS,
    status: STATUS.PENDING,
    description: 'Collapsed section of road after drainage leak near Pahadi Shareef. Extremely hazardous in rain.',
    reportedAt: '2026-04-06T22:00:00',
    rainHazard: true,
    reporter: 'Suresh G.',
    reporterCount: 31,
    image: null,
  },
  {
    id: 10,
    lat: 17.3450,
    lng: 78.4460,
    severity: SEVERITY.MINOR,
    status: STATUS.REPAIRED,
    description: 'Patched pothole near Hasthinapuram GHMC office. Repair holding well.',
    reportedAt: '2026-03-28T13:30:00',
    rainHazard: false,
    reporter: 'Deepak L.',
    reporterCount: 4,
    image: null,
  },
  {
    id: 11,
    lat: 17.3320,
    lng: 78.4640,
    severity: SEVERITY.DANGEROUS,
    status: STATUS.PENDING,
    description: 'Series of connected potholes forming a trench on NH44 service road. Two-wheelers reported losing control.',
    reportedAt: '2026-04-07T07:45:00',
    rainHazard: true,
    reporter: 'Ravi T.',
    reporterCount: 17,
    image: null,
  },
  {
    id: 12,
    lat: 17.3460,
    lng: 78.4530,
    severity: SEVERITY.MEDIUM,
    status: STATUS.IN_PROGRESS,
    description: 'Uneven manhole cover on Chandrayangutta road creating hazard during monsoon flooding.',
    reportedAt: '2026-04-05T16:20:00',
    rainHazard: true,
    reporter: 'Anita B.',
    reporterCount: 8,
    image: null,
  },
  {
    id: 13,
    lat: 17.3390,
    lng: 78.4475,
    severity: SEVERITY.DANGEROUS,
    status: STATUS.PENDING,
    description: 'Wide crater near Almasguda railway crossing. Vehicles swerve dangerously to avoid it. Hidden in monsoon.',
    reportedAt: '2026-04-07T15:30:00',
    rainHazard: true,
    reporter: 'Farhan S.',
    reporterCount: 26,
    image: null,
  },
  {
    id: 14,
    lat: 17.3275,
    lng: 78.4510,
    severity: SEVERITY.MEDIUM,
    status: STATUS.PENDING,
    description: 'Damaged road edge near Meerpet park. Water accumulates here causing skids for bikes.',
    reportedAt: '2026-04-07T12:15:00',
    rainHazard: true,
    reporter: 'Lakshmi V.',
    reporterCount: 6,
    image: null,
  },
  {
    id: 15,
    lat: 17.3430,
    lng: 78.4590,
    severity: SEVERITY.MINOR,
    status: STATUS.REPAIRED,
    description: 'Minor road crack near Balapur market. Has been well patched by GHMC.',
    reportedAt: '2026-03-30T09:00:00',
    rainHazard: false,
    reporter: 'Sanjay K.',
    reporterCount: 1,
    image: null,
  },
];

let nextId = potholeData.length + 1;

// Simulate road authority based on coordinate hash
function identifyAuthority(lat, lng) {
  const hash = Math.abs(Math.sin(lat * 97.4 + lng * 31.2));
  if (hash > 0.85) return 'NHAI / PWD (Highway)';
  if (hash < 0.3) return 'Local Panchayat (Local Road)';
  return 'Municipal Corporation (City Road)';
}

// Backfill existing mock data with an authority
potholeData.forEach(p => p.authority = identifyAuthority(p.lat, p.lng));

// ---------- helpers ----------
function getAllPotholes() {
  return [...potholeData];
}

function getPotholeById(id) {
  return potholeData.find(p => p.id === id) || null;
}

function addPothole(pothole) {
  const entry = {
    id: nextId++,
    lat: pothole.lat,
    lng: pothole.lng,
    severity: pothole.severity || SEVERITY.MEDIUM,
    status: STATUS.PENDING,
    description: pothole.description || '',
    reportedAt: new Date().toISOString(),
    rainHazard: pothole.rainHazard ?? true,
    reporter: pothole.reporter || 'Anonymous',
    reporterCount: 1,
    image: pothole.image || null,
    authority: identifyAuthority(pothole.lat, pothole.lng),
  };
  potholeData.unshift(entry);
  return entry;
}

function updatePotholeStatus(id, newStatus) {
  const p = potholeData.find(x => x.id === id);
  if (p) p.status = newStatus;
  return p;
}

// Compute stats
function getStats() {
  const total = potholeData.length;
  const dangerous = potholeData.filter(p => p.severity === SEVERITY.DANGEROUS).length;
  const pending = potholeData.filter(p => p.status === STATUS.PENDING).length;
  const repaired = potholeData.filter(p => p.status === STATUS.REPAIRED).length;
  const rainHazards = potholeData.filter(p => p.rainHazard).length;
  const inProgress = potholeData.filter(p => p.status === STATUS.IN_PROGRESS).length;
  return { total, dangerous, pending, repaired, rainHazards, inProgress };
}

// Simple distance (haversine approximation for short distances)
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  return distanceKm(lat1, lng1, lat2, lng2) * 1000;
}

function getNearbyPotholes(lat, lng, radiusKm = 2) {
  return potholeData
    .filter(p => distanceKm(lat, lng, p.lat, p.lng) <= radiusKm)
    .sort((a, b) => distanceKm(lat, lng, a.lat, a.lng) - distanceKm(lat, lng, b.lat, b.lng));
}

// Search / filter
function searchPotholes(query) {
  const q = query.toLowerCase().trim();
  if (!q) return getAllPotholes();
  return potholeData.filter(p =>
    p.description.toLowerCase().includes(q) ||
    p.reporter.toLowerCase().includes(q) ||
    p.severity.includes(q) ||
    p.status.includes(q) ||
    `#${p.id}`.includes(q)
  );
}

function getMockRoutes() {
  return MOCK_ROUTES;
}

// Export for modules (but we use plain scripts)
window.RW_DATA = {
  SEVERITY, STATUS, SEVERITY_COLORS, SEVERITY_LABELS, STATUS_LABELS,
  getAllPotholes, getPotholeById, addPothole, updatePotholeStatus,
  getStats, getNearbyPotholes, distanceKm, distanceMeters, searchPotholes,
  getMockRoutes, identifyAuthority,
};
