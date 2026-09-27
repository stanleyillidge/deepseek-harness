---
description: "Initial Projects navigation and project workspace UI for the web client."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-projects

English | [中文](README.zh.md)

## Summary

This package provides the first Projects surface for the web client. It owns the localized navigation label, create/open actions, project instructions, run status presentation, and loading, error, and empty states.

`ProjectsPage` is a pure-props component. Data ownership stays with the host composition, while `UiProjectsService` provides an isolated `ctx.uiProjects` registration face for navigation entries.

## Use this package

Load the browser half and provide `ProjectsPage` with a `projects` state, callbacks for create/open/retry, and the standard `projects` locale seat. Register the page in the host navigation through `ctx.uiProjects.registerNavigation`.

The package does not persist projects or runs. It does not call a remote API and it does not own a model-facing tool.

## Model Experience

None. `ProjectsPage` is a browser UI surface and does not change provider requests or session history.

## Runtime invariant

No companion is published. The package owns one isolated navigation service and a pure presentation component; it does not modify `ui-workspace` or another feature package.
