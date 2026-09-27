---
description: "Biblioteca acotada de skills, templates, referencias y checklists por proyecto."
kind: "package-library"
---

# @deepseek-ai/dsh-project-library

No invariant companion is published; la biblioteca rechaza duplicados al registrar cada entrada.

## Resumen

`ProjectLibrary` ofrece un catálogo por proyecto para recursos que el planner o un worker puede consultar.

## Model Experience

### Recursos de proyecto

#### What the model sees

El consumidor puede seleccionar una entrada de `ProjectLibrary` y convertirla en contexto; el catálogo no ejecuta ni inyecta recursos por sí mismo.

#### Token effect

Condicional y limitado por el consumidor que seleccione entradas y aplique un presupuesto.

#### KV Cache effect

La selección de recursos puede reemplazar la sección de contexto que la presente; no administra caché de proveedor.

## Known Limitations and Deferred Work

- **Persistencia** — la biblioteca incluida vive en memoria.
- **Ejecución** — registrar una skill no la ejecuta ni concede permisos adicionales.
