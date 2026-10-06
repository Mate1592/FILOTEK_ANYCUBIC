# Filoteca 🧵

[🇪🇸 Leer en Español](README.es.md) | [🇺🇸 English]

![Windows 10/11 x64](https://img.shields.io/badge/Windows-10%2F11%20x64-0078D6?style=flat-square&logo=windows)
![MIT License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![100% Offline](https://img.shields.io/badge/100%25-Offline-4CAF50?style=flat-square)
![Version](https://img.shields.io/badge/Version-v1.0.0-blue?style=flat-square)

> **3D Printing Filament Inventory** — A modern, smooth, and 100% offline desktop application for Windows. Features procedural 3D rendering, smart restocking forecasts, multi-language support (English, Spanish, Portuguese), and automatic data ingestion for Anycubic Slicer Next 2.0+ (Kobra X) and OrcaSlicer.

Filoteca is designed for professional makers and 3D printing workshops. Going beyond generic tables or CRUD spreadsheets, each spool is visually represented as a parametric 3D model in three-quarters view that reflects actual color, material finishes (matte, glossy, silk, translucent, glitter), and remaining filament volume based on physical winding geometry.

---

## 📸 Screenshots

### Main 3D Spool Shelf
![Main 3D Spool Shelf](docs/screenshots/01-shelf-3d.png)

### 360° Tactile Inspection & Spool Details
![Spool Modal View](docs/screenshots/02-modal-3d.png)

### Automatic Slicer Companion (Anycubic / Orca)
![Slicer Companion Tray](docs/screenshots/03-companion.png)

### Replenishment Planning & Consumption Forecasting
![Replenishment Forecast](docs/screenshots/04-replenishment.png)

---

## ✨ Main Features

### 1. Parametric 3D Spools with On-Demand Rendering
- **True Winding Physics:** The radius of the remaining filament responds directly to volumetric physics:
  $$R = \sqrt{r_{\text{core}}^2 + f \cdot (R_{\text{full}}^2 - r_{\text{core}}^2)}$$
  where $f = \frac{\text{remaining weight}}{\text{initial weight}}$. A spool at 33% physically represents an authentic volumetric third, showing the interior kraft cardboard cylinder through the hexagonal lattice.
- **Realistic PBR Materials:** Calibrated presets for matte, glossy, silk (pearly sheen), translucent (optical depth transmission), and glitter (procedural metallic scintillation).
- **Resource-Efficient 30 FPS Engine:** Shared WebGL canvas architecture with on-demand rendering (*scissor testing*). At idle, GPU usage drops to **0%**, preventing thermal load and battery drain on high-refresh-rate monitors (120Hz, 144Hz, 240Hz).

### 2. Automatic Slicer Companion (Anycubic Slicer Next & OrcaSlicer)
- **"Slicing ≠ Printing" Philosophy:** Filoteca never silently deducts filament. It passively monitors generated files and displays an interactive tray for you to confirm only what was actually printed.
- **Background Temporal Watcher:** Watches `%LOCALAPPDATA%\Temp\anycubicslicer_model\` to extract embedded 260px PNG thumbnails, material slots, estimated print times, and weights.
- **Perceptual CIELAB (CIE76) Color Matching:** Converts sRGB colors from the slicer to the perceptual $L^*a^*b^*$ color space and automatically pairs each slot with the closest spool in your inventory ($\Delta E_{76}$).

### 3. Smart Backup Stock Logic (`hasBackupStock`)
- If a spool drops below the low-stock safety threshold (e.g. 40g), but your workshop has another sealed spool of the exact same brand, material, and color, Filoteca displays a reassuring badge (*"4% · Backed up"*), avoiding unnecessary panic on your shelf and shopping lists.

### 4. Multi-Language Support & Onboarding Tour
- Native support for **English**, **Español**, and **Português**.
- Interactive first-run onboarding tour to choose your language, workshop currency (COP, USD, EUR, BRL), and visual theme (dark or light). Re-run the tour anytime from Settings.

### 5. 100% Offline & Private
- WebAssembly SQLite database engine (`sql.js`). All your data, prices, consumption logs, and workshop notes stay strictly on your local disk. No mandatory accounts, telemetry, or internet access required.

---

## 🚀 Quick Start (No Installation Required)

1. Head over to the **[Releases](https://github.com/Mate1592/FILOTEK_ANYCUBIC/releases)** page of this repository.
2. Download the standalone executable: **`Filoteca-Portable-1.0.0.exe`**.
3. Double-click the file to launch Filoteca immediately. You can run it from a USB drive or store it in your portable tools folder.

*(An optional NSIS installer `Filoteca Setup 1.0.0.exe` is also provided if you prefer Start Menu shortcuts and uninstaller registration).*

---

## 👥 Community & Getting Involved

- **Discussions, Ideas & Workshop Setups:** Join [GitHub Discussions](https://github.com/Mate1592/FILOTEK_ANYCUBIC/discussions) to share prints and feature suggestions.
- **Bug Reports & Filament Requests:** Open a [GitHub Issue](https://github.com/Mate1592/FILOTEK_ANYCUBIC/issues) to report bugs or request new filament brand presets.

---

## ☕ Support & Donations

Filoteca is an open-source project created for the global 3D printing maker community. If this software saves you time, prevents print failures, and organizes your workshop, consider supporting its active development:

### Colombia 🇨🇴 (Local Payments)
- **Wompi / PSE / Nequi / Bancolombia / Cards:**
  [checkout.wompi.co/l/miKi8F](https://checkout.wompi.co/l/miKi8F)

### Global 🌎 (International Payments)
- **PayPal:** [paypal.me/matec15](https://paypal.me/matec15)
- **Ko-fi:** [ko-fi.com/mate1592](https://ko-fi.com/mate1592)

---

## 🛠️ Local Development & Build

If you wish to contribute or build Filoteca from source:

### Prerequisites
- Windows 10 or 11 (64-bit).
- Node.js LTS (v20+ recommended).

### Commands
```powershell
# 1. Install dependencies
npm install

# 2. Run in development mode with HMR
npm run dev

# 3. Execute G-code metadata & colorimetric unit tests
npm run test:gcode

# 4. Build Windows portable standalone binary (.exe)
npm run dist:portable
```

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for details.
