// ============================================================
// ALGORITHMS.JS — utilidades de distancia, riesgo, combustible y
// formato de tiempo usadas por el flujo real de ruteo (app.js).
//
// NOTA DE MANTENIMIENTO (2026):
// Este archivo antes incluía una "familia" completa de algoritmos
// simulados (A*, Manhattan, Costo Uniforme, Genético) que generaban
// rutas en línea recta entre origen y destino y luego buscaban
// casetas cercanas a esa línea. Ese código:
//   1) NUNCA se invocaba desde app.js (dead code) — la app ya usa
//      ruteo real por carretera (Valhalla + fallback OSRM).
//   2) Tenía un bug real: tollsOnRoute() leía `toll.autoMXN`, un
//      campo que no existe en TOLL_BOOTHS (la estructura real es
//      `toll.rates.auto/moto/bus/c2..c9`). De haberse usado, el
//      costo de casetas habría salido `NaN` siempre.
// Se eliminó esa simulación para no dejar una ruta de cálculo de
// costos rota y sin uso. El cálculo de casetas real y correcto vive
// en calculateRealTolls() (app.js), que sí usa getTollRate() con el
// tarifario CAPUFE-FONADIN 2026 exacto por clase de vehículo.
// ============================================================

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function riskScore(lat, lng, avoidRed) {
  if (!avoidRed) return 0;
  let score = 0;
  for (const zone of RISK_ZONES) {
    const d = haversine(lat, lng, zone.lat, zone.lng);
    if (d < zone.radius) {
      const levelW = { extreme:4, high:3, medium:2, low:1 }[zone.level] || 1;
      score += levelW * (1 - d/zone.radius);
    }
  }
  return score;
}

function formatTime(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function addMinutes(timeStr, mins) {
  if (!timeStr) {
    const now = new Date();
    now.setMinutes(now.getMinutes() + mins);
    return now.toTimeString().slice(0,5);
  }
  const [h, m] = timeStr.split(':').map(Number);
  const total  = h*60 + m + mins;
  return `${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
