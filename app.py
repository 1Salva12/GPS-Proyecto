from datetime import datetime, timedelta

import pytz
from flask import Flask, jsonify, render_template, request

from config import GOOGLE_API_KEY, PRECIO_DIESEL, PRECIO_GASOLINA
from google_service import buscar_gasolineras_ruta, geocodificar, obtener_rutas_google
from route_utils import (
    decode_polyline,
    ruta_intersecta_zona,
    sanitizar_coordenadas_ruta,
    validar_geometria_ruta,
)

app = Flask(__name__)

# ─────────────────────────────────────────────
#  RENDIMIENTO POR VEHÍCULO (km / litro)
# ─────────────────────────────────────────────
RENDIMIENTO_VEHICULO = {
    "12":  12,   # Auto
    "8":    8,   # Camioneta
    "25":  25,   # Moto
    "4":    4,   # Camión
}
FACTOR_EVITACION_CASETAS = 18.0
# ─────────────────────────────────────────────
#  ZONAS HORARIAS POR ESTADO (México)
# ─────────────────────────────────────────────
ZONAS_HORARIAS_MX = {
    "sonora":           "America/Hermosillo",
    "baja california":  "America/Tijuana",
    "baja california sur": "America/Mazatlan",
    "sinaloa":          "America/Mazatlan",
    "nayarit":          "America/Mazatlan",
    "chihuahua":        "America/Chihuahua",
    "default":          "America/Mexico_City",
}

def obtener_zona_horaria(lugar: str) -> str:
    lugar_lower = lugar.lower()
    for estado, tz in ZONAS_HORARIAS_MX.items():
        if estado in lugar_lower:
            return tz
    return ZONAS_HORARIAS_MX["default"]


def calcular_hora_llegada(
    hora_salida_str: str,
    duracion_seg: int,
    tz_origen: str,
    tz_destino: str,
) -> dict:
    """Calcula la hora de llegada ajustada a la zona horaria del destino."""
    try:
        tz_orig = pytz.timezone(tz_origen)
        tz_dest = pytz.timezone(tz_destino)
        ahora = datetime.now(tz_orig)
        hh, mm = map(int, hora_salida_str.split(":"))
        salida_local = ahora.replace(hour=hh, minute=mm, second=0, microsecond=0)
        llegada_local = salida_local + timedelta(seconds=duracion_seg)
        llegada_destino = llegada_local.astimezone(tz_dest)
        diferencia_horas = int(
            (llegada_destino.utcoffset() - salida_local.utcoffset()).total_seconds() / 3600
        )
        return {
            "hora_llegada": llegada_destino.strftime("%H:%M"),
            "fecha_llegada": llegada_destino.strftime("%d/%m/%Y"),
            "zona_horaria_destino": tz_destino,
            "diferencia_horas": diferencia_horas,
        }
    except Exception:
        return {}


def _formatear_duracion(duracion_seg: int) -> str:
    duracion_min = round(duracion_seg / 60)
    if duracion_min >= 60:
        horas = duracion_min // 60
        minutos = duracion_min % 60
        return f"{horas}h {minutos}min" if minutos else f"{horas}h"
    return f"{duracion_min} min"


def _seleccionar_ruta_valida(candidatas, zonas_a_usar):
    mejor = None
    mejor_score = None

    for idx, ruta in enumerate(candidatas):
        puntos = decode_polyline(ruta.get("polyline_points", ""))
        puntos = sanitizar_coordenadas_ruta(puntos)
        if len(puntos) < 2:
            continue

        geometria_ok, _ = validar_geometria_ruta(puntos, [])
        if not geometria_ok:
            continue

        zonas_intersectadas = 0
        if zonas_a_usar:
            for zona in zonas_a_usar:
                if ruta_intersecta_zona(puntos, zona):
                    zonas_intersectadas += 1

        distancia_m = float(ruta.get("distancia_m", 0))
        duracion_s = float(ruta.get("duracion_s", 0))
        costo_casetas = float(ruta.get("costo_casetas", 0))

        # Regla fuerte para fronteras: si una ruta toca la zona marcada,
        # se considera peor aunque sea más corta. Solo se usa si no existe alternativa.
        score = (
            0 if zonas_intersectadas == 0 else 1,
            zonas_intersectadas,
            distancia_m + costo_casetas * 120,
            duracion_s,
        )
        if mejor_score is None or score < mejor_score:
            mejor_score = score
            mejor = (ruta, puntos, idx)

    return mejor if mejor is not None else (None, None, None)

@app.route("/")
def index():
    return render_template("index.html", google_api_key=GOOGLE_API_KEY)

@app.route("/calcular_ruta", methods=["POST"])
def calcular_ruta():
    # ── 1. Leer y validar JSON ──────────────────
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "JSON inválido o vacío"}), 400

    origen_raw  = str(data.get("origen",  "")).strip()
    destino_raw = str(data.get("destino", "")).strip()
    if not origen_raw or not destino_raw:
        return jsonify({"error": "Origen y destino son obligatorios"}), 400
    if origen_raw == destino_raw:
        return jsonify({"error": "El origen y el destino no pueden ser iguales"}), 400

    # Parámetros opcionales
    vehiculo              = str(data.get("vehiculo", "12"))
    rendimiento_pers      = data.get("rendimiento_personalizado")
    combustible_inicial   = float(data.get("combustible_inicial", 0) or 0)
    evitar_casetas        = bool(data.get("evitar_casetas", True))
    ruta_index            = int(data.get("index", 0))
    tipo_combustible      = str(data.get("tipo_combustible", "gasolina"))  # "gasolina" o "diesel"
    hora_salida           = str(data.get("hora_salida", "")).strip()       # "HH:MM"
    zonas_prohibidas      = data.get("zonas_prohibidas", [])               # lista de {lat, lng, radio_km}

    # ── 2. Rendimiento y precio combustible ─────
    try:
        if vehiculo == "personalizado" and rendimiento_pers:
            rendimiento = float(rendimiento_pers)
            if rendimiento <= 0:
                raise ValueError
        else:
            rendimiento = RENDIMIENTO_VEHICULO.get(vehiculo, 12)
    except (ValueError, TypeError):
        return jsonify({"error": "Rendimiento inválido"}), 400

    precio_combustible = PRECIO_DIESEL if tipo_combustible == "diesel" else PRECIO_GASOLINA

    # ── 3. Geocodificar ─────────────────────────
    try:
        origen_coord  = geocodificar(origen_raw)
        destino_coord = geocodificar(destino_raw)
    except ValueError as e:
        return jsonify({"error": "No se pudo geocodificar", "detalle": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "Error al conectar con Google Geocoding", "detalle": str(e)}), 502

    if not origen_coord or not destino_coord:
        return jsonify({"error": "No se encontraron coordenadas para los puntos indicados"}), 404

    # ── 4. Obtener rutas de Google Directions ───
    try:
        rutas = obtener_rutas_google(
            origen_coord, destino_coord,
            evitar_casetas=evitar_casetas,
            zonas_prohibidas=zonas_prohibidas,
        )
    except Exception:
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Error al obtener rutas de Google", "detalle": "Error interno al procesar rutas"}), 502

    if not rutas:
        return jsonify({"error": "Google no encontró rutas entre esos puntos"}), 404

    ruta_index = max(0, min(ruta_index, len(rutas) - 1))

    # ── 5. Validar y seleccionar ruta usando la geometría real de la API ───
    ruta_alterna_sugerida = None
    advertencia_zona = None
    try:
        ruta_sel = None
        camino = None
        ruta_valida_idx = None

        ruta_sel, camino, ruta_valida_idx = _seleccionar_ruta_valida(
            rutas,
            zonas_prohibidas,
        )

        if ruta_sel is None or camino is None:
            return jsonify({"error": "No se pudo reconstruir una ruta válida"}), 500

        ruta_index = ruta_valida_idx

        if zonas_prohibidas:
            for zona in zonas_prohibidas:
                if ruta_intersecta_zona(camino, zona):
                    advertencia_zona = (
                        "⚠️ Esta es una zona de riesgo. Ten cuidado al pasar por aquí; "
                        "puede haber delincuencia."
                    )
                    break

        for idx, r in enumerate(rutas):
            if idx == ruta_valida_idx:
                continue
            alt_puntos = decode_polyline(r.get("polyline_points", ""))
            alt_puntos = sanitizar_coordenadas_ruta(alt_puntos)
            if len(alt_puntos) < 2:
                continue
            ruta_alterna_sugerida = {
                "summary": r.get("summary", f"Ruta {idx + 1}"),
                "coordenadas_alternativa": [[lat, lng] for lat, lng in alt_puntos],
                "distancia_km": round(float(r.get("distancia_m", 0)) / 1000, 2),
                "duracion_texto": _formatear_duracion(int(r.get("duracion_s", 0))),
            }
            break
    except Exception:
        return jsonify(
            {
                "error": "Error al procesar la ruta",
                "detalle": "Error interno al procesar la ruta",
            }
        ), 500

    # ── 6. Calcular costos ──────────────────────
    distancia_km   = round(ruta_sel.get("distancia_m", 0) / 1000, 2)
    duracion_seg   = ruta_sel.get("duracion_s", 0)
    duracion_min   = round(duracion_seg / 60)
    litros         = round(distancia_km / rendimiento, 2) if rendimiento > 0 else 0
    costo_comb     = round(litros * precio_combustible, 2)
    costo_casetas  = round(ruta_sel.get("costo_casetas", 0), 2)
    casetas_detalle = ruta_sel.get("casetas_detalle", [])
    casetas_detectadas = len(casetas_detalle)

    # Se prioriza el costo real de la ruta, sin penalizar artificialmente las casetas.
    costo_total = round(
        (distancia_km * (precio_combustible / max(rendimiento, 1)))
        + costo_casetas,
        2,
    )
    duracion_texto = _formatear_duracion(duracion_seg)

    # Combustible restante y advertencia
    combustible_restante = None
    advertencia_combustible = None
    gasolineras_sugeridas  = []

    if combustible_inicial > 0:
        combustible_restante = round(combustible_inicial - litros, 2)
        if combustible_restante < 0:
            advertencia_combustible = (
                f"⚠️ Tu gasolina no alcanza. Necesitas {abs(combustible_restante):.2f} L más."
            )
            # Buscar gasolineras cercanas a la ruta
            try:
                gasolineras_sugeridas = buscar_gasolineras_ruta(camino)
            except Exception:
                gasolineras_sugeridas = []

    # Zona horaria y hora de llegada
    info_horaria = {}
    if hora_salida:
        tz_origen  = obtener_zona_horaria(origen_raw)
        tz_destino = obtener_zona_horaria(destino_raw)
        info_horaria = calcular_hora_llegada(hora_salida, duracion_seg, tz_origen, tz_destino)

    # Resumen de todas las rutas (para tabs en el frontend)
    rutas_info = []
    for i, r in enumerate(rutas):
        rutas_info.append(
            {
                "index": i,
                "summary": r.get("summary", f"Ruta {i + 1}"),
                "distancia_km": round(r.get("distancia_m", 0) / 1000, 2),
                "duracion_texto": _formatear_duracion(r.get("duracion_s", 0)),
                "costo_casetas": round(r.get("costo_casetas", 0), 2),
            }
        )

    # ── 7. Respuesta ────────────────────────────
    return jsonify({
        "coordenadas":             camino,
        "origen_coord":            list(origen_coord),
        "destino_coord":           list(destino_coord),
        "distancia_km":            distancia_km,
        "duracion_minutos":        duracion_min,
        "duracion_texto":          duracion_texto,
        "litros_estimados":        litros,
        "tipo_combustible":        tipo_combustible,
        "precio_combustible":      precio_combustible,
        "costo_combustible":       costo_comb,
        "costo_casetas":           costo_casetas,
        "casetas_detalle":         casetas_detalle,
        "costo_total":             costo_total,
        "combustible_restante":    combustible_restante,
        "advertencia_combustible": advertencia_combustible,
        "gasolineras_sugeridas":   gasolineras_sugeridas,
        "evitar_casetas":          evitar_casetas,
        "ruta_index":              ruta_index,
        "ruta_total":              len(rutas),
        "rutas_info":              rutas_info,
        "info_horaria":            info_horaria,
        "advertencia_zona":        advertencia_zona,
        "ruta_alterna_sugerida":   ruta_alterna_sugerida,
    })

if __name__ == "__main__":
    app.run(debug=True)