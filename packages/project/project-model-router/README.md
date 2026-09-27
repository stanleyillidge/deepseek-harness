---
description: "Router puro de modelos con selección cheapest-first, filtros de capacidad, cuota y cooldown, y escalamiento explícito."
kind: "package-library"
---

# @deepseek-ai/dsh-project-model-router

No invariant companion is published; el router es una decisión pura sobre snapshots.

`dsh-project-model-router` calcula una ruta de modelo desde un `ModelRouteInventory`. El consumidor adapta el LLM existente a `ModelCandidate`, entrega costes y snapshots de cuota/capacidad, y conserva la autoridad para ejecutar el `modelId` devuelto. El paquete no invoca proveedores, no calcula precios y no actualiza cuotas.

## Selección

`selectModelRoute` descarta candidatos inválidos, de complejidad insuficiente, con contexto insuficiente, sin cuota o en cooldown. Entre los elegibles ordena por coste ascendente; los empates usan ajuste de complejidad, capacidad sobrante, cuota restante e identificador. El reloj `now` es parte de `ModelRoutingRequest`, así que la decisión es reproducible.

`escalateModelRoute` excluye la ruta anterior y los identificadores ya intentados. Si hay candidatos elegibles con una complejidad máxima superior a la anterior, los prioriza; dentro de ese grupo conserva el orden cheapest-first. La decisión solo contiene datos y no inicia una segunda llamada.

La interfaz `ModelRouter` permite integrar otra implementación con el mismo contrato. `DeterministicModelRouter` es la implementación sin estado incluida en este paquete; `ModelRouteInventory` es el punto de adaptación para `ctx.llm` u otra fuente existente.

## Fallos y propiedad

Una selección agotada devuelve `kind: 'unavailable'` con los motivos de descarte. Un candidato con cuota ausente se considera sin límite de cuota porque esa política pertenece al adaptador; una cuota presente debe cubrir al menos una solicitud y los tokens estimados. Un cooldown que vence exactamente en `now` ya permite seleccionar el candidato.

## Model Experience

### Request context and condition

#### What the model sees

El paquete no agrega mensajes, herramientas ni texto al modelo; el consumidor decide cómo representar la ruta o un fallo de disponibilidad.

#### Token effect

No añade tokens. `requiredContextTokens` y `estimatedTokens` son metadatos de admisión entregados por el consumidor.

#### KV Cache effect

No modifica la caché del modelo porque solo devuelve una decisión de selección.

## Known Limitations and Deferred Work

- **No ejecución ni reserva** — la cuota y el cooldown son snapshots de solo lectura; el consumidor debe reservar, invocar y actualizar el estado con su propia integración.
