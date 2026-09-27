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

rem Vision general del proceso:
rem Este bloque libera el puerto fijo del perfil Web antes de iniciar DeepSeek Harness, cerrando
rem los procesos que lo ocupan y confirmando que el listener desaparecio antes de continuar.
rem
rem Detalle paso a paso:
rem 1. Se consultan todos los listeners del puerto 3080 y sus procesos propietarios.
rem 2. Se cierra cada proceso propietario y la cadena de lanzamiento Web relacionada con Stop-Process -Force.
rem 3. Se verifica que el puerto quedo libre o se informa el PID que no pudo cerrarse.
set "DSH_SERVER_PORT_STATE="
for /f "delims=" %%A in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$listeners=@(Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue); if ($listeners.Count -eq 0) { 'FREE' } else { $processIds=[System.Collections.Generic.HashSet[int]]::new(); foreach ($listener in $listeners) { $currentId=[int]$listener.OwningProcess; [void]$processIds.Add($currentId); while ($currentId -gt 0) { $current=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $currentId); if ($null -eq $current) { break }; $parentId=[int]$current.ParentProcessId; if ($parentId -le 0) { break }; $parent=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $parentId); if ($null -eq $parent -or $parent.CommandLine -notmatch 'apps[\\/\\\\]cli[\\/\\\\]src[\\/\\\\]bin\.ts.*web|pnpm.*dsh.*web|node.*web.*--no-open') { break }; [void]$processIds.Add($parentId); $currentId=$parentId } }; try { foreach ($ownerPid in $processIds) { Stop-Process -Id $ownerPid -Force -ErrorAction Stop }; Start-Sleep -Milliseconds 750; $remaining=@(Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue); if ($remaining.Count -eq 0) { 'CLEARED' } else { $remainingIds=@(); foreach ($remainingListener in $remaining) { $remainingIds += [string]$remainingListener.OwningProcess }; 'FAILED:' + ($remainingIds -join ',') } } catch { 'FAILED:' + ($_.Exception.Message -replace '[\r\n]+',' ') } }"') do set "DSH_SERVER_PORT_STATE=%%A"
if /i "%DSH_SERVER_PORT_STATE%"=="FREE" goto :check_client_artifacts
if /i "%DSH_SERVER_PORT_STATE%"=="CLEARED" goto :port_cleared
goto :port_cleanup_failed

:port_cleared
echo [INFO] Se libero el puerto 127.0.0.1:3080 antes de iniciar el servidor.
goto :check_client_artifacts

:check_client_artifacts
goto :build_client

:build_client
rem Vision general del proceso:
rem Este bloque sincroniza los artefactos de los plugins cliente y el shell Web antes de arrancar.
rem Asi el cargador servido por apps/web y los bundles de shortcuts siempre pertenecen a la misma
rem compilacion local.
rem
rem Detalle paso a paso:
rem 1. Se emiten los tipos cliente que consumen los bundles de tsdown.
rem 2. Se reconstruyen los artefactos Host y los bundles Client de shortcuts.
rem 3. Se reconstruye apps/web/dist y solo despues se inicia el launcher oficial.
echo Preparando los artefactos cliente y el shell Web...
set "DSH_SERVER_PREVIOUS_NODE_OPTIONS=%NODE_OPTIONS%"
set "NODE_OPTIONS=--max-old-space-size=4096"

goto :compile_client_types

:compile_client_types
node ./node_modules/typescript/bin/tsc -b packages/client/shortcuts/tsconfig.client.json packages/client/ui-shortcuts/tsconfig.json --pretty false
set "DSH_SERVER_TSC_EXIT=%ERRORLEVEL%"
if not "%DSH_SERVER_TSC_EXIT%"=="0" echo [AVISO] TypeScript informo diagnosticos preexistentes; se validaran los artefactos emitidos.

:bundle_client
set "DSH_SERVER_BUILD_EXIT=0"
call pnpm exec tsdown --config packages/client/shortcuts/tsdown.config.ts --env.DSH_BUILD_FACE host
if errorlevel 1 goto :build_failed
call pnpm exec tsdown --config packages/client/shortcuts/tsdown.config.ts --env.DSH_BUILD_FACE client
if errorlevel 1 goto :build_failed

:bundle_ui_client
call pnpm exec tsdown --config packages/client/ui-shortcuts/tsdown.config.ts --env.DSH_BUILD_FACE client
set "DSH_SERVER_BUILD_EXIT=%ERRORLEVEL%"

:restore_build_environment
set "NODE_OPTIONS=%DSH_SERVER_PREVIOUS_NODE_OPTIONS%"
if not "%DSH_SERVER_BUILD_EXIT%"=="0" goto :build_failed

:build_web
echo Reconstruyendo el shell Web de apps/web...
call pnpm run build:web
set "DSH_SERVER_WEB_BUILD_EXIT=%ERRORLEVEL%"
if not "%DSH_SERVER_WEB_BUILD_EXIT%"=="0" goto :web_build_failed
goto :start_server

:start_server
echo Ejecutando servidor web con el launcher oficial...
call pnpm dsh web --no-open
set "DSH_SERVER_EXIT=%ERRORLEVEL%"
if not "%DSH_SERVER_EXIT%"=="0" goto :server_failed
exit /b 0

:port_cleanup_failed
echo.
echo [ERROR] No se pudo liberar el puerto 3080 antes de iniciar el servidor.
echo [ERROR] Detalle devuelto por Windows: %DSH_SERVER_PORT_STATE%
echo [INFO] Ejecuta el archivo como administrador si el proceso requiere permisos elevados.
pause
exit /b 2

:port_check_failed
echo.
echo [ERROR] No se pudo determinar si el puerto 3080 esta disponible.
echo [ERROR] No se iniciara el servidor para evitar una segunda instancia no controlada.
pause
exit /b 2

:pnpm_missing
echo [ERROR] No se encontro pnpm en el PATH.
echo Instala pnpm o habilita Corepack antes de iniciar el servidor.
pause
exit /b 1

:build_failed
set "EXIT_CODE=%DSH_SERVER_BUILD_EXIT%"
echo.
echo [ERROR] No se pudieron construir los artefactos del cliente (codigo de salida: %EXIT_CODE%).
pause
exit /b %EXIT_CODE%

:web_build_failed
set "EXIT_CODE=%DSH_SERVER_WEB_BUILD_EXIT%"
echo.
echo [ERROR] No se pudo reconstruir el shell Web de apps/web (codigo de salida: %EXIT_CODE%).
pause
exit /b %EXIT_CODE%

:server_failed
set "EXIT_CODE=%DSH_SERVER_EXIT%"
echo.
echo [ERROR] El servidor se detuvo o encontro un error (codigo de salida: %EXIT_CODE%).
pause
exit /b %EXIT_CODE%
