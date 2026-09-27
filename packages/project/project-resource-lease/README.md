---
description: "Leases deterministas para impedir conflictos de escritura y recursos entre tareas de proyectos."
kind: "package-library"
---

# @deepseek-ai/dsh-project-resource-lease

No invariant companion is published; el administrador comprueba conflictos antes de publicar leases.

## Resumen

Este paquete reserva `writeScopes` y `resourceClaims` con leases efímeros. Los scopes se comparan como prefijos de rutas normalizadas; los claims se comparan por igualdad. `tryAcquire` publica un lease solo cuando todos los recursos están disponibles.

## Uso

`ProjectResourceLeaseManager` recibe un reloj y un TTL opcionales para mantener pruebas reproducibles. `renew` extiende un lease vigente, `release` es idempotente y `activeLeases` devuelve una copia ordenada.

El paquete no inicia workers, no persiste eventos y no conoce Subagents ni Jobs. `ProjectTask` se comparte como descriptor de dependencias y recursos para las capas superiores.

## Model Experience

### Reservas de recursos

#### What the model sees

No expone herramientas ni texto dirigido al modelo. `ProjectResourceLeaseManager` solo publica disponibilidad para el consumidor que coordina tareas.

#### Token effect

No añade tokens a solicitudes de modelo.

#### KV Cache effect

No aplica; el paquete no modifica prompts ni mensajes.

## Known Limitations and Deferred Work

- El MVP mantiene leases en memoria; un proceso nuevo necesita una política de recovery que vuelva a adquirir los recursos.
- Todos los claims son exclusivos; no existe modo compartido.
- El vencimiento se evalúa al consultar o adquirir, no mediante un temporizador en segundo plano.
