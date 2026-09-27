---
description: "使用可注入执行器、安全诊断和默认关闭的 push 执行本地与远程 Git 操作。"
kind: "package-library"
---

# @deepseek-ai/dsh-project-repository

[English](README.md) | 中文

## Summary

该库可以检查和操作本地 Git checkout、克隆远程仓库并读取变更，而不会把控制权交给全局 shell。调用方注入执行器并保留 worktree 的精确路径。输出和错误会隐藏已知凭据；`push` 必须显式启用，并且遵守受保护分支规则。

## Table of Contents

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制和延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

当 Host 层需要访问仓库而不绑定 PowerShell、Bash 或隐式工作目录时，使用这个库。

### Entry point

执行器接收 `argv` 和 `cwd`；库本身不会创建进程。下面的最小流程保留脏 checkout，并在策略未启用时阻止 `push`：

```text
const repository = new ProjectRepository({ path, executor })
const inspection = await repository.inspect()
const diff = await repository.diff()
```

`ProjectRepository.clone({ url, path, executor })` 从远程创建本地 checkout。`fetch`、`branch`、`status`、`diff` 和 `commit` 不会隐式清理文件或切换分支。要允许 `push`，配置 `policy.allowPush: true`；除非再次显式选择，`main` 和 `master` 仍然受保护。

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>实现细节</summary>

`ProjectRepository` 将每个操作转换为带有 `argv` 和 worktree `cwd` 的 Git 命令。执行、网络和进程隔离由注入的 `RepositoryExecutor` 负责。结果在进入 `RepositoryCommandError` 或返回调用方之前会先进行清理。

克隆使用明确的目标路径，不会覆盖已有目录。`status` 暴露 porcelain 条目；`createBranch` 创建引用但不 checkout；`fetch` 只更新本地引用；`commit` 只影响本地仓库。`push` 是唯一可能写入远程的操作，并由默认策略关闭。

| 文件 | 职责 |
| --- | --- |
| [`src/index.ts`](src/index.ts) | API、策略、清理和命令构建 |
| [`src/types.ts`](src/types.ts) | 执行器、worktree 和操作类型 |
| [`tests/project-repository.spec.ts`](tests/project-repository.spec.ts) | 安全与 checkout 保留的合成用例 |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`docs/architecture.md`](../../../docs/architecture.zh.md) — Host 能力和执行器的位置。
- [`packages/util/native-command`](../../util/native-command/README.zh.md) — 使用 `argv` 执行原生集成的模式。

-----

<a id="model-experience"></a>
## Model Experience

该库不会直接向模型添加文本、工具或状态；是否将 Git 操作暴露给模型由调用方决定。

### KV Cache effect

它不会生成模型请求，也不会修改上下文前缀。

## Known Limitations and Deferred Work

- **远程认证** — 执行器必须提供 Git 凭据；该库不会保存 token，也不会配置凭据 helper。
- **远程保护** — 本地策略会阻止受保护分支，但远程提供方的规则仍然是最终权威。

### Dev Note

<details>
<summary>维护上下文</summary>

None.

</details>
