# Filoteca v1.0.0 · Taller 3D (Lanzamiento Inicial)

¡Bienvenido al lanzamiento oficial de la versión 1.0.0 de Filoteca!

Filoteca es una aplicación de escritorio moderna, fluida y 100% offline para Windows con renderizado procedural 3D diseñada específicamente para las necesidades y la estética de un taller maker profesional o dueños de talleres de impresión 3D.

## ✨ Novedades y Optimizaciones
- **Visualizador 3D Paramétrico de Bobinas:** Representación procedural con celosía hexagonal, conservación física de volumen, acabados PBR, e interacción física. El renderizado es bajo demanda y está optimizado a 30 FPS, logrando **0% de consumo de GPU** cuando la ventana está en reposo, lo que es ideal para computadoras o monitores de alta frecuencia (como 144Hz) donde otras apps fallan o consumen demasiados recursos sin estar haciendo nada.
- **Ingesta Inteligente de Laminadores:** Companion dedicado de Anycubic Slicer Next 2.0+ y OrcaSlicer, con detección de metadatos `.gcode.metadata`, miniaturas y descarte de `.3mf` y archivos temporales, con cálculo de volumen de respaldo.
- **Previsión de Reabastecimiento `hasBackupStock`:** Un sistema robusto de lógica de stock que considera como "respaldo" aquellos rollos sellados de igual marca y material, sin lanzar alertas falsas y priorizando reposiciones críticas.
- **Rendimiento 100% Offline:** Todo corre localmente bajo SQLite en WebAssembly (`sql.js`), priorizando la privacidad y el desempeño (cero telemetría a la nube).
- **Control Real del Dinero y Costos en COP:** Formateo y estimación nativa para la moneda local (Pesos Colombianos), integrando los costes por gramo para un cálculo exacto.

## 📥 Descargas
Puedes descargar los binarios oficiales compilados mediante GitHub Actions y verificados a continuación:

- **[Filoteca-Portable-1.0.0.exe](https://github.com/Mate1592/filament/releases/download/v1.0.0/Filoteca-Portable-1.0.0.exe)**: Ejecutable portable independiente (¡Recomendado!, ~105 MB).
- **[Filoteca Setup 1.0.0.exe](https://github.com/Mate1592/filament/releases/download/v1.0.0/Filoteca%20Setup%201.0.0.exe)**: Instalador estándar NSIS para Windows.