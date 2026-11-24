# Filoteca — Plan de Mejoras Futuras (`v2.1+`)

Este documento recoge las mejoras técnicas priorizadas para futuras versiones de **Filoteca** (desarrollada por **TermuxX solutions**, 100% offline para Windows), tomando como base directa la arquitectura actual de la versión `2.0.0`.

---

## Matriz de Prioridades

| Prioridad | Versión objetivo | Iniciativa | Módulo / Base en el código | Impacto esperado |
|---|---|---|---|---|
| **P0** | `v2.1.0` | Paridad tri-lingüe (`ES`/`EN`/`PT`) completa en todas las vistas y proceso principal | `src/lib/i18n.ts`, vistas heredadas, `src/lib/roll.ts`, `src/lib/gcodeParser.ts`, `electron/main.ts` | Elimina textos mixtos para talleres en inglés y portugués; localización completa de fechas y menús de bandeja. |
| **P0** | `v2.1.0` | Historial persistente de cotizaciones y analítica de rentabilidad | `electron/db.ts` (`SCHEMA_VERSION = 3`), `src/lib/printCalculator.ts`, `QuoteCalculatorTool.tsx`, `StatsView.tsx` | Convierte los cálculos efímeros en un registro histórico offline de ingresos, costos y margen real por proyecto. |
| **P1** | `v2.1.0` | Sincronización física de ranuras AMS / ACE Pro (`slotRollMappings`) | `Settings.slotRollMappings` (`src/shared/types.ts`), `src/lib/colorMath.ts`, `ShelfView.tsx`, `useStore.ts` | Evita reasignar manualmente carretes en `InboxView` cuando las bobinas permanecen cargadas en un cambiador multicolor. |
| **P1** | `v2.1.0` | Etiquetas QR / Código de barras offline y perfiles de tara personalizados | `src/lib/filamentMath.ts` (`SPOOL_TARE_PRESETS`), `Settings`, `RollDetailModal.tsx`, `file:saveTextFile` | Permite escanear bobinas con lector USB e incorporar taras personalizadas por marca/fabricante en inventario. |
| **P1** | `v2.2.0` | Registro de flota de impresoras y contadores de mantenimiento | `GcodeJob` (`printerModel`, `nozzleDiameter`, `printTimeSeconds`), `UsageEntry`, `useStore.ts`, `electron/db.ts` | Lleva control de horas impresas y gramos abrasivos (`PLA-CF`, `Nylon`) para alertar desgaste de boquilla, PTFE y correas. |
| **P2** | `v2.2.0` | Telemetría opcional en red local (LAN) para Klipper/Moonraker y Anycubic | `electron/main.ts` (ampliación opcional de vigilancia local), `InboxView.tsx` | Automatiza la ingesta de impresiones completadas desde tarjeta SD, USB o interfaz web local sin depender de servidores en la nube. |
| **P2** | `v2.3.0` | Copias de seguridad cifradas y sincronización local entre PCs del taller | `FilotecaDb.backupTo()` / `restoreFrom()`, `ExportBundle` v2, `electron/main.ts` (`crypto`) | Protege datos de precios y clientes en memorias USB y permite sincronizar inventario en LAN manteniendo operación 100% offline. |

---

## Detalle de Propuestas

### 1. Paridad Tri-lingüe (`ES` / `EN` / `PT`) Completa (`P0` · `v2.1.0`)
- **Estado actual**: `src/lib/i18n.ts` ya gestiona `TitleBar`, `OnboardingModal`, `ToolsView` y las secciones nuevas de `SettingsView` en español, inglés y portugués. Sin embargo, vistas heredadas (`StatsView.tsx`, `ReplenishmentView.tsx`, `ShoppingView.tsx`, `InboxView.tsx`, `CompanionPromptModal.tsx`, `RollDetailModal.tsx`, `RollEditorModal.tsx`, `QuickUseModal.tsx`, `ShelfView.tsx` y secciones legacy de `SettingsView.tsx`), así como etiquetas en `src/lib/roll.ts` (`LEVEL_LABEL`, `STATUS_LABEL`, `FINISH_LABEL`, `fmtDate`, `fmtRelative`), `src/lib/gcodeParser.ts` (`formatPrintTime`, `formatJobName`) y cadenas del menú contextual de bandeja en `electron/main.ts`, conservan texto estático en español.
- **Propuesta**: Migrar todas las cadenas visibles a `useI18n()` / `t(key, lang, vars)` y pasar `settings.language` al proceso principal mediante IPC para traducir notificaciones nativas y menú de tray.
- **Impacto**: Experiencia consistente al 100% en los tres idiomas soportados sin regresiones en selectores ni formato numérico.

### 2. Historial de Cotizaciones Guardadas y Rentabilidad (`P0` · `v2.1.0`)
- **Estado actual**: `src/lib/printCalculator.ts` (`calculatePrintQuote`, `formatQuoteText`, `formatQuoteHtml`) permite calcular y exportar cotizaciones a `.txt`/`.html`, pero no existe persistencia en SQLite (`electron/db.ts` en `SCHEMA_VERSION = 2` almacena `rolls`, `usage`, `shopping`, `orders`, `gcode_jobs`, `settings`).
- **Propuesta**: Subir a `SCHEMA_VERSION = 3` con una tabla `quotes` (`id`, `created_at`, `status`, `client_name`, `data`), definir `PrintQuoteRecord` en `src/shared/types.ts` y exponer CRUD vía `db:*` en `electron/main.ts` / `electron/preload.ts`. Integrar estados (`borrador`, `enviada`, `aprobada`, `impresa`) y métricas comparativas de costo estimado vs. consumo real (`UsageEntry`) en `StatsView.tsx`.
- **Impacto**: Trazabilidad financiera completa del taller sin hojas de cálculo externas.

### 3. Mapeo Persistente de Ranuras AMS / ACE Pro (`P1` · `v2.1.0`)
- **Estado actual**: `Settings.slotRollMappings?: Record<string, string>` ya está declarado en `src/shared/types.ts` (inicializado como `{}` en `DEFAULT_SETTINGS`), pero actualmente solo `rememberedMappings` participa en `matchSlotToRoll()` (`src/lib/colorMath.ts`).
- **Propuesta**: Habilitar un panel rápido de bahías cargadas (por ejemplo, `ACE Pro #1` ranuras 1–4 o `AMS #1` A1–A4) para vincular cada ranura física con un `Roll.id`, e inyectar `slotRollMappings` como prioridad máxima en `matchSlotToRoll()`.
- **Impacto**: Reduce a cero la reasignación manual de colores repetidos en trabajos multicolor dentro de `InboxView`.

### 4. Etiquetas QR / Códigos de Barras Offline y Taras Personalizadas (`P1` · `v2.1.0`)
- **Estado actual**: `src/lib/filamentMath.ts` define 11 perfiles en `SPOOL_TARE_PRESETS` de solo lectura en tiempo de compilación.
- **Propuesta**: Permitir guardar perfiles de tara personalizados en `Settings` y añadir en `RollDetailModal.tsx` un generador local de etiquetas imprimibles SVG/HTML (vía `api.file.saveTextFile`) con código QR/Code-128 (`filoteca://roll/<id>`) y datos técnicos del material.
- **Impacto**: Identificación instantánea de bobinas en estanterías o cajas secas con cualquier lector USB de escritorio.

### 5. Flota de Impresoras y Mantenimiento Preventivo (`P1` · `v2.2.0`)
- **Estado actual**: `GcodeJob` ya extrae `printerModel`, `nozzleDiameter` y `printTimeSeconds`, y `MATERIAL_PRESETS` marca materiales abrasivos con `requiresHardenedNozzle`.
- **Propuesta**: Incorporar una tabla `printers` en `FilotecaDb` con perfiles por máquina (potencia, tarifa/hora, vida útil, diámetro de boquilla instalado) y contadores acumulativos que se actualizan al confirmar `markJobPrinted` / `markJobFailed` en `useStore.ts`.
- **Impacto**: Alertas tempranas para cambio de boquilla, tubo PTFE o calibración mecánica antes de perder piezas largas.

### 6. Telemetría Opcional Solo en LAN Local (`P2` · `v2.2.0`)
- **Estado actual**: La ingesta automática de `electron/main.ts` vigila carpetas temporales locales del laminador, carpetas personalizadas (`watchedGcodeFolder`) y procesos activos.
- **Propuesta**: Añadir conectores opt-in exclusivamente en red local (sin nube ni cuentas externas) para Moonraker/Klipper (`http://<ip-local>:7125`) o servicios LAN de impresoras compatibles, enviando trabajos finalizados a `InboxView` para confirmación manual.
- **Impacto**: Registra consumos incluso cuando los archivos se lanzan desde tarjetas SD o interfaces web locales.

### 7. Respaldos Cifrados y Sincronización Local entre Equipos (`P2` · `v2.3.0`)
- **Estado actual**: `FilotecaDb.backupTo()` / `restoreFrom()` y `ExportBundle` v2 operan en texto claro sobre archivos locales `.db`, `.json` y `.csv`.
- **Propuesta**: Añadir cifrado opcional con frase de paso mediante `node:crypto` (`scrypt` + `AES-256-GCM`) para copias portables, y sincronización opcional punto a punto en red local (LAN) entre el PC del taller y un portátil auxiliar.
- **Impacto**: Seguridad adicional para datos comerciales del taller manteniendo el principio estricto de cero servidores externos.
