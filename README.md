# Filoteca 🧵

![Windows Portable](https://img.shields.io/badge/Windows-Portable-0078D6?style=flat-square&logo=windows)
![Electron 44](https://img.shields.io/badge/Electron-44-47848F?style=flat-square&logo=electron)
![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript)
![100% Offline](https://img.shields.io/badge/100%25-Offline-4CAF50?style=flat-square)
![SQLite WASM](https://img.shields.io/badge/SQLite-WASM-003B57?style=flat-square&logo=sqlite)

> **3D Printing Filament Inventory** — A modern, smooth, and 100% offline desktop app for Windows. Features procedural 3D rendering, smart restocking forecasts, and automatic data ingestion from Anycubic Slicer Next 2.0+ (Kobra X) and OrcaSlicer.

Filoteca is designed for professional makers and 3D printing workshops. It goes beyond simple lists by providing visual, physics-based 3D representations of your filament spools showing real colors, finishes (matte, glossy, silk, translucent, glitter), and accurate remaining volume.

---

## ✨ Main Features

1. **Parametric 3D Spool Viewer:** Hexagonal lattice design with optimized on-demand rendering (30 FPS, 0% GPU usage when idle). It physically conserves the remaining filament volume and uses realistic PBR materials.
2. **Slicer Companion:** Automatically detects `.gcode.metadata` and ignores temporary `.3mf` files. It follows a *"Slicing ≠ Printing"* philosophy, gently notifying you of new print jobs without being intrusive.
3. **Smart Stock Logic (`hasBackupStock`):** If a spool is running low but you have a sealed backup of the same material and color, it prevents false low-stock alerts.
4. **100% Offline & Private:** Uses a local WebAssembly SQLite database (`sql.js`). Your data stays on your machine, ensuring high performance and absolute privacy.
5. **Local Currency & Costs:** Native support for local currency (like COP), intelligent cost-per-gram calculation, and flexible number inputs.

---

## 📥 Download and Installation

### Portable Version (Recommended!)
1. Go to the **[Releases](https://github.com/Mate1592/filament/releases)** tab of this repository.
2. Download the latest `.exe` file (e.g., `Filoteca-Portable-1.0.0.exe`).
3. That's it! You can run it directly (100% standalone, no admin rights or installation required) or use the NSIS installer if you want start menu shortcuts.

---

## 🧑‍💻 Quick Developer Guide

If you prefer to build from source or contribute to the project:

### Prerequisites:
- Windows 10 or 11 (64-bit).
- Node.js LTS (v18, v20, v22, or v24).

### Install dependencies:
```powershell
npm install
```

### Key Commands:
- **`npm run dev`**: Starts the Vite development server with HMR and the Electron window.
- **`npm run build`**: Compiles the frontend and the Electron main process.
- **`npm run test:gcode`**: Runs the unit tests for the metadata parser and colorimetry logic.
- **`npm run typecheck`**: Runs TypeScript type checking across the project.

---

## 🧪 Automated Testing

### 1. G-code Ingestion Test Suite
Tests the parser tolerance against edge cases from Anycubic Slicer Next and OrcaSlicer:
```powershell
npm run test:gcode
```

### 2. Full E2E Smoke Test
Tests the real app running in Electron using an isolated database and Playwright:
```powershell
npm run smoke
```

---

## 📁 Project Structure

```text
FILAMENTO/
├── .github/workflows/       # GitHub Actions for cloud building
├── electron/                # Main process, SQLite WASM, IPC, and Slicer parsing
├── src/                     # React + Vite frontend, 3D rendering (Three.js)
├── test-fixtures/           # Test fixtures for slicer outputs
├── scripts/                 # Dev tools, testing, and build scripts
└── package.json
```