# Filoteca 🧵

> **Inventario de filamento para impresión 3D** — Aplicación de escritorio moderna, fluida y 100% offline para Windows con renderizado procedural 3D, soporte nativo de pesos colombianos (COP), previsión de reabastecimiento e ingesta automática para Anycubic Slicer Next 2.0+ (Kobra X) y OrcaSlicer.

Filoteca no es un CRUD genérico: está diseñada con la estética y el ritmo de un taller maker profesional (inspirada en la precisión y fluidez de herramientas como Linear y Raycast). Cada rollo se representa visualmente con un modelo paramétrico 3D en vista tres cuartos que refleja el color real, los acabados del material (mate, brillante, seda, translúcido, glitter) y el radio exacto de filamento restante calculado por volumen, acompañado de un anillo radial de uso estilo disco de almacenamiento.

---

## ✨ Características Principales

### 1. Bobinas 3D Procedurales en Tres Cuartos (Three.js PBR)
- **Geometría procedural nativa:** Discos laterales con radios y perforaciones circulares, núcleo de cartón kraft y cilindro de filamento enrollado con textura de vueltas finas.
- **Conservación física de volumen:** El radio del filamento restante responde a la física real del devanado:
  $$R = \sqrt{r_{\text{núcleo}}^2 + f \cdot (R_{\text{lleno}}^2 - r_{\text{núcleo}}^2)}$$
  donde $f = \frac{\text{peso restante}}{\text{peso inicial}}$. Un rollo al 33% luce como un tercio volumétrico auténtico; un rollo agotado muestra el carrete vacío.
- **Materiales PBR realistas:** Presets específicos para cada acabado:
  - *Mate:* Alta rugosidad y dispersión suave.
  - *Brillante:* Capa transparente de barniz (*clearcoat* reflectante).
  - *Seda:* Anisotropía y brillo nacarado (*sheen*).
  - *Translúcido:* Transmisión de luz física y profundidad óptica.
  - *Glitter:* Escintilación y destellos metálicos procedurales generados por ruido.
- **Interacción táctil y física:** Tilt que sigue el cursor en la estantería, resorte elástico al hacer hover y rotación libre 360° con inercia mediante arrastre en el panel de detalle.
- **Rendimiento optimizado y fallback:** Render bajo demanda con WebGL compartido, pausa fuera de pantalla, respeto de `prefers-reduced-motion` y fallback automático en SVG ultrarrápido para entornos sin aceleración por hardware.

### 2. Moneda Local y Costes: Pesos Colombianos (COP)
- **Formateo estándar colombiano:** Todos los importes se muestran en COP sin decimales (`$ 89.900`) mediante `Intl.NumberFormat('es-CO')`.
- **Costo unitario por gramo:** Indicador de precisión con un decimal (`$ 89,9/g`).
- **Entrada flexible:** Los campos numéricos aceptan indistintamente `"89900"` y `"89.900"`.
- **Catálogo de demostración:** Precios realistas para bobinas de 1 kg en el mercado colombiano ($ 65.000 a $ 160.000 COP). Moneda configurable en Ajustes.

### 3. Previsión Inteligente de Reabastecimiento
- **Ventana móvil de 30 días:** Estimación del ritmo de consumo real por bobina y por material.
- **Umbral de seguridad y días de entrega:** Margen configurable de entrega de pedidos (lead time) más reserva de seguridad.
- **Priorización automática:**
  - 🔴 **Crítica:** El stock se agotará antes de que un pedido nuevo pueda llegar al taller.
  - 🟡 **Próxima:** El stock caerá por debajo del umbral de seguridad en los próximos 7 a 14 días.
  - 🟢 **Planificada:** Stock suficiente para producción continua.
- **Acción directa:** Botón de un clic para añadir bobinas en riesgo directamente a la lista de compras del taller.

### 4. Ingesta Automática de Anycubic Slicer Next y OrcaSlicer
- **Filosofía "Slicing ≠ Printing":** Laminar no es imprimir. Filoteca **nunca** descuenta filamento de manera silenciosa ni asume que un archivo laminado fue enviado o completado con éxito.
- **Ingesta no invasiva:** Notificación silenciosa mediante una insignia reactiva en la barra de título (`Bandeja (N)`).
- **Vigilante en tiempo real de temporales:** Escucha activa y recursiva de `%LOCALAPPDATA%\Temp\anycubicslicer_model\` detectando archivos ocultos con prefijo punto (`.*.gcode*` y `.*.gcode.metadata`). Escaneo automático de sesiones recientes al iniciar la aplicación.
- **Parser tolerante de metadatos:**
  - Extrae miniaturas PNG embebidas (260×260 px) y las almacena localmente en `%APPDATA%\Filoteca\thumbnails\`, sirviéndolas con el protocolo seguro `filoteca-media://`.
  - Lee pesos reales por slot, tiempo estimado de impresión, capas, modelo de impresora (Kobra X / Anycubic Multi-Color) y metadatos de filamento.
  - Fórmula de respaldo volumétrico si faltan los gramos explícitos ($m = \frac{\pi (d/2)^2 L \rho}{1000}$).
- **Emparejamiento colorimétrico CIELAB (CIE76):**
  - Transforma colores sRGB del slicer a espacio perceptual $L^*a^*b^*$.
  - Calcula la distancia $\Delta E_{76} = \sqrt{(\Delta L^*)^2 + (\Delta a^*)^2 + (\Delta b^*)^2}$.
  - Selecciona la mejor bobina del inventario priorizando: mapeos recordados de impresiones previas > concordancia de marca/material > acabado > menor $\Delta E$ > bobina en uso > stock suficiente.
- **Bandeja de laminados dedicada:**
  - Vista visual con miniaturas renderizadas, advertencias de discrepancia (material o color diferente al configurado en el laminador).
  - Selector desplegable para asociar o cambiar la bobina de cada slot.
  - Ajuste manual de gramos consumidos por slot.
  - Acciones rápidas: *"Lo imprimí"* (descuenta y archiva), *"Impresión parcial / fallida"* (modal con deslizador de porcentaje impreso real) y *"No lo imprimí / Descartar"*.
  - Agrupación por sesión (`sessionKey`) y barra de herramientas de selección múltiple por lotes.
- **Modo Compañero (Companion Mode):**
  - Monitorea el proceso de Windows `AnycubicSlicerNext.exe` de forma ligera (sondeo cada 2.5s con `tasklist`).
  - Al detectar un nuevo laminado, abre o muestra Filoteca en segundo plano sin robar el foco (`win.showInactive()`).
  - Al cerrarse el laminador, Filoteca emerge con el modal interactivo: *"¿Qué imprimiste en esta sesión?"* para confirmar o descartar en segundos.
  - Detector de estado en vivo del proceso en la pantalla de Ajustes.

---

## 🛠️ Tecnologías y Arquitectura

- **Proceso Principal:** Electron 44 + TypeScript, SQLite WASM (`sql.js`), gestión de ventana e IPC tipado con protocolo personalizado `filoteca-media://`.
- **Frontend / Renderer:** React 19 + TypeScript + Vite 8.
- **Gráficos 3D:** Three.js procedural (geometría paramétrica, materiales PBR, mapas de normales y reflejos).
- **Estilos y Tokens:** Tailwind CSS v4, `@fontsource-variable` (Bricolage Grotesque, Inter, JetBrains Mono).
- **Animaciones y Física:** Motion (Framer Motion) a 60 fps (resortes elásticos, layout animations y microinteracciones).
- **Geometría de Gráficos:** D3 Shape y D3 Hierarchy para donuts interactivos y treemaps.
- **Empaquetado:** `electron-builder` para instalador NSIS y ejecutable portable `.exe`.

---

## 🚀 Requisitos e Instalación

### Requisitos previos:
- Windows 10 u 11 (64-bit).
- Node.js LTS (v18, v20, v22 o v24).

### Instalación de dependencias:
```powershell
npm install
```

### Modo de desarrollo:
Para iniciar el servidor Vite con Hot Module Replacement (HMR) y la ventana de Electron simultáneamente:
```powershell
npm run dev
```

---

## 📦 Ejecutables Disponibles (.exe)

Los binarios compilados y verificados se encuentran en la carpeta `release/`:

1. **`release\Filoteca-Portable-1.0.0.exe`**:
   - **Ejecutable portable 100% independiente (~105 MB).**
   - No requiere privilegios de administrador ni instalación en el sistema.
   - Ideal para llevar en una memoria USB o ejecutar directamente en la estación de trabajo junto a la impresora 3D.
2. **`release\Filoteca Setup 1.0.0.exe`**:
   - Instalador estándar NSIS para Windows con acceso directo en el escritorio y menú inicio.
3. **`release\win-unpacked\Filoteca.exe`**:
   - Carpeta desempaquetada lista para ejecución instantánea sin descompresión.

### Compilación desde código fuente:
Para volver a generar los binarios en cualquier momento:
```powershell
# Compilar versión portable:
npm run dist:portable

# Compilar instalador completo NSIS:
npm run dist

# O utilizando el script de compilación en un paso:
.\build-windows.ps1
```

---

## 🧪 Pruebas y Verificación Automatizada

### 1. Suite de Pruebas Unitarias de Ingesta G-code (7 Fixtures)
Prueba la tolerancia del parser ante todos los casos borde de Anycubic Slicer Next y OrcaSlicer:
```powershell
npx tsx scripts/test-gcode-advanced.mjs
```
Casos cubiertos y verificados (100% aprobados):
- `multicolor_real.metadata`: Archivo multicolor real Kobra X (extracción de miniaturas, slots, ams_info, capas).
- `single_color_real.metadata`: Archivo monocolor estándar con coincidencias exactas.
- `non_consecutive_slots.metadata`: Slots no consecutivos (ej. ranuras 1 y 4 activas, 2 y 3 vacías).
- `mismatched_lengths.metadata`: Arrays de color y material con longitudes asimétricas (marca advertencia de revisión manual).
- `missing_grams_fallback.metadata`: Archivos sin peso declarado (cálculo volumétrico por densidad y diámetro).
- `corrupt_thumbnail.metadata`: Bloque de miniatura corrupto o base64 inválido (gestión segura sin romper el parseo).
- `dot_filename_plate.metadata`: Archivos temporales ocultos (`.21552.58.gcode.metadata`).

### 2. Smoke Test E2E Completo con Playwright
Prueba la aplicación real montada en Electron con base de datos aislada y capturas de pantalla de verificación:
```powershell
npm run smoke
```

---

## 📁 Estructura del Proyecto

```
FILAMENTO/
├── .github/workflows/       # Workflow de GitHub Actions para compilación en la nube
├── electron/
│   ├── db.ts                # Capa SQLite WASM con transacciones y flush atómico
│   ├── gcode.ts             # Parser de bajo nivel en streaming (64 KB) y guardado de thumbnails
│   ├── main.ts              # Proceso principal, protocolo filoteca-media, watcher y Companion Mode
│   ├── preload.ts           # Puente seguro contextBridge hacia window.filoteca
│   └── tsconfig.json        # Configuración TypeScript de Electron
├── src/
│   ├── components/
│   │   ├── gcode/           # Cajón rápido de laminados pendientes
│   │   ├── inbox/           # Bandeja de laminados completa y modal Companion Mode
│   │   ├── layout/          # TitleBar con badge reactivo, navegación y toasts
│   │   ├── settings/        # Configuración de moneda, tema, backup y detector de slicer
│   │   ├── shelf/           # Estantería de bobinas con filtros reactivos y vista 3D
│   │   ├── shopping/        # Lista de compras y sugerencias automáticas
│   │   ├── spool/           # Bobinas 3D (Three.js PBR), Spool SVG, GaugeRing y modales
│   │   └── stats/           # Donut charts globales, Treemap, consumo y previsión
│   ├── lib/
│   │   ├── colorMath.ts     # Conversión sRGB -> CIELAB y algoritmo CIE76 Delta E
│   │   ├── gcodeParser.ts   # Parser de metadatos con soporte Orca y Anycubic Slicer Next
│   │   ├── motion.ts        # Tokens y curvas de animación elástica
│   │   ├── roll.ts          # Cálculos de stock, colorimetría y formateo COP
│   │   └── seed.ts          # Rollos de demostración con precios realistas en COP
│   ├── shared/
│   │   └── types.ts         # Tipos compartidos: Roll, GcodeJob, CompanionSettings, etc.
│   ├── store/
│   │   └── useStore.ts      # Estado global reactivo Zustand con persistencia y lógica de ingesta
│   ├── App.tsx              # Componente raíz y control de atajos de teclado
│   ├── index.css            # Tokens de diseño, temas claro/oscuro y variables CSS
│   └── main.tsx             # Punto de entrada de React con tipografías empaquetadas
├── test-fixtures/           # 7 fixtures de prueba para laminadores reales y casos borde
├── scripts/
│   ├── dev.mjs              # Orquestador de desarrollo Vite + Electron
│   ├── gen-icons.mjs        # Generador de iconos .png y .ico
│   ├── test-gcode-advanced.mjs # Suite de pruebas unitarias de metadatos G-code
│   └── smoke.mjs            # Prueba de humo automatizada E2E con Playwright
├── release/
│   └── Filoteca-Portable-1.0.0.exe # Binario portable verificado listo para usar
├── build-windows.ps1        # Script PowerShell de compilación en un paso
├── build-windows.bat        # Script Batch de compilación en un paso
├── DECISIONS.md             # Decisiones de diseño, arquitectura y viabilidad LAN Fase 2
└── package.json
```
