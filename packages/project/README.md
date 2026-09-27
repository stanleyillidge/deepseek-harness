---
description: "Paquetes del Project Runtime para persistencia, contexto, planificación, ejecución, recuperación y exposición de Proyectos."
kind: "package-group"
---

# project/ — Project Runtime

El grupo `project/` contiene los contratos y adaptadores del Project Runtime. La ejecución concreta sigue dependiendo de proveedores Host, Subagents, Jobs, LLM y herramientas ya existentes en Harness.

## Paquetes

| Paquete | Responsabilidad |
|---|---|
| [`project-planner/`](project-planner/README.md) | Validación determinista de planes, dependencias, scopes y límites; cálculo del DAG ejecutable. |
| [`project-model-router/`](project-model-router/README.md) | Selección cheapest-first y escalamiento sin invocar proveedores ni modificar cuotas. |
| [`project/`](project/README.md) | Seam de dominio, persistencia SQLite, validación e invariantes de proyectos. |
| [`project-orchestrator/`](project-orchestrator/README.md) | DAG, leases, workers, verificación, cancelación y recovery. |
| [`project-repository/`](project-repository/README.md) | Operaciones Git seguras sobre worktrees y remotos. |
| [`project-resource-lease/`](project-resource-lease/README.md) | Exclusión de scopes de escritura y recursos. |
| [`project-verifier/`](project-verifier/README.md) | Contrato de verificación de resultados. |
| [`project-worker/`](project-worker/README.md) | Adaptadores cancelables de workers. |
| [`project-context/`](project-context/README.md) | Ensamblaje acotado de instrucciones, repositorios y memoria autorizada. |
| [`project-memory/`](project-memory/README.md) | Memoria reciente por proyecto con búsqueda textual determinista. |
| [`project-library/`](project-library/README.md) | Registro y búsqueda de skills, plantillas, referencias y checklists. |
| [`tool-project/`](tool-project/README.md) | Herramienta model-facing para listar, configurar e iniciar proyectos. |

## Documentación relacionada

- [Referencia del subsistema project](../../docs/subsystems/project.md) — tipos compartidos y reglas de selección.
