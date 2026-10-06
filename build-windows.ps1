# Script de PowerShell para compilar Filoteca en Windows con un solo comando
# Requiere Node.js 18+ (si no está instalado en PATH, busca en $env:LOCALAPPDATA\devtools\node-*)

$ErrorActionPreference = "Stop"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   Compilando Filoteca para Windows (x64)     " -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# 1. Comprobar Node.js
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    $localNode = Get-ChildItem -Path "$env:LOCALAPPDATA\devtools" -Filter "node.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($localNode) {
        $nodeDir = Split-Path $localNode.FullName
        Write-Host "[info] Usando Node.js detectado en $nodeDir" -ForegroundColor Yellow
        $env:Path = "$nodeDir;" + $env:Path
    } else {
        Write-Error "No se encontró Node.js en PATH ni en %LOCALAPPDATA%\devtools. Por favor instala Node.js LTS (https://nodejs.org)."
    }
}

Write-Host "[1/5] Verificando versión de Node..." -ForegroundColor Green
node -v
npm -v

# 2. Instalar dependencias
Write-Host "[2/5] Instalando dependencias del proyecto..." -ForegroundColor Green
npm install

# 3. Generar iconos
Write-Host "[3/5] Generando iconos de la aplicación..." -ForegroundColor Green
node scripts/gen-icons.mjs

# 4. Compilar Frontend y Electron
Write-Host "[4/5] Compilando frontend y proceso principal..." -ForegroundColor Green
npm run build

# 5. Empaquetar ejecutable .exe con electron-builder
Write-Host "[5/5] Generando instalador y portable con electron-builder..." -ForegroundColor Green
npx electron-builder --win --x64 --publish never

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " ¡Compilación finalizada con éxito!                       " -ForegroundColor Green
Write-Host " Los ejecutables se encuentran en la carpeta 'release\': " -ForegroundColor Green
Write-Host "   - release\Filoteca Setup 1.0.0.exe (Instalador NSIS)   " -ForegroundColor Cyan
Write-Host "   - release\Filoteca-Portable-1.0.0.exe (Versión portable)" -ForegroundColor Cyan
Write-Host "   - release\win-unpacked\Filoteca.exe (Ejecutable directo)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
