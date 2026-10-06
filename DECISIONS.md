# Decisiones — Filoteca

## Iteración 1: Stack y Fundamentos
1. **Stack: Electron + React + TypeScript + Vite + Tailwind v4 + Motion**, empaquetado con **electron-builder** (instalador NSIS + portable).
2. Criterio 1 (animación/gráficos): UI web = mismo nivel visual que Tauri; Motion da springs, layout y shared-element que en WPF/QML/JavaFX costarían mucho más. Descarto .NET/Python/Java.
3. Criterio 2 (.exe real) decidió entre Tauri y Electron: este equipo Windows no tenía Rust ni MSVC Build Tools (varios GB, requieren admin). Electron solo necesita Node, así que **puedo generar y verificar el .exe aquí mismo**, y no solo entregar un pipeline.
4. Además, Chromium empaquetado = render idéntico en cualquier Windows (WebView2 varía de versión) → animaciones predecibles a 60 fps.
5. Coste asumido: ~90 MB instalado y arranque ~1 s (Tauri sería ~10 MB). Aceptable frente a 1 y 2.
6. Persistencia: **SQLite vía sql.js (WASM)** en el proceso main, archivo `%APPDATA%/Filoteca/filoteca.db`, escritura atómica (tmp + rename). Sin módulos nativos → build sin compiladores.
7. Backup = copia del .db con un clic; restaurar valida el esquema antes de sustituir.
8. Gráficos propios en SVG (d3-shape/d3-hierarchy solo para geometría) para controlar animaciones y estética.
9. Barra de título: `titleBarOverlay` (botones nativos de Windows 11, snap layouts) + barra propia temable.
10. Bobina: el filamento es un disco escalado con `transform: scale` (GPU) bajo el núcleo → grosor realista y animación barata.
11. Fuentes empaquetadas (@fontsource): Bricolage Grotesque (display), Inter (datos), JetBrains Mono (cifras). 100 % offline.
12. Nombre: **Filoteca** (filamento + biblioteca). Acento lima "boquilla caliente" sobre grafito; ámbar/coral solo para alertas.

## Iteración 2: Bobinas 3D, Moneda COP, Reabastecimiento e Ingesta Anycubic Slicer Next
13. **Bobina 3D procedural (Three.js):** Se eligió Three.js procedural sin modelos externos ni WebGL por tarjeta. Geometría paramétrica (discos laterales con perforaciones circulares, núcleo de cartón kraft y filamento enrollado con normal mapping). Materiales PBR `MeshPhysicalMaterial` con presets por acabado: mate (rugosidad 0.85), brillante (clearcoat 1.0, rugosidad 0.15), seda (sheen 1.0, rugosidad 0.3), translúcido (transmisión 0.65, rugosidad 0.25) y glitter (ruido procedural en canvas).
14. **Radio dinámico volumétrico:** El radio del bobinado se calcula por conservación de volumen $R = \sqrt{r_{\text{núcleo}}^2 + f \cdot (R_{\text{lleno}}^2 - r_{\text{núcleo}}^2)}$, asegurando que el 33% restante se aprecie visualmente realista como un tercio volumétrico y no una reducción lineal engañosa.
15. **Moneda COP (Pesos Colombianos):** Formato colombiano sin decimales (`$ 89.900`) y costo por gramo con un decimal (`$ 89,9/g`) mediante `Intl.NumberFormat('es-CO')`. Entradas de texto flexibles que admiten tanto `89900` como `89.900`. Precios de catálogo actualizados a valores colombianos reales ($ 65.000 a $ 160.000 COP por bobina de 1 kg).
16. **Previsión de reabastecimiento proactiva:** Cálculo de pendiente de consumo diario sobre ventana móvil de 30 días, margen de tiempo de entrega (días de despacho + colchón de seguridad) y puntuación de prioridad (`critica`, `proxima`, `planificada`). Integración directa en 1 clic hacia la lista de compras.
17. **Filosofía de ingesta: Slicing ≠ Printing:** Laminar NO equivale a imprimir. Filoteca **nunca** descuenta filamento de manera silenciosa ni asume que un archivo laminado fue enviado o terminado con éxito.
18. **Ingesta silenciosa y Bandeja de laminados:** Los eventos del slicer se reciben sin modal invasivo: solo un badge reactivo en la barra de título (`Bandeja (N)`). La vista dedicada "Bandeja de laminados" permite revisar miniaturas de 260×260 px, advertencias técnicas, asignación visual de bobinas por slot, ajuste manual de gramos y confirmación de impresión total o parcial mediante slider.
19. **Parser tolerante de Anycubic Slicer Next y OrcaSlicer:**
    - Lectura de archivos ocultos temporales `.<pid>.<k>.gcode.metadata` y escaneo seguro de 64 KB en cabecera y cola para `.gcode` completos.
    - Decodificación y persistencia local de miniaturas PNG en `%APPDATA%\Filoteca\thumbnails\`, servidas a través del esquema seguro `filoteca-media://`.
    - Prevención de colisiones con macros de plantillas (ej. `filename_format = {filament_type}...`) mediante coincidencia estricta al inicio de línea.
    - Cálculo de gramos por fórmula volumétrica de respaldo ($m = \frac{\pi \cdot (d/2)^2 \cdot L \cdot \rho}{1000}$) si el archivo omite el peso directo.
20. **Algoritmo de correspondencia colorimétrica CIELAB (CIE76):**
    - Conversión sRGB $\to$ CIE $XYZ$ $\to$ CIELAB ($L^*a^*b^*$).
    - Distancia perceptual $\Delta E_{76} = \sqrt{(\Delta L^*)^2 + (\Delta a^*)^2 + (\Delta b^*)^2}$.
    - Cascada de coincidencia: 1º Mapeo recordado de sesiones previas (`slotMapping`), 2º Marca y material exactos, 3º Acabado de superficie, 4º Menor distancia perceptual $\Delta E$, 5º Bobina marcada "en uso", 6º Stock suficiente ($> \text{gramos requeridos}$).
21. **Vigilante en tiempo real y Modo Compañero (Companion Mode):**
    - Observador recursivo en `%LOCALAPPDATA%\Temp\anycubicslicer_model\` con soporte para archivos con prefijo punto (`.pid.k.gcode*`).
    - Detección no invasiva del proceso `AnycubicSlicerNext.exe` (sondeo de 2.5s vía `tasklist`).
    - Apertura en segundo plano sin robar foco (`win.showInactive()`) mientras se lamina.
    - Modal de cierre de sesión al terminar de usar el slicer: "¿Qué imprimiste en esta sesión?" con confirmación en lote.

## Análisis de Viabilidad Fase 2: Conectividad Directa LAN Anycubic Kobra X (MQTT / FTP)
22. **Arquitectura de red de la Anycubic Kobra X (Anycubic OS / Kobra OS):**
    - **Modo Nube (Cloud):** La impresora utiliza túneles MQTT/WSS autenticados contra servidores de Anycubic Cloud con payloads JSON cifrados por tokens de sesión propietarios.
    - **Modo LAN (Local Area Network):** Al activar "Modo LAN" en la pantalla táctil de la Kobra X, la impresora habilita servicios locales accesibles dentro de la subred Wi-Fi/Ethernet doméstica o de taller:
      1. **Broker MQTT Local (Puerto 8883 / 1883):** Emite tópicos de telemetría de estado (`kobra/status`, `printer/state`, `job/progress`). Publica temperaturas de boquilla/cama, porcentaje de progreso (`progress_percent`), capa actual y eventos de ciclo de vida (`idle`, `printing`, `paused`, `finished`, `stopped`).
      2. **Servidor FTP / WebDAV Local (Puerto 21 / 8080):** Permite listar archivos `.gcode` almacenados en la memoria eMMC local o unidad USB montada y descargar metadatos directos.
23. **Estrategia de integración para Fase 2 en Filoteca:**
    - **Suscripción pasiva a telemetría:** Filoteca incorporará un cliente MQTT ligero (`mqtt` en Node.js) que se conectará a la IP de la Kobra X ingresada en Ajustes.
    - **Confirmación automática precisa:** Al detectar el estado `finished` (o `stopped` con porcentaje intermedio), Filoteca asociará el archivo G-code en ejecución con la bandeja de laminados y preseleccionará automáticamente el porcentaje real impreso para descuento sin margen de error.
    - **100% Local y Seguro:** Sin credenciales de la nube de Anycubic, sin fugas de datos y manteniendo la privacidad total en el taller.

## Iteración 2.1: Bobina Honeycomb Pulida, Detección de Color Real y Filtrado de Placas Dummy
50. **Bobina 3D Honeycomb (Panal) de Alto Contraste:**
    - Geometría procedural inspirada en bobinas reutilizables ligeras tipo Bambu Lab (`media_1791245263852.png`).
    - Celosía de 78 celdas hexagonales regulares con bisel de doble segmento entre $r_{\text{in}} = 0.455$ y $r_{\text{out}} = 0.945$.
    - Buje central sólido de radio $R_{\text{hub}} = 0.44$ con orificio de eje $R_{\text{hole}} = 0.15$ que abraza limpiamente el núcleo de cartón kraft ($R_{\text{core}} = 0.40$).
    - Pestañas sólidas para placa de etiqueta superior y clips de filamento inferiores.
    - Material PBR gris titanio técnico (`#4c5460`, rugosidad 0.32, metalness 0.16, clearcoat 0.65) e iluminación de 5 puntos con rim light superior, logrando máximo contraste sobre fondo grafito/nocturno.
51. **Detección de Color Real en Anycubic Slicer (`filament_colour_info`):**
    - Corrección en la expresión regular del parser para no solapar `filament_colour =` con `filament_colour_info =`.
    - Cuando una ranura activa reporta placeholder `#FFFFFFFF` (blanco por omisión en perfiles multimaterial), el parser resuelve el color desde `filament_colour_info = #3E55AB` (Azul) o `extruder_colour`.
    - Auto-asignación inmediata de la bobina física azul en el inventario, eliminando la falsa bandera de "Ranura sin color".
    - Interfaz con selector de color interactivo (`<input type="color">`), código HEX editable y botón de restauración.
52. **Eliminación de Placas Dummy y Caché `.3mf`:**
    - El vigilante de la carpeta temporal `%TEMP%\anycubicslicer_model\` ignora archivos `.3mf` de proyecto.
    - Cualquier entrada con 0 capas, 0 segundos y sin miniatura retorna `null`, evitando que aparezca la placa genérica ("Placa 1, 25g, 0 min") y mostrando únicamente la placa real con su miniatura 3D.

