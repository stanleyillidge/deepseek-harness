---
description: "Adaptadores de ejecución de tareas que aíslan el MVP de las implementaciones concretas de DSH Subagents y Jobs."
kind: "package-library"
---

# @deepseek-ai/dsh-project-worker

No invariant companion is published; la cancelación se mantiene en el runner.

## Resumen

`ProjectWorkerRunner` convierte un `ProjectWorkerAdapter` en un handle cancelable. Cada ejecución recibe `AbortSignal`, tarea, intento y lease. Los puentes `ProjectSubagentWorkerAdapter` y `ProjectJobWorkerAdapter` solo delegan en interfaces estructurales y no importan los paquetes concretos de DSH.

## Uso

Un consumidor implementa `start`, devuelve `{ result, cancel? }` y deja la decisión de verificación al paquete `project-verifier`. El runner conserva la cancelación idempotente y avisa tanto al signal como al adaptador.

## Model Experience

### Ejecución de worker

#### What the model sees

No tiene superficie de modelo. `ProjectWorkerRunner` adapta Subagents o Jobs que otro consumidor exponga mediante una herramienta.

#### Token effect

No añade tokens por sí mismo.

#### KV Cache effect

No aplica; no construye solicitudes de modelo.

## Known Limitations and Deferred Work

- Cancelar depende de que el proveedor termine su trabajo al recibir el signal o su callback; el runner no puede matar un proveedor que ignore ambos.
- Este paquete no decide reintentos, estados del DAG ni persistencia.
