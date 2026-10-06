# Filoteca v1.0.0-final — 3D Workshop & Filament Management (Initial Release)

Welcome to the official global release of Filoteca v1.0.0!

Filoteca is a modern, smooth, and 100% offline desktop application for Windows, designed specifically for the needs of professional makers and 3D printing workshop owners.

## ✨ Key Features & Optimizations
- **Parametric 3D Spool Viewer:** Experience a visual, procedural representation of your spools with real-world winding volume physics and stunning PBR finishes (silk, matte, transparent, glitter). The rendering engine is strictly capped at 30 FPS and uses **0% GPU when idle**, ensuring it runs silently in the background even on high-refresh-rate (144Hz) monitors without dropping frames in your slicer or CAD software.
- **Automatic Slicer Companion:** A dedicated background companion for Anycubic Slicer Next 2.0+ (Kobra X) and OrcaSlicer. It automatically detects print jobs, extracts embedded 260px thumbnails, recognizes multi-plate projects, and ignores temporary `.3mf` files. It includes a fallback volumetric calculation and uses CIELAB $\Delta E_{76}$ perceptual color matching to automatically select the right spool from your inventory.
- **Smart Backup Stock Logic (`hasBackupStock`):** A robust logic system that looks for sealed replacement rolls of the exact same brand and material. If a backup exists, it silently manages the stock without throwing annoying false low-stock alarms, letting you focus on critical restocks.
- **First-Run Onboarding Tour:** We've introduced a dynamic onboarding tour with multi-language selection (English, Spanish, Portuguese) and easy setup for your local currency (USD, EUR, GBP, COP, BRL) and visual themes.
- **100% Offline & Private:** Built with a local WebAssembly SQLite database (`sql.js`). Your workshop data stays strictly on your machine with absolutely zero cloud telemetry.

## 📥 Downloads
You can download the official verified binaries below.

- **[Filoteca-Portable-1.0.0.exe](https://github.com/Mate1592/FILOTEK_ANYCUBIC/releases/download/v1.0.0/Filoteca-Portable-1.0.0.exe)**: Standalone portable executable (**Recommended!** ~105 MB. No installation or admin rights required).
- **[Filoteca Setup 1.0.0.exe](https://github.com/Mate1592/FILOTEK_ANYCUBIC/releases/download/v1.0.0/Filoteca%20Setup%201.0.0.exe)**: Standard NSIS installer for Windows, if you prefer Start Menu shortcuts.