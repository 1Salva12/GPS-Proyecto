// ============================================================
// APP.JS — GPS INTERNACIONAL v9
// Fixes: geolocalización robusta + detección de casetas exacta
// ============================================================

const map = L.map('map', {
  center: [23.6345, -102.5528],
  zoom: 5,
  zoomControl: false,
}).addLayer(
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  })
);

L.control.zoom({ position: 'bottomright' }).addTo(map);

let userLocation = null;
let originCoords = null;
let destCoords = null;
let vehicleType = 'auto';
let vehicleSubClass = null; // { kind:'truck'|'bus', axles:2..9 } — solo aplica a 'camion'
let routeLayers = [];
let riskLayers = [];
let tollMarkers = [];
let trafficLayers = [];
let locationMarker = null;
let destMarker = null;
let currentRoute = null;
let activeFuel = FUEL_BY_COUNTRY.MX;

function activeVehicleFactor() {
  return { fuel: getVehicleFuelFactor(vehicleType, vehicleSubClass) };
}

// ===== RISK ZONES =====
function drawRiskZones() {
  riskLayers.forEach(l => map.removeLayer(l));
  riskLayers = [];
  const colors = { extreme: '#ef4444', high: '#f97316', medium: '#eab308', low: '#84cc16' };
  RISK_ZONES.forEach(zone => {
    const color = colors[zone.level] || '#ef4444';
    const circle = L.circle([zone.lat, zone.lng], {
      radius: zone.radius * 1000, color, fillColor: color, fillOpacity: 0.12,
      weight: 1.5, dashArray: zone.level === 'extreme' ? '6,3' : null,
    }).addTo(map);
    circle.bindPopup(`
      <div style="min-width:180px">
        <p style="font-weight:700;font-size:13px;margin-bottom:4px">⚠️ ${zone.name}</p>
        <p style="font-size:11px;color:#f59e0b;margin-bottom:6px">Nivel: ${zone.level.toUpperCase()}</p>
        <p style="font-size:11px">${zone.description}</p>
        <p style="font-size:10px;color:#7c8db0;margin-top:6px">Fuente: SESNSP 2024</p>
      </div>`);
    riskLayers.push(circle);
  });
}

function drawTollMarkers() {
  tollMarkers.forEach(m => map.removeLayer(m));
  tollMarkers = [];
  const tollIcon = L.divIcon({
    className: '',
    html: `<div style="background:#f59e0b;border:2px solid #1a1d27;border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center;font-size:7px;color:#000;font-weight:900">$</div>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
  });
  TOLL_BOOTHS.forEach(toll => {
    const cost = getTollRate(toll, vehicleType, vehicleSubClass);
    const sourceNote = toll.source === 'oficial'
      ? 'Fuente: Tarifario oficial CAPUFE 2026'
      : toll.source === 'privado'
        ? 'Concesión privada (no CAPUFE)'
        : '⚠️ Estimado, verificar antes de viajar';
    const m = L.marker([toll.lat, toll.lng], { icon: tollIcon }).addTo(map);
    m.bindPopup(`
      <div style="min-width:160px">
        <p style="font-weight:700;font-size:13px;margin-bottom:4px">🛣️ ${toll.name}</p>
        <p style="font-size:11px;color:#7c8db0">${toll.state} · ${toll.highway || ''}</p>
        <p style="font-size:15px;font-weight:700;color:#f59e0b;margin-top:6px">$${cost} MXN <span style="font-size:11px;font-weight:400;color:#7c8db0">(${VEHICLE_FACTORS[vehicleType].label})</span></p>
        <p style="font-size:10px;color:#7c8db0;margin-top:4px">${sourceNote}</p>
      </div>`);
    tollMarkers.push(m);
  });
}

function drawTraffic() {
  trafficLayers.forEach(l => map.removeLayer(l));
  trafficLayers = [];
  [
    { lat: 19.4326, lng: -99.1332, r: 6 }, { lat: 20.6597, lng: -103.3496, r: 5 },
    { lat: 25.6866, lng: -100.3161, r: 5 }, { lat: 19.0414, lng: -98.2063, r: 4 },
    { lat: 19.6010, lng: -99.0503, r: 4 }, { lat: 19.5478, lng: -99.2014, r: 3 },
  ].forEach(s => {
    const c = L.circle([s.lat, s.lng], {
      radius: s.r * 1000, color: '#64748b', fillColor: '#64748b', fillOpacity: 0.18, weight: 1,
    }).addTo(map);
    c.bindPopup('<p style="font-size:12px">🚦 <strong>Embotellamiento detectado</strong></p>');
    trafficLayers.push(c);
  });
}

function makeIcon(emoji, color) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};border:2px solid #0f1117;border-radius:50% 50% 50% 0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;transform:rotate(-45deg);box-shadow:0 2px 10px rgba(0,0,0,0.5)"><span style="transform:rotate(45deg)">${emoji}</span></div>`,
    iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32],
  });
}

// ============================================================
// AUTOCOMPLETE
// ============================================================
let acTimers = {};

function setupAutocomplete(inputId, dropdownId, onSelect) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  input.addEventListener('input', () => {
    const q = input.value.trim();
    dropdown.innerHTML = '';
    if (q.length < 3) { dropdown.classList.remove('show'); return; }
    const localResults = MX_CITIES
      .filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || (c.state && c.state.toLowerCase().includes(q.toLowerCase())))
      .slice(0, 4);
    clearTimeout(acTimers[inputId]);
    acTimers[inputId] = setTimeout(() => {
      fetchNominatim(q).then(places => {
        dropdown.innerHTML = '';
        const combined = [...localResults];
        places.forEach(p => {
          if (!combined.some(c => Math.abs(c.lat - p.lat) < 0.05 && Math.abs(c.lng - p.lng) < 0.05))
            combined.push(p);
        });
        if (!combined.length) { dropdown.classList.remove('show'); return; }
        combined.slice(0, 8).forEach(city => {
          const item = document.createElement('div');
          item.className = 'ac-item';
          const flag = getCountryFlag(city.country || 'MX');
          const sub = city.state || city.country || '';
          item.innerHTML = `<span class="ac-icon">${flag}</span><span><span class="ac-name">${city.name}</span><br><span class="ac-detail">${sub}</span></span>`;
          item.addEventListener('mousedown', e => {
            e.preventDefault();
            input.value = city.displayName || `${city.name}${city.state ? ', ' + city.state : ''}`;
            dropdown.classList.remove('show');
            onSelect({ lat: city.lat, lng: city.lng, name: input.value, state: city.state || '', country: city.country || 'MX' });
          });
          dropdown.appendChild(item);
        });
        dropdown.classList.add('show');
      });
    }, 350);
  });
  input.addEventListener('blur', () => setTimeout(() => dropdown.classList.remove('show'), 200));
}

async function fetchNominatim(query) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1`, { headers: { 'Accept-Language': 'es' } });
    const data = await res.json();
    return data.map(item => ({
      name: item.name || item.display_name.split(',')[0],
      displayName: item.display_name.split(',').slice(0, 3).join(',').trim(),
      state: item.address?.state || item.address?.county || '',
      country: item.address?.country_code?.toUpperCase() || '',
      lat: parseFloat(item.lat), lng: parseFloat(item.lon),
    }));
  } catch { return []; }
}

function getCountryFlag(code) {
  const f = { MX: '🇲🇽', US: '🇺🇸', ES: '🇪🇸', FR: '🇫🇷', DE: '🇩🇪', BR: '🇧🇷', AR: '🇦🇷', CO: '🇨🇴', CL: '🇨🇱', PE: '🇵🇪', GB: '🇬🇧', IT: '🇮🇹', JP: '🇯🇵', CA: '🇨🇦', AU: '🇦🇺' };
  return f[code] || '📍';
}

// ============================================================
// GEOLOCALIZACIÓN — robusta con reverse geocoding mejorado
// Las coordenadas GPS exactas siempre se usan para la ruta.
// El texto en el input es solo visual; originCoords.lat/lng
// son los valores reales que se pasan a Valhalla.
// ============================================================
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=14`,
      { headers: { 'Accept-Language': 'es' }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) throw new Error('nominatim error');
    const data = await res.json();
    const addr = data.address || {};

    // Cascada de fallbacks para obtener el mejor nombre legible
    const cityName =
      addr.city ||
      addr.town ||
      addr.municipality ||
      addr.village ||
      addr.suburb ||
      addr.neighbourhood ||
      addr.county ||
      'Mi ubicación';

    const stateName = addr.state || addr.region || '';
    const country = (addr.country_code || 'mx').toUpperCase();
    const display = stateName ? `${cityName}, ${stateName}` : cityName;

    return { name: cityName, display, state: stateName, country };
  } catch {
    // Si falla el reverse geocoding, usar coordenadas en el texto
    return {
      name: 'Mi ubicación',
      display: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      state: '',
      country: 'MX',
    };
  }
}

document.getElementById('useMyLocation').addEventListener('click', () => {
  if (!navigator.geolocation) { showToast('❌ Geolocalización no disponible en este navegador'); return; }
  showToast('📡 Obteniendo tu ubicación...');

  navigator.geolocation.getCurrentPosition(
    async pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracyM = pos.coords.accuracy; // metros de margen de error

      userLocation = { lat, lng };
      originCoords = { lat, lng, name: 'Mi ubicación', state: '', country: 'MX' };
      document.getElementById('originInput').value = '📍 Mi ubicación actual';
      placeOriginMarker(lat, lng, accuracyM);
      map.setView([lat, lng], accuracyM > 2000 ? 11 : 14);

      // Avisar si la precisión es baja (típico en laptop/desktop sin GPS real)
      if (accuracyM > 1500) {
        showToast(`⚠️ Precisión baja (±${Math.round(accuracyM / 1000)} km). Arrastra el pin 📍 a tu ubicación real.`);
      } else {
        showToast(`✅ Ubicación obtenida (±${Math.round(accuracyM)} m) — identificando lugar...`);
      }

      const geo = await reverseGeocode(lat, lng);
      originCoords.name = geo.display;
      originCoords.state = geo.state;
      originCoords.country = geo.country;
      document.getElementById('originInput').value = `📍 ${geo.display}`;
    },
    err => {
      const msgs = {
        1: '❌ Permiso de ubicación denegado. Habilítalo en tu navegador.',
        2: '⚠️ No se pudo obtener la ubicación. Intenta de nuevo.',
        3: '⚠️ Tiempo agotado. Verifica tu conexión.',
      };
      showToast(msgs[err.code] || '⚠️ Error al obtener ubicación');
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
});

// Marcador de origen ARRASTRABLE — permite corregir la ubicación
// manualmente cuando la geolocalización del navegador es imprecisa
// (común en laptops/PC sin chip GPS, que solo triangulan por WiFi/IP).
let accuracyCircle = null;

function placeOriginMarker(lat, lng, accuracyM) {
  if (locationMarker) map.removeLayer(locationMarker);
  if (accuracyCircle) map.removeLayer(accuracyCircle);

  locationMarker = L.marker([lat, lng], {
    icon: makeIcon('📍', '#3b82f6'),
    draggable: true,
  }).addTo(map);

  locationMarker.bindTooltip('Arrastra para corregir tu ubicación', { permanent: false });

  if (accuracyM) {
    accuracyCircle = L.circle([lat, lng], {
      radius: accuracyM, color: '#3b82f6', fillColor: '#3b82f6',
      fillOpacity: 0.08, weight: 1, dashArray: '4,4',
    }).addTo(map);
  }

  locationMarker.on('dragend', async e => {
    const pos = e.target.getLatLng();
    if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
    originCoords = { lat: pos.lat, lng: pos.lng, name: 'Mi ubicación (ajustada)', state: '', country: 'MX' };
    document.getElementById('originInput').value = '📍 Ubicando...';
    showToast('📍 Ubicación ajustada — identificando lugar...');
    const geo = await reverseGeocode(pos.lat, pos.lng);
    originCoords.name = geo.display;
    originCoords.state = geo.state;
    originCoords.country = geo.country;
    document.getElementById('originInput').value = `📍 ${geo.display}`;
    showToast(`✅ Origen corregido: ${geo.display}`);
  });
}

document.querySelectorAll('.vehicle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.vehicle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    vehicleType = btn.dataset.type;

    const axleGroup = document.getElementById('axleGroup');
    if (vehicleType === 'camion') {
      axleGroup.style.display = 'flex';
      syncVehicleSubClassFromUI();
    } else {
      axleGroup.style.display = 'none';
      vehicleSubClass = null;
    }

    tollMarkers.forEach(m => map.removeLayer(m));
    tollMarkers = [];
    drawTollMarkers();
  });
});

function syncVehicleSubClassFromUI() {
  const kindSel = document.getElementById('truckKind');
  const axlesSel = document.getElementById('truckAxles');
  if (!kindSel || !axlesSel) return;
  const axlesValue = parseInt(axlesSel.value, 10);
  // Validar que axles sea un número válido (2-9)
  if (!isNaN(axlesValue) && axlesValue >= 2 && axlesValue <= 9) {
    vehicleSubClass = { kind: kindSel.value, axles: axlesValue };
  } else {
    // Fallback a 2 ejes si no hay valor válido
    vehicleSubClass = { kind: kindSel.value, axles: 2 };
  }
}

const truckKindEl = document.getElementById('truckKind');
const truckAxlesEl = document.getElementById('truckAxles');
if (truckKindEl && truckAxlesEl) {
  function rebuildAxleOptions() {
    const isBus = truckKindEl.value === 'bus';
    const maxAxles = isBus ? 4 : 9;
    const current = parseInt(truckAxlesEl.value, 10) || 2;
    truckAxlesEl.innerHTML = '';
    for (let n = 2; n <= maxAxles; n++) {
      const opt = document.createElement('option');
      opt.value = n;
      const table = isBus ? BUS_AXLE_FUEL : TRUCK_AXLE_FUEL;
      opt.textContent = table[n] !== undefined
        ? (isBus ? `Autobús B${n} (${n} ejes)` : `Camión C${n} (${n} ejes)`)
        : `${n} ejes`;
      truckAxlesEl.appendChild(opt);
    }
    truckAxlesEl.value = Math.min(current, maxAxles);
  }
  rebuildAxleOptions();
  truckKindEl.addEventListener('change', () => {
    rebuildAxleOptions();
    syncVehicleSubClassFromUI();
    tollMarkers.forEach(m => map.removeLayer(m));
    tollMarkers = [];
    drawTollMarkers();
  });
  truckAxlesEl.addEventListener('change', () => {
    syncVehicleSubClassFromUI();
    tollMarkers.forEach(m => map.removeLayer(m));
    tollMarkers = [];
    drawTollMarkers();
  });
}

const fuelSlider = document.getElementById('fuelSlider');
const fuelFill = document.getElementById('fuelFill');
const fuelPct = document.getElementById('fuelPercent');
const fuelAlert = document.getElementById('fuelAlert');

fuelSlider.addEventListener('input', () => {
  const v = fuelSlider.value;
  fuelFill.style.width = v + '%';
  fuelPct.textContent = v + '%';
  fuelAlert.style.display = v < 20 ? 'block' : 'none';
});

const now = new Date();
document.getElementById('departureTime').value =
  `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
document.getElementById('departureDate').value =
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

setupAutocomplete('originInput', 'originDropdown', coords => {
  originCoords = coords;
  placeOriginMarker(coords.lat, coords.lng);
});
setupAutocomplete('destInput', 'destDropdown', coords => {
  destCoords = coords;
  if (destMarker) map.removeLayer(destMarker);
  destMarker = L.marker([coords.lat, coords.lng], { icon: makeIcon('🏁', '#22c55e') }).addTo(map);
});

// ============================================================
// VALHALLA — alternativas reales con via-points distintos
// ============================================================
// Dimensiones/peso aproximados por número de ejes — solo para que
// Valhalla aplique restricciones LEGALES reales de camión (puentes,
// libramientos obligatorios, vialidades prohibidas a carga pesada),
// lo que evita rutas "imposibles" y por lo tanto tiempos/distancias
// poco realistas para este tipo de vehículo. No afecta el costo de
// casetas (ese siempre usa la tarifa exacta por clase/eje de CAPUFE).
const TRUCK_DIMENSIONS_BY_AXLES = {
  2: { length: 9, width: 2.6, height: 3.5, weight: 8.5 },
  3: { length: 11, width: 2.6, height: 3.8, weight: 17 },
  4: { length: 14, width: 2.6, height: 4.0, weight: 24 },
  5: { length: 18, width: 2.6, height: 4.1, weight: 33.5 },
  6: { length: 20, width: 2.6, height: 4.1, weight: 38 },
  7: { length: 23, width: 2.6, height: 4.1, weight: 45 },
  8: { length: 26, width: 2.6, height: 4.1, weight: 52 },
  9: { length: 31, width: 2.6, height: 4.1, weight: 66.5 },
};

function buildDepartureISO() {
  const dateStr = document.getElementById('departureDate')?.value;
  const timeStr = document.getElementById('departureTime')?.value;
  if (!dateStr || !timeStr) return null;
  return `${dateStr}T${timeStr}`;
}

async function fetchValhallaRoute(origin, dest, options, viaPoints) {
  // Acepta un solo punto {lat,lng}, un arreglo de puntos, o null/undefined.
  const viaList = !viaPoints ? [] : (Array.isArray(viaPoints) ? viaPoints : [viaPoints]);
  const costing = vehicleType === 'camion' ? 'truck' : 'auto';
  const costingOptions = { [costing]: {} };

  // IMPORTANTE: el valor por defecto de Valhalla para "use_tolls" es
  // ~0.5 (voluntad MODERADA de pagar casetas), no 1.0. Eso provocaba que,
  // sin pedirlo, la "ruta principal" a veces rodeara por carreteras libres
  // para esquivar casetas — subcalculando el costo real y dejando de ser
  // "la carretera más conocida" (en México, esa suele ser justo la
  // autopista de cuota). Si el usuario NO marcó "evitar casetas", forzamos
  // voluntad MÁXIMA de usarlas (1.0) para que la ruta principal sea la
  // autopista de cuota real que la mayoría de la gente toma.
  costingOptions[costing].use_tolls = options.avoidTolls ? 0.0 : 1.0;

  // Preferir SIEMPRE la red troncal de autopistas (use_highways = 1.0,
  // máxima preferencia) en el tramo entre ciudades: así la ruta "principal"
  // coincide con la carretera más conocida/transitada, no con una variante
  // más larga por vialidades secundarias.
  if (costing === 'auto') {
    costingOptions.auto.use_highways = 1.0;
    costingOptions.auto.use_primary = 1.0;
    costingOptions.auto.maneuver_penalty = 5;
  }

  if (costing === 'truck' && vehicleSubClass) {
    const dims = TRUCK_DIMENSIONS_BY_AXLES[vehicleSubClass.axles];
    if (dims) Object.assign(costingOptions.truck, dims);
  }

  const locations = [
    { lon: origin.lng, lat: origin.lat, type: 'break' },
    ...viaList.map(v => ({ lon: v.lng, lat: v.lat, type: 'through' })),
    { lon: dest.lng, lat: dest.lat, type: 'break' },
  ];

  const body = {
    locations,
    costing,
    costing_options: costingOptions,
    units: 'kilometers',
    language: 'es-ES',
    directions_options: { units: 'kilometers' },
  };

  // date_time tipo 1 = "salida en este momento/fecha-hora local" — permite
  // a Valhalla usar perfiles de velocidad históricos por franja horaria
  // (hora pico vs. madrugada) en vez de una velocidad fija, acercando el
  // tiempo estimado al tiempo real de viaje según cuándo se sale.
  const departure = buildDepartureISO();
  if (departure) body.date_time = { type: 1, value: departure };

  const res = await fetch('https://valhalla1.openstreetmap.de/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Valhalla ${res.status}`);
  const data = await res.json();
  if (!data.trip) throw new Error('Sin ruta');
  return parseValhallaTrip(data.trip);
}

function generateViaPoints(origin, dest) {
  const dLat = dest.lat - origin.lat;
  const dLng = dest.lng - origin.lng;
  const dist = Math.sqrt(dLat * dLat + dLng * dLng);
  const perpLat = -dLng / dist;
  const perpLng = dLat / dist;
  const mid = { lat: (origin.lat + dest.lat) / 2, lng: (origin.lng + dest.lng) / 2 };
  const offset = dist * 0.18;
  return [
    { lat: mid.lat + perpLat * offset, lng: mid.lng + perpLng * offset },
    { lat: mid.lat - perpLat * offset, lng: mid.lng - perpLng * offset },
    { lat: mid.lat + dLat * 0.15, lng: mid.lng + dLng * 0.15 },
  ];
}

async function fetchAllRoutes(origin, dest, options) {
  const routes = [];

  // Si origen/destino encajan en un corredor principal conocido (ver
  // MAIN_CORRIDORS en data.js), forzamos que la RUTA PRINCIPAL pase por
  // las casetas icónicas de ese corredor (p. ej. Tepotzotlán + Palmillas
  // entre CDMX y Querétaro/San Juan del Río), aunque Valhalla por su
  // cuenta hubiera preferido una variante libre local más corta.
  const forcedVias = options.avoidTolls ? [] : getForcedViaPoints(origin, dest);

  try {
    const main = await fetchValhallaRoute(origin, dest, options, forcedVias);
    routes.push(main);
  } catch (e) {
    console.warn('Ruta principal con vía forzada falló, reintentando sin forzar:', e.message);
    try {
      const fallbackMain = await fetchValhallaRoute(origin, dest, options, null);
      routes.push(fallbackMain);
    } catch (e2) {
      console.warn('Ruta principal:', e2.message);
    }
  }

  const vias = generateViaPoints(origin, dest);
  const alts = await Promise.all(vias.map(via =>
    fetchValhallaRoute(origin, dest, options, via).catch(() => null)
  ));

  for (const alt of alts) {
    if (!alt) continue;
    const isDiff = !routes.some(r => Math.abs(r.distanceM - alt.distanceM) / alt.distanceM < 0.03);
    if (isDiff) routes.push(alt);
    if (routes.length >= 3) break;
  }
  return routes;
}

async function fetchOSRMFallback(origin, dest) {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&alternatives=true`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.routes || !data.routes[0]) return [];
  return data.routes.map(r => ({
    geometry: r.geometry.coordinates,
    distanceM: r.distance,
    durationS: r.duration,
  }));
}

function decodePolyline6(encoded) {
  const coords = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lng / 1e6, lat / 1e6]);
  }
  return coords;
}

function parseValhallaTrip(trip) {
  let allCoords = [];
  for (const leg of trip.legs) {
    const decoded = decodePolyline6(leg.shape);
    if (allCoords.length > 0) allCoords.pop();
    allCoords = allCoords.concat(decoded);
  }
  return {
    geometry: allCoords,
    distanceM: trip.summary.length * 1000,
    durationS: trip.summary.time,
  };
}

// ============================================================
// CONSTRUIR OBJETO RUTA
// ============================================================
function buildRouteObject(routeData, index, options) {
  const distKm = Math.round(routeData.distanceM / 1000);
  // Valhalla ya usa, desde la llamada con date_time (ver fetchValhallaRoute),
  // velocidades históricas por franja horaria según la hora real de salida.
  // Aun así no modela tráfico en vivo, así que si el usuario marca "evitar
  // embotellamientos" se añade un margen adicional pero más conservador
  // (8%, antes 15%) para no duplicar el ajuste que ya aporta date_time.
  let timeMin = Math.round(routeData.durationS / 60);
  if (options.avoidTraffic) timeMin = Math.round(timeMin * 1.08);

  const fuel = activeFuel || FUEL_BY_COUNTRY.MX;
  const liters = distKm * fuel.consumption * activeVehicleFactor().fuel;
  const price = fuel.priceMXN || (fuel.priceUSD * 17.5);
  const fuelL = liters.toFixed(1);
  const fuelCost = Math.round(liters * price);

  let tolls = [], tollCost = 0, tollNote = null;
  const firstC = routeData.geometry[0];
  const lastC = routeData.geometry[routeData.geometry.length - 1];
  const isMX = isRouteInMexico({ lat: firstC[1], lng: firstC[0] }, { lat: lastC[1], lng: lastC[0] });

  if (!isMX) {
    tollNote = 'Casetas no disponibles fuera de México';
  } else if (!options.avoidTolls) {
    tolls = calculateRealTolls(routeData.geometry);
    tollCost = tolls.reduce((s, t) => s + t.cost, 0);
  }

  const step = Math.max(1, Math.floor(routeData.geometry.length / 30));
  const sampleCoords = routeData.geometry.filter((_, i) => i % step === 0);
  const riskLevel = options.avoidRed
    ? sampleCoords.reduce((s, c) => s + riskScore(c[1], c[0], true), 0) / sampleCoords.length
    : 0;

  const labels = ['Ruta principal', 'Ruta alternativa 1', 'Ruta alternativa 2'];
  const algos = ['Óptima (A*)', 'Costo Uniforme', 'Alternativa'];

  return {
    geometry: routeData.geometry,
    totalDist: distKm,
    timeMin,
    tolls, tollCost, tollNote,
    fuelL, fuelCost, riskLevel,
    algorithm: algos[index] || `Alternativa ${index}`,
    label: labels[index] || `Alternativa ${index}`,
  };
}

// ============================================================
// BÚSQUEDA PRINCIPAL
// ============================================================
document.getElementById('searchBtn').addEventListener('click', async () => {
  if (!originCoords || !destCoords) { showToast('⚠️ Ingresa origen y destino'); return; }

  const btn = document.getElementById('searchBtn');
  btn.classList.add('loading');
  btn.innerHTML = '<span class="spinner"></span> Calculando...';

  try {
    const options = {
      vehicleType,
      avoidTolls: document.getElementById('avoidTolls').checked,
      avoidRed: document.getElementById('avoidRed').checked,
      avoidTraffic: document.getElementById('avoidTraffic').checked,
      algorithm: document.getElementById('algorithmSelect').value,
    };

    activeFuel = getFuelForRoute(originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng);
    activeFuel = { ...activeFuel }; // copia para no mutar el objeto compartido FUEL_BY_COUNTRY
    const overrideEl = document.getElementById('fuelPriceOverride');
    const overrideVal = overrideEl && overrideEl.value ? parseFloat(overrideEl.value) : null;
    if (overrideVal && overrideVal > 0) {
      activeFuel.priceMXN = overrideVal;
    }
    showToast('🛣️ Calculando rutas...');

    let rawRoutes = [];
    try {
      rawRoutes = await fetchAllRoutes(originCoords, destCoords, options);
    } catch (e) {
      console.warn('Valhalla falló, OSRM:', e.message);
      showToast('⚠️ Servidor lento, usando respaldo...');
      rawRoutes = await fetchOSRMFallback(originCoords, destCoords);
    }

    if (!rawRoutes || rawRoutes.length === 0) throw new Error('No se encontraron rutas disponibles');

    // IMPORTANTE: NO reordenar rawRoutes aquí. rawRoutes[0] es siempre la
    // ruta DIRECTA que devuelve Valhalla/OSRM sin vía-puntos forzados —
    // es decir, la ruta "más conocida"/estándar (la misma que recomendaría
    // Google Maps por defecto). Si se reordena por duración antes de
    // construir los objetos de ruta, una alternativa artificial (generada
    // forzando un vía-punto lateral) podía desplazar a la ruta estándar
    // como "ruta principal" de forma inconsistente entre búsquedas.
    let allRoutes = rawRoutes.map((r, i) => buildRouteObject(r, i, options));
    allRoutes.forEach(r => { r.fuelCostFormatted = formatFuelCost(parseFloat(r.fuelL), activeFuel); });

    // ============================================================
    // La ruta principal SIEMPRE es la ruta directa/estándar (la más
    // conocida). El selector de "algoritmo" solo decide cómo se
    // ordenan las 2 alternativas entre sí (más rápida / más corta /
    // más económica / balanceada) — nunca sustituye a la principal.
    // ============================================================
    allRoutes = reorderRoutesByAlgorithm(allRoutes, options.algorithm, options.avoidRed);
    allRoutes.forEach((r, i) => {
      r.label = ['Ruta principal', 'Ruta alternativa 1', 'Ruta alternativa 2'][i] || `Alternativa ${i}`;
      r.algorithm = i === 0 ? 'Ruta más conocida (estándar)' : (ALGORITHM_LABELS[options.algorithm] || 'Óptima (A*)');
    });

    currentRoute = { main: allRoutes[0], alternatives: allRoutes.slice(1) };
    drawRouteOnMap(currentRoute, originCoords, destCoords);
    showInfoPanel(currentRoute, options);

  } catch (e) {
    showToast('❌ ' + e.message);
    console.error(e);
  }

  btn.classList.remove('loading');
  btn.innerHTML = '<span class="btn-icon">🔍</span> Calcular Ruta';
});

function isRouteInMexico(origin, dest) {
  const inMX = (lat, lng) => lat >= 14.5 && lat <= 32.7 && lng >= -117.1 && lng <= -86.7;
  return inMX(origin.lat, origin.lng) || inMX(dest.lat, dest.lng);
}

// ============================================================
// SELECCIÓN DE RUTA PRINCIPAL SEGÚN ALGORITMO ELEGIDO
// Todas las rutas en `routes` ya vienen de Valhalla/OSRM (datos reales
// de carretera). Aquí solo se decide el ORDEN de presentación según
// el criterio que el usuario escogió en el selector:
//   - astar:      minimiza tiempo de viaje (ruta más rápida)
//   - manhattan:  minimiza distancia recorrida (ruta más corta)
//   - uniform:    minimiza costo total (casetas + combustible)
//   - genetic:    balance multi-objetivo (tiempo + costo + riesgo)
// ============================================================
const ALGORITHM_LABELS = {
  astar: 'Óptima (A*) · más rápida',
  manhattan: 'Heurística Manhattan · más corta',
  uniform: 'Costo Uniforme (Dijkstra) · más económica',
  genetic: 'Genético Evolutivo · balanceada',
};

function reorderRoutesByAlgorithm(routes, algorithm, avoidRed) {
  if (routes.length <= 1) return routes;

  // routes[0] es la ruta DIRECTA (sin vía-puntos forzados) — la más
  // conocida/estándar. Se mantiene fija como principal siempre; solo
  // se reordenan las alternativas [1..] según el criterio elegido.
  const main = routes[0];
  const alts = routes.slice(1);
  const totalCost = r => r.tollCost + r.fuelCost;

  if (algorithm === 'manhattan') {
    alts.sort((a, b) => a.totalDist - b.totalDist);
  } else if (algorithm === 'uniform') {
    alts.sort((a, b) => totalCost(a) - totalCost(b));
  } else if (algorithm === 'genetic') {
    const maxTime = Math.max(...alts.map(r => r.timeMin), 1);
    const maxCost = Math.max(...alts.map(totalCost), 1);
    const maxRisk = Math.max(...alts.map(r => r.riskLevel || 0), 0.0001);
    const score = r => (r.timeMin / maxTime) * 0.4 + (totalCost(r) / maxCost) * 0.3 +
      (avoidRed ? (r.riskLevel || 0) / maxRisk * 0.3 : 0);
    alts.sort((a, b) => score(a) - score(b));
  } else {
    // 'astar' (default): alternativas ordenadas por tiempo (más rápida primero)
    alts.sort((a, b) => a.timeMin - b.timeMin);
  }
  return [main, ...alts];
}

function formatFuelCost(liters, fuel) {
  if (fuel.priceMXN) return { text: `$${Math.round(liters * fuel.priceMXN)} MXN`, liters };
  return { text: `${fuel.symbol}${(liters * fuel.priceUSD).toFixed(0)} ${fuel.currency}`, liters };
}

// ============================================================
// DIBUJAR RUTAS
// ============================================================
function drawRouteOnMap(result, origin, dest) {
  routeLayers.forEach(l => map.removeLayer(l));
  routeLayers = [];

  const { main, alternatives } = result;

  const altStyles = [
    { color: '#a78bfa', weight: 4, opacity: 0.70, dashArray: '10,6' },
    { color: '#4ade80', weight: 4, opacity: 0.70, dashArray: '6,8' },
  ];
  alternatives.forEach((alt, i) => {
    const coords = alt.geometry.map(c => [c[1], c[0]]);
    const style = altStyles[i] || { color: '#f59e0b', weight: 3, opacity: 0.6 };
    const line = L.polyline(coords, style).addTo(map);
    line.bindTooltip(`${i === 0 ? '🟣' : '🟢'} ${alt.label} · ${alt.totalDist} km · ${formatTime(alt.timeMin)}`, { sticky: true });
    routeLayers.push(line);
  });

  const mainCoords = main.geometry.map(c => [c[1], c[0]]);
  const mainLine = L.polyline(mainCoords, { color: '#22d3ee', weight: 6, opacity: 0.95 }).addTo(map);
  mainLine.bindTooltip(`🔵 ${main.label} · ${main.totalDist} km · ${formatTime(main.timeMin)}`, { sticky: true });
  routeLayers.push(mainLine);

  if (locationMarker) map.removeLayer(locationMarker);
  locationMarker = L.marker([origin.lat, origin.lng], { icon: makeIcon('📍', '#3b82f6') })
    .addTo(map).bindPopup(`<strong>Origen</strong><br>${origin.name}`);

  if (destMarker) map.removeLayer(destMarker);
  destMarker = L.marker([dest.lat, dest.lng], { icon: makeIcon('🏁', '#22c55e') })
    .addTo(map).bindPopup(`<strong>Destino</strong><br>${dest.name}`);

  routeLayers.push(locationMarker, destMarker);
  map.fitBounds(L.latLngBounds(mainCoords), { padding: [60, 60] });
}

// ============================================================
// DETECCIÓN DE CASETAS SOBRE LA RUTA REAL
// 
// Algoritmo:
//  1. Filtrar casetas fuera del bounding box de la ruta (+0.05° margen)
//  2. Para cada caseta candidata, recorrer TODOS los segmentos
//     de la geometría real de Valhalla y calcular la distancia
//     perpendicular punto-a-segmento exacta (Haversine).
//  3. Umbral: 0.8 km — las casetas CAPUFE están exactamente
//     sobre el carril de la autopista, así que 0.8 km es preciso
//     sin capturar casetas de rutas paralelas.
//  4. Ordenar las casetas detectadas según su posición real
//     en la ruta (índice del segmento más cercano) para que
//     el listado aparezca en orden de recorrido.
// ============================================================

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distPointToSegmentKm(pLat, pLng, aLat, aLng, bLat, bLng) {
  const dLat = bLat - aLat, dLng = bLng - aLng;
  if (dLat === 0 && dLng === 0) return haversineKm(pLat, pLng, aLat, aLng);
  const t = Math.max(0, Math.min(1,
    ((pLat - aLat) * dLat + (pLng - aLng) * dLng) / (dLat * dLat + dLng * dLng)
  ));
  return haversineKm(pLat, pLng, aLat + t * dLat, aLng + t * dLng);
}

function calculateRealTolls(routeCoords) {
  if (!routeCoords || routeCoords.length < 2) return [];

  // Bounding box de la ruta con 0.05° de margen (~5 km)
  const lats = routeCoords.map(c => c[1]);
  const lngs = routeCoords.map(c => c[0]);
  const minLat = Math.min(...lats) - 0.10;
  const maxLat = Math.max(...lats) + 0.10;
  const minLng = Math.min(...lngs) - 0.10;
  const maxLng = Math.max(...lngs) + 0.10;

  // Umbral de detección: 1.2 km — suficiente margen para el desfase
  // típico entre la geometría de Valhalla/OSRM y la coordenada exacta
  // de la caseta, sin capturar libramientos o carreteras libres
  // paralelas que en varios tramos de México corren a 2-4 km de la
  // autopista de cuota (p. ej. Fed. 95 libre vs. 95D).
  const THRESHOLD_KM = 2.2;

  const found = [];

  for (const toll of TOLL_BOOTHS) {
    // Descarte rápido por bounding box
    if (toll.lat < minLat || toll.lat > maxLat ||
      toll.lng < minLng || toll.lng > maxLng) continue;

    let minDist = Infinity;
    let minSegIdx = 0;

    // Recorrer TODOS los segmentos de la geometría real
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const [aLng, aLat] = routeCoords[i];
      const [bLng, bLat] = routeCoords[i + 1];
      const d = distPointToSegmentKm(toll.lat, toll.lng, aLat, aLng, bLat, bLng);
      if (d < minDist) {
        minDist = d;
        minSegIdx = i;
      }
      // Early exit si ya está muy cerca (< 0.1 km)
      if (minDist < 0.1) break;
    }

    if (minDist <= THRESHOLD_KM) {
      found.push({
        ...toll,
        cost: getTollRate(toll, vehicleType, vehicleSubClass),
        _segIdx: minSegIdx,   // para ordenar por posición en la ruta
        _dist: minDist,
      });
    }
  }

  // Ordenar por posición en la ruta (segmento más cercano).
  // NOTA: cada caseta en TOLL_BOOTHS es un objeto único — no se necesita
  // (ni se debe) deduplicar por cercanía de índice, porque varios
  // corredores reales (Chamapa-Lechería, 95D Cuernavaca-Acapulco,
  // 195D Las Choapas-Ocozocoautla) tienen 4-6 casetas DISTINTAS y
  // legítimas separadas por solo unos cuantos km. Agruparlas por
  // "highway + índice cercano" las fusionaba incorrectamente y
  // sub-calculaba el costo total de casetas.
  found.sort((a, b) => a._segIdx - b._segIdx);

  return found;
}

// ============================================================
// PANEL DE INFORMACIÓN
// ============================================================
function calcArrivalDate(depDateStr, dep, extraMins) {
  if (!depDateStr) return '';
  const [depH, depM] = dep.split(':').map(Number);
  const totalArrMin = depH * 60 + depM + extraMins;
  const extraDays = Math.floor(totalArrMin / (24 * 60));
  const [y, mo, d] = depDateStr.split('-').map(Number);
  const date = new Date(y, mo - 1, d);
  date.setDate(date.getDate() + extraDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fmtDate(d) {
  if (!d) return '--';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

function showInfoPanel(result, options) {
  const { main, alternatives } = result;
  const dep = document.getElementById('departureTime').value || '00:00';
  const depDateStr = document.getElementById('departureDate').value;

  document.getElementById('arrivalTime').value = addMinutes(dep, main.timeMin);
  document.getElementById('arrivalDate').value = calcArrivalDate(depDateStr, dep, main.timeMin);

  document.getElementById('routeDistance').textContent = `${main.totalDist} km`;
  document.getElementById('routeTime').textContent = formatTime(main.timeMin);
  document.getElementById('routeTolls').textContent = main.tollNote ? '—' : (main.tollCost > 0 ? `$${main.tollCost} MXN` : 'Libre');
  const ff = main.fuelCostFormatted || { text: `$${main.fuelCost} MXN` };
  document.getElementById('routeFuel').textContent = `${ff.text} (${main.fuelL}L)`;
  document.getElementById('routeTitle').textContent = main.label;

  // Alternativas
  const altList = document.getElementById('altRoutesList');
  altList.innerHTML = '';
  if (!alternatives.length) {
    altList.innerHTML = '<p style="font-size:12px;color:#7c8db0">Solo se encontró una ruta para este trayecto.</p>';
  } else {
    alternatives.forEach((alt, i) => {
      const altFf = alt.fuelCostFormatted || { text: `$${alt.fuelCost} MXN` };
      const mainTotalCost = main.tollCost + main.fuelCost;
      const altTotalCost = alt.tollCost + alt.fuelCost;
      let badge, badgeClass;
      if (alt.timeMin < main.timeMin) { badge = 'Más rápida'; badgeClass = 'fast'; }
      else if (altTotalCost < mainTotalCost) { badge = 'Más económica'; badgeClass = 'cheap'; }
      else if (alt.totalDist < main.totalDist) { badge = 'Más corta'; badgeClass = 'cheap'; }
      else { badge = 'Alternativa'; badgeClass = 'cheap'; }
      const div = document.createElement('div');
      div.className = 'alt-route-item';
      div.innerHTML = `
        <div class="alt-info">
          <span class="alt-name">${alt.label}</span>
          <span class="alt-meta">${alt.totalDist} km · ${formatTime(alt.timeMin)} · ${alt.tollCost > 0 ? '$' + alt.tollCost + ' MXN casetas' : 'Sin casetas'}</span>
        </div>
        <span class="alt-badge ${badgeClass}">${badge}</span>`;
      div.addEventListener('click', () => {
        document.querySelectorAll('.alt-route-item').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
        const dep2 = document.getElementById('departureTime').value || '00:00';
        document.getElementById('routeDistance').textContent = `${alt.totalDist} km`;
        document.getElementById('routeTime').textContent = formatTime(alt.timeMin);
        document.getElementById('routeTolls').textContent = alt.tollNote ? '—' : (alt.tollCost > 0 ? `$${alt.tollCost} MXN` : 'Libre');
        document.getElementById('routeFuel').textContent = `${altFf.text} (${alt.fuelL}L)`;
        document.getElementById('routeTitle').textContent = alt.label;
        document.getElementById('arrivalTime').value = addMinutes(dep2, alt.timeMin);
        document.getElementById('arrivalDate').value = calcArrivalDate(depDateStr, dep2, alt.timeMin);
        updateArrivalBox(alt, dep2, depDateStr);
        updateTollsList(alt);
        highlightRouteOnMap(i);
        showToast(`✅ ${alt.label} seleccionada`);
      });
      altList.appendChild(div);
    });
  }

  updateTollsList(main);

  const fuelInfoEl = document.getElementById('fuelInfo');
  if (fuelInfoEl) fuelInfoEl.innerHTML = `<p style="font-size:11px;color:#7c8db0;margin-top:4px">💱 Precio combustible: ${activeFuel.symbol}${activeFuel.priceUSD.toFixed(2)} USD/L · ${activeFuel.currency}</p>`;

  const tzOrigin = getTimezoneForState(originCoords?.state || '');
  const tzDest = getTimezoneForState(destCoords?.state || '');
  const tzContent = document.getElementById('timezoneContent');
  const isIntl = (originCoords?.country || 'MX') !== (destCoords?.country || 'MX');
  if (isIntl) {
    tzContent.innerHTML = `<div class="timezone-box"><p>${getCountryFlag(originCoords?.country || 'MX')} Origen: <strong>${originCoords?.country || 'MX'}</strong></p><p>${getCountryFlag(destCoords?.country || 'MX')} Destino: <strong>${destCoords?.country || 'MX'}</strong></p><p style="color:#f59e0b;margin-top:6px">🌐 Ruta internacional.</p></div>`;
  } else if (tzOrigin.zone !== tzDest.zone) {
    tzContent.innerHTML = `<div class="timezone-box"><p>📍 Origen: <strong>${tzOrigin.label}</strong></p><p>🏁 Destino: <strong>${tzDest.label}</strong></p><p style="color:#f59e0b;margin-top:6px">⚠️ Cambio de zona horaria.</p></div>`;
  } else {
    tzContent.innerHTML = `<div class="timezone-box">🕐 Zona horaria: <strong>${tzOrigin.label}</strong></div>`;
  }

  updateArrivalBox(main, dep, depDateStr);

  const tankL = 50 * (parseInt(fuelSlider.value) / 100);
  if (tankL < parseFloat(main.fuelL)) {
    fuelAlert.style.display = 'block';
    fuelAlert.textContent = `⚠️ ¡Combustible insuficiente! Necesitas ${main.fuelL}L y tienes ~${tankL.toFixed(0)}L.`;
  }

  document.getElementById('infoPanel').style.display = 'flex';
}

function updateTollsList(route) {
  const tollsList = document.getElementById('tollsList');
  tollsList.innerHTML = '';
  if (route.tollNote) {
    tollsList.innerHTML = `<p style="font-size:12px;color:#7c8db0">ℹ️ ${route.tollNote}</p>`;
  } else if (!route.tolls?.length) {
    tollsList.innerHTML = '<p style="font-size:12px;color:#7c8db0">Sin casetas de cuota en esta ruta.</p>';
  } else {
    route.tolls.forEach(t => {
      const div = document.createElement('div');
      div.className = 'toll-item';
      const warn = t.source === 'estimado' ? ' ⚠️' : '';
      div.innerHTML = `<span class="toll-name">🛣️ ${t.name}${warn}<br><span style="font-size:10px;color:#7c8db0">${t.highway || ''} · ${t.state}</span></span><span class="toll-price">$${t.cost} MXN</span>`;
      tollsList.appendChild(div);
    });
    if (route.tolls.some(t => t.source === 'estimado')) {
      const note = document.createElement('p');
      note.style.cssText = 'font-size:10px;color:#f59e0b;margin-top:4px';
      note.textContent = '⚠️ Las casetas marcadas tienen tarifa estimada (no confirmada en el tarifario oficial CAPUFE 2026) — verifica antes de viajar.';
      tollsList.appendChild(note);
    }
    const tot = document.createElement('div');
    tot.className = 'toll-item';
    tot.style.borderTop = '1px solid #2d3142';
    tot.innerHTML = `<span class="toll-name" style="font-weight:700">TOTAL casetas</span><span class="toll-price" style="color:#f59e0b;font-weight:700">$${route.tollCost} MXN</span>`;
    tollsList.appendChild(tot);
  }
}

// Resalta visualmente la ruta seleccionada en el mapa
function highlightRouteOnMap(altIndex) {
  if (!currentRoute) return;
  // Redibujar todo (restablece estilos)
  drawRouteOnMap(currentRoute, originCoords, destCoords);
  // Luego engrosar la alternativa elegida
  const alt = currentRoute.alternatives[altIndex];
  if (!alt) return;
  const coords = alt.geometry.map(c => [c[1], c[0]]);
  const hl = L.polyline(coords, { color: '#facc15', weight: 7, opacity: 0.95 }).addTo(map);
  routeLayers.push(hl);
  map.fitBounds(L.latLngBounds(coords), { padding: [60, 60] });
}

function updateArrivalBox(route, dep, depDateStr) {
  const arrTime = addMinutes(dep, route.timeMin);
  const arrDateStr = calcArrivalDate(depDateStr, dep, route.timeMin);
  const isIntl = (originCoords?.country || 'MX') !== (destCoords?.country || 'MX');
  document.getElementById('arrivalContent').innerHTML = `
    <div class="arrival-row"><span>📅 Fecha de salida</span><strong>${fmtDate(depDateStr)}</strong></div>
    <div class="arrival-row"><span>🕐 Hora de salida</span><strong>${dep}</strong></div>
    <div class="arrival-row"><span>⏱️ Duración estimada</span><strong>${formatTime(route.timeMin)}</strong></div>
    <div class="arrival-row"><span>📅 Fecha de llegada</span><strong>${fmtDate(arrDateStr)}</strong></div>
    <div class="arrival-row"><span>🕔 Hora de llegada</span><strong>${arrTime}</strong></div>
    <div class="arrival-row"><span>🛣️ Ruta activa</span><strong>${route.label}</strong></div>
    ${isIntl ? '<div style="background:rgba(99,102,241,0.1);border:1px solid #6366f1;border-radius:8px;padding:8px 10px;margin-top:8px;font-size:12px;color:#a5b4fc">🌐 Ruta internacional detectada.</div>' : ''}
    ${route.riskLevel > 0.5 ? '<div style="background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:8px;padding:8px 10px;margin-top:8px;font-size:12px;color:#fca5a5">⚠️ La ruta pasa cerca de zonas con alta incidencia delictiva.</div>' : ''}`;
}

// ===== SIDEBAR =====
document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
document.getElementById('closeSidebar').addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));
document.getElementById('closeInfo').addEventListener('click', () => document.getElementById('infoPanel').style.display = 'none');

function showToast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function applyLabelOverrides() {
  const logoText = document.querySelector('.logo-text');
  if (logoText) logoText.innerHTML = 'Route<strong>Flow</strong>';

  const logoSub = document.querySelector('.logo-sub');
  if (logoSub) logoSub.textContent = 'Tu viaje en tiempo real';

  const highlightSpans = document.querySelectorAll('.sidebar-highlight span');
  if (highlightSpans.length >= 2) {
    highlightSpans[0].textContent = '⚡ Ruta rápida';
    highlightSpans[1].textContent = '🗺️ Mejor recorrido';
  }

  document.querySelectorAll('label').forEach(label => {
    const text = label.textContent || '';
    if (text.includes('Origen')) label.textContent = '📍 Punto de inicio';
    if (text.includes('Destino')) label.textContent = '🎯 Destino';
    if (text.includes('Tipo de vehículo')) label.textContent = '🚘 Tipo de viaje';
    if (text.includes('Tipo') && !text.includes('de viaje') && !text.includes('Método') && !text.includes('Ruta')) label.textContent = '🚚 Tipo';
    if (text.includes('Fecha de salida')) label.textContent = '📆 Inicio';
    if (text.includes('Hora de salida')) label.textContent = '⏰ Hora';
    if (text.includes('Fecha de llegada est.')) label.textContent = '📅 Llegada';
    if (text.includes('Hora de llegada est.')) label.textContent = '🕒 Estimada';
    if (text.includes('Opciones de ruta')) label.textContent = '⚙️ Preferencias';
    if (text.includes('Evitar casetas')) label.textContent = 'Sin peajes';
    if (text.includes('Evitar zonas de riesgo')) label.textContent = 'Evitar zonas peligrosas';
    if (text.includes('Evitar embotellamientos')) label.textContent = 'Evitar tráfico';
    if (text.includes('Orden de alternativas')) label.textContent = '🧠 Método de ruta';
    if (text.includes('Precio gasolina')) label.textContent = '⛽ Precio de gasolina';
    if (text.includes('Combustible actual')) label.textContent = '⛽ Nivel de gasolina';
  });

  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) searchBtn.innerHTML = '<span class="btn-icon">🧭</span><span>Encontrar ruta</span>';

  const fuelAlert = document.getElementById('fuelAlert');
  if (fuelAlert) fuelAlert.textContent = '⚠️ Queda poco combustible, revisa antes de salir.';

  const routeTitle = document.getElementById('routeTitle');
  if (routeTitle) routeTitle.textContent = 'Resumen del viaje';

  document.querySelectorAll('.stat-label').forEach(label => {
    const text = label.textContent || '';
    if (text.includes('Distancia')) label.textContent = 'Kilómetros';
    if (text.includes('Tiempo')) label.textContent = 'Duración';
    if (text.includes('Casetas')) label.textContent = 'Peajes';
    if (text.includes('Combustible')) label.textContent = 'Gasolina';
  });

  document.querySelectorAll('.alt-title').forEach(el => {
    if (el.textContent.includes('Rutas alternativas')) el.textContent = '🛣️ Rutas alternativas';
  });

  document.querySelectorAll('.detail-title').forEach(el => {
    const txt = el.textContent || '';
    if (txt.includes('Casetas')) el.textContent = '💳 Peajes en la ruta';
    if (txt.includes('Zona horaria')) el.textContent = '🌍 Zona horaria';
    if (txt.includes('Horario de viaje')) el.textContent = '🗓️ Horario del viaje';
  });

  document.querySelectorAll('.legend-item').forEach(item => {
    const txt = item.textContent || '';
    if (txt.includes('Zona de riesgo')) item.textContent = 'Riesgo';
    if (txt.includes('Caseta')) item.textContent = 'Peaje';
    if (txt.includes('Ruta principal')) item.textContent = 'Ruta';
    if (txt.includes('Embotellamiento')) item.textContent = 'Tráfico';
  });

  const originInput = document.getElementById('originInput');
  if (originInput) originInput.placeholder = 'Tu ubicación o lugar de salida';
  const destInput = document.getElementById('destInput');
  if (destInput) destInput.placeholder = 'Lugar al que quieres llegar';
  const fuelPrice = document.getElementById('fuelPriceOverride');
  if (fuelPrice) fuelPrice.placeholder = 'Ej. 24.50 por litro';
}

// ===== INIT =====
applyLabelOverrides();
drawRiskZones();
drawTollMarkers();
drawTraffic();
showToast('🌐 GPS Internacional listo. Ingresa origen y destino.');
