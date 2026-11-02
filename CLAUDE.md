# Sharlock Hub: notes for Claude Code

Gamified cybersecurity learning site (IS216 Group 7). MEVN stack: Vue 3 `<script setup>` + Vite, Bootstrap 5.3, Pinia, Vue Router and Axios on the client; Express, Mongoose and MongoDB on the server. It is a pnpm workspace (`client`, `server`) with one root lockfile. Never add npm/yarn lockfiles.

## Binding policy

@agents.md

`agents.md` is the single source of the repo rules (feature-selection decision tree, collision guardrail, auth/data/scoring rules, comment style, documentation upkeep). Claude Code imports it through the line above. Do not duplicate its rules in this file; change them in `agents.md` only.

## Read order

1. `agents.md` (imported above): read it before any edit.
2. [TASKS.md](TASKS.md): about 1.8k lines. Search it with `rg` for "Current authorization", your task ID and your name as owner; do not read it whole.
3. [README.md](README.md) sections 1-2: kickoff prompt and setup.
4. [DESIGN.md](DESIGN.md): before any UI work.
5. [CODE_STYLE.md](CODE_STYLE.md): before changing code.
6. The module README (`client/src/{features,games}/<id>/`, `server/src/modules/**/`) before touching that module.

## Commands (repo root)

```bash
npm install --global pnpm@12.3.4        # first setup only
pnpm install --frozen-lockfile
pnpm setup:env                          # creates local env files; never print them
pnpm db:local                           # local development MongoDB
pnpm dev                                # client :5173 + API :3000
pnpm build
pnpm lint
pnpm format:check
pnpm test:unit
pnpm test:integration
pnpm exec playwright install chromium   # required before reporting any E2E result
pnpm test:e2e
```

Never print, overwrite or commit `.env` or `server/.env`.

## Workflow checklist (every change)

1. Plan first, with a **Docs impact** line naming the Markdown files the change will update. Wait for approval (agents.md section 2).
2. Implement within the approved scope only.
3. Run the narrowest relevant checks (lint, `pnpm exec prettier --check` on the changed files, unit, targeted integration or E2E).
4. Update every doc named in agents.md section 10 in the same change: module README (with its `## Presentation summary` for games/activities), README setup and "Using the app", DESIGN.md, hub README.
5. Update the TASKS.md record. Task status lives only in TASKS.md.
6. Finish with a completion report listing the checks run and the docs updated, or "no docs impact" with the reason.

## Subagents

Subagents (Explore, Plan, general-purpose or custom agents) do not inherit this file or `agents.md`. Every delegation brief must:

- tell the subagent to read `agents.md` in full before any edit
- restate the approved scope, the files it may touch, and that it must not edit other contributors' modules or the `llm/` engine
- restate the docs-upkeep rule (agents.md section 10) when it changes code, and the comment style (lowercase, minimal, no trailing full stop)
- tell it to stop and report if the work grows beyond that scope

The main session stays responsible for reviewing every subagent change and for the docs and TASKS.md updates in the checklist above.

## Branches and merge conflicts

Work on your own branch cut from the latest `origin/main`. Before any merge or PR, fetch `origin/main` and check for conflicts. On a conflict, stop and tell the user to alert the team. Never resolve conflicts in files another contributor owns. Never commit, push or open a PR unless asked.
