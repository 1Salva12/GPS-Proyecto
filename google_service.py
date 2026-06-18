import requests
from config import GOOGLE_API_KEY
from route_utils import (
    decode_polyline,
    generar_waypoints_evitacion,
    sanitizar_coordenadas_ruta,
    validar_geometria_ruta,
)


def _normalizar_zonas(zonas_prohibidas):
    if not zonas_prohibidas:
        return []
    resultado = []
    for zona in zonas_prohibidas:
        if isinstance(zona, dict):
            resultado.append(
                {
                    "lat": float(zona.get("lat", zona.get("latitude", 0))),
                    "lng": float(zona.get("lng", zona.get("lon", zona.get("longitude", 0)))),
                    "radio_km": float(zona.get("radio_km", zona.get("radius_km", 0))),
                }
            )
        else:
            lat, lng, radio_km = zona
            resultado.append(
                {
                    "lat": float(lat),
                    "lng": float(lng),
                    "radio_km": float(radio_km),
                }
            )
    return resultado


def _ruta_es_valida_local(ruta, zonas_a_usar):
    polyline = ruta.get("polyline_points", "")
    puntos = decode_polyline(polyline)
    puntos = sanitizar_coordenadas_ruta(puntos)
    if len(puntos) < 2:
        return False
    return validar_geometria_ruta(puntos, zonas_a_usar)[0]

# ─────────────────────────────────────────────
#  UTILIDADES
# ─────────────────────────────────────────────

def intentar_parsear_coordenadas(texto: str):
    """
    Detecta si el texto viene como coordenadas directas.
    Ejemplo: 19.951234,-99.532456
    """
    try:
        partes = texto.split(",")
        if len(partes) != 2:
            return None
        lat = float(partes[0].strip())
        lng = float(partes[1].strip())
        if -90 <= lat <= 90 and -180 <= lng <= 180:
            return lat, lng
        return None
    except Exception:
        return None


def geocodificar(lugar: str):
    """Devuelve sólo las coordenadas (lat, lng) para compatibilidad con app.py."""
    coordenadas, _ = obtener_coordenadas_google(lugar)
    return coordenadas


def obtener_coordenadas_google(lugar: str):
    """
    Si recibe coordenadas directas las usa.
    Si recibe texto, usa Google Geocoding API.
    """
    coordenadas_directas = intentar_parsear_coordenadas(lugar)
    if coordenadas_directas:
        lat, lng = coordenadas_directas
        return coordenadas_directas, f"{lat}, {lng}"

    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {
        "address":    lugar,
        "key":        GOOGLE_API_KEY,
        "region":     "mx",
        "language":   "es",
        "components": "country:MX",
    }
    respuesta = requests.get(url, params=params, timeout=15)
    datos     = respuesta.json()

    if datos.get("status") != "OK":
        mensaje = datos.get("error_message", "Sin detalle")
        raise RuntimeError(f"Google Geocoding respondió {datos.get('status')}: {mensaje}")

    resultado            = datos["results"][0]
    location             = resultado["geometry"]["location"]
    coordenadas          = (location["lat"], location["lng"])
    direccion_formateada = resultado.get("formatted_address", lugar)
    return coordenadas, direccion_formateada


# ─────────────────────────────────────────────
#  OBTENER RUTAS
# ─────────────────────────────────────────────

def obtener_rutas_google(
    origen_coord,
    destino_coord,
    evitar_casetas: bool = True,
    zonas_prohibidas: list = None,
) -> list:
    """
    Pide rutas a Google Directions usando una estrategia de evasión basada en la
    geometría real de la ruta y de las zonas restringidas.

    La primera petición usa el origen/destino normal. Si una ruta intersecta una
    zona prohibida, se generan waypoints dinámicos sobre el perímetro del círculo
    usando la geometría del segmento que atraviesa la zona; luego se hace una
    segunda petición con esos waypoints.
    """
    url = "https://maps.googleapis.com/maps/api/directions/json"

    def _parse_rutas(datos: dict) -> list:
        if datos.get("status") != "OK":
            mensaje = datos.get("error_message", "Sin detalle")
            raise RuntimeError(f"Google Directions respondió {datos.get('status')}: {mensaje}")

        rutas = []
        for ruta in datos.get("routes", []):
            legs = ruta.get("legs", [])
            leg = legs[0] if legs else {}
            costo_casetas = 0.0
            casetas_detalle = []
            for step in leg.get("steps", []):
                instruccion = step.get("html_instructions", "").lower()
                if (
                    "cuota" in instruccion
                    or "caseta" in instruccion
                    or "peaje" in instruccion
                    or "toll" in instruccion
                ):
                    dist_step_km = step.get("distance", {}).get("value", 0) / 1000
                    precio_est = round(dist_step_km * 1.8, 2)
                    costo_casetas += precio_est
                    casetas_detalle.append(
                        {
                            "instruccion": step.get("html_instructions", ""),
                            "km": round(dist_step_km, 2),
                            "costo_est": precio_est,
                        }
                    )
            rutas.append(
                {
                    "summary": ruta.get("summary", "Ruta"),
                    "polyline_points": ruta.get("overview_polyline", {}).get("points", ""),
                    "distancia_m": leg.get("distance", {}).get("value", 0),
                    "duracion_s": leg.get("duration", {}).get("value", 0),
                    "costo_casetas": round(costo_casetas, 2),
                    "casetas_detalle": casetas_detalle,
                }
            )
        return rutas

    def _request(params: dict) -> list:
        print("DEBUG Directions params:", params)
        print("DEBUG alternatives activado:", params.get("alternatives"))
        respuesta = requests.get(url, params=params, timeout=20)
        datos = respuesta.json()
        print("DEBUG Directions status:", datos.get("status"))
        print("DEBUG Directions routes count:", len(datos.get("routes", [])))
        return _parse_rutas(datos)

    zonas_norm = _normalizar_zonas(zonas_prohibidas)

    # Petición base: sólo origen, destino, modo y opciones generales.
    params = {
        "origin": f"{float(origen_coord[0])},{float(origen_coord[1])}",
        "destination": f"{float(destino_coord[0])},{float(destino_coord[1])}",
        "mode": "driving",
        "language": "es",
        "region": "mx",
        "alternatives": "true",
        "key": GOOGLE_API_KEY,
    }
    if evitar_casetas:
        params["avoid"] = "tolls"

    rutas = _request(params)
    print("DEBUG rutas base obtenidas:", len(rutas))

    rutas_validas = [
        ruta for ruta in rutas if _ruta_es_valida_local(ruta, zonas_norm)
    ]
    print("DEBUG rutas válidas después de validación local:", len(rutas_validas))

    # Si no hay zonas restringidas, devolvemos sólo rutas que pasen la validación local.
    if not zonas_norm:
        return rutas_validas

    # Estrategia geométrica robusta: intentar rutas alternativas por ambos lados
    # del obstáculo usando los puntos de entrada/salida detectados sobre la ruta.
    waypoints_global = []
    for ruta in rutas_validas:
        puntos = decode_polyline(ruta.get("polyline_points", ""))
        puntos = sanitizar_coordenadas_ruta(puntos)
        if len(puntos) < 2:
            continue
        for zona in zonas_norm:
            if validar_geometria_ruta(puntos, [zona])[0]:
                continue
            wp_candidatos = generar_waypoints_evitacion(puntos, zona)
            for wp in wp_candidatos:
                if not any(
                    abs(wp[0] - w[0]) < 1e-9 and abs(wp[1] - w[1]) < 1e-9
                    for w in waypoints_global
                ):
                    waypoints_global.append(wp)

    print("WAYPOINTS GENERADOS:", len(waypoints_global))
    print(waypoints_global)

    # Si la geometría del segmento indica que hay una zona bloqueando el trayecto,
    # hacemos una petición adicional con waypoints dinámicos sobre el perímetro.
    if waypoints_global:
        waypoints_global = waypoints_global[:8]
        params_avoid = dict(params)
        params_avoid["waypoints"] = "|".join(
            f"via:{lat},{lng}" for lat, lng in waypoints_global
        )
        print("DEBUG waypoints enviados a Google:", len(waypoints_global))
        print("DEBUG payload enviado a Directions:", params_avoid)
        rutas_alternativas = _request(params_avoid)
        rutas_alternativas = [
            ruta for ruta in rutas_alternativas if _ruta_es_valida_local(ruta, zonas_norm)
        ]
        if rutas_alternativas:
            return rutas_alternativas

    return rutas_validas


# ─────────────────────────────────────────────
#  GASOLINERAS CERCANAS A LA RUTA
# ─────────────────────────────────────────────

def buscar_gasolineras_ruta(camino: list, max_puntos: int = 3) -> list:
    """
    Busca gasolineras reales usando Google Places API
    a lo largo de puntos muestreados de la ruta.

    camino: lista de [lat, lng] devuelta por Dijkstra.
    Retorna lista de {nombre, lat, lng, direccion}.
    """
    if not camino:
        return []

    # Muestrear hasta max_puntos puntos distribuidos en la ruta
    paso    = max(1, len(camino) // max_puntos)
    indices = list(range(0, len(camino), paso))[:max_puntos]

    gasolineras = []
    vistos      = set()

    for idx in indices:
        punto = camino[idx]
        lat, lng = punto[0], punto[1]

        url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        params = {
            "location": f"{lat},{lng}",
            "radius":   10000,               # 10 km
            "type":     "gas_station",
            "language": "es",
            "key":      GOOGLE_API_KEY,
        }
        try:
            resp  = requests.get(url, params=params, timeout=10)
            datos = resp.json()
            for place in datos.get("results", [])[:2]:
                pid = place.get("place_id", "")
                if pid in vistos:
                    continue
                vistos.add(pid)
                loc = place.get("geometry", {}).get("location", {})
                gasolineras.append({
                    "nombre":    place.get("name", "Gasolinera"),
                    "lat":       loc.get("lat"),
                    "lng":       loc.get("lng"),
                    "direccion": place.get("vicinity", ""),
                    "rating":    place.get("rating", None),
                })
        except Exception:
            continue

    return gasolineras