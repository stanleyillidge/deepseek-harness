# Baseline de implementación de Projects

Fecha: 2026-09-27
Rama: `codex/proyectos-runtime`
Base: merge de `upstream/master` en `42b5fe2813`

## Estado de la línea base

La rama local incorporó el estado de `upstream/master` antes de iniciar el vertical slice. `pnpm install` terminó correctamente en Windows con advertencias esperadas de paquetes nativos para otros sistemas operativos.

## Gates ejecutados

- `pnpm run typecheck`: terminó con código 0 antes del merge de upstream.
- `pnpm run lint`: terminó con código 1; reportó diagnósticos `typescript(no-unsafe-...)` en superficies existentes de Desktop y Client.
- `pnpm test`: mostró fallos preexistentes en `boot/app-boot`, `experimental/inspector` y `shell/pwsh-local`.
- `pnpm run build`: inició y produjo múltiples artefactos correctamente, pero fue interrumpido antes de registrar un código final por la concurrencia con los demás gates.
- `pnpm run test:web`: no se considera una señal completa; el proceso fue interrumpido mientras el scaffold informaba seis entradas pendientes de activar.
- `pnpm run gen-tsconfig-paths`: se inició para registrar los nuevos paquetes, pero la verificación del lockfile quedó retenida por la saturación de procesos paralelos; los aliases necesarios quedaron declarados manualmente y deben reconciliarse con el generador antes de publicar.

Estos resultados no demuestran un repositorio verde. Los fallos y gates interrumpidos se conservan explícitamente para no confundir validación local con verificación de CI.

## Reconciliación posterior del vertical slice

Después de la baseline se ejecutó `gen-tsconfig-paths --check`, que confirmó los aliases generados; también pasaron las compuertas focalizadas de paquetes, documentación, dependencias, metadatos, `tsc -b tsconfig.host.json`, `oxlint` de las superficies nuevas, y las pruebas de Projects. Estas señales no convierten en verdes los fallos preexistentes de lint, pruebas generales y `test:web` descritos arriba.
