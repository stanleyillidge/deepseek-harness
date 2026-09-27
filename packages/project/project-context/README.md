---
description: "Ensamblaje acotado de instrucciones, memoria y snapshots de repositorios para Projects."
kind: "package-library"
---

# @deepseek-ai/dsh-project-context

No invariant companion is published; el ensamblador aplica su presupuesto de caracteres en el punto de composición.

## Resumen

`buildProjectContext` compone instrucciones, la petición actual, resúmenes de repositorios y memoria autorizada en un orden estable y con límite explícito.

## Model Experience

### Contexto de proyecto

#### What the model sees

El consumidor recibe el texto producido por `buildProjectContext`; el paquete no llama al modelo ni decide qué proveedor lo consume.

#### Token effect

Acotado por `maxCharacters`; la conversión final de caracteres a tokens pertenece al consumidor y al proveedor.

#### KV Cache effect

La sección completa puede reemplazarse cuando cambie una instrucción, memoria o snapshot; el paquete no administra caché.

## Known Limitations and Deferred Work

- **Presupuesto** — el límite se expresa en caracteres, no en tokens exactos.
- **Autorización** — el consumidor debe filtrar los datos antes de entregar memoria o repositorios.
