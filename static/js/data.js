// ============================================================
// DATA.JS — Datos de casetas, zonas de riesgo y ciudades
// Versión Internacional + México
// ============================================================

const VEHICLE_FACTORS = {
  auto: { tolls: 1.0, fuel: 1.0, label: 'Automóvil' },
  moto: { tolls: 0.5, fuel: 0.45, label: 'Motocicleta' },
  camion: { tolls: 1.7, fuel: 2.2, label: 'Camión / Autobús' }, // fallback si la caseta no publica tarifa por eje
  taxi: { tolls: 1.0, fuel: 1.0, label: 'Taxi / Autos de alquiler' }
};

// Factores de combustible por número de ejes (no publicados por CAPUFE,
// estimados por peso/tipo de motor; las CASETAS sí usan tarifa exacta).
const TRUCK_AXLE_FUEL = { 2: 2.2, 3: 2.7, 4: 3.1, 5: 3.5, 6: 3.8, 7: 4.0, 8: 4.3, 9: 4.6 };
const BUS_AXLE_FUEL = { 2: 1.8, 3: 2.3, 4: 2.8 };

function getVehicleFuelFactor(vehicleType, subClass) {
  if (vehicleType === 'camion' && subClass) {
    if (subClass.kind === 'bus' && BUS_AXLE_FUEL[subClass.axles]) return BUS_AXLE_FUEL[subClass.axles];
    if (TRUCK_AXLE_FUEL[subClass.axles]) return TRUCK_AXLE_FUEL[subClass.axles];
  }
  return VEHICLE_FACTORS[vehicleType] ? VEHICLE_FACTORS[vehicleType].fuel : 1.0;
}

// Precio combustible por país. México: promedio nacional Magna actualizado
// (~jun/2026, fuente CRE — varía a diario y por estado/gasolinera; el
// usuario puede sobreescribirlo en la UI). Consumo en autopista 8.5-9 L/100km.
const FUEL_BY_COUNTRY = {
  MX: { priceMXN: 23.85, priceUSD: 1.26, consumption: 0.088, currency: 'MXN', symbol: '$' },
  US: { priceMXN: null, priceUSD: 0.95, consumption: 0.09, currency: 'USD', symbol: '$' },
  ES: { priceMXN: null, priceUSD: 1.65, consumption: 0.08, currency: 'EUR', symbol: '€' },
  FR: { priceMXN: null, priceUSD: 1.75, consumption: 0.08, currency: 'EUR', symbol: '€' },
  DE: { priceMXN: null, priceUSD: 1.80, consumption: 0.08, currency: 'EUR', symbol: '€' },
  AR: { priceMXN: null, priceUSD: 0.75, consumption: 0.10, currency: 'ARS', symbol: '$' },
  CO: { priceMXN: null, priceUSD: 0.55, consumption: 0.10, currency: 'COP', symbol: '$' },
  BR: { priceMXN: null, priceUSD: 1.10, consumption: 0.10, currency: 'BRL', symbol: 'R$' },
  DEFAULT: { priceMXN: null, priceUSD: 1.20, consumption: 0.09, currency: 'USD', symbol: '$' }
};

// Fuel activo (se actualiza según el país de la ruta)
let FUEL = { ...FUEL_BY_COUNTRY.MX };

// ============================================================
// CASETAS REALES — CAPUFE / RED FONADIN, tarifario oficial 2026
// (vigente desde 13/abr/2026, "con IVA"). Fuente:
//   pot.capufe.mx/.../Tarifas/Vigentes/2026/Tarifas-vigentes-2026.pdf
// Cada caseta trae la tarifa EXACTA por clase de vehículo (no una
// aproximación): moto, auto, autobús (B2-B4, casi siempre iguales),
// y camión por número de ejes (C2 a C9). Cuando la caseta no publica
// tarifa de cierta clase (p. ej. algunos libramientos que no permiten
// camiones de carga), el campo queda en null y la app usa un factor de
// respaldo (VEHICLE_FACTORS.camion.tolls) sobre la tarifa de auto.
//
// source:'oficial'  -> tomado literalmente del tarifario CAPUFE-FONADIN 2026
// source:'privado'  -> concesión privada (no aparece en el tarifario CAPUFE)
// source:'estimado' -> corredor real pero la cifra exacta no se pudo
//                       confirmar contra el tarifario oficial; verificar
//                       antes de viajar (ver nota en cada caseta)
// ============================================================
const TOLL_BOOTHS = [
  { id: "cua-aca-01", name: "Tlalpan", lat: 19.27, lng: -99.176, state: "Ciudad de México", highway: "95D México-Cuernavaca", source: "oficial", rates: { moto: 78, auto: 156, bus: 301, c2: 299, c3: 299, c4: 299, c5: 512, c6: 512, c7: 748, c8: 748, c9: 748 } },
  { id: "cua-aca-02", name: "Tres Marías", lat: 19.048, lng: -99.233, state: "Morelos", highway: "95D Cuernavaca-Acapulco", source: "oficial", rates: { moto: 28, auto: 56, bus: 132, c2: 128, c3: 128, c4: 128, c5: 252, c6: 252, c7: 365, c8: 365, c9: 365 } },
  { id: "cua-aca-03", name: "Alpuyeca", lat: 18.772, lng: -99.239, state: "Morelos", highway: "95D Cuernavaca-Acapulco", source: "oficial", rates: { moto: 34, auto: 68, bus: 124, c2: 122, c3: 122, c4: 122, c5: 153, c6: 153, c7: 172, c8: 172, c9: 172 } },
  { id: "cua-aca-04", name: "Paso Morelos", lat: 18.385, lng: -99.498, state: "Guerrero", highway: "95D Cuernavaca-Acapulco", source: "oficial", rates: { moto: 104, auto: 209, bus: 453, c2: 449, c3: 449, c4: 449, c5: 591, c6: 591, c7: 654, c8: 654, c9: 654 } },
  { id: "cua-aca-05", name: "Palo Blanco", lat: 17.41, lng: -99.623, state: "Guerrero", highway: "95D Cuernavaca-Acapulco", source: "oficial", rates: { moto: 95, auto: 190, bus: 262, c2: 262, c3: 262, c4: 262, c5: 345, c6: 345, c7: 386, c8: 386, c9: 386 } },
  { id: "cua-aca-06", name: "La Venta", lat: 17.095, lng: -99.778, state: "Guerrero", highway: "95D Cuernavaca-Acapulco", source: "oficial", rates: { moto: 85, auto: 171, bus: 248, c2: 245, c3: 245, c4: 245, c5: 335, c6: 335, c7: 375, c8: 375, c9: 375 } },
  { id: "cor-ver-01", name: "Cuitláhuac", lat: 18.865, lng: -96.728, state: "Veracruz", highway: "150D Córdoba-Veracruz", source: "oficial", rates: { moto: 73, auto: 146, bus: 208, c2: 195, c3: 195, c4: 195, c5: 278, c6: 278, c7: 292, c8: 292, c9: 292 } },
  { id: "cor-ver-02", name: "Paso del Toro", lat: 19.075, lng: -96.235, state: "Veracruz", highway: "150D Córdoba-Veracruz", source: "oficial", rates: { moto: 68, auto: 136, bus: 226, c2: 223, c3: 223, c4: 223, c5: 288, c6: 288, c7: 336, c8: 336, c9: 336 } },
  { id: "tin-cos-01", name: "Cosamaloapan", lat: 18.407, lng: -95.8, state: "Veracruz", highway: "145D La Tinaja-Coatzacoalcos", source: "oficial", rates: { moto: 145, auto: 290, bus: 457, c2: 381, c3: 381, c4: 381, c5: 561, c6: 561, c7: 647, c8: 647, c9: 647 } },
  { id: "tin-cos-02", name: "Acayucan (Sayula)", lat: 17.959, lng: -94.918, state: "Veracruz", highway: "145D La Tinaja-Coatzacoalcos", source: "oficial", rates: { moto: 135, auto: 270, bus: 413, c2: 351, c3: 351, c4: 351, c5: 543, c6: 543, c7: 596, c8: 596, c9: 596 } },
  { id: "qro-libNE-01", name: "Chichimequillas", lat: 20.738, lng: -100.366, state: "Querétaro", highway: "57D Libr. NE Querétaro", source: "oficial", rates: { moto: 32, auto: 65, bus: 118, c2: 112, c3: 112, c4: 112, c5: 121, c6: 121, c7: 166, c8: 166, c9: 166 } },
  { id: "salt-lib-01", name: "Ojo Caliente (Libr. Saltillo)", lat: 25.469, lng: -100.897, state: "Coahuila", highway: "Libr. Ote. Saltillo", source: "oficial", rates: { moto: 26, auto: 53, bus: 84, c2: null, c3: null, c4: null, c5: null, c6: null, c7: null, c8: null, c9: null } },
  { id: "carb-pm-01", name: "Los Chorros", lat: 24.893, lng: -101.417, state: "Coahuila", highway: "57D La Carbonera-Pto. México", source: "oficial", rates: { moto: 41, auto: 82, bus: 146, c2: 196, c3: 196, c4: 196, c5: 306, c6: 306, c7: 380, c8: 380, c9: 380 } },
  { id: "carb-pm-02", name: "Huachichil", lat: 24.608, lng: -101.182, state: "Coahuila", highway: "57D La Carbonera-Pto. México", source: "oficial", rates: { moto: 31, auto: 62, bus: 99, c2: 178, c3: 178, c4: 178, c5: 240, c6: 240, c7: 303, c8: 303, c9: 303 } },
  { id: "tampico-01", name: "Tampico (Libramiento)", lat: 22.236, lng: -97.923, state: "Tamaulipas", highway: "Libr. Pte. Tampico", source: "oficial", rates: { moto: 19, auto: 39, bus: 81, c2: 70, c3: 70, c4: 70, c5: 127, c6: 127, c7: 155, c8: 155, c9: 155 } },
  { id: "camp-01", name: "Seybaplaya", lat: 19.647, lng: -90.692, state: "Campeche", highway: "180D Champotón-Campeche", source: "oficial", rates: { moto: 49, auto: 99, bus: 163, c2: 161, c3: 161, c4: 161, c5: 277, c6: 277, c7: 335, c8: 335, c9: 335 } },
  { id: "chamapa-01", name: "Chamapa", lat: 19.518, lng: -99.328, state: "Estado de México", highway: "Chamapa-Lechería", source: "oficial", rates: { moto: 34, auto: 69, bus: 127, c2: 119, c3: 119, c4: 119, c5: 183, c6: 183, c7: 228, c8: 228, c9: 228 } },
  { id: "chamapa-02", name: "Cipreses", lat: 19.538, lng: -99.292, state: "Estado de México", highway: "Chamapa-Lechería", source: "oficial", rates: { moto: 31, auto: 62, bus: 114, c2: 113, c3: 113, c4: 113, c5: 166, c6: 166, c7: 218, c8: 218, c9: 218 } },
  { id: "chamapa-03", name: "San Mateo Nopala", lat: 19.498, lng: -99.305, state: "Estado de México", highway: "Chamapa-Lechería", source: "oficial", rates: { moto: 30, auto: 60, bus: 99, c2: 105, c3: 105, c4: 105, c5: 149, c6: 149, c7: 194, c8: 194, c9: 194 } },
  { id: "chamapa-04", name: "Madín", lat: 19.505, lng: -99.258, state: "Estado de México", highway: "Chamapa-Lechería", source: "oficial", rates: { moto: 18, auto: 36, bus: 64, c2: 64, c3: 64, c4: 64, c5: 100, c6: 100, c7: 125, c8: 125, c9: 125 } },
  { id: "chamapa-05", name: "Atizapán", lat: 19.561, lng: -99.247, state: "Estado de México", highway: "Chamapa-Lechería", source: "oficial", rates: { moto: 10, auto: 21, bus: 45, c2: 44, c3: 44, c4: 44, c5: 65, c6: 65, c7: 83, c8: 83, c9: 83 } },
  { id: "chamapa-06", name: "Lomas Verdes", lat: 19.578, lng: -99.282, state: "Estado de México", highway: "Chamapa-Lechería", source: "oficial", rates: { moto: 30, auto: 61, bus: 111, c2: 107, c3: 107, c4: 107, c5: 155, c6: 155, c7: 202, c8: 202, c9: 202 } },
  { id: "son-01", name: "Estación Don", lat: 27.082, lng: -109.438, state: "Sonora", highway: "15D Son.", source: "oficial", rates: { moto: 57, auto: 114, bus: 194, c2: 191, c3: 191, c4: 191, c5: 287, c6: 287, c7: 330, c8: 330, c9: 330 } },
  { id: "son-02", name: "Fundición", lat: 27.167, lng: -109.672, state: "Sonora", highway: "15D Son.", source: "oficial", rates: { moto: 57, auto: 114, bus: 194, c2: 191, c3: 191, c4: 191, c5: 287, c6: 287, c7: 330, c8: 330, c9: 330 } },
  { id: "son-03", name: "Esperanza (Son.)", lat: 27.77, lng: -110.496, state: "Sonora", highway: "15D Son.", source: "oficial", rates: { moto: 57, auto: 114, bus: 194, c2: 190, c3: 190, c4: 190, c5: 287, c6: 287, c7: 330, c8: 330, c9: 330 } },
  { id: "son-04", name: "Guaymas (Libramiento)", lat: 27.942, lng: -110.898, state: "Sonora", highway: "15D Son.", source: "oficial", rates: { moto: 24, auto: 48, bus: 106, c2: 107, c3: 107, c4: 107, c5: 157, c6: 157, c7: 187, c8: 187, c9: 187 } },
  { id: "son-05", name: "Hermosillo", lat: 29.024, lng: -111.008, state: "Sonora", highway: "15D Son.", source: "oficial", rates: { moto: 57, auto: 114, bus: 195, c2: 191, c3: 191, c4: 191, c5: 287, c6: 287, c7: 345, c8: 345, c9: 345 } },
  { id: "son-06", name: "Magdalena (Libramiento)", lat: 30.619, lng: -110.965, state: "Sonora", highway: "15D Son.", source: "oficial", rates: { moto: 19, auto: 38, bus: 64, c2: 64, c3: 64, c4: 64, c5: 99, c6: 99, c7: 127, c8: 127, c9: 127 } },
  { id: "gp-dgo-01", name: "Bermejillo", lat: 25.855, lng: -103.498, state: "Durango", highway: "40D", source: "oficial", rates: { moto: 80, auto: 161, bus: 244, c2: 215, c3: 215, c4: 215, c5: 362, c6: 362, c7: 416, c8: 416, c9: 416 } },
  { id: "gp-dgo-02", name: "Ceballos", lat: 26.526, lng: -103.961, state: "Durango", highway: "40D", source: "oficial", rates: { moto: 91, auto: 183, bus: 261, c2: 229, c3: 229, c4: 229, c5: 369, c6: 369, c7: 404, c8: 404, c9: 404 } },
  { id: "tor-salt-01", name: "La Cuchilla", lat: 25.68, lng: -103.23, state: "Coahuila", highway: "40D Torreón-Saltillo", source: "oficial", rates: { moto: 50, auto: 100, bus: 183, c2: 159, c3: 159, c4: 159, c5: 233, c6: 233, c7: 264, c8: 264, c9: 264 } },
  { id: "tor-salt-02", name: "Plan de Ayala", lat: 25.534, lng: -101.07, state: "Coahuila", highway: "40D Torreón-Saltillo", source: "oficial", rates: { moto: 88, auto: 176, bus: 306, c2: 268, c3: 268, c4: 268, c5: 369, c6: 369, c7: 419, c8: 419, c9: 419 } },
  { id: "agua-card-01", name: "La Venta (Agua Dulce)", lat: 18.145, lng: -93.798, state: "Tabasco", highway: "180D Agua Dulce-Cárdenas", source: "oficial", rates: { moto: 53, auto: 106, bus: 210, c2: 176, c3: 176, c4: 176, c5: 287, c6: 287, c7: 358, c8: 358, c9: 358 } },
  { id: "ixtla-igu-01", name: "Iguala", lat: 18.346, lng: -99.539, state: "Guerrero", highway: "95D Pte. Ixtla-Iguala", source: "oficial", rates: { moto: 56, auto: 112, bus: 238, c2: 237, c3: 237, c4: 237, c5: 435, c6: 435, c7: 596, c8: 596, c9: 596 } },
  { id: "mor-cuau-01", name: "La Pera-Cuautla", lat: 18.999, lng: -99.066, state: "Morelos", highway: "160D La Pera-Cuautla", source: "oficial", rates: { moto: 43, auto: 86, bus: 159, c2: 156, c3: 156, c4: 156, c5: 254, c6: 254, c7: 374, c8: 374, c9: 374 } },
  { id: "mor-cuau-02", name: "Tepoztlán", lat: 18.985, lng: -99.098, state: "Morelos", highway: "160D La Pera-Cuautla", source: "oficial", rates: { moto: 32, auto: 64, bus: 118, c2: 116, c3: 116, c4: 116, c5: 191, c6: 191, c7: 282, c8: 282, c9: 282 } },
  { id: "mor-cuau-03", name: "Oaxtepec", lat: 18.902, lng: -98.967, state: "Morelos", highway: "160D La Pera-Cuautla", source: "oficial", rates: { moto: 33, auto: 66, bus: 122, c2: 119, c3: 119, c4: 119, c5: 195, c6: 195, c7: 289, c8: 289, c9: 289 } },
  { id: "mor-cuau-04", name: "Oacalco", lat: 18.809, lng: -98.955, state: "Morelos", highway: "160D La Pera-Cuautla", source: "oficial", rates: { moto: 26, auto: 53, bus: 100, c2: 98, c3: 98, c4: 98, c5: 159, c6: 159, c7: 234, c8: 234, c9: 234 } },
  { id: "zac-rv-01", name: "Zacapalco", lat: 18.13, lng: -99.631, state: "Guerrero", highway: "95D Zacapalco-Rancho Viejo", source: "oficial", rates: { moto: 23, auto: 46, bus: 99, c2: 95, c3: 95, c4: 95, c5: 144, c6: 144, c7: 204, c8: 204, c9: 204 } },
  { id: "tih-gz-01", name: "Totomoxtle", lat: 20.694, lng: -97.431, state: "Veracruz", highway: "180D Tihuatlán-Gtz. Zamora", source: "oficial", rates: { moto: 30, auto: 60, bus: 126, c2: 107, c3: 107, c4: 107, c5: 182, c6: 182, c7: 241, c8: 241, c9: 241 } },
  { id: "chiapas-01", name: "Las Choapas", lat: 17.918, lng: -93.846, state: "Veracruz", highway: "195D Las Choapas-Ocozocoautla", source: "oficial", rates: { moto: 52, auto: 105, bus: 197, c2: 167, c3: 167, c4: 167, c5: 264, c6: 264, c7: 361, c8: 361, c9: 361 } },
  { id: "chiapas-02", name: "Malpasito", lat: 17.492, lng: -93.735, state: "Tabasco", highway: "195D Las Choapas-Ocozocoautla", source: "oficial", rates: { moto: 53, auto: 106, bus: 197, c2: 168, c3: 168, c4: 168, c5: 264, c6: 264, c7: 362, c8: 362, c9: 362 } },
  { id: "chiapas-03", name: "Ocozocoautla", lat: 16.756, lng: -93.376, state: "Chiapas", highway: "195D Las Choapas-Ocozocoautla", source: "oficial", rates: { moto: 53, auto: 106, bus: 198, c2: 168, c3: 168, c4: 168, c5: 264, c6: 264, c7: 362, c8: 362, c9: 362 } },
  { id: "mex-qro-01", name: "Tepotzotlán", lat: 19.705, lng: -99.228, state: "Estado de México", highway: "57D México-Querétaro", source: "oficial", rates: { moto: 56, auto: 113, bus: 269, c2: 257, c3: 257, c4: 517, c5: 517, c6: 743, c7: 743, c8: 743, c9: 743 } },
  { id: "mex-qro-02", name: "Jorobas", lat: 19.805, lng: -99.355, state: "Estado de México", highway: "57D México-Querétaro", source: "oficial", rates: { moto: 37, auto: 74, bus: 141, c2: 140, c3: 140, c4: 278, c5: 278, c6: 399, c7: 399, c8: 399, c9: 399 } },
  { id: "mex-qro-03", name: "Palmillas", lat: 20.258, lng: -99.961, state: "Querétaro", highway: "57D México-Querétaro", source: "oficial", rates: { moto: 56, auto: 113, bus: 251, c2: 240, c3: 240, c4: 482, c5: 482, c6: 703, c7: 703, c8: 703, c9: 703 } },
  { id: "mex-qro-04", name: "Polotitlán", lat: 20.207, lng: -99.835, state: "Querétaro", highway: "57D México-Querétaro", source: "oficial", rates: { moto: 51, auto: 103, bus: 216, c2: 210, c3: 210, c4: 415, c5: 415, c6: 583, c7: 583, c8: 583, c9: 583 } },
  { id: "qro-irap-01", name: "Querétaro (57D-45D)", lat: 20.644, lng: -100.412, state: "Querétaro", highway: "45D Querétaro-Irapuato", source: "oficial", rates: { moto: 53, auto: 107, bus: 225, c2: 216, c3: 216, c4: 425, c5: 425, c6: 596, c7: 596, c8: 596, c9: 596 } },
  { id: "qro-irap-02", name: "Apaseo", lat: 20.565, lng: -100.628, state: "Guanajuato", highway: "45D Querétaro-Irapuato", source: "oficial", rates: { moto: 24, auto: 49, bus: 99, c2: 99, c3: 99, c4: 193, c5: 193, c6: 269, c7: 269, c8: 269, c9: 269 } },
  { id: "qro-irap-03", name: "Salamanca", lat: 20.571, lng: -100.98, state: "Guanajuato", highway: "45D Querétaro-Irapuato", source: "oficial", rates: { moto: 36, auto: 73, bus: 173, c2: 170, c3: 170, c4: 330, c5: 330, c6: 445, c7: 445, c8: 445, c9: 445 } },
  { id: "qro-irap-04", name: "Villagrán", lat: 20.529, lng: -101.047, state: "Guanajuato", highway: "45D Querétaro-Irapuato", source: "oficial", rates: { moto: 21, auto: 42, bus: 81, c2: 79, c3: 79, c4: 157, c5: 157, c6: 225, c7: 225, c8: 225, c9: 225 } },
  { id: "qro-irap-05", name: "Cerro Gordo", lat: 20.498, lng: -100.774, state: "Guanajuato", highway: "45D Querétaro-Irapuato", source: "oficial", rates: { moto: 30, auto: 61, bus: 132, c2: 134, c3: 134, c4: 232, c5: 232, c6: 342, c7: 342, c8: 342, c9: 342 } },
  { id: "mex-pue-01", name: "Chalco", lat: 19.264, lng: -98.899, state: "Estado de México", highway: "150D México-Puebla", source: "oficial", rates: { moto: 13, auto: 26, bus: 52, c2: 50, c3: 50, c4: 81, c5: 81, c6: 127, c7: 127, c8: 127, c9: 127 } },
  { id: "mex-pue-02", name: "Ixtapaluca", lat: 19.322, lng: -98.885, state: "Estado de México", highway: "150D México-Puebla", source: "oficial", rates: { moto: 13, auto: 26, bus: 52, c2: 50, c3: 50, c4: 81, c5: 81, c6: 127, c7: 127, c8: 127, c9: 127 } },
  { id: "mex-pue-03", name: "San Marcos", lat: 19.216, lng: -98.454, state: "Estado de México", highway: "150D México-Puebla", source: "oficial", rates: { moto: 86, auto: 173, bus: 350, c2: 335, c3: 335, c4: 688, c5: 688, c6: 943, c7: 943, c8: 943, c9: 943 } },
  { id: "mex-pue-04", name: "San Martín Texmelucan", lat: 19.282, lng: -98.429, state: "Puebla", highway: "150D México-Puebla", source: "oficial", rates: { moto: 26, auto: 53, bus: 137, c2: 129, c3: 129, c4: 261, c5: 261, c6: 366, c7: 366, c8: 366, c9: 366 } },
  { id: "pue-acatz-01", name: "Amozoc", lat: 19.048, lng: -98.057, state: "Puebla", highway: "150D Puebla-Acatzingo", source: "oficial", rates: { moto: 47, auto: 94, bus: 196, c2: 187, c3: 187, c4: 360, c5: 360, c6: 480, c7: 480, c8: 480, c9: 480 } },
  { id: "acatz-cm-01", name: "Esperanza", lat: 18.846, lng: -97.396, state: "Puebla", highway: "150D Acatzingo-Cd. Mendoza", source: "oficial", rates: { moto: 89, auto: 178, bus: 409, c2: 386, c3: 386, c4: 745, c5: 745, c6: 1085, c7: 1085, c8: 1085, c9: 1085 } },
  { id: "teh-oax-01", name: "Tehuacán", lat: 18.644, lng: -97.447, state: "Puebla", highway: "135D Tehuacán-Oaxaca", source: "oficial", rates: { moto: 29, auto: 58, bus: 138, c2: 136, c3: 136, c4: 170, c5: 170, c6: 266, c7: 266, c8: 266, c9: 266 } },
  { id: "teh-oax-02", name: "Miahuatlán", lat: 18.327, lng: -97.568, state: "Oaxaca", highway: "135D Tehuacán-Oaxaca", source: "oficial", rates: { moto: 21, auto: 42, bus: 71, c2: 70, c3: 70, c4: 99, c5: 99, c6: 146, c7: 146, c8: 146, c9: 146 } },
  { id: "teh-oax-03", name: "Suchixtlahuaca", lat: 17.799, lng: -97.276, state: "Oaxaca", highway: "135D Tehuacán-Oaxaca", source: "oficial", rates: { moto: 49, auto: 99, bus: 218, c2: 217, c3: 217, c4: 264, c5: 264, c6: 368, c7: 368, c8: 368, c9: 368 } },
  { id: "teh-oax-04", name: "Huitzo", lat: 17.293, lng: -96.852, state: "Oaxaca", highway: "135D Tehuacán-Oaxaca", source: "oficial", rates: { moto: 57, auto: 114, bus: 275, c2: 274, c3: 274, c4: 319, c5: 319, c6: 497, c7: 497, c8: 497, c9: 497 } },
  { id: "tij-ens-01", name: "Playas", lat: 32.422, lng: -117.085, state: "Baja California", highway: "1D Tijuana-Ensenada", source: "oficial", rates: { moto: 25, auto: 50, bus: 109, c2: 109, c3: 109, c4: 131, c5: 131, c6: 152, c7: 152, c8: 152, c9: 152 } },
  { id: "tij-ens-02", name: "Rosarito", lat: 32.287, lng: -117.027, state: "Baja California", highway: "1D Tijuana-Ensenada", source: "oficial", rates: { moto: 24, auto: 49, bus: 110, c2: 110, c3: 110, c4: 132, c5: 132, c6: 152, c7: 152, c8: 152, c9: 152 } },
  { id: "tij-ens-03", name: "Ensenada", lat: 31.89, lng: -116.642, state: "Baja California", highway: "1D Tijuana-Ensenada", source: "oficial", rates: { moto: 26, auto: 53, bus: 114, c2: 110, c3: 110, c4: 136, c5: 136, c6: 160, c7: 160, c8: 160, c9: 160 } },
  { id: "taxco-01", name: "Taxco", lat: 18.526, lng: -99.628, state: "Guerrero", highway: "95D Rancho Viejo-Taxco", source: "oficial", rates: { moto: 9, auto: 19, bus: 39, c2: 37, c3: 37, c4: 62, c5: 62, c6: 77, c7: 77, c8: 77, c9: 77 } },
  { id: "rum-tec-01", name: "El Hongo", lat: 32.497, lng: -116.23, state: "Baja California", highway: "2D La Rumorosa-Tecate", source: "oficial", rates: { moto: 54, auto: 108, bus: 202, c2: 202, c3: 202, c4: 362, c5: 362, c6: 522, c7: 522, c8: 522, c9: 522 } },
  { id: "cabo-01", name: "San José del Cabo - Cabo San Lucas", lat: 23.008, lng: -109.735, state: "Baja California Sur", highway: "Los Cabos", source: "oficial", rates: { moto: 46, auto: 93, bus: 193, c2: 191, c3: 191, c4: 306, c5: 306, c6: 306, c7: 306, c8: 306, c9: 306 } },
  { id: "cabo-02", name: "Aeropuerto Los Cabos - San José del Cabo", lat: 23.156, lng: -109.718, state: "Baja California Sur", highway: "Los Cabos", source: "oficial", rates: { moto: 25, auto: 51, bus: 114, c2: 113, c3: 113, c4: 180, c5: 180, c6: 180, c7: 180, c8: 180, c9: 180 } },
  { id: "sal-vent-01", name: "Tehuantepec", lat: 16.167, lng: -95.198, state: "Oaxaca", highway: "185D Salina Cruz-La Ventosa", source: "oficial", rates: { moto: 24, auto: 49, bus: 103, c2: 99, c3: 99, c4: 143, c5: 143, c6: 179, c7: 179, c8: 179, c9: 179 } },
  { id: "sal-vent-02", name: "Ixtepec", lat: 16.567, lng: -95.085, state: "Oaxaca", highway: "185D Salina Cruz-La Ventosa", source: "oficial", rates: { moto: 50, auto: 100, bus: 196, c2: 194, c3: 194, c4: 281, c5: 281, c6: 360, c7: 360, c8: 360, c9: 360 } },
  { id: "dgo-maz-01", name: "Durango (Libramiento)", lat: 24.027, lng: -104.715, state: "Durango", highway: "40D Durango-Mazatlán", source: "oficial", rates: { moto: 42, auto: 84, bus: 176, c2: 176, c3: 176, c4: 257, c5: 257, c6: 354, c7: 354, c8: 354, c9: 354 } },
  { id: "dgo-maz-02", name: "Llano Grande", lat: 23.97, lng: -104.952, state: "Durango", highway: "40D Durango-Mazatlán", source: "oficial", rates: { moto: 63, auto: 126, bus: 262, c2: 262, c3: 262, c4: 387, c5: 387, c6: 528, c7: 528, c8: 528, c9: 528 } },
  { id: "dgo-maz-03", name: "Coscomate", lat: 23.757, lng: -105.464, state: "Durango", highway: "40D Durango-Mazatlán", source: "oficial", rates: { moto: 199, auto: 399, bus: 829, c2: 829, c3: 829, c4: 1219, c5: 1219, c6: 1670, c7: 1670, c8: 1670, c9: 1670 } },
  { id: "dgo-maz-04", name: "Mesillas", lat: 23.209, lng: -105.997, state: "Sinaloa", highway: "40D Durango-Mazatlán", source: "oficial", rates: { moto: 105, auto: 211, bus: 435, c2: 435, c3: 435, c4: 642, c5: 642, c6: 879, c7: 879, c8: 879, c9: 879 } },
  { id: "lag-slp-01", name: "Lagos de Moreno", lat: 21.744, lng: -101.447, state: "San Luis Potosí", highway: "80D Lagos de Moreno-SLP", source: "oficial", rates: { moto: 73, auto: 146, bus: 309, c2: 299, c3: 299, c4: 299, c5: 442, c6: 442, c7: 617, c8: 617, c9: 617 } },
  { id: "ozumba-01", name: "Ozumba", lat: 19.048, lng: -98.756, state: "Estado de México", highway: "Libr. Amecameca-Nepantla", source: "oficial", rates: { moto: 33, auto: 66, bus: 110, c2: 110, c3: 110, c4: 110, c5: 150, c6: 150, c7: 210, c8: 210, c9: 210 } },
  { id: "acap-lib-01", name: "Libramiento Poniente Acapulco", lat: 16.898, lng: -99.887, state: "Guerrero", highway: "Libr. Pte. Acapulco", source: "oficial", rates: { moto: 29, auto: 58, bus: 97, c2: 97, c3: 97, c4: 97, c5: 126, c6: 126, c7: 141, c8: 141, c9: 141 } },
  { id: "vhsa-lib-01", name: "Loma de Caballo", lat: 17.987, lng: -92.987, state: "Tabasco", highway: "Libr. Villahermosa", source: "oficial", rates: { moto: 38, auto: 77, bus: 176, c2: 197, c3: 197, c4: 197, c5: 230, c6: 230, c7: 230, c8: 230, c9: 230 } },
  { id: "chih-lib-01", name: "Ent. Sacramento", lat: 28.692, lng: -106.027, state: "Chihuahua", highway: "Libr. Ote. Chihuahua", source: "oficial", rates: { moto: 23, auto: 46, bus: 81, c2: 81, c3: 81, c4: 81, c5: 135, c6: 135, c7: 166, c8: 166, c9: 166 } },
  { id: "oax-vent-01", name: "Barranca Larga", lat: 16.842, lng: -96.978, state: "Oaxaca", highway: "Barranca Larga-Ventanilla", source: "oficial", rates: { moto: 122, auto: 245, bus: 490, c2: 490, c3: 490, c4: 490, c5: 734, c6: 734, c7: 1102, c8: 1102, c9: 1102 } },
  { id: "oax-vent-02", name: "Ventanilla", lat: 16.073, lng: -97.862, state: "Oaxaca", highway: "Barranca Larga-Ventanilla", source: "oficial", rates: { moto: 122, auto: 245, bus: 490, c2: 490, c3: 490, c4: 490, c5: 734, c6: 734, c7: 1102, c8: 1102, c9: 1102 } },
  { id: "cv-tamuin-01", name: "La Calera", lat: 22.092, lng: -98.954, state: "San Luis Potosí", highway: "70D Cd. Valles-Tamuín", source: "oficial", rates: { moto: 64, auto: 128, bus: 242, c2: 242, c3: 242, c4: 242, c5: 375, c6: 375, c7: 457, c8: 457, c9: 457 } },
  { id: "pte-zacatal", name: "El Zacatal", lat: 18.647, lng: -91.809, state: "Campeche", highway: "Puente Nacional El Zacatal", source: "oficial", rates: { moto: 57, auto: 114, bus: 252, c2: 251, c3: 251, c4: 251, c5: 407, c6: 407, c7: 506, c8: 506, c9: 506 } },
  { id: "pte-panuco", name: "Pánuco", lat: 22.053, lng: -98.184, state: "Veracruz/Tamaulipas", highway: "Puente Pánuco", source: "oficial", rates: { moto: 12, auto: 24, bus: 44, c2: 44, c3: 44, c4: 44, c5: 89, c6: 89, c7: 122, c8: 122, c9: 122 } },
  { id: "pte-alvarado", name: "Alvarado", lat: 18.772, lng: -95.765, state: "Veracruz", highway: "Puente Alvarado", source: "oficial", rates: { moto: 13, auto: 26, bus: 47, c2: 47, c3: 47, c4: 47, c5: 100, c6: 100, c7: 146, c8: 146, c9: 146 } },
  { id: "pte-papaloapan", name: "Papaloapan (Cosamaloapan)", lat: 18.376, lng: -95.8, state: "Veracruz", highway: "Puente Papaloapan", source: "oficial", rates: { moto: 13, auto: 26, bus: 47, c2: 47, c3: 47, c4: 47, c5: 100, c6: 100, c7: 146, c8: 146, c9: 146 } },
  { id: "pte-caracol", name: "El Caracol", lat: 16.78, lng: -93.63, state: "Chiapas", highway: "Puente El Caracol", source: "oficial", rates: { moto: 13, auto: 26, bus: 47, c2: 47, c3: 47, c4: 47, c5: 100, c6: 100, c7: 146, c8: 146, c9: 146 } },
  { id: "pte-nautla", name: "Nautla", lat: 20.213, lng: -96.779, state: "Veracruz", highway: "Puente Nautla", source: "oficial", rates: { moto: 13, auto: 26, bus: 47, c2: 47, c3: 47, c4: 47, c5: 100, c6: 100, c7: 146, c8: 146, c9: 146 } },
  { id: "pte-grijalva", name: "Grijalva", lat: 17.989, lng: -92.93, state: "Tabasco", highway: "Puente Grijalva", source: "oficial", rates: { moto: 13, auto: 26, bus: 47, c2: 47, c3: 47, c4: 47, c5: 100, c6: 100, c7: 146, c8: 146, c9: 146 } },
  { id: "pte-usumacinta", name: "Usumacinta", lat: 17.997, lng: -91.575, state: "Tabasco", highway: "Puente Usumacinta", source: "oficial", rates: { moto: 13, auto: 26, bus: 47, c2: 47, c3: 47, c4: 47, c5: 100, c6: 100, c7: 146, c8: 146, c9: 146 } },
  { id: "pte-cadereyta", name: "Cadereyta", lat: 25.589, lng: -99.999, state: "Nuevo León", highway: "Puente Cadereyta", source: "oficial", rates: { moto: 8, auto: 15, bus: 20, c2: 20, c3: 20, c4: 20, c5: 28, c6: 28, c7: 37, c8: 37, c9: 37 } },
  { id: "pte-lapiedad", name: "La Piedad", lat: 20.345, lng: -102.027, state: "Michoacán", highway: "Puente La Piedad", source: "oficial", rates: { moto: 8, auto: 15, bus: 23, c2: 23, c3: 23, c4: 23, c5: 35, c6: 35, c7: 54, c8: 54, c9: 54 } },
  { id: "pte-tecolutla", name: "Tecolutla", lat: 20.481, lng: -97.005, state: "Veracruz", highway: "Puente Tecolutla", source: "oficial", rates: { moto: 13, auto: 26, bus: 45, c2: 45, c3: 45, c4: 45, c5: 96, c6: 96, c7: 146, c8: 146, c9: 146 } },
  { id: "pte-sanjuan", name: "San Juan", lat: 18.65, lng: -95.15, state: "Veracruz", highway: "Puente San Juan", source: "oficial", rates: { moto: 9, auto: 17, bus: 33, c2: 33, c3: 33, c4: 33, c5: 53, c6: 53, c7: 75, c8: 75, c9: 75 } },
  { id: "pte-tampico", name: "Tampico (Puente)", lat: 22.255, lng: -97.865, state: "Tamaulipas", highway: "Puente Tampico", source: "oficial", rates: { moto: 18, auto: 38, bus: 82, c2: 82, c3: 82, c4: 82, c5: 151, c6: 151, c7: 210, c8: 210, c9: 210 } },
  { id: "pte-tlacotalpan", name: "Tlacotalpan", lat: 18.616, lng: -95.658, state: "Veracruz", highway: "Puente Tlacotalpan", source: "oficial", rates: { moto: 13, auto: 26, bus: 47, c2: 47, c3: 47, c4: 47, c5: 100, c6: 100, c7: 146, c8: 146, c9: 146 } },
  { id: "pte-dovali", name: "Dovalí (Lázaro Cárdenas)", lat: 17.956, lng: -102.19, state: "Michoacán", highway: "Puente Dovalí", source: "oficial", rates: { moto: 11, auto: 22, bus: 40, c2: 40, c3: 40, c4: 40, c5: 70, c6: 70, c7: 108, c8: 108, c9: 108 } },
  { id: "pte-refineria-lc", name: "Acceso Refinería Lázaro Cárdenas", lat: 17.97, lng: -102.22, state: "Michoacán", highway: "Acceso Refinería L.C.", source: "oficial", rates: { moto: 11, auto: 22, bus: 40, c2: 40, c3: 40, c4: 40, c5: 70, c6: 70, c7: 108, c8: 108, c9: 108 } },
  { id: "pte-culiacan", name: "Río Culiacán", lat: 24.79, lng: -107.4, state: "Sinaloa", highway: "Puente Culiacán", source: "oficial", rates: { moto: 13, auto: 26, bus: 47, c2: 47, c3: 47, c4: 47, c5: 100, c6: 100, c7: 146, c8: 146, c9: 146 } },
  { id: "pte-sinaloa", name: "Río Sinaloa", lat: 25.17, lng: -107.62, state: "Sinaloa", highway: "Puente Sinaloa", source: "oficial", rates: { moto: 13, auto: 26, bus: 47, c2: 47, c3: 47, c4: 47, c5: 100, c6: 100, c7: 146, c8: 146, c9: 146 } },
  { id: "pi-reynosa", name: "Puente Internacional Reynosa", lat: 26.049, lng: -98.288, state: "Tamaulipas", highway: "Pte. Internacional Reynosa-McAllen", source: "oficial", rates: { moto: 16, auto: 32, bus: 65, c2: 65, c3: 65, c4: 65, c5: 65, c6: 65, c7: 65, c8: 65, c9: 65 } },
  { id: "pi-piedras-negras", name: "Puente Internacional Piedras Negras", lat: 28.702, lng: -100.523, state: "Coahuila", highway: "Pte. Internacional Piedras Negras-Eagle Pass", source: "oficial", rates: { moto: 16, auto: 32, bus: 65, c2: 65, c3: 65, c4: 65, c5: 65, c6: 65, c7: 65, c8: 65, c9: 65 } },
  { id: "pi-acuna", name: "Puente Internacional Ciudad Acuña", lat: 29.323, lng: -100.929, state: "Coahuila", highway: "Pte. Internacional Acuña-Del Río", source: "oficial", rates: { moto: 16, auto: 32, bus: 65, c2: 65, c3: 65, c4: 65, c5: 65, c6: 65, c7: 65, c8: 65, c9: 65 } },
  { id: "pi-juarez-lincoln", name: "Puente Juárez-Lincoln (Nuevo Laredo)", lat: 27.496, lng: -99.507, state: "Tamaulipas", highway: "Pte. Juárez-Lincoln Nuevo Laredo", source: "oficial", rates: { moto: 16, auto: 32, bus: 70, c2: 70, c3: 70, c4: 140, c5: 140, c6: 233, c7: 233, c8: 233, c9: 233 } },
  { id: "pi-matamoros", name: "Puente Internacional Matamoros", lat: 25.878, lng: -97.498, state: "Tamaulipas", highway: "Pte. Internacional Matamoros-Brownsville", source: "oficial", rates: { moto: 16, auto: 32, bus: 65, c2: 65, c3: 65, c4: 65, c5: 65, c6: 65, c7: 65, c8: 65, c9: 65 } },
  { id: "pi-ojinaga", name: "Puente Internacional Ojinaga", lat: 29.565, lng: -104.408, state: "Chihuahua", highway: "Pte. Internacional Ojinaga-Presidio", source: "oficial", rates: { moto: 15, auto: 30, bus: 58, c2: 58, c3: 58, c4: 58, c5: 58, c6: 58, c7: 58, c8: 58, c9: 58 } },
  { id: "pi-suchiate", name: "Suchiate II (Ing. Luis Cabrera)", lat: 14.535, lng: -92.198, state: "Chiapas", highway: "Pte. Internacional Suchiate II", source: "oficial", rates: { moto: 10, auto: 20, bus: 35, c2: 35, c3: 35, c4: 68, c5: 68, c6: 97, c7: 97, c8: 97, c9: 97 } },
  { id: "chapalilla-01", name: "Compostela", lat: 21.238, lng: -104.902, state: "Nayarit", highway: "Chapalilla-Compostela", source: "oficial", rates: { moto: 20, auto: 41, bus: 81, c2: 81, c3: 81, c4: 156, c5: 156, c6: 216, c7: 216, c8: 216, c9: 216 } },
  { id: "zacatecas-01", name: "Zacatecas (Ent. Cuauhtémoc-Osiris)", lat: 22.728, lng: -102.545, state: "Zacatecas", highway: "Ent. Cuauhtémoc-Osiris", source: "oficial", rates: { moto: 23, auto: 44, bus: 64, c2: 64, c3: 64, c4: 89, c5: 89, c6: 115, c7: 115, c8: 115, c9: 115 } },
  { id: "mer-can-01", name: "Kantunil", lat: 20.824, lng: -89.054, state: "Yucatán", highway: "180D Mérida-Cancún (concesión privada)", source: "privado", rates: { moto: 124, auto: 248, bus: null, c2: null, c3: null, c4: null, c5: null, c6: null, c7: null, c8: null, c9: null } },
  { id: "mer-can-02", name: "Nuevo Xcan", lat: 20.623, lng: -87.499, state: "Quintana Roo", highway: "180D Mérida-Cancún (concesión privada)", source: "privado", rates: { moto: 214, auto: 427, bus: null, c2: null, c3: null, c4: null, c5: null, c6: null, c7: null, c8: null, c9: null } },
  { id: "slp-01", name: "San Luis Potosí (Libramiento)", lat: 22.098, lng: -100.892, state: "San Luis Potosí", highway: "57D SLP-Saltillo", source: "estimado", rates: { moto: 40, auto: 80, bus: 140, c2: 140, c3: 140, c4: 150, c5: 150, c6: 180, c7: 180, c8: 180, c9: 180 } },
  { id: "mat-01", name: "Matehuala (Libramiento)", lat: 23.65, lng: -100.65, state: "San Luis Potosí", highway: "57D SLP-Saltillo", source: "estimado", rates: { moto: 44, auto: 88, bus: 160, c2: 160, c3: 160, c4: 170, c5: 170, c6: 200, c7: 200, c8: 200, c9: 200 } },
  { id: "dr-arroyo-01", name: "Dr. Arroyo", lat: 23.85, lng: -100.17, state: "Nuevo León", highway: "57D SLP-Saltillo", source: "estimado", rates: { moto: 38, auto: 75, bus: 135, c2: 135, c3: 135, c4: 145, c5: 145, c6: 170, c7: 170, c8: 170, c9: 170 } },
  { id: "cams-01", name: "Periférico (Saltillo-Monterrey)", lat: 25.52, lng: -100.66, state: "Coahuila", highway: "40D Saltillo-Monterrey (CAMS)", source: "estimado", rates: { moto: 22, auto: 45, bus: 107, c2: 116, c3: 116, c4: 116, c5: 210, c6: 210, c7: 220, c8: 220, c9: 220 } },
  { id: "cams-02", name: "Ojo Caliente 2 (Saltillo-Monterrey)", lat: 25.597, lng: -100.427, state: "Nuevo León", highway: "40D Saltillo-Monterrey (CAMS)", source: "estimado", rates: { moto: 49, auto: 98, bus: 162, c2: 178, c3: 178, c4: 178, c5: 322, c6: 322, c7: 335, c8: 335, c9: 335 } },
  { id: "mty-norte-01", name: "Monterrey Norte", lat: 25.85, lng: -100.19, state: "Nuevo León", highway: "85D Monterrey-Nuevo Laredo", source: "estimado", rates: { moto: 76, auto: 152, bus: 265, c2: 265, c3: 265, c4: 280, c5: 280, c6: 310, c7: 310, c8: 310, c9: 310 } },
  { id: "cienega-flores-01", name: "Ciénega de Flores", lat: 25.96, lng: -100.15, state: "Nuevo León", highway: "85D Monterrey-Nuevo Laredo", source: "estimado", rates: { moto: 15, auto: 29, bus: 55, c2: 55, c3: 55, c4: 60, c5: 60, c6: 70, c7: 70, c8: 70, c9: 70 } },

  // ------------------------------------------------------------
  // CORREDORES AGREGADOS (jun/2026) — faltaban del catálogo original.
  // Verificadas con fuentes de prensa especializadas en tarifas CAPUFE
  // 2026 (tarifascapufe.com.mx, La Jornada Hidalgo, La Silla Rota).
  // Las marcadas "estimado" tienen el total del tramo confirmado por
  // prensa, pero la tarifa EXACTA por caseta individual (al repartir
  // el total entre varias plazas del mismo corredor) es una
  // aproximación proporcional; conviene confirmarla en ruta.
  // ------------------------------------------------------------

  // Arco Norte (López Portillo) — bypass clave para ir de Querétaro/
  // Bajío hacia Puebla/Veracruz/Golfo sin cruzar la Ciudad de México.
  { id: "arconorte-01", name: "Jilotepec (Arco Norte)", lat: 19.953, lng: -99.54, state: "Estado de México", highway: "Arco Norte", source: "estimado", rates: { moto: 18, auto: 36, bus: 65, c2: 65, c3: 65, c4: 100, c5: 100, c6: 140, c7: 140, c8: 140, c9: 140 } },
  { id: "arconorte-02", name: "Tula (Arco Norte)", lat: 20.06, lng: -99.27, state: "Hidalgo", highway: "Arco Norte", source: "estimado", rates: { moto: 20, auto: 40, bus: 72, c2: 72, c3: 72, c4: 110, c5: 110, c6: 154, c7: 154, c8: 154, c9: 154 } },
  { id: "arconorte-03", name: "Cd. Sahagún (Arco Norte)", lat: 19.96, lng: -98.57, state: "Hidalgo", highway: "Arco Norte", source: "estimado", rates: { moto: 22, auto: 44, bus: 80, c2: 80, c3: 80, c4: 122, c5: 122, c6: 171, c7: 171, c8: 171, c9: 171 } },
  { id: "arconorte-04", name: "Calpulalpan (Arco Norte)", lat: 19.59, lng: -98.57, state: "Tlaxcala", highway: "Arco Norte", source: "estimado", rates: { moto: 20, auto: 40, bus: 73, c2: 73, c3: 73, c4: 111, c5: 111, c6: 155, c7: 155, c8: 155, c9: 155 } },
  { id: "arconorte-05", name: "Martín Texmelucan (ent. Méx-Puebla, Arco Norte)", lat: 19.29, lng: -98.42, state: "Puebla", highway: "Arco Norte", source: "estimado", rates: { moto: 14, auto: 28, bus: 51, c2: 51, c3: 51, c4: 78, c5: 78, c6: 109, c7: 109, c8: 109, c9: 109 } },

  // México-Pachuca (vía libre de cuota Ojo de Agua-Ecatepec; corredor de acceso norte)
  { id: "mex-pac-01", name: "Ojo de Agua (México-Pachuca)", lat: 19.63, lng: -99.0, state: "Estado de México", highway: "México-Pachuca", source: "oficial", rates: { moto: 34, auto: 69, bus: 137, c2: 137, c3: 137, c4: 280, c5: 280, c6: 418, c7: 418, c8: 418, c9: 418 } },

  // México-Toluca (Siglo XXI / La Marquesa) — corredor hacia el Poniente, Toluca, Morelia
  { id: "mex-tol-01", name: "La Marquesa (México-Toluca)", lat: 19.32, lng: -99.42, state: "Estado de México", highway: "15D México-Toluca", source: "oficial", rates: { moto: 58, auto: 116, bus: 210, c2: 200, c3: 200, c4: 380, c5: 380, c6: 520, c7: 520, c8: 520, c9: 520 } },

  // 15D México-Guadalajara (vía Atlacomulco-Maravatío-Zapotlanejo) — ruta clásica al Bajío/Jalisco sin pasar por Querétaro
  { id: "atlacomulco-01", name: "Atlacomulco", lat: 19.8, lng: -99.88, state: "Estado de México", highway: "15D México-Atlacomulco", source: "estimado", rates: { moto: 45, auto: 90, bus: 170, c2: 165, c3: 165, c4: 320, c5: 320, c6: 440, c7: 440, c8: 440, c9: 440 } },
  { id: "maravatio-01", name: "Maravatío", lat: 19.89, lng: -100.44, state: "Michoacán", highway: "15D Atlacomulco-Maravatío", source: "estimado", rates: { moto: 40, auto: 80, bus: 150, c2: 145, c3: 145, c4: 280, c5: 280, c6: 390, c7: 390, c8: 390, c9: 390 } },
  { id: "zapotlanejo-01", name: "Zapotlanejo", lat: 20.62, lng: -103.07, state: "Jalisco", highway: "15D Zapotlanejo (acceso Guadalajara)", source: "estimado", rates: { moto: 28, auto: 56, bus: 105, c2: 100, c3: 100, c4: 190, c5: 190, c6: 265, c7: 265, c8: 265, c9: 265 } },

  // Guadalajara-Colima-Manzanillo (Autopista Siglo XXI)
  { id: "tonila-01", name: "Tonila (Autopista Siglo XXI)", lat: 19.55, lng: -103.55, state: "Jalisco", highway: "54D Guadalajara-Colima", source: "estimado", rates: { moto: 60, auto: 120, bus: 225, c2: 215, c3: 215, c4: 410, c5: 410, c6: 560, c7: 560, c8: 560, c9: 560 } },
  { id: "colima-01", name: "Colima (Siglo XXI)", lat: 19.18, lng: -103.85, state: "Colima", highway: "54D Colima-Manzanillo", source: "estimado", rates: { moto: 35, auto: 70, bus: 130, c2: 125, c3: 125, c4: 240, c5: 240, c6: 330, c7: 330, c8: 330, c9: 330 } },

  // Amozoc-Perote (Puebla-Veracruz vía Xalapa, alterna a la 150D)
  { id: "amozoc-perote-01", name: "Perote", lat: 19.56, lng: -97.24, state: "Veracruz", highway: "140D Amozoc-Perote", source: "estimado", rates: { moto: 45, auto: 90, bus: 165, c2: 160, c3: 160, c4: 300, c5: 300, c6: 410, c7: 410, c8: 410, c9: 410 } },
];

// Devuelve la tarifa exacta en MXN para una caseta según el tipo de
// vehículo y, si aplica, su subclase de ejes. Si la caseta no publica
// esa clase específica, usa el factor de respaldo sobre la tarifa de auto.
function getTollRate(toll, vehicleType, subClass) {
  const r = toll.rates;
  if (vehicleType === 'moto') {
    return r.moto != null ? r.moto : Math.round(r.auto * VEHICLE_FACTORS.moto.tolls);
  }
  if (vehicleType === 'camion' && subClass) {
    const key = subClass.kind === 'bus' ? 'bus' : ('c' + subClass.axles);
    if (r[key] != null) return r[key];
    // Si la caseta no tiene tarifa específica, usar factor de respaldo
    // (usa factor de tolls, no de fuel)
    const fallbackFactor = subClass.kind === 'bus'
      ? VEHICLE_FACTORS.camion.tolls
      : VEHICLE_FACTORS.camion.tolls;
    return Math.round(r.auto * fallbackFactor);
  }
  if (vehicleType === 'camion') {
    return r.c2 != null ? r.c2 : Math.round(r.auto * VEHICLE_FACTORS.camion.tolls);
  }
  // auto / taxi
  return r.auto;
}
// ============================================================
// ZONAS ROJAS — Basadas en datos SESNSP / incidencia delictiva 2024
// ============================================================
const RISK_ZONES = [
  { id: 'r01', name: 'Colima - Alta violencia', lat: 19.2437, lng: -103.7241, radius: 18, level: 'extreme', description: 'Municipios de Colima y Villa de Álvarez. Zona con máxima incidencia de homicidios (SESNSP 2024).' },
  { id: 'r02', name: 'Manzanillo - Costa', lat: 19.1016, lng: -104.3318, radius: 12, level: 'high', description: 'Zona portuaria con actividad criminal activa.' },
  { id: 'r03', name: 'Chilpancingo - Guerrero', lat: 17.5500, lng: -99.5000, radius: 25, level: 'extreme', description: 'Guerrero: estado con mayor número de homicidios. Chilpancingo y región sierra.' },
  { id: 'r04', name: 'Acapulco', lat: 16.8634, lng: -99.8809, radius: 20, level: 'extreme', description: 'Acapulco en primeros lugares de homicidios dolosos en México.' },
  { id: 'r05', name: 'Iguala - Guerrero', lat: 18.3454, lng: -99.5393, radius: 15, level: 'high', description: 'Zona de alta incidencia delictiva y violencia.' },
  { id: 'r06', name: 'Uruapan - Michoacán', lat: 19.4196, lng: -102.0574, radius: 20, level: 'extreme', description: 'Una de las ciudades más violentas. Fuerte presencia de crimen organizado.' },
  { id: 'r07', name: 'Zamora - Michoacán', lat: 19.9867, lng: -102.2833, radius: 15, level: 'high', description: 'Altos índices de homicidio y extorsión.' },
  { id: 'r08', name: 'Apatzingán', lat: 19.0865, lng: -102.3519, radius: 12, level: 'extreme', description: 'Tierra Caliente Michoacán — zona de alto riesgo.' },
  { id: 'r09', name: 'Tijuana - BC', lat: 32.5149, lng: -117.0382, radius: 22, level: 'high', description: 'Tijuana registra miles de homicidios. Mayor violencia en zonas periféricas.' },
  { id: 'r10', name: 'Ensenada - BC', lat: 31.8667, lng: -116.5966, radius: 12, level: 'medium', description: 'Incidencia media-alta de delitos.' },
  { id: 'r11', name: 'Celaya - Guanajuato', lat: 20.5234, lng: -100.8154, radius: 18, level: 'extreme', description: 'Guanajuato lidera robos con violencia y homicidios. Celaya zona crítica.' },
  { id: 'r12', name: 'Salamanca - Guanajuato', lat: 20.5731, lng: -101.1935, radius: 12, level: 'high', description: 'Alta presencia criminal — huachicoleros y crimen organizado.' },
  { id: 'r13', name: 'León - Guanajuato', lat: 21.1244, lng: -101.6863, radius: 15, level: 'medium', description: 'Índice de robos y extorsiones elevado.' },
  { id: 'r14', name: 'Tlaquepaque - Jalisco', lat: 20.6424, lng: -103.3108, radius: 14, level: 'high', description: 'Municipio con alta incidencia delictiva en área metropolitana Guadalajara.' },
  { id: 'r15', name: 'Tonalá - Jalisco', lat: 20.6236, lng: -103.2347, radius: 10, level: 'medium', description: 'Robo a transeúnte y a negocio frecuente.' },
  { id: 'r16', name: 'Coatzacoalcos - Ver.', lat: 18.1500, lng: -94.4500, radius: 14, level: 'high', description: 'Alta incidencia de homicidios y extorsión en zona industrial.' },
  { id: 'r17', name: 'Xalapa - Veracruz', lat: 19.5438, lng: -96.9269, radius: 10, level: 'medium', description: 'Robos con violencia — zona periurbana.' },
  { id: 'r18', name: 'Juárez - Chihuahua', lat: 31.6904, lng: -106.4245, radius: 20, level: 'high', description: 'Ciudad Juárez con alta incidencia de violencia y tráfico.' },
  { id: 'r19', name: 'Chihuahua ciudad', lat: 28.6353, lng: -106.0889, radius: 14, level: 'medium', description: 'Incidencia media de delitos del fuero común.' },
  { id: 'r20', name: 'Reynosa - Tamaulipas', lat: 26.0797, lng: -98.2954, radius: 16, level: 'extreme', description: 'Tamaulipas con alertas de viaje de nivel 4 (USA). Crimen organizado activo.' },
  { id: 'r21', name: 'Matamoros - Tamaulipas', lat: 25.8693, lng: -97.5036, radius: 12, level: 'extreme', description: 'Zona fronteriza con alta peligrosidad.' },
  { id: 'r22', name: 'Nuevo Laredo', lat: 27.4767, lng: -99.5167, radius: 12, level: 'high', description: 'Ciudad fronteriza — actividad del crimen organizado.' },
  { id: 'r23', name: 'Ecatepec - Edomex', lat: 19.6010, lng: -99.0503, radius: 16, level: 'high', description: 'Ecatepec: mayor incidencia de robos en la ZMC México.' },
  { id: 'r24', name: 'Valle de Chalco', lat: 19.2943, lng: -98.9544, radius: 12, level: 'high', description: 'Alto índice de asalto a transporte público y robo a transeúnte.' },
  { id: 'r25', name: 'Naucalpan - Edomex', lat: 19.4742, lng: -99.2372, radius: 10, level: 'medium', description: 'Robos en carretera y asaltos frecuentes.' },
  { id: 'r26', name: 'Iztapalapa - CDMX', lat: 19.3574, lng: -99.0573, radius: 12, level: 'medium', description: 'Alta tasa de robos en zona comercial.' },
  { id: 'r27', name: 'Tepito - CDMX', lat: 19.4476, lng: -99.1333, radius: 4, level: 'high', description: 'Zona de alto riesgo — Barrio Bravo.' },
  { id: 'r28', name: 'Culiacán - Sinaloa', lat: 24.8091, lng: -107.3940, radius: 18, level: 'high', description: 'Culiacán con altos índices de homicidio.' },
  { id: 'r29', name: 'Mazatlán - Sinaloa', lat: 23.2494, lng: -106.4111, radius: 10, level: 'medium', description: 'Zona turística con incidencia media.' },
  { id: 'r30', name: 'Zacatecas ciudad', lat: 22.7709, lng: -102.5832, radius: 15, level: 'extreme', description: 'Zacatecas escaló al primer lugar en homicidios per cápita en 2023.' },
  { id: 'r31', name: 'Fresnillo - Zacatecas', lat: 23.1716, lng: -102.8706, radius: 12, level: 'extreme', description: 'Fresnillo figura entre los municipios más peligrosos de México.' },
];

// ============================================================
// CIUDADES MEXICANAS para autocompletado (backup offline)
// ============================================================
const MX_CITIES = [
  { name: 'Ciudad de México', state: 'CDMX', lat: 19.4326, lng: -99.1332, country: 'MX' },
  { name: 'Guadalajara', state: 'Jalisco', lat: 20.6597, lng: -103.3496, country: 'MX' },
  { name: 'Monterrey', state: 'Nuevo León', lat: 25.6866, lng: -100.3161, country: 'MX' },
  { name: 'Puebla', state: 'Puebla', lat: 19.0414, lng: -98.2063, country: 'MX' },
  { name: 'Tijuana', state: 'Baja California', lat: 32.5149, lng: -117.0382, country: 'MX' },
  { name: 'León', state: 'Guanajuato', lat: 21.1244, lng: -101.6863, country: 'MX' },
  { name: 'Juárez', state: 'Chihuahua', lat: 31.6904, lng: -106.4245, country: 'MX' },
  { name: 'Mérida', state: 'Yucatán', lat: 20.9674, lng: -89.5926, country: 'MX' },
  { name: 'San Luis Potosí', state: 'San Luis Potosí', lat: 22.1565, lng: -100.9855, country: 'MX' },
  { name: 'Aguascalientes', state: 'Aguascalientes', lat: 21.8853, lng: -102.2916, country: 'MX' },
  { name: 'Hermosillo', state: 'Sonora', lat: 29.0729, lng: -110.9559, country: 'MX' },
  { name: 'Saltillo', state: 'Coahuila', lat: 25.4232, lng: -100.9896, country: 'MX' },
  { name: 'Mexicali', state: 'Baja California', lat: 32.6245, lng: -115.4523, country: 'MX' },
  { name: 'Culiacán', state: 'Sinaloa', lat: 24.8091, lng: -107.3940, country: 'MX' },
  { name: 'Acapulco', state: 'Guerrero', lat: 16.8634, lng: -99.8809, country: 'MX' },
  { name: 'Tepic', state: 'Nayarit', lat: 21.5042, lng: -104.8953, country: 'MX' },
  { name: 'Chihuahua', state: 'Chihuahua', lat: 28.6353, lng: -106.0889, country: 'MX' },
  { name: 'Morelia', state: 'Michoacán', lat: 19.7060, lng: -101.1950, country: 'MX' },
  { name: 'Querétaro', state: 'Querétaro', lat: 20.5888, lng: -100.3878, country: 'MX' },
  { name: 'Veracruz', state: 'Veracruz', lat: 19.1814, lng: -96.1429, country: 'MX' },
  { name: 'Cancún', state: 'Quintana Roo', lat: 21.1743, lng: -86.8466, country: 'MX' },
  { name: 'Toluca', state: 'Estado de México', lat: 19.2926, lng: -99.6573, country: 'MX' },
  { name: 'Torreón', state: 'Coahuila', lat: 25.5428, lng: -103.4068, country: 'MX' },
  { name: 'Durango', state: 'Durango', lat: 24.0277, lng: -104.6532, country: 'MX' },
  { name: 'Oaxaca', state: 'Oaxaca', lat: 17.0732, lng: -96.7266, country: 'MX' },
  { name: 'Zacatecas', state: 'Zacatecas', lat: 22.7709, lng: -102.5832, country: 'MX' },
  { name: 'Colima', state: 'Colima', lat: 19.2437, lng: -103.7241, country: 'MX' },
  { name: 'Manzanillo', state: 'Colima', lat: 19.0535, lng: -104.3319, country: 'MX' },
  { name: 'La Paz', state: 'Baja California Sur', lat: 24.1426, lng: -110.3128, country: 'MX' },
  { name: 'Villahermosa', state: 'Tabasco', lat: 17.9892, lng: -92.9475, country: 'MX' },
  { name: 'Tuxtla Gutiérrez', state: 'Chiapas', lat: 16.7516, lng: -93.1152, country: 'MX' },
  { name: 'Playa del Carmen', state: 'Quintana Roo', lat: 20.6296, lng: -87.0739, country: 'MX' },
  { name: 'Mazatlán', state: 'Sinaloa', lat: 23.2494, lng: -106.4111, country: 'MX' },
  { name: 'Puerto Vallarta', state: 'Jalisco', lat: 20.6534, lng: -105.2253, country: 'MX' },
  { name: 'Tultepec', state: 'Estado de México', lat: 19.6916, lng: -99.1280, country: 'MX' },
  { name: 'Pachuca', state: 'Hidalgo', lat: 20.1011, lng: -98.7591, country: 'MX' },
  { name: 'Reynosa', state: 'Tamaulipas', lat: 26.0797, lng: -98.2954, country: 'MX' },
  { name: 'Matamoros', state: 'Tamaulipas', lat: 25.8693, lng: -97.5036, country: 'MX' },
  { name: 'Nuevo Laredo', state: 'Tamaulipas', lat: 27.4767, lng: -99.5167, country: 'MX' },
  { name: 'Tampico', state: 'Tamaulipas', lat: 22.2475, lng: -97.8567, country: 'MX' },
  { name: 'Apatzingán', state: 'Michoacán', lat: 19.0865, lng: -102.3519, country: 'MX' },
  { name: 'Uruapan', state: 'Michoacán', lat: 19.4196, lng: -102.0574, country: 'MX' },
  { name: 'Zamora', state: 'Michoacán', lat: 19.9867, lng: -102.2833, country: 'MX' },
  { name: 'Chilpancingo', state: 'Guerrero', lat: 17.5500, lng: -99.5000, country: 'MX' },
];

// ============================================================
// CORREDORES PRINCIPALES — jun/2026
//
// PROBLEMA QUE RESUELVE: Valhalla optimiza por tiempo/costo y a veces
// elige variantes locales reales (p. ej. el libramiento libre de San
// Juan del Río que evita Palmillas, o accesos que rodean Tepotzotlán)
// aunque use_tolls=1.0 y use_highways=1.0. Esas variantes SÍ existen
// en la vida real, pero NO son "la ruta principal/más conocida" que
// la mayoría de la gente reconoce y usa (la autopista de cuota
// troncal). Para garantizar que la ruta principal pase siempre por
// las casetas icónicas de cada corredor, definimos aquí, por región
// de origen/destino, los IDs de TOLL_BOOTHS que se fuerzan como
// puntos "through" en la llamada a Valhalla (ver app.js,
// getForcedViaPoints()).
//
// Cada corredor define dos cajas (boundingBox) — una por cada extremo
// del corredor — y la lista de casetas (en orden de recorrido) que se
// fuerzan SOLO si origen y destino caen en cajas opuestas (no importa
// el sentido del viaje).
// ============================================================
function bbox(minLat, maxLat, minLng, maxLng) { return { minLat, maxLat, minLng, maxLng }; }
function inBBox(pt, b) { return pt.lat >= b.minLat && pt.lat <= b.maxLat && pt.lng >= b.minLng && pt.lng <= b.maxLng; }

const MAIN_CORRIDORS = [
  { // CDMX/Edomex (sur) <-> Querétaro/Bajío/San Juan del Río — 57D
    name: 'México-Querétaro (57D)',
    boxA: bbox(19.0, 19.9, -99.45, -98.85), // CDMX/Edomex sur-centro
    boxB: bbox(19.9, 21.6, -101.6, -99.55), // Querétaro, San Juan del Río, Bajío
    viaIds: ['mex-qro-01', 'mex-qro-03'], // Tepotzotlán, Palmillas
  },
  { // CDMX <-> Puebla/Veracruz — 150D
    name: 'México-Puebla-Veracruz (150D)',
    boxA: bbox(19.1, 19.7, -99.3, -98.85),
    boxB: bbox(18.7, 19.6, -98.6, -95.9),
    viaIds: ['mex-pue-02', 'mex-pue-03', 'mex-pue-04'], // Ixtapaluca, San Marcos, Texmelucan
  },
  { // CDMX <-> Cuernavaca/Acapulco — 95D
    name: 'México-Cuernavaca-Acapulco (95D)',
    boxA: bbox(19.15, 19.6, -99.3, -99.0),
    boxB: bbox(16.7, 19.1, -99.95, -98.9),
    viaIds: ['cua-aca-01'], // Tlalpan
  },
  { // CDMX <-> Toluca/Morelia/Guadalajara directa — 15D
    name: 'México-Toluca-Maravatío-Guadalajara (15D)',
    boxA: bbox(19.15, 19.6, -99.35, -99.0),
    boxB: bbox(19.6, 21.0, -103.6, -99.7),
    viaIds: ['mex-tol-01', 'atlacomulco-01', 'maravatio-01'], // La Marquesa, Atlacomulco, Maravatío
  },
  { // CDMX <-> Pachuca
    name: 'México-Pachuca',
    boxA: bbox(19.2, 19.7, -99.2, -98.95),
    boxB: bbox(19.9, 20.3, -98.85, -98.5),
    viaIds: ['mex-pac-01'], // Ojo de Agua
  },
  { // Querétaro/Bajío <-> Monterrey — 57D + 40D
    name: 'Querétaro-Saltillo-Monterrey (57D/40D)',
    boxA: bbox(19.9, 22.5, -101.0, -99.5),
    boxB: bbox(25.0, 26.2, -100.6, -99.9),
    viaIds: ['mex-qro-03', 'carb-pm-01', 'carb-pm-02', 'tor-salt-01', 'tor-salt-02', 'cams-01', 'cams-02'],
  },
  { // CDMX <-> Guadalajara vía Bajío (Querétaro-Irapuato-La Piedad)
    name: 'Querétaro-Irapuato-La Piedad-Guadalajara',
    boxA: bbox(20.4, 21.0, -100.6, -99.9),
    boxB: bbox(19.6, 20.8, -103.6, -101.9),
    viaIds: ['qro-irap-01', 'qro-irap-03', 'pte-lapiedad'],
  },
  { // Guadalajara <-> Colima/Manzanillo — 54D Siglo XXI
    name: 'Guadalajara-Colima-Manzanillo (54D)',
    boxA: bbox(20.3, 20.9, -103.6, -103.1),
    boxB: bbox(18.9, 19.6, -104.4, -103.3),
    viaIds: ['tonila-01', 'colima-01'],
  },
];

// Devuelve, si origen y destino encajan en un corredor conocido (en
// cualquier sentido), la lista de objetos {lat,lng} de las casetas que
// deben forzarse como vía en la ruta principal. Si no hay corredor que
// matchee, regresa [] y la ruta se deja completamente libre (Valhalla).
function getForcedViaPoints(origin, dest) {
  for (const c of MAIN_CORRIDORS) {
    const direct = inBBox(origin, c.boxA) && inBBox(dest, c.boxB);
    const reverse = inBBox(origin, c.boxB) && inBBox(dest, c.boxA);
    if (direct || reverse) {
      const ids = reverse ? [...c.viaIds].reverse() : c.viaIds;
      const points = ids
        .map(id => TOLL_BOOTHS.find(t => t.id === id))
        .filter(Boolean)
        .map(t => ({ lat: t.lat, lng: t.lng }));
      if (points.length) return points;
    }
  }
  return [];
}

// ============================================================
// ZONAS HORARIAS MÉXICO
// ============================================================
const MX_TIMEZONES = [
  { zone: 'America/Mexico_City', label: 'Centro (UTC-6)', states: ['CDMX', 'Estado de México', 'Jalisco', 'Nuevo León', 'Puebla', 'Veracruz', 'Hidalgo', 'Guanajuato', 'Oaxaca', 'Querétaro', 'San Luis Potosí', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Guerrero', 'Morelos', 'Aguascalientes', 'Colima', 'Michoacán', 'Nayarit', 'Durango', 'Zacatecas', 'Chiapas', 'Campeche', 'Yucatán', 'Chihuahua'] },
  { zone: 'America/Hermosillo', label: 'Pacífico (UTC-7)', states: ['Sonora'] },
  { zone: 'America/Tijuana', label: 'Pacífico Norte (UTC-8)', states: ['Baja California'] },
  { zone: 'America/La_Paz', label: 'Montaña (UTC-7)', states: ['Baja California Sur', 'Sinaloa'] },
  { zone: 'America/Cancun', label: 'Sureste (UTC-6 fijo)', states: ['Quintana Roo'] },
];

function getTimezoneForState(state) {
  for (const tz of MX_TIMEZONES) {
    if (tz.states.includes(state)) return tz;
  }
  return MX_TIMEZONES[0];
}

// ============================================================
// DETECCIÓN DE PAÍS según coordenadas (bounding boxes)
// ============================================================
function detectCountry(lat, lng) {
  if (lat >= 14.5 && lat <= 32.7 && lng >= -117.1 && lng <= -86.7) return 'MX';
  if (lat >= 24.4 && lat <= 49.4 && lng >= -125.0 && lng <= -66.9) return 'US';
  if (lat >= 35.9 && lat <= 43.8 && lng >= -9.3 && lng <= 4.3) return 'ES';
  if (lat >= 41.3 && lat <= 51.1 && lng >= -5.1 && lng <= 9.6) return 'FR';
  if (lat >= 47.3 && lat <= 55.1 && lng >= 6.0 && lng <= 15.0) return 'DE';
  if (lat >= -55.0 && lat <= -21.8 && lng >= -73.6 && lng <= -34.0) return 'BR';
  if (lat >= -55.0 && lat <= -21.8 && lng >= -73.6 && lng <= -53.7) return 'AR';
  if (lat >= -4.2 && lat <= 12.5 && lng >= -77.0 && lng <= -66.9) return 'CO';
  return 'DEFAULT';
}

function getFuelForRoute(originLat, originLng, destLat, destLng) {
  const c1 = detectCountry(originLat, originLng);
  const c2 = detectCountry(destLat, destLng);
  // Usar el país de origen si ambos son distintos
  const country = (c1 === c2) ? c1 : c1;
  return FUEL_BY_COUNTRY[country] || FUEL_BY_COUNTRY.DEFAULT;
}
