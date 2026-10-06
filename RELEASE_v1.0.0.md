# Filoteca v1.0.0 · 3D Workshop (Initial Release)

Welcome to the official release of Filoteca v1.0.0!

Filoteca is a modern, smooth, and 100% offline desktop application for Windows. It features a gorgeous procedural 3D renderer and is designed specifically for the needs of professional makers and 3D printing workshop owners.

## ✨ What's New & Highlights
- **Parametric 3D Spool Viewer:** A procedural representation of your spools with real-world physics, PBR finishes, and smooth interaction. Optimized at 30 FPS, it uses **0% GPU** when idle, perfect for running silently in the background on high-refresh-rate (144Hz) monitors without dropping frames in other apps.
- **Smart Slicer Ingestion:** A dedicated companion for Anycubic Slicer Next 2.0+ and OrcaSlicer. It automatically detects your print jobs, extracts thumbnails, and ignores temporary `.3mf` files.
- **`hasBackupStock` Forecasting:** A robust stock logic system that considers sealed rolls of the same brand and material as "backups", avoiding annoying false alerts and helping you focus on critical restocks.
- **100% Offline Performance:** Everything runs locally using a WebAssembly SQLite database (`sql.js`), prioritizing your privacy and speed (zero cloud telemetry).
- **Cost Tracking:** Native cost-per-gram estimation to give you absolute control over your workshop finances.

## 📥 Downloads
You can download the official verified binaries below:

- **[Filoteca-Portable-1.0.0.exe](https://github.com/Mate1592/filament/releases/download/v1.0.0/Filoteca-Portable-1.0.0.exe)**: Standalone portable executable (Recommended! ~105 MB. No install needed).
- **[Filoteca Setup 1.0.0.exe](https://github.com/Mate1592/filament/releases/download/v1.0.0/Filoteca%20Setup%201.0.0.exe)**: Standard NSIS installer for Windows.