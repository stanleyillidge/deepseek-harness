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
if %errorlevel% neq 0 (
    if exist "D:\Program Files\nodejs\node.exe" (
        set "PATH=D:\Program Files\nodejs;%PATH%"
    ) else (
        echo [ERROR] No se encontro Node.js en el sistema.
        echo Por favor verifica que Node.js este instalado.
        pause
        exit /b 1
    )
)

echo Ejecutando servidor web...
node --import tsx/esm apps/cli/src/bin.ts web

if %errorlevel% neq 0 (
    echo.
    echo [AVISO] El servidor se detuvo o encontro un error (codigo de salida: %errorlevel%).
    pause
)
