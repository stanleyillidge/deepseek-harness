---
description: "Web 客户端初始项目导航与项目工作区 UI。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-projects

[English](README.md) | 中文

## 概述

本包提供 Web 客户端的第一版项目界面。它拥有本地化导航标签、新建和打开操作、项目说明、运行状态，以及加载、错误和空状态。

`ProjectsPage` 是纯 props 组件。数据仍由宿主组合拥有，`UiProjectsService` 提供隔离的 `ctx.uiProjects` 导航注册入口。

## 使用本包

加载浏览器部分，向 `ProjectsPage` 提供 `projects` 状态、创建/打开/重试回调和标准 `projects` locale seat。通过 `ctx.uiProjects.registerNavigation` 把页面注册到宿主导航。

本包不持久化项目或运行记录，不调用远程 API，也不拥有模型可见工具。

## 模型体验

无。本包是浏览器 UI，不改变 provider 请求或会话历史。

## 运行时不变式

不发布伴生入口。本包拥有一个隔离的导航服务和一个纯展示组件，不修改 `ui-workspace` 或其他功能包。
