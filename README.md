# Filoteca 🧵

[🇪🇸 Leer en Español](README.es.md) | [🇺🇸 English]

![Windows 10/11 x64](https://img.shields.io/badge/Windows-10%2F11%20x64-0078D6?style=flat-square&logo=windows)
![MIT License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![100% Offline](https://img.shields.io/badge/100%25-Offline-4CAF50?style=flat-square)
![Version](https://img.shields.io/badge/Version-v1.0.0-blue?style=flat-square)

> **3D Printing Filament Inventory** — A modern, smooth, and 100% offline desktop application for Windows. Features procedural 3D rendering, smart restocking forecasts, and automatic data ingestion from Anycubic Slicer Next 2.0+ (Kobra X) and OrcaSlicer.

Filoteca is designed for professional makers and 3D printing workshops. It goes beyond simple lists by providing visual, physics-based 3D representations of your filament spools showing real colors, finishes, and accurate remaining volume.

![Shelf 3D](docs/screenshots/01-shelf-3d.png)
![Modal 3D](docs/screenshots/02-modal-3d.png)

---

## Quick Start (No installation required)

1. Go to the **[Releases](https://github.com/Mate1592/FILOTEK_ANYCUBIC/releases)** tab of this repository.
2. Download the latest `.exe` portable file: `Filoteca-Portable-1.0.0.exe`.
3. Run the executable directly. It is 100% standalone and requires no administrator privileges or system installation.

*(An NSIS installer `Filoteca Setup 1.0.0.exe` is also available if you prefer Start Menu shortcuts).*

---

## Community & Support / Donations

If Filoteca helps you organize your 3D printing workshop, consider supporting its continuous development!

- **Global (PayPal):** [paypal.me/matec15](https://paypal.me/matec15)
- **Colombia (Wompi / PSE / Nequi):** [checkout.wompi.co/l/miKi8F](https://checkout.wompi.co/l/miKi8F)
- **Ko-fi:** [ko-fi.com/mate1592](https://ko-fi.com/mate1592)

---

## Main Features

### 1. Parametric 3D Spools
- **Procedural Geometry:** Hexagonal lattice design with optimized on-demand rendering capped at 30 FPS, achieving **0% GPU usage when idle**.
- **Physics-Based Volume:** The radius of the remaining filament responds to true winding physics: $R = \sqrt{r_{\text{core}}^2 + f(R_{\text{max}}^2 - r_{\text{core}}^2)}$. A spool at 33% visually represents an authentic volumetric third.
- **Realistic PBR Materials:** Presets for matte, glossy, silk (anisotropy and sheen), translucent (optical depth), and glitter (procedural metallic scintillation) finishes.

### 2. Automatic Slicer Companion
- **Slicing ≠ Printing:** Filoteca never blindly deducts filament or assumes a sliced file was printed successfully.
- **Seamless Background Ingestion:** Monitors Anycubic Slicer Next and OrcaSlicer in the background. Detects `.gcode.metadata`, extracts embedded 260px thumbnails, recognizes printing plates, and ignores temporary `.3mf` files.
- **Perceptual Color Matching:** Transforms sRGB colors from the slicer to the perceptual CIELAB color space and calculates $\Delta E_{76}$ distance to automatically match the best spool in your inventory.

![Companion](docs/screenshots/03-companion.png)

### 3. Smart Backup Stock Logic (`hasBackupStock`)
- Intelligent inventory logic prevents false low-stock alarms. If a spool is running critically low, but there is a sealed "backup" spool of the exact same brand, material, and color available in the inventory, Filoteca handles it silently without interrupting your workflow.

![Replenishment](docs/screenshots/04-replenishment.png)

### 4. First-Run Onboarding Tour
- **Dynamic Setup:** Get started quickly with a multi-language selection tour (English, Spanish, Portuguese).
- **Currency & Theme:** Configure your local currency (USD, EUR, GBP, COP, BRL) and visual preferences right from the start.

### 5. 100% Offline & Private
- **Zero Cloud Dependency:** All data is securely stored on your local machine using a WebAssembly SQLite database (`sql.js`). No mandatory accounts, no subscriptions, and absolute privacy for your workshop data.