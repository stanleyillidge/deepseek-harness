---
description: "Herramienta model-facing para operar el Project Runtime mediante el servicio de proyectos."
kind: "package-library"
---

# @deepseek-ai/dsh-tool-project

No invariant companion is published; el servicio `ctx.project` conserva la autoridad de persistencia y permisos.

## Resumen

Registra la herramienta `project` con operaciones para listar, abrir, crear, actualizar instrucciones, iniciar runs y consultar estado.

## Model Experience

### Contexto de proyecto

#### What the model sees

El modelo ve una única herramienta con una acción explícita y resultados JSON del servicio `ctx.project`.

#### Token effect

Los resultados dependen de la operación; el plugin no agrega memoria ni biblioteca automáticamente.

#### KV Cache effect

Una llamada de mutación invalida el estado que el consumidor deba volver a consultar; el plugin no administra caché.

## Known Limitations and Deferred Work

- **Composición** — el bundle debe incluir el plugin y un proveedor concreto de `ctx.project`.
- **Autorización** — las políticas de permisos pertenecen al servicio de proyectos y no se duplican en la herramienta.
