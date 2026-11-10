@echo off
setlocal
title Calculadora P2P
cd /d "%~dp0"

echo ============================================
echo   Calculadora P2P - Inicio local
echo ============================================
echo.

if not exist "package.json" (
  echo [ERROR] No se encontro package.json en esta carpeta.
  echo Coloca este archivo en la raiz del proyecto.
  echo.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado o no esta en el PATH.
  echo Descargalo desde https://nodejs.org/ y vuelve a intentar.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm no esta disponible en el PATH.
  echo Reinstala Node.js desde https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias por primera vez...
  echo Esto puede tardar unos minutos.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] No se pudieron instalar las dependencias.
    echo Revisa tu conexion a internet y vuelve a intentar.
    echo.
    pause
    exit /b 1
  )
  echo.
)

echo Iniciando la aplicacion...
if /I "%~1"=="--no-open" (
  echo Modo de prueba: el navegador no se abrira automaticamente.
  call npm run dev
) else (
  echo El navegador se abrira automaticamente.
  call npm run dev -- --open
)

echo.
echo La aplicacion se detuvo.
pause
endlocal
