@echo off
title Servidor Local - DeepSeek Harness
cd /d "%~dp0"

echo ========================================================
echo       Iniciando Servidor Local - DeepSeek Harness
echo ========================================================
echo.
echo Directorio: %CD%
echo.

where node >nul 2>nul
if errorlevel 1 (
    if exist "D:\Program Files\nodejs\node.exe" (
        set "PATH=D:\Program Files\nodejs;%PATH%"
    ) else (
        echo [ERROR] No se encontro Node.js en el sistema.
        echo Por favor verifica que Node.js este instalado.
        pause
        exit /b 1
    )
)

where pnpm >nul 2>nul
if errorlevel 1 goto :pnpm_missing

if not exist "packages\client\shortcuts\lib\client.js" goto :build_client
if not exist "packages\client\ui-shortcuts\lib\client.js" goto :build_client
goto :start_server

:build_client
echo Faltan artefactos del cliente; ejecutando la compilacion requerida...
call pnpm run build
if errorlevel 1 goto :build_failed

:start_server
echo Ejecutando servidor web con el launcher oficial...
call pnpm dsh web --no-open
if errorlevel 1 goto :server_failed
exit /b 0

:pnpm_missing
echo [ERROR] No se encontro pnpm en el PATH.
echo Instala pnpm o habilita Corepack antes de iniciar el servidor.
pause
exit /b 1

:build_failed
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo [ERROR] No se pudieron construir los artefactos del cliente (codigo de salida: %EXIT_CODE%).
pause
exit /b %EXIT_CODE%

:server_failed
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo [ERROR] El servidor se detuvo o encontro un error (codigo de salida: %EXIT_CODE%).
pause
exit /b %EXIT_CODE%
