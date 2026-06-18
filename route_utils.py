from __future__ import annotations

from math import asin, cos, radians, sin, sqrt
from typing import Iterable, List, Sequence, Tuple
import math

import requests

from config import GOOGLE_API_KEY

Coord = Tuple[float, float]


def _normalizar_zona(zona: Sequence[float] | dict) -> tuple[float, float, float]:
    """Acepta zonas como listas/tuplas o como diccionarios con claves lat/lng/radio_km."""
    if isinstance(zona, dict):
        lat = zona.get("lat", zona.get("latitude", 0))
        lng = zona.get("lng", zona.get("lon", zona.get("longitude", 0)))
        radio_km = zona.get("radio_km", zona.get("radius_km", 0))
        return float(lat), float(lng), float(radio_km)
    return float(zona[0]), float(zona[1]), float(zona[2])


def _es_coord_valida(coord: Sequence[float]) -> bool:
    if len(coord) != 2:
        return False
    lat, lng = coord
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return False
    return -90 <= lat_f <= 90 and -180 <= lng_f <= 180


def _normalizar_coord(coord: Sequence[float]) -> Coord:
    return float(coord[0]), float(coord[1])


def distancia_haversine(a: Coord, b: Coord) -> float:
    """Distancia en kilómetros entre dos puntos GPS usando Haversine."""
    lat1, lon1 = map(float, a)
    lat2, lon2 = map(float, b)
    lat1_rad, lon1_rad = radians(lat1), radians(lon1)
    lat2_rad, lon2_rad = radians(lat2), radians(lon2)
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    h = sin(dlat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2) ** 2
    return 2 * 6371 * asin(sqrt(h))


def decode_polyline(polyline_str: str) -> List[Coord]:
    """Decodifica una polyline codificada por Google Directions."""
    if not polyline_str:
        return []

    index, lat, lng = 0, 0, 0
    coords: List[Coord] = []
    while index < len(polyline_str):
        for is_lat in (True, False):
            resultado = 0
            shift = 0
            while True:
                if index >= len(polyline_str):
                    return coords
                b = ord(polyline_str[index]) - 63
                index += 1
                resultado |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            valor = ~(resultado >> 1) if (resultado & 1) else (resultado >> 1)
            if is_lat:
                lat += valor
            else:
                lng += valor
        coords.append((float(lat) / 1e5, float(lng) / 1e5))
    return coords


def sanitizar_coordenadas_ruta(ruta: Iterable[Sequence[float]]) -> List[Coord]:
    """
    Elimina puntos inválidos y duplicados consecutivos.
    Mantiene el orden original para preservar la geometría de la ruta.
    """
    ruta = list(ruta)
    if not ruta:
        return []

    salida: List[Coord] = []
    for punto in ruta:
        if not _es_coord_valida(punto):
            continue
        coord = _normalizar_coord(punto)
        if not salida or distancia_haversine(salida[-1], coord) > 0.000001:
            salida.append(coord)
    return salida


def punto_dentro_zona(coord: Coord, zona: Sequence[float] | dict) -> bool:
    """Comprueba si una coordenada está dentro del radio de una zona restringida."""
    lat, lng = map(float, coord)
    z_lat, z_lng, radio_km = _normalizar_zona(zona)
    return distancia_haversine((lat, lng), (z_lat, z_lng)) <= radio_km


def _coord_a_plano(coord: Coord) -> tuple[float, float]:
    """Convierte coordenadas GPS a un sistema local aproximado para geometría local."""
    lat, lng = map(float, coord)
    lat_rad = radians(lat)
    x = lng * 111.32 * cos(lat_rad)
    y = lat * 110.57
    return x, y


def _plano_a_coord(x: float, y: float, lat_ref: float) -> Coord:
    """Convierte coordenadas planas locales de regreso a lat/lng."""
    x = float(x)
    y = float(y)
    lat_ref = float(lat_ref)
    lat = y / 110.57
    lng = x / (111.32 * cos(radians(lat_ref)))
    return lat, lng


def _normalizar_vector(x: float, y: float) -> tuple[float, float]:
    x = float(x)
    y = float(y)
    longitud = math.hypot(x, y)
    if longitud == 0:
        return 0.0, 0.0
    return x / longitud, y / longitud


def _desplazar_coord(coord: Coord, dx_km: float, dy_km: float) -> Coord:
    """Desplaza una coordenada GPS usando una aproximación local en km."""
    lat, lng = map(float, coord)
    dx_km = float(dx_km)
    dy_km = float(dy_km)
    lat_ref = radians(lat)
    lat_offset = dy_km / 110.57
    lng_offset = dx_km / (111.32 * cos(lat_ref))
    return lat + lat_offset, lng + lng_offset


def _puntos_interseccion_segmento_circulo(
    a: Coord, b: Coord, zona: Sequence[float] | dict
) -> list[Coord]:
    """Calcula los puntos donde un segmento cruza el círculo de la zona."""
    a = tuple(float(x) for x in a)
    b = tuple(float(x) for x in b)
    z_lat, z_lng, radio_km = _normalizar_zona(zona)
    centro = (z_lat, z_lng)

    ax, ay = _coord_a_plano(a)
    bx, by = _coord_a_plano(b)
    cx, cy = _coord_a_plano(centro)

    dx = bx - ax
    dy = by - ay
    if abs(dx) < 1e-12 and abs(dy) < 1e-12:
        return []

    a_coef = dx * dx + dy * dy
    b_coef = 2 * ((ax - cx) * dx + (ay - cy) * dy)
    c_coef = (ax - cx) * (ax - cx) + (ay - cy) * (ay - cy) - radio_km * radio_km

    discriminante = b_coef * b_coef - 4 * a_coef * c_coef
    if discriminante < 0:
        return []

    raiz = math.sqrt(max(0.0, discriminante))
    t1 = (-b_coef - raiz) / (2 * a_coef)
    t2 = (-b_coef + raiz) / (2 * a_coef)
    resultados = []
    lat_ref = radians((a[0] + b[0] + centro[0]) / 3)

    for t in (t1, t2):
        if 0.0 <= t <= 1.0:
            px = ax + t * dx
            py = ay + t * dy
            lat, lng = _plano_a_coord(px, py, lat_ref)
            resultados.append((lat, lng))

    # Evita duplicados por redondeo.
    salida = []
    for punto in resultados:
        if not any(distancia_haversine(punto, p) < 1e-8 for p in salida):
            salida.append(punto)
    return salida


def generar_waypoints_evitacion(
    ruta: Iterable[Sequence[float]], zona: Sequence[float] | dict
) -> list[Coord]:
    """
    Genera hasta 8 waypoints por zona usando una evasión más amplia del obstáculo.
    """
    ruta_limpia = sanitizar_coordenadas_ruta(ruta)
    if len(ruta_limpia) < 2:
        return []

    z_lat, z_lng, radio_km = _normalizar_zona(zona)
    centro = (z_lat, z_lng)
    radio_km = float(radio_km)

    if radio_km <= 0:
        return []

    candidatos_izq: list[Coord] = []
    candidatos_der: list[Coord] = []

    for i in range(len(ruta_limpia) - 1):
        a = ruta_limpia[i]
        b = ruta_limpia[i + 1]
        if not segmento_intersecta_zona(a, b, zona):
            continue

        intersecciones = _puntos_interseccion_segmento_circulo(a, b, zona)
        if not intersecciones:
            intersecciones = [a, b]

        a_plano = _coord_a_plano(a)
        b_plano = _coord_a_plano(b)
        dx_seg = b_plano[0] - a_plano[0]
        dy_seg = b_plano[1] - a_plano[1]
        seg_len = math.hypot(dx_seg, dy_seg)
        if seg_len == 0:
            continue

        nx = -dy_seg / seg_len
        ny = dx_seg / seg_len
        offset_km = max(2.5, radio_km * 2.0)

        for punto in intersecciones:
            p_plano = _coord_a_plano(punto)
            px, py = p_plano
            lat_ref = punto[0]
            for signo, destino in ((1, candidatos_izq), (-1, candidatos_der)):
                px_cand = px + signo * nx * offset_km
                py_cand = py + signo * ny * offset_km
                cand = _plano_a_coord(px_cand, py_cand, lat_ref)
                if not _es_coord_valida(cand):
                    continue
                if distancia_haversine(cand, centro) <= radio_km:
                    continue
                destino.append(cand)

    def _deduplicar(candidatos: list[Coord]) -> list[Coord]:
        salida: list[Coord] = []
        for punto in candidatos:
            if not _es_coord_valida(punto):
                continue
            if any(distancia_haversine(punto, p) < 1e-7 for p in salida):
                continue
            salida.append(punto)
        return salida

    candidatos_izq = _deduplicar(candidatos_izq)
    candidatos_der = _deduplicar(candidatos_der)

    def _mejor_candidato(candidatos: list[Coord]) -> Coord | None:
        if not candidatos:
            return None
        return max(
            candidatos,
            key=lambda p: distancia_haversine(p, centro),
        )

    salida: list[Coord] = []
    mejor_izq = _mejor_candidato(candidatos_izq)
    mejor_der = _mejor_candidato(candidatos_der)
    if mejor_izq is not None:
        salida.append(mejor_izq)
    if mejor_der is not None and not any(
        distancia_haversine(mejor_der, p) < 1e-7 for p in salida
    ):
        salida.append(mejor_der)

    # Limita explícitamente a 8 waypoints por zona.
    return salida[:8]


def distancia_segmento_a_punto(a: Coord, b: Coord, p: Coord) -> float:
    """Distancia mínima entre un segmento y un punto en kilómetros."""
    a = tuple(float(x) for x in a)
    b = tuple(float(x) for x in b)
    p = tuple(float(x) for x in p)

    ax, ay = _coord_a_plano(a)
    bx, by = _coord_a_plano(b)
    px, py = _coord_a_plano(p)

    abx = bx - ax
    aby = by - ay
    apx = px - ax
    apy = py - ay
    ab_len_sq = abx * abx + aby * aby
    if ab_len_sq == 0:
        return math.hypot(px - ax, py - ay)

    t = max(0.0, min(1.0, (apx * abx + apy * aby) / ab_len_sq))
    projx = ax + t * abx
    projy = ay + t * aby
    return math.hypot(px - projx, py - projy)


def segmento_intersecta_zona(a: Coord, b: Coord, zona: Sequence[float] | dict) -> bool:
    """Detecta si un segmento cruza una zona circular restringida."""
    z_lat, z_lng, radio_km = _normalizar_zona(zona)
    centro = (z_lat, z_lng)
    d1 = distancia_haversine(a, centro)
    d2 = distancia_haversine(b, centro)
    if min(d1, d2) <= float(radio_km):
        return True

    min_dist = distancia_segmento_a_punto(a, b, centro)
    return min_dist <= float(radio_km)


def ruta_intersecta_zona(
    ruta: Iterable[Sequence[float]], zona: Sequence[float]
) -> bool:
    """Detecta si algún segmento de la ruta atraviesa la zona restringida."""
    ruta_limpia = sanitizar_coordenadas_ruta(ruta)
    if len(ruta_limpia) < 2:
        return False
    for i in range(len(ruta_limpia) - 1):
        if segmento_intersecta_zona(ruta_limpia[i], ruta_limpia[i + 1], zona):
            return True
    return False


def validar_ruta_contra_zonas(
    ruta: Iterable[Sequence[float]],
    zonas_rojas: Sequence[Sequence[float]] | dict | None,
) -> bool:
    """
    Valida la ruta usando geometría pura contra zonas prohibidas.

    Para cada zona, se mide la distancia mínima entre la trayectoria y el centro
    de la zona. Si algún segmento entra dentro del radio de exclusión, la ruta
    se considera bloqueada y la función devuelve False.
    """
    ruta_limpia = sanitizar_coordenadas_ruta(ruta)
    if len(ruta_limpia) < 2:
        return False

    if zonas_rojas is None:
        return True

    if isinstance(zonas_rojas, dict):
        zonas_a_validar = [zonas_rojas]
    else:
        zonas_a_validar = list(zonas_rojas)

    for zona in zonas_a_validar:
        try:
            z_lat, z_lng, radio_km = _normalizar_zona(zona)
        except Exception:
            continue
        if radio_km <= 0:
            continue

        centro = (z_lat, z_lng)
        for i in range(len(ruta_limpia) - 1):
            a = ruta_limpia[i]
            b = ruta_limpia[i + 1]
            if distancia_segmento_a_punto(a, b, centro) <= radio_km:
                return False

    return True


def _calcular_costo_ruta(ruta: dict) -> float:
    distancia_km = float(ruta.get("distancia_m", 0)) / 1000.0
    casetas = float(ruta.get("costo_casetas", 0))
    return round(distancia_km * 1.8 + casetas * 1.5, 2)


def _crear_params_directions(
    origen: Coord,
    destino: Coord,
    waypoint: Coord | None = None,
) -> dict:
    params = {
        "origin": f"{origen[0]},{origen[1]}",
        "destination": f"{destino[0]},{destino[1]}",
        "mode": "driving",
        "language": "es",
        "region": "mx",
        "alternatives": "true",
        "key": GOOGLE_API_KEY,
    }
    if waypoint:
        params["waypoints"] = f"via:{waypoint[0]},{waypoint[1]}"
    return params


def generar_ruta_alternativa(
    origen: Coord,
    destino: Coord,
    zona_prohibida: Sequence[float] | dict,
) -> dict | None:
    """
    Genera una ruta alternativa usando un waypoint tangente al círculo de la zona
    prohibida y compara el costo estimado con una ruta base.
    """
    if not _es_coord_valida(origen) or not _es_coord_valida(destino):
        return None

    try:
        z_lat, z_lng, radio_km = _normalizar_zona(zona_prohibida)
    except Exception:
        return None

    if radio_km <= 0:
        return None

    def _ruta_desde_google(waypoint: Coord | None = None) -> list[dict]:
        params = _crear_params_directions(origen, destino, waypoint)
        respuesta = requests.get(
            "https://maps.googleapis.com/maps/api/directions/json",
            params=params,
            timeout=20,
        )
        datos = respuesta.json()
        if datos.get("status") != "OK":
            return []

        rutas = []
        for ruta in datos.get("routes", []):
            legs = ruta.get("legs", [])
            leg = legs[0] if legs else {}
            rutas.append(
                {
                    "summary": ruta.get("summary", "Ruta"),
                    "polyline_points": ruta.get("overview_polyline", {}).get("points", ""),
                    "distancia_m": leg.get("distance", {}).get("value", 0),
                    "duracion_s": leg.get("duration", {}).get("value", 0),
                    "costo_casetas": 0.0,
                }
            )
        return rutas

    ruta_base = _ruta_desde_google()
    if not ruta_base:
        return None

    def _waypoint_tangente() -> Coord | None:
        origen_plano = _coord_a_plano(origen)
        destino_plano = _coord_a_plano(destino)
        centro_plano = _coord_a_plano((z_lat, z_lng))
        dx = destino_plano[0] - origen_plano[0]
        dy = destino_plano[1] - origen_plano[1]
        longitud = math.hypot(dx, dy)
        if longitud == 0:
            return None
        nx = -dy / longitud
        ny = dx / longitud

        candidatos = []
        for signo in (1.0, -1.0):
            px = centro_plano[0] + signo * nx * radio_km
            py = centro_plano[1] + signo * ny * radio_km
            lat, lng = _plano_a_coord(px, py, z_lat)
            if not _es_coord_valida((lat, lng)):
                continue
            candidatos.append((lat, lng))

        if not candidatos:
            return None

        def _score(cand: Coord) -> float:
            return (
                distancia_haversine(cand, origen)
                + distancia_haversine(cand, destino)
                + distancia_haversine(cand, (z_lat, z_lng))
            )

        return max(candidatos, key=_score)

    waypoint = _waypoint_tangente()
    if waypoint is None:
        return None

    rutas_alternas = _ruta_desde_google(waypoint)
    if not rutas_alternas:
        return None

    ruta_alterna = rutas_alternas[0]
    costo_base = _calcular_costo_ruta(ruta_base[0])
    costo_alterno = _calcular_costo_ruta(ruta_alterna)

    return {
        "waypoint": waypoint,
        "ruta_base": ruta_base[0],
        "ruta_alterna": ruta_alterna,
        "costo_base": costo_base,
        "costo_alterno": costo_alterno,
        "diferencia_costo": round(costo_alterno - costo_base, 2),
    }


def _segmentos_se_cruzan(p1, p2, p3, p4) -> bool:
    """Detección simple de intersección entre dos segmentos."""
    def orient(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    o1 = orient(p1, p2, p3)
    o2 = orient(p1, p2, p4)
    o3 = orient(p3, p4, p1)
    o4 = orient(p3, p4, p2)

    if ((o1 > 0 and o2 < 0) or (o1 < 0 and o2 > 0)) and ((o3 > 0 and o4 < 0) or (o3 < 0 and o4 > 0)):
        return True
    return False


def validar_geometria_ruta(
    ruta: Iterable[Sequence[float]], zonas_prohibidas: Sequence[Sequence[float]]
) -> tuple[bool, List[str]]:
    """
    Valida una ruta antes de dibujarla.
    Comprueba puntos inválidos, segmentos degenerados, auto-intersecciones
    y cruces con zonas restringidas.
    """
    ruta_limpia = sanitizar_coordenadas_ruta(ruta)
    errores: List[str] = []

    if len(ruta_limpia) < 2:
        errores.append("La ruta no contiene suficientes puntos válidos para dibujarse.")
        return False, errores

    for i in range(1, len(ruta_limpia)):
        if distancia_haversine(ruta_limpia[i - 1], ruta_limpia[i]) < 0.000001:
            errores.append(f"Segmento degenerado detectado entre los puntos {i - 1} y {i}.")

    for i in range(len(ruta_limpia) - 2):
        for j in range(i + 2, len(ruta_limpia) - 1):
            if _segmentos_se_cruzan(
                ruta_limpia[i],
                ruta_limpia[i + 1],
                ruta_limpia[j],
                ruta_limpia[j + 1],
            ):
                errores.append(f"Intersección detectada entre los segmentos {i}-{i+1} y {j}-{j+1}.")
                break
        if errores:
            break

    for i, punto in enumerate(ruta_limpia):
        for zona in zonas_prohibidas:
            if punto_dentro_zona(punto, zona):
                errores.append(f"La ruta atraviesa una zona restringida cerca del punto {i}.")
                break
        if errores:
            break

    for zona in zonas_prohibidas:
        if ruta_intersecta_zona(ruta_limpia, zona):
            errores.append("La ruta intersecta una zona restringida en uno o más segmentos.")
            break

    return not errores, errores
