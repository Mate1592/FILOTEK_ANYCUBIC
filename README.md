<h1 align="center">Filoteca 🧵</h1>

<p align="center">
  <b>3D Printing Filament Inventory — Visual, Smart & 100% Offline</b>
</p>

<p align="center">
  <a href="README.es.md">🇪🇸 Leer en Español</a> · <a href="#">🇺🇸 English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-10%2F11%20x64-0078D6?style=flat-square&logo=windows" alt="Windows 10/11 x64" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License" />
  <img src="https://img.shields.io/badge/100%25-Offline-4CAF50?style=flat-square" alt="100% Offline" />
  <img src="https://img.shields.io/badge/Version-v1.0.1-blue?style=flat-square" alt="Version" />
</p>

> Developed by **TermuxX solutions** — A modern desktop app that turns boring filament spreadsheets into an interactive 3D workshop shelf. Manage spools visually, track consumption in real time, get smart restock alerts, and connect seamlessly with your slicer.

---

## 🧵 Spool Management & 3D Visualization

Every spool in your inventory is rendered as a **realistic 3D model** that reflects its actual color, material finish, and remaining filament level. No more guessing how much is left on a roll — just look at it.

![Interactive 3D Spool Shelf](docs/screenshots/01-shelf-3d.png)

- **Real-Time Filament Level** — The 3D spool shrinks proportionally to the actual remaining weight. A spool at 30% looks like a spool at 30%.
- **Authentic Material Finishes** — Each spool renders with its real-world finish: matte, glossy, silk (pearly sheen), translucent, or glitter.
- **360° Interactive Inspection** — Click any spool to open a detailed view where you can spin, rotate, and examine it from every angle with smooth inertia.
- **Complete Spool Details** — Temperatures, cost per gram, supplier, physical storage location, purchase date, and notes — all at a glance.

![Spool Detail — 3D Viewer, Stats & Supplier Info](docs/screenshots/05-spool-detail.png)

---

## 🤖 Automatic Slicer Detection

Filoteca watches your slicer's temp folder in the background. The moment you slice a model, it appears automatically in Filoteca's **Companion Tray** — no manual exports, no drag & drop, no file browsing.

![Anycubic Slicer Next Gen — Sliced Model Ready](docs/screenshots/07-anycubic-slicer.png)

- **Instant Background Detection** — Slice your model and Filoteca picks it up silently. A subtle badge `Slicer Tray (1)` lights up in the title bar.
- **Auto Color Matching** — Each color slot is automatically matched to the best spool from your inventory based on color similarity, brand, and material type.
- **Multi-Color Support** — Full support for multi-material setups (Anycubic ACE Pro / Kobra Series) with per-slot weight tracking.
- **You Decide What Counts** — Nothing is deducted without your confirmation:
  - ✅ **"I Printed It"** — Deducts the exact grams from your stock.
  - ⚠️ **"Failed / Partial"** — Adjust the percentage actually used.
  - ❌ **"Didn't Print / Discard"** — No deduction, job archived.

![Companion Tray — Auto-Detected Slicer Jobs](docs/screenshots/06-companion-tray.png)

---

## 📊 Workshop Statistics & Insights

A built-in analytics dashboard gives you a bird's-eye view of your entire workshop inventory with interactive charts and key performance indicators.

![Statistics Dashboard — Materials, Brands & KPIs](docs/screenshots/08-statistics.png)

- **Material Distribution** — See how your inventory breaks down by filament type (PLA, PETG, ABS, TPU, etc.) with interactive donut charts.
- **Brand Overview** — Track which brands dominate your shelf and compare inventory value across suppliers.
- **Workshop KPIs** — Total spools, total weight in stock, total inventory value (in your local currency), and average cost per gram.

---

## 🛡️ Smart Inventory & Restock Alerts

Never run out of filament mid-print again. Filoteca monitors your consumption patterns and warns you before it's too late.

![Smart Replenishment Forecast](docs/screenshots/04-replenishment.png)

- **Consumption Forecast** — Tracks your 30-day usage per spool and estimates when you'll run out.
- **Traffic-Light Alerts** — 🔴 Critical (order now), 🟡 Soon (plan ahead), 🟢 Ready (all good).
- **Backup Spool Awareness** — Already have a sealed replacement? Filoteca detects it and adjusts the urgency.
- **One-Click Shopping List** — Add low-stock spools directly to your purchasing list.

---

## 🖨️ Slicer Compatibility

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/assets/anycubic-slicer-next.png" width="90" alt="Anycubic Slicer Next Gen" />
      <br /><br />
      <b>Anycubic Slicer Next Gen</b>
      <br />
      <code>✅ Native Support Active</code>
      <p>Automatic detection of sliced projects, multi-color slots, print previews, and material estimates.</p>
    </td>
    <td align="center" width="50%">
      <img src="docs/assets/orcaslicer.png" width="90" alt="OrcaSlicer" />
      <br /><br />
      <b>OrcaSlicer</b>
      <br />
      <code>🚀 Coming Soon</code>
      <p>Native OrcaSlicer compatibility is currently in active development and will be available in an upcoming update.</p>
    </td>
  </tr>
</table>

---

## 🌍 Multi-Language, Currency & Themes

- **3 Languages Built-In** — English, Español 🇨🇴, and Português 🇧🇷.
- **Local Currency Support** — COP (\$), USD (\$), EUR (€), BRL (R\$), and more.
- **Dark & Light Modes** — A polished maker aesthetic designed for your workshop.

---

## 🔒 100% Offline & Private

Your data never leaves your computer. No accounts, no cloud, no internet required, no subscriptions. All spool data, prices, and workshop history are stored locally on your PC.

---

## 🚀 Quick Start (No Installation Required)

1. Go to **[Releases](https://github.com/Mate1592/FILOTEK_ANYCUBIC/releases)**.
2. Download **`Filoteca-Portable-1.0.1.exe`**.
3. Double-click to launch — runs from your desktop or a USB drive.

*(An optional installer `Filoteca Setup 1.0.1.exe` is also available if you prefer Start Menu shortcuts).*

---

## 👥 Community & Getting Involved

- **Discussions & Ideas:** [GitHub Discussions](https://github.com/Mate1592/FILOTEK_ANYCUBIC/discussions)
- **Bug Reports & Suggestions:** [GitHub Issues](https://github.com/Mate1592/FILOTEK_ANYCUBIC/issues)

---

## ☕ Support & Donations

Filoteca is open-source, built by **TermuxX solutions** for the global 3D printing community. If it helps organize your workshop and saves you filament, consider supporting its development:

### Colombia 🇨🇴 (Local Payments)
- **Wompi / PSE / Nequi / Bancolombia / Cards:**
  👉 [checkout.wompi.co/l/miKi8F](https://checkout.wompi.co/l/miKi8F)

### Global 🌎 (International Payments)
- **PayPal:**
  👉 [paypal.me/matec15](https://paypal.me/matec15)

---

## 🛠️ Local Development & Build

```powershell
# 1. Install dependencies
npm install

# 2. Run in development mode
npm run dev

# 3. Build standalone portable binary (.exe)
npm run dist:portable
```

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for details.

---

<p align="center">Developed with dedication by <b>TermuxX solutions</b> for the global maker community.</p>
