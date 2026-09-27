---
description: "Contratos de Projects, validación de invariantes y persistencia SQLite para proyectos, runs, tareas y workers; útil para proveedores Host que necesitan recarga segura y control de revisiones."
kind: "package-reference"
---

# @deepseek-ai/dsh-project

No invariant companion is published; las invariantes se validan al leer el snapshot SQLite.

English | [中文](README.zh.md)

## Summary

Este paquete permite registrar proyectos por workspace, conservar runs, tareas y workers, y reabrir el estado después de un reinicio. `SqliteProjectRepository` valida cada payload al abrir, rechaza workspaces duplicados y aplica actualizaciones compare-and-set mediante `revision`. `ProjectService` sigue siendo la capacidad Cordis que los proveedores Host pueden montar sobre estos contratos.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Cuándo elegirlo

Elige este paquete cuando el proveedor necesita una fuente durable para proyectos y sus relaciones inmediatas. Usa `ProjectService` para integrar una implementación Cordis con el Host y `SqliteProjectRepository` para persistencia local independiente del controller.

### Entrada mínima

```ts
const repository = await openProjectRepository('projects.sqlite')
const project = await repository.createProject({ workspace: '/workspace/demo', name: 'Demo' })
const updated = await repository.updateProject(project.id, project.revision, { name: 'Demo actualizado' })
await repository.close()
```

`workspace` es único después de eliminar espacios exteriores. Una revisión antigua produce `ProjectRevisionConflictError` con el registro actual; un payload inválido al abrir produce `ProjectCorruptionError`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Detalles de implementación</summary>

`SqliteProjectRepository` mantiene tablas separadas para proyectos, runs, tareas y workers. El payload completo se guarda como JSON junto con columnas de identidad, workspace y revisión para que SQLite pueda arbitrar unicidad y compare-and-set. La apertura lee todas las filas, ejecuta el validador y después comprueba referencias y unicidad mediante `assertProjectInvariants`.

| Archivo | Responsabilidad |
|---|---|
| [`src/types.ts`](src/types.ts) | Contratos de `ProjectRecord`, `ProjectRun`, `ProjectTask`, `Worker` y `ProjectRepository`. |
| [`src/sqlite.ts`](src/sqlite.ts) | Adaptador SQLite y ciclo de vida de la conexión. |
| [`src/validator.ts`](src/validator.ts) | Validación de filas y snapshots. |
| [`src/invariants.ts`](src/invariants.ts) | Invariantes entre tablas. |
| [`src/errors.ts`](src/errors.ts) | Errores tipados y códigos estables. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Consulta [`src/index.ts`](src/index.ts) para el servicio Cordis y [`tests/project.spec.ts`](tests/project.spec.ts) para las comprobaciones ejecutables.

-----

<a id="model-experience"></a>
## Model Experience

### Persistencia de proyectos

#### What the model sees

Nada directamente. `ProjectRepository` conserva datos para los consumidores Host y API; no agrega prompts, herramientas ni texto al request del modelo.

#### Token effect

Cero. Las operaciones de repositorio no se proyectan a la historia del modelo.

#### KV Cache effect

Independiente. Cambiar un proyecto no modifica el prefijo de una solicitud de modelo.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- El adaptador implementa SQLite local; la coordinación entre procesos y migraciones de versiones posteriores quedan fuera de esta fase.
- `ProjectService` sigue requiriendo un proveedor Cordis concreto para exponer operaciones al Host; el repositorio no inicia workers ni runs por sí mismo.

<a id="dev-note"></a>
### Dev Note

Las pruebas de [`tests/project.spec.ts`](tests/project.spec.ts) cubren creación, workspace duplicado, recarga, corrupción persistida, invariantes y conflicto de revisión.
