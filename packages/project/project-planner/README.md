---
description: "Validador determinista de PlanV1: dependencias DAG, scopes, límites y orden de ejecución estable."
kind: "package-library"
---

# @deepseek-ai/dsh-project-planner

No invariant companion is published; el planner valida el DAG en la misma operación.

`dsh-project-planner` valida entradas `PlanV1` sin ejecutar tareas ni depender de un LLM. Comprueba el formato, scopes autorizados, dependencias, ciclos y límites; cuando el plan es válido devuelve un orden topológico estable y niveles paralelizables.

## Uso

`validatePlanV1(value, options?)` recibe un valor no confiable y devuelve `{ ok: true, value }` o `{ ok: false, issues }`. Los diagnósticos se ordenan por la entrada y por identificadores, por lo que el mismo plan produce el mismo resultado. `assertValidPlanV1` ofrece la misma validación mediante `PlanValidationError`.

`PlanV1` contiene `version: 1`, un `id`, una lista de `tasks` y, opcionalmente, la lista de `scopes` autorizados. Cada tarea requiere `id`, `prompt` y `complexity`; `dependsOn` expresa aristas hacia tareas predecesoras y `scopes` debe ser un subconjunto de los scopes del plan. El orden recibido en `tasks` no altera `executionOrder`.

Los límites predeterminados se exponen como `DEFAULT_PLAN_VALIDATION_LIMITS` y pueden reemplazarse parcialmente por `PlanValidationOptions`. El consumidor puede exigir, entre otros, máximo de tareas, dependencias por tarea, profundidad, scopes, caracteres de prompt y tokens estimados.

## Fallos y propiedad

La validación nunca muta el valor de entrada ni ejecuta prompts. Un ciclo produce un diagnóstico `cycle` con el recorrido cerrado; una dependencia ausente, scope no autorizado o límite excedido conserva su código y ruta. Los empates del orden topológico se resuelven lexicográficamente por `id`.

## Model Experience

### Request context and condition

#### What the model sees

El paquete no crea contexto para el modelo; el consumidor que recibe el plan decide si expone sus diagnósticos u orden de ejecución.

#### Token effect

No agrega tokens a una solicitud; `estimatedInputTokens` y `estimatedOutputTokens` solo alimentan límites del plan.

#### KV Cache effect

No modifica ni invalida la caché del modelo porque no construye solicitudes ni llama a un proveedor.

## Known Limitations and Deferred Work

- **Formato versionado limitado a `PlanV1`** — la validación rechaza versiones distintas de `1`; una versión posterior debe declarar su propio formato y reglas.
