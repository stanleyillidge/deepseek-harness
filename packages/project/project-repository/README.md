---
description: "Operaciones Git locales y remotas con ejecutor inyectable, diagnóstico sanitizado y push deshabilitado por defecto."
kind: "package-library"
---

# @deepseek-ai/dsh-project-repository

No invariant companion is published; las operaciones Git se validan dentro del repositorio.

English | [中文](README.zh.md)

## Summary

La biblioteca permite inspeccionar y operar un checkout Git local, clonar un remoto y consultar sus cambios sin entregar el control a un shell global. El consumidor inyecta el ejecutor y conserva la ruta exacta del worktree. Las salidas y errores ocultan credenciales conocidas; `push` exige habilitación explícita y respeta ramas protegidas.

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

Usa esta biblioteca cuando una capa Host necesite trabajar con un repositorio sin acoplarse a PowerShell, Bash ni a un directorio de trabajo implícito.

### Entry point

El ejecutor recibe `argv` y `cwd`; la biblioteca no crea procesos por sí misma. El flujo mínimo conserva un checkout sucio y bloquea `push` mientras la política no lo habilite:

```text
const repository = new ProjectRepository({ path, executor })
const inspection = await repository.inspect()
const diff = await repository.diff()
```

`ProjectRepository.clone({ url, path, executor })` crea un checkout local desde un remoto. `fetch`, `branch`, `status`, `diff` y `commit` no limpian ni cambian de rama de forma implícita. Para permitir `push`, configura `policy.allowPush: true`; las ramas `main` y `master` siguen protegidas salvo otro opt-in.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Detalles de implementación</summary>

`ProjectRepository` traduce cada operación a una orden Git con `argv` y la ruta del worktree como `cwd`. La ejecución, la red y el aislamiento del proceso pertenecen al `RepositoryExecutor` inyectado. Los resultados se sanitizan antes de entrar en `RepositoryCommandError` o de regresar al caller.

La clonación usa un destino explícito y no sobrescribe un directorio existente. `status` expone entradas porcelain; `createBranch` crea una referencia sin checkout; `fetch` solo actualiza referencias locales; `commit` afecta el repositorio local. `push` es la única operación que puede escribir en un remoto y queda cerrada por la política predeterminada.

| Archivo | Responsabilidad |
| --- | --- |
| [`src/index.ts`](src/index.ts) | API, política, sanitización y construcción de órdenes |
| [`src/types.ts`](src/types.ts) | Tipos del ejecutor, worktrees y operaciones |
| [`tests/project-repository.spec.ts`](tests/project-repository.spec.ts) | Casos sintéticos de seguridad y preservación del checkout |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`docs/architecture.md`](../../../docs/architecture.md) — ubicación de las capacidades Host y de los ejecutores.
- [`packages/util/native-command`](../../util/native-command/README.md) — patrón de ejecución por `argv` para integraciones nativas.

-----

<a id="model-experience"></a>
## Model Experience

Esta biblioteca no añade texto, herramientas ni estado directamente visible para el modelo; `ProjectRepository` deja que sus consumidores decidan si una operación Git llega a una superficie del modelo.

### KV Cache effect

No produce solicitudes de modelo ni modifica prefijos de contexto.

## Known Limitations and Deferred Work

- **Autenticación remota** — el ejecutor debe proporcionar las credenciales de Git; esta biblioteca no almacena tokens ni configura helpers de credenciales.
- **Protección remota** — la política local bloquea ramas protegidas, pero las reglas del proveedor remoto siguen siendo la autoridad final.

### Dev Note

<details>
<summary>Contexto de mantenimiento</summary>

None.

</details>
