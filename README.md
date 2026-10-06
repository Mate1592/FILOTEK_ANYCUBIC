# Filoteca 🧵

![Windows Portable](https://img.shields.io/badge/Windows-Portable-0078D6?style=flat-square&logo=windows)
![Electron 44](https://img.shields.io/badge/Electron-44-47848F?style=flat-square&logo=electron)
![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript)
![100% Offline](https://img.shields.io/badge/100%25-Offline-4CAF50?style=flat-square)
![SQLite WASM](https://img.shields.io/badge/SQLite-WASM-003B57?style=flat-square&logo=sqlite)

> **Inventario de filamento para impresión 3D** — Aplicación de escritorio moderna, fluida y 100% offline para Windows con renderizado procedural 3D, soporte nativo de pesos colombianos (COP), previsión de reabastecimiento e ingesta automática para Anycubic Slicer Next 2.0+ (Kobra X) y OrcaSlicer.

Filoteca no es un CRUD genérico: está diseñada con la estética y el ritmo de un taller maker profesional (inspirada en la precisión y fluidez de herramientas como Linear y Raycast). Cada rollo se representa visualmente con un modelo paramétrico 3D en vista tres cuartos que refleja el color real, los acabados del material (mate, brillante, seda, translúcido, glitter) y el radio exacto de filamento restante calculado por volumen, acompañado de un anillo radial de uso estilo disco de almacenamiento.

---

## ✨ Características Principales

1. **Visualizador 3D Paramétrico de Bobinas:** Celosía hexagonal (panal Bambu/MasterSpool) con renderizado bajo demanda optimizado a 30 FPS (0% de consumo de GPU en reposo). Conservación física de volumen del filamento restante, y materiales PBR realistas para cada acabado.
2. **Companion de Laminador Anycubic:** Detección automática de `.gcode.metadata`, descarte de temporales `.3mf`, reconocimiento de placas y cálculo volumétrico de respaldo. Filosofía *"Slicing ≠ Printing"*, con ingesta no invasiva.
3. **Lógica Inteligente de Stock (`hasBackupStock`):** Si una bobina está baja pero existe un rollo nuevo del mismo material y color, no lanza falsas alertas.
4. **100% Offline y Privado:** Base de datos SQLite local en WebAssembly (`sql.js`), garantizando rendimiento y privacidad de tus datos sin depender de la nube.
5. **Moneda Local:** Formateado nativo en Pesos Colombianos (COP), con cálculo inteligente de costo por gramo y soporte para diferentes tipos de entrada.

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

## 📥 Descarga e Instalación

### Versión Portable y Ejecutable (¡Recomendado!)
1. Ve a la pestaña **[Releases](https://github.com/Mate1592/filament/releases)** del repositorio en GitHub.
2. Descarga el archivo `.exe` más reciente (por ejemplo, `Filoteca-Portable-1.0.0.exe`).
3. ¡Listo! Puedes ejecutarlo directamente (100% independiente, no requiere privilegios de administrador ni instalación en el sistema) o utilizar el instalador NSIS si prefieres integrarlo en el menú de inicio.

---

## 🧑‍💻 Guía Rápida para Desarrolladores

Si prefieres compilar la aplicación desde el código fuente o contribuir al proyecto:

### Requisitos previos:
- Windows 10 u 11 (64-bit).
- Node.js LTS (v18, v20, v22 o v24).

### Instalación de dependencias:
```powershell
npm install
```

### Comandos Clave:
- **`npm run dev`**: Inicia el servidor de Vite con HMR y la ventana de Electron en modo de desarrollo.
- **`npm run build`**: Compila todo el frontend (Vite) y el proceso principal (TypeScript de Electron).
- **`npm run test:gcode`**: Ejecuta la suite de pruebas unitarias del parser de metadatos de G-code y colorimetría.
- **`npm run typecheck`**: Verifica los tipos en todo el proyecto TypeScript.

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
