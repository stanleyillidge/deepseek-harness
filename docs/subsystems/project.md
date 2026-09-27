# Project Runtime

English | [Español](../../packages/project/README.md)

The `project/` group contains the local Project Runtime seams. The packages persist project state, build bounded context, validate plans, route models, schedule workers, verify results, recover runs, and expose a model-facing tool. They do not call providers by themselves; Host composition retains execution and permission authority.

## Runtime composition

`@deepseek-ai/dsh-project` owns the `ProjectService` seam and the SQLite repository. `project-controller` exposes that seam through Remote, while `ui-projects` renders the initial browser surface. `project-context`, `project-memory`, and `project-library` provide bounded data sources. `project-planner`, `project-model-router`, `project-orchestrator`, `project-worker`, `project-resource-lease`, `project-verifier`, and `project-recovery` form the deterministic execution layer. `project-repository` isolates Git commands and push policy. `tool-project` is the model-facing adapter.

## PlanV1

`@deepseek-ai/dsh-project-planner` owns `PlanV1`, where `tasks` form a directed graph through `dependsOn`. `validatePlanV1()` checks version, identifiers, task fields, duplicate or missing dependencies, cycles, scopes and configured limits. A successful result contains a stable lexicographic topological order and parallelizable levels.

## Model route selection

`@deepseek-ai/dsh-project-model-router` consumes `ModelRouteInventory` snapshots. A candidate is eligible only when its maximum complexity and context capacity cover the request, its quota covers the estimated tokens, and its cooldown has expired. Eligible candidates are sorted cheapest-first with deterministic tie-breaks. Escalation excludes previous attempts and prefers a higher maximum complexity when available.

The router returns identifiers and diagnostics only. It never invokes a model, reserves quota, changes cooldown state, or assumes a provider API.

## Current integration boundary

The packages are locally type-checked and tested as a vertical slice. A concrete provider that binds `ctx.project` to Workspace, Session, LLM, Subagent, Job, Browser, Computer Use, and durable host permissions is still required before the feature can be enabled in a shipped bundle. This is deliberate: the new packages do not duplicate those existing infrastructure seams.
