---
title: Breezing workers run in a hidden worktree; uncommitted work must be moved back
author: Ivan
date: 2026-10-17
branch: LB-31-User-Gets-Logged-Out-Mid-Session
touches:
  - android/app/capacitor.build.gradle
  - android/app/src/main/AndroidManifest.xml
  - android/capacitor.settings.gradle
  - ios/App/CapApp-SPM/Package.swift
  - package-lock.json
  - package.json
  - src/app/app-routing.spec.ts
  - src/app/app.module.ts
  - src/app/core/auth.service.ts
  - src/app/core/profile.service.spec.ts
---

## Decided
- In no-commit runs, the claude-code-harness:worker agent is auto-isolated into `.harness-worktrees/<session>` cut from HEAD, so its uncommitted edits never reach the main tree. Copy them back (tracked diff via `git diff --binary` + `git apply`, new files copied by hand), then remove the worktree and its `harness/worker/*` branch.
- For dependent tasks (later task needs earlier uncommitted work), use a non-isolated agent so it sees the working tree.

## Tried and ruled out
- `git add -N` then `git diff` to include new files: the local git is old and renders intent-to-add files as edits of existing files, so `git apply` fails on them.

## Watch out
- Local git has no `git branch --show-current`; use `git rev-parse --abbrev-ref HEAD`.
- App installs need `--legacy-peer-deps` (pre-existing ng2-charts / @angular/cdk peer conflict).
- After moving a worker's package.json change, run `npm install --legacy-peer-deps` in the main tree before testing.
