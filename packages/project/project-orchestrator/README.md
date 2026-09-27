---
description: "Orquestación determinista de DAGs con paralelismo seguro, cancelación, pausa, verificación, retry y recovery."
kind: "package-library"
---

# @deepseek-ai/dsh-project-orchestrator

No invariant companion is published; el orquestador conserva sus invariantes durante la ejecución.

## Resumen

`ProjectOrchestrator` ejecuta tareas ready en orden determinista y en paralelo hasta `maxParallelism`. Una tarea solo se inicia si sus dependencias están en `succeeded` y `ProjectResourceLeaseManager` no encuentra conflicto de `writeScopes` ni `resourceClaims`. Cada intento pasa por `ProjectWorkerAdapter` y `ProjectVerifier` antes de publicar `succeeded`.

## Uso

`start` devuelve un `ProjectRunHandle` con `ready`, `result`, `snapshot`, `pause`, `resume`, `cancel` y `subscribe`. Los fallos retryable vuelven a `ready` hasta `maxAttempts`; un fallo de dependencia produce `blocked`. `recover` lee el mismo `ProjectLedger`, reabre estados activos como `ready` y continúa desde el siguiente intento.

El orquestador no importa Subagents ni Jobs: recibe un worker compatible. El ledger y el administrador de leases también son inyectables, por lo que la integración durable puede sustituir las implementaciones MVP.

## Model Experience

### Estado de ejecución

#### What the model sees

No expone una herramienta de modelo. Si una superficie de producto usa `ProjectOrchestrator`, esa superficie debe definir sus propios textos, límites y presentación de estados.

#### Token effect

No añade tokens por sí mismo.

#### KV Cache effect

No aplica; el paquete no ensambla prompts.

## Known Limitations and Deferred Work

- La salida y la evidencia viven en memoria; recovery reconstruye estados y vuelve a ejecutar tareas activas, pero no restaura resultados previos.
- Pausar impide nuevos inicios y deja terminar workers activos; cancel solicita cancelación y espera su settlement para cerrar el run.
- No hay backoff temporal en el MVP; los reintentos son inmediatos y deterministas.
