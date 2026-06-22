# GPS MX — Proyecto Flask

## Instalación

```bash
pip install -r requirements.txt
```

## Ejecutar

```bash
python app.py
```

Luego abre tu navegador en: http://127.0.0.1:5000

## Estructura

```
GPS_P/
├── app.py                  # Servidor Flask
├── requirements.txt        # Dependencias
├── README.md
├── templates/
│   └── index.html          # Interfaz principal (Jinja2)
└── static/
    ├── css/
    │   └── style.css       # Estilos
    └── js/
        ├── data.js         # Casetas CAPUFE 2026 (tarifas exactas) + Zonas riesgo SESNSP
        ├── algorithms.js   # Utilidades (formatTime, riskScore, haversine)
        └── app.js          # Lógica del mapa e interacciones
```

## Características

- Diseño estilo Google Maps (teal/mauve/violet)
- Autocompletado de 80+ ciudades mexicanas + búsqueda global (Nominatim)
- Geolocalización (usa tu ubicación actual)
- Ruteo REAL sobre carretera (Valhalla, con respaldo OSRM) — distancia,
  tiempo y geometría corresponden al camino real, no a una línea recta
- **Ruta principal = siempre la ruta directa/estándar** (la misma que
  recomendaría Google Maps por defecto). Las 2 alternativas se generan a
  partir de ella y nunca la sustituyen; solo se reordenan entre sí según
  el criterio elegido (más rápida / más corta / más económica / balanceada)
- **119 casetas** de cuota con tarifas **exactas por tipo de vehículo**
  (moto, auto, autobús, camión C2-C9) tomadas literalmente del tarifario
  oficial CAPUFE-FONADIN 2026 (vigente desde 13/abr/2026):
  pot.capufe.mx/.../Tarifas-vigentes-2026.pdf
  - 110 casetas confirmadas contra el tarifario oficial
  - 7 del corredor México-Saltillo-Monterrey-Nuevo Laredo marcadas como
    **estimadas** (no aparecen en el tarifario CAPUFE-FONADIN consultado;
    posible concesión distinta — se señalan con ⚠️ en la app)
  - 2 de Mérida-Cancún (concesión privada, no CAPUFE)
  - Incluye puentes nacionales e internacionales además de autopistas
  - Caseta Fortín **removida** (cerró operaciones el 5/may/2023)
- Clasificación de camiones/autobuses por número de ejes (C2-C9, B2-B4)
  con tarifa real por eje cuando la caseta la publica
- Precio de gasolina con valor por defecto actualizado y campo para que
  el usuario lo sobreescriba con el precio local exacto de su zona
- Zonas de riesgo basadas en SESNSP 2023-2024
- Embotellamientos simulados
- Cálculo de combustible y costo total (casetas + gasolina)
- Zonas horarias de México
- Aviso de gasolina baja

## Limitaciones a tener en cuenta

- Las 7 casetas del corredor SLP-Saltillo-Monterrey-Nuevo Laredo marcadas
  "estimado" usan cifras de fuentes secundarias (no del tarifario CAPUFE
  oficial); revísalas antes de viajar si tu ruta pasa por ahí.
- Las tarifas CAPUFE cambian periódicamente; si CAPUFE publica un nuevo
  tarifario, los montos en `data.js` deben actualizarse a mano.
- El precio de la gasolina varía a diario y por estado/gasolinera; usa el
  campo "Precio gasolina $/L (opcional)" para máxima precisión.
- La detección de casetas compara la geometría real de la ruta contra las
  coordenadas de cada caseta con un margen de 1.2 km.
