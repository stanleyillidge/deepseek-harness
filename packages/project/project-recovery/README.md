---
description: "Ledger idempotente y reconstrucción de runs de proyectos después de un crash."
kind: "package-library"
---

# @deepseek-ai/dsh-project-recovery

No invariant companion is published; el ledger mantiene la idempotencia dentro de su implementación.

## Resumen

`InMemoryProjectLedger` deduplica eventos por `idempotencyKey` y rechaza reutilizaciones con contenido distinto. `ProjectRunRecovery` lee la secuencia por run, conserva el último estado de cada tarea y convierte `leased`, `running`, `verifying` y `retrying` en `ready` para que el orquestador pueda reanudar.

## Uso

Un backend durable puede implementar `ProjectLedger` sin cambiar el orquestador. El recovery valida los IDs contra el DAG actual; los resultados de workers no se guardan automáticamente, por lo que un proceso nuevo vuelve a ejecutar dependientes incompletos según sus intentos registrados.

## Model Experience

### Ledger de recuperación

#### What the model sees

No expone herramientas ni texto de modelo; `ProjectRunRecovery` solo reconstruye estados para el orquestador.

#### Token effect

No añade tokens por sí mismo.

#### KV Cache effect

No aplica; solo conserva hechos de ejecución.

## Known Limitations and Deferred Work

- La implementación incluida es en memoria y sirve para MVP y pruebas.
- El ledger conserva estados y metadatos pequeños, no la salida completa ni la evidencia arbitraria del worker.
- Un lease de un proceso perdido no se reaprovecha: recovery deja la tarea lista y el nuevo proceso adquiere otro lease.
