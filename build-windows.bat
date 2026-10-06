@echo off
setlocal enabledelayedexpansion

echo ==============================================
echo    Compilando Filoteca para Windows (x64)
echo ==============================================

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    for /d %%D in ("%LOCALAPPDATA%\devtools\node*") do (
        if exist "%%D\node.exe" (
            echo [info] Usando Node.js en %%D
            set "PATH=%%D;%PATH%"
            goto :found_node
        )
    )
    echo [error] Node.js no se encontro en PATH ni en %LOCALAPPDATA%\devtools.
    echo Por favor instala Node.js LTS desde https://nodejs.org
    exit /b 1
)

:found_node
echo [1/5] Verificando version de Node y NPM...
node -v
call npm -v

echo [2/5] Instalando dependencias...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [error] Fallo npm install.
    exit /b %ERRORLEVEL%
)

echo [3/5] Generando iconos...
node scripts/gen-icons.mjs

echo [4/5] Compilando la aplicacion...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [error] Fallo la compilacion.
    exit /b %ERRORLEVEL%
)

echo [5/5] Generando ejecutables .exe con electron-builder...
call npx electron-builder --win --x64 --publish never
if %ERRORLEVEL% NEQ 0 (
    echo [error] Fallo electron-builder.
    exit /b %ERRORLEVEL%
)

echo.
echo ==========================================================
echo  Compilacion exitosa! Revisa la carpeta release\
echo ==========================================================
pause
