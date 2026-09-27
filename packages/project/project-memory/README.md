---
description: "Memoria acotada y específica de proyecto para contexto recuperable."
kind: "package-library"
---

# @deepseek-ai/dsh-project-memory

No invariant companion is published; el store mantiene sus límites al insertar y consultar.

## Resumen

`InMemoryProjectMemory` ofrece memoria por proyecto para hechos, decisiones, restricciones y artefactos. El contrato `ProjectMemoryStore` permite sustituirlo por SQLite sin cambiar el consumidor de contexto.

## Model Experience

### Memoria recuperada

#### What the model sees

El consumidor puede convertir resultados de `search` en contexto del proyecto, pero este paquete no inyecta prompts.

#### Token effect

Condicional: depende de cuántos registros seleccione el consumidor y del límite de contexto que aplique.

#### KV Cache effect

Reemplaza únicamente la sección de memoria que el consumidor reconstruya; no controla la caché del proveedor.

## Known Limitations and Deferred Work

- **Persistencia** — la implementación incluida es en memoria y pierde registros al reiniciar el proceso.
- **Búsqueda** — la recuperación es textual y determinista; no incluye embeddings ni ranking semántico.
