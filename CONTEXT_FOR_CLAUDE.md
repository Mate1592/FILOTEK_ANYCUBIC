# Contexto del Proyecto: Filoteca · Taller 3D
> Documento de traspaso y briefing técnico para Claude (u otro agente de IA).
> Última actualización: 2026-10-05.

---

## 1. Visión y Propósito
**Filoteca · Taller 3D** es una aplicación de escritorio para Windows (distribuida como ejecutable portable `.exe` y con instalador NSIS) orientada a la gestión de inventario de filamentos para impresión 3D en talleres reales.
- **Estética:** Taller técnico profesional, tema oscuro refinado (grafito/carbón) con acento verde lima "boquilla caliente" (`#b9ec4a`), soporte de modo claro y oscuro, tipografía técnica monoespaciada (`JetBrains Mono`, `Bricolage Grotesque`, `Inter`).
- **Moneda:** Pesos colombianos (COP), formateado como `$ 89.900` sin decimales innecesarios.
- **100% Offline:** Base de datos SQLite local en WebAssembly (`sql.js`) guardada en `%APPDATA%/filoteca/filoteca.db`, con respaldo y restauración de datos en 1 clic.

---

## 2. Stack Tecnológico
- **Runtime:** Electron 44 (Node 24 portable en `$env:LOCALAPPDATA\devtools\node-v24.21.0-win-x64`).
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Motion (`motion/react` / Framer Motion), Lucide React.
- **Motor 3D:** Three.js con arquitectura de **1 solo Canvas WebGL compartido** (`SpoolViewerManager.ts`) usando *scissor testing* para renderizar cientos de bobinas a 60 fps sin agotar contextos WebGL. Canvas interactivo independiente con inercia para modales de detalle (`InteractiveSpool3D.tsx`).
- **Base de Datos:** SQLite local vía `sql.js` (WebAssembly, sin compiladores C++ nativos requeridos).
- **Laminador / Companion:** Parser automático de metadatos de Anycubic Slicer Next (`.gcode.metadata`) con reconocimiento de placas, cálculo volumétrico de respaldo, descarte de dummies `.3mf` y algoritmo de coincidencia de color CIELAB $\Delta E$.

---

## 3. Estado Actual de las Mejoras y Decisiones Clave

### A. Bobinas 3D Paramétricas (Geometría y Materiales)
- **Archivos:** [`src/components/spool3d/geometries.ts`](./src/components/spool3d/geometries.ts), [`src/components/spool3d/materials.ts`](./src/components/spool3d/materials.ts), [`src/components/spool3d/SpoolViewerManager.ts`](./src/components/spool3d/SpoolViewerManager.ts).
- **Celosía Hexagonal (Honeycomb):** Reducido el buje central a `0.21` (solo un collar fino alrededor del eje de `0.15`), borde exterior reducido a `0.024`, eliminadas pestañas que tapaban el panal. Dispone de **144 alvéolos hexagonales abiertos** con paredes ultrafinas (`0.007`) y ~88% de área abierta.
- **Profundidad de Núcleo:** En el centro se aprecia el cilindro de cartón kraft marrón cálido (`#c68b50`) a través del panal central.
- **Radio no lineal del filamento:** El filamento restante se modela por volumen real: $R = \sqrt{r_{\text{núcleo}}^2 + f \cdot (R_{\text{lleno}}^2 - r_{\text{núcleo}}^2)}$.
- **Modo Oscuro con Color Radiante:** Para evitar que los filamentos se oscurezcan sobre fondo negro, los materiales PBR incorporan un tinte `emissive` sutil proporcional al color real y se incrementó la luz ambiental (`1.8`) y frontal (`1.3`). Colores como Azul cobalto, Rosa chicle, Rojo lava, Blanco y Oro irradian vivos, y Negro carbón captura reflejos especulares de las espiras.

### B. Lógica Inteligente de Respaldo de Stock (`hasBackupStock`)
- **Archivos:** [`src/lib/roll.ts`](./src/lib/roll.ts), [`src/components/shelf/ShelfView.tsx`](./src/components/shelf/ShelfView.tsx), [`src/components/spool/SpoolCard.tsx`](./src/components/spool/SpoolCard.tsx), [`src/components/shopping/ShoppingView.tsx`](./src/components/shopping/ShoppingView.tsx).
- **Problema resuelto:** Si un rollo tiene 40g (4%), pero en el taller hay otro rollo nuevo de 1000g del mismo material y color, no hay desabastecimiento.
- **Comportamiento:**
  - `hasBackupStock(roll, rolls, settings)` valida si otro rollo del mismo material y color tiene $\ge 150$g y supera el umbral de stock saludable.
  - El botón superior **"Bajo stock"** en la estantería no cuenta los rollos suplidos (marca `0` en vez de falsas alarmas).
  - La tarjeta muestra una insignia tranquila: **`4% · Respaldado`** con checkmark verde (`CheckCircle2`). El aro medidor y el carrete 3D no emiten alarmas de pánico.
  - La lista de compras no sugiere reordenar materiales ya respaldados.

### C. Menú Desplegable (3 puntos) en las Tarjetas
- **Archivo:** [`src/components/spool/SpoolCard.tsx`](./src/components/spool/SpoolCard.tsx).
- **Solución al bug de oclusión:** El menú usa `createPortal` montado a `document.body` con posición fija y `z-index: 99999`, superando el contexto WebGL fijado (`z-index: 1`). Se eliminó el cierre prematuro en `handleMouseLeave`.

### D. Fabricantes Anycubic y Sunlu
- Añadidos como opciones prioritarias en `RollEditorModal.tsx` con botones de selección rápida a un clic (`[ Anycubic ]`, `[ Sunlu ]`, etc.), tiendas oficiales configuradas y presencia en los datos de inicio (`seed.ts`).

### E. Empaquetado Rápido del Ejecutable Portable
- **Archivo:** [`package.json`](./package.json).
- Con `"compression": "store"` y `"npmRebuild": false`, el ejecutable portable (`release/Filoteca-Portable-1.0.0.exe`) se genera en apenas **40 segundos** (evitando los 4.5 minutos que tardaba la compresión LZMA ultra de 7-Zip).

### F. Optimización Extrema de GPU y CPU (Caída a ~0% en Reposo y 30 FPS en Animación)
- **Archivos:** [`src/components/spool3d/SpoolViewerManager.ts`](./src/components/spool3d/SpoolViewerManager.ts), [`src/components/spool3d/InteractiveSpool3D.tsx`](./src/components/spool3d/InteractiveSpool3D.tsx), [`src/components/spool3d/geometries.ts`](./src/components/spool3d/geometries.ts), [`src/components/spool3d/materials.ts`](./src/components/spool3d/materials.ts), [`src/components/spool/SpoolCard.tsx`](./src/components/spool/SpoolCard.tsx).
- **Problema previo:**
  1. En reposo, la GPU se saturaba al **98.9% - 100%** de forma permanente por un bucle `requestAnimationFrame` incondicional a 60 fps y `transmission: 0.65`.
  2. En hover, en pantallas de **144Hz / 120Hz**, `requestAnimationFrame` corría a 144 fps, disparando el uso de GPU. Además, `handleMouseMove` en `SpoolCard.tsx` ejecutaba `setTiltAngles` (estado de React) en cada micro-evento de ratón (hasta 1000Hz con ratones gaming), provocando cientos de re-renders de React por segundo y elevando la CPU al 40%.
  3. Los discos laterales con panal tenían bisel (`bevelEnabled: true`), generando más de 76.000 vértices por bobina.
- **Solución implementada:**
  1. **Render Bajo Demanda:** En reposo, rAF se detiene por completo (`0 draws/s`, `0.0 rAF/s`, GPU en reposo absoluto).
  2. **Límite de Animación a 30 FPS (`TARGET_ANIM_FPS = 30`):** Tanto el giro en hover de `SpoolViewerManager` como la interacción en `InteractiveSpool3D` se limitan a ~30 fps (`MIN_FRAME_INTERVAL_MS = 33.3ms`), reduciendo los draws/s en hover de 545 a 125 (reducción del 77%), independientemente de si la pantalla es de 144Hz o 240Hz.
  3. **Bypass de Re-renders de React en Movimiento de Ratón:** En `SpoolCard.tsx`, se eliminó el estado `useState` de `tiltAngles`. El evento `handleMouseMove` está throttled a 30ms y actualiza directamente `spoolViewer.updateItem` sin re-renderizar React (0 renders durante el movimiento del cursor, CPU cae a <2%).
  4. **Optimización de Geometría Hexagonal:** `bevelEnabled: false` en la extrusión del panal redujo los vértices de 38.016 a 13.248 por disco (reducción del 65% de polígonos), viéndose más nítido y limpio.
  5. **Materiales Ligeros:** Reemplazado `transmission: 0.65` por `transparent: true, opacity: 0.78, clearcoat: 0.8`.
  6. **Capping de DPR a 1.5:** Previene sobrecargas en pantallas 4K/retina con multiplicadores excesivos.
  7. **Script de Verificación:** [`scripts/perf-gpu.mjs`](./scripts/perf-gpu.mjs) audita draws/s, rAF/s y uso de GPU de Windows vía contadores de rendimiento.

---

## 4. Estructura de Carpetas Principal
```text
FILAMENTO/
├── electron/
│   ├── main.ts              # Proceso principal de Electron, IPC, ventanas
│   ├── preload.ts           # Context bridge seguro
│   └── watcher.ts           # Vigilante de archivos temporales de Anycubic Slicer
├── src/
│   ├── components/
│   │   ├── gcode/           # Modales de laminados detectados y bandeja
│   │   ├── layout/          # TitleBar, Toasts, navegación
│   │   ├── replenishment/   # Módulo predictivo de reabastecimiento
│   │   ├── settings/        # Ajustes de taller, moneda, slicer
│   │   ├── shelf/           # ShelfView (estantería principal con filtros y búsqueda)
│   │   ├── shopping/        # ShoppingView (lista de compras y sugerencias)
│   │   ├── spool/           # SpoolCard, Spool 2D SVG, GaugeRing, RollEditorModal
│   │   ├── spool3d/         # geometries.ts, materials.ts, SpoolViewerManager.ts, SpoolObject.ts
│   │   └── stats/           # Gráficos de consumo, treemap, donuts
│   ├── lib/
│   │   ├── gcodeParser.ts   # Parser de metadatos de Anycubic Slicer y CIELAB ΔE
│   │   ├── replenishment.ts # Agrupamiento por producto y cálculo de consumo
│   │   ├── roll.ts          # Cálculos de peso, stockLevel, hasBackupStock, COP
│   │   └── seed.ts          # Datos iniciales realistas con Anycubic, Sunlu, etc.
│   └── store/
│       └── useStore.ts      # Zustand con persistencia SQLite/localStorage
├── release/
│   └── Filoteca-Portable-1.0.0.exe  # Ejecutable portable Windows generado
├── scripts/
│   ├── test-gcode-advanced.mjs      # Suite de 11 tests unitarios de G-code y color
│   └── smoke.mjs                    # Smoke test con Playwright Electron y capturas
└── package.json
```

---

## 5. Comandos de Terminal (PowerShell en Windows)
Para ejecutar comandos en este entorno, siempre anteponer la ruta de Node portátil si no está en PATH global:
```powershell
$env:Path = "$env:LOCALAPPDATA\devtools\node-v24.21.0-win-x64;" + $env:Path
```

- **Compilar proyecto (Typecheck + Vite + Electron):**
  ```powershell
  npm run build
  ```
- **Correr suite de pruebas de G-code y CIELAB (11/11 tests):**
  ```powershell
  npm run test:gcode
  ```
- **Correr smoke test con capturas de pantalla:**
  ```powershell
  npm run smoke
  ```
- **Generar ejecutable portable (.exe):**
  ```powershell
  npm run dist:portable
  ```
- **Iniciar en modo desarrollo:**
  ```powershell
  npm run dev
  ```

---

## 6. Estado de los Tests y Verificación
- **TypeScript:** 0 errores (`tsc --noEmit`).
- **G-code Unit Tests:** 11/11 pruebas pasando (detección de color Anycubic Slicer, CIELAB $\Delta E$, fallback volumétrico, descarte de dummies `.3mf`).
- **Lógica de stock suplido:** Verificada (`r1 hasBackup with r2: true`).
- **Capturas visuales:** Almacenadas en `screenshots/` (`dropdown-menu-fixed.png`, `shelf-3d-nocturno.png`, `reabastecimiento.png`, etc.).
- **Ejecutable:** Generado y verificado en `release/Filoteca-Portable-1.0.0.exe`.
