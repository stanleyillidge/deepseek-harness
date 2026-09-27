---
description: "Project Remote commands over the project capability seam."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-project-controller

No invariant companion is published; el controller solo expone el seam Remote.

## Resumen

`ProjectController` registra `ctx.remote.project` y delega las operaciones de proyectos a `ctx.project`. Expone listado, creación, apertura, actualización de instrucciones, inicio de runs y consulta de estado. Los payloads pertenecen a `@deepseek-ai/dsh-project/types`.

## API

El controller publica `list`, `create`, `open`, `updateInstructions`, `startRun` y `getStatus`. El servicio de dominio conserva la autoridad sobre validación, almacenamiento y ejecución; el controller no transforma respuestas ni errores.

## Model Experience

### Operaciones de proyecto

#### What the model sees

No añade prompts, herramientas ni resultados al contexto del modelo; `ProjectController` deja el namespace Remote disponible para consumidores de interfaz.

#### Token effect

Sin efecto directo: el cliente invoca las operaciones fuera de la solicitud del modelo.

#### KV Cache effect

Sin efecto directo ni invalidación de caché; cualquier contenido model-visible pertenece al consumidor que use el proyecto.


## Known Limitations and Deferred Work

- Este paquete no incluye una UI ni un proveedor de almacenamiento o ejecución; esas responsabilidades pertenecen a otros consumidores y providers.
