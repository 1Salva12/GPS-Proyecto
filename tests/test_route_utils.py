from google_service import obtener_rutas_google
from route_utils import (
    generar_ruta_alternativa,
    generar_waypoints_evitacion,
    sanitizar_coordenadas_ruta,
    validar_geometria_ruta,
    validar_ruta_contra_zonas,
)


def test_sanitizar_coordenadas_ruta_elimina_duplicados_consecutivos():
    ruta = [
        [19.43, -99.13],
        [19.43, -99.13],
        [19.431, -99.132],
        [19.431, -99.132],
        [19.432, -99.133],
    ]

    resultado = sanitizar_coordenadas_ruta(ruta)

    assert resultado == [
        (19.43, -99.13),
        (19.431, -99.132),
        (19.432, -99.133),
    ]


def test_validar_geometria_ruta_rechaza_una_ruta_invalida():
    ruta = [
        [0.0, 0.0],
        [0.0, 0.0],
        [0.0, 0.0],
    ]

    valido, errores = validar_geometria_ruta(ruta, [])

    assert valido is False
    assert errores


def test_generar_waypoints_evitacion_genera_puntos_en_lados_distintos():
    ruta = [
        [19.4320, -99.1330],
        [19.4330, -99.1330],
        [19.4340, -99.1330],
    ]
    zona = [19.4330, -99.1330, 0.02]

    waypoints = generar_waypoints_evitacion(ruta, zona)

    assert len(waypoints) >= 2
    # Deben existir al menos dos candidatos distintos según el lado de la ruta.
    assert len({(round(w[0], 6), round(w[1], 6)) for w in waypoints}) >= 2


def test_generar_waypoints_evitacion_limita_candidatos_por_zona():
    ruta = [
        [19.4310, -99.1330],
        [19.4320, -99.1330],
        [19.4330, -99.1330],
        [19.4340, -99.1330],
        [19.4350, -99.1330],
        [19.4360, -99.1330],
    ]
    zona = [19.4335, -99.1330, 0.02]

    waypoints = generar_waypoints_evitacion(ruta, zona)

    assert len(waypoints) <= 3
    assert len({(round(w[0], 6), round(w[1], 6)) for w in waypoints}) == len(waypoints)


def test_validar_ruta_contra_zonas_rechaza_ruta_que_entraria_a_la_zona():
    ruta = [
        [19.4310, -99.1330],
        [19.4320, -99.1330],
        [19.4330, -99.1330],
        [19.4340, -99.1330],
    ]
    zona = {"lat": 19.4330, "lng": -99.1330, "radio_km": 0.02}

    assert validar_ruta_contra_zonas(ruta, zona) is False


def test_generar_waypoints_evitacion_acepta_coordenadas_como_texto():
    ruta = [
        ("19.4320", "-99.1330"),
        ("19.4330", "-99.1330"),
        ("19.4340", "-99.1330"),
    ]
    zona = ["19.4330", "-99.1330", "0.02"]

    waypoints = generar_waypoints_evitacion(ruta, zona)

    assert isinstance(waypoints, list)
    assert all(len(w) == 2 for w in waypoints)


def test_generar_ruta_alternativa_devuelve_info_cuando_hay_waypoint(monkeypatch):
    class FakeResponse:
        def __init__(self, payload):
            self._payload = payload

        def json(self):
            return self._payload

    def fake_get(url, params, timeout):
        return FakeResponse(
            {
                "status": "OK",
                "routes": [
                    {
                        "summary": "Ruta alterna",
                        "overview_polyline": {"points": "ruta_alterna"},
                        "legs": [
                            {
                                "distance": {"value": 1500},
                                "duration": {"value": 900},
                                "steps": [],
                            }
                        ],
                    }
                ],
            }
        )

    monkeypatch.setattr("route_utils.requests.get", fake_get)
    monkeypatch.setattr(
        "route_utils.decode_polyline",
        lambda polyline: [
            (19.4300, -99.1300),
            (19.4310, -99.1310),
            (19.4320, -99.1320),
        ],
    )

    resultado = generar_ruta_alternativa(
        origen=(19.4300, -99.1300),
        destino=(19.4320, -99.1320),
        zona_prohibida={"lat": 19.4310, "lng": -99.1310, "radio_km": 0.02},
    )

    assert resultado is not None
    assert resultado["ruta_alterna"]["summary"] == "Ruta alterna"
    assert resultado["waypoint"] is not None


def test_obtener_rutas_google_filtra_rutas_invalidas(monkeypatch):
    class FakeResponse:
        def __init__(self, payload):
            self._payload = payload

        def json(self):
            return self._payload

    rutas_por_polyline = {
        "ruta_valida": [
            (19.4200, -99.1300),
            (19.4210, -99.1310),
            (19.4220, -99.1320),
        ],
        "ruta_invalida": [
            (19.4330, -99.1330),
            (19.4340, -99.1330),
            (19.4350, -99.1330),
        ],
    }

    def fake_get(url, params, timeout):
        return FakeResponse(
            {
                "status": "OK",
                "routes": [
                    {
                        "summary": "Ruta valida",
                        "overview_polyline": {"points": "ruta_valida"},
                        "legs": [
                            {
                                "distance": {"value": 1000},
                                "duration": {"value": 600},
                                "steps": [],
                            }
                        ],
                    },
                    {
                        "summary": "Ruta invalida",
                        "overview_polyline": {"points": "ruta_invalida"},
                        "legs": [
                            {
                                "distance": {"value": 1100},
                                "duration": {"value": 650},
                                "steps": [],
                            }
                        ],
                    },
                ],
            }
        )

    monkeypatch.setattr("google_service.requests.get", fake_get)
    monkeypatch.setattr(
        "google_service.decode_polyline",
        lambda polyline: rutas_por_polyline[polyline],
    )

    rutas = obtener_rutas_google(
        origen_coord=(19.4200, -99.1300),
        destino_coord=(19.4220, -99.1320),
        zonas_prohibidas=[(19.4330, -99.1330, 0.05)],
    )

    assert len(rutas) == 1
    assert rutas[0]["summary"] == "Ruta valida"
