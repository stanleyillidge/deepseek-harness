---
description: "Contrato de verificación explícita para aceptar o rechazar resultados de tareas de proyectos."
kind: "package-library"
---

# @deepseek-ai/dsh-project-verifier

No invariant companion is published; la aceptación se decide en `ProjectVerifier.verify`.

## Resumen

Una tarea solo pasa a `succeeded` después de que `ProjectVerifier.verify` devuelve `verified: true`. Un rechazo contiene `reason` y `retryable`, de modo que la política de reintentos queda expresada en datos y no implícita en el worker.

## Uso

`ProjectCallbackVerifier` adapta una función de dominio. La solicitud incluye run, tarea, intento y resultado completo del worker; la evidencia positiva queda disponible en el snapshot del orquestador.

## Model Experience

### Resultado verificado

#### What the model sees

No expone herramientas ni mensajes de modelo. `ProjectVerifier` devuelve evidencia para que el consumidor decida cómo presentar una verificación fallida.

#### Token effect

No añade tokens por sí mismo.

#### KV Cache effect

No aplica; no altera contexto de modelo.

## Known Limitations and Deferred Work

- La evidencia no se escribe automáticamente en el ledger porque puede contener valores no serializables; el consumidor persistente debe registrar un resumen durable si lo necesita.
- El verificador no modifica tareas ni controla leases.
