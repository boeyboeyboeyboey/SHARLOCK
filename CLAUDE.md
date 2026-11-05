# Sharlock Hub: notes for Claude Code

Gamified cybersecurity learning site (IS216 Group 7). MEVN stack: Vue 3 `<script setup>` + Vite, Bootstrap 5.3, Pinia, Vue Router and Axios on the client; Express, Mongoose and MongoDB on the server. It is a pnpm workspace (`client`, `server`) with one root lockfile. Never add npm/yarn lockfiles.

## Binding policy

**Always default to a technical plan and assume the user will implement it by hand. Never create or edit code without explicit user permission for the specific edits. Approval of a plan alone is not permission to write code.**

@agents.md

`agents.md` is the single source of the repo rules (planning-and-teaching workflow, feature-selection decision tree, collision guardrail, auth/data/scoring rules, comment style, documentation upkeep). Claude Code imports it through the line above. Keep detailed shared rules in `agents.md`; the checklist below summarises them.

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

## Workflow checklist

1. Read `agents.md` in full and [README.md](README.md), the instructor-facing application guide. Inspect the relevant source without changing files.
2. Default to a technical plan for the user to implement by hand, following the shared [planning-and-teaching workflow](agents.md#planning-and-teaching-before-implementation). Include intended behaviour, approach, exact files, interfaces, risks, focused checks and **Docs impact**.
3. Discuss the plan and explain unfamiliar techniques. Stop before code edits unless the user explicitly instructs you to perform the specified edits. Plan approval, test failures and tool permissions do not authorise implementation.
4. If explicit code-edit permission and required owner/plan approvals already cover the same scope, make only those permitted edits without asking again. Do not expand scope, install dependencies, scaffold or run automatic fixes without permission.
5. Run the narrowest relevant checks for permitted changes. Never apply code fixes just because a check failed.
6. Make only documentation edits within the user's permitted scope. Keep the instructor README about running and using the app; report proposed work and approvals in the conversation rather than creating project logs.
7. Finish with a technical plan or a report of actual permitted edits, AI-generated outputs, checks run and remaining limits. Never claim unrun checks passed.

## Subagents

Follow the shared [project rules for delegation](agents.md#project-rules-for-delegation). Only the main session delegates under this project's rules; subagents must not delegate further, even where Claude Code supports nesting.

Non-fork subagents start with separate context; forks inherit the parent conversation. Most agents load the CLAUDE.md hierarchy, but Explore/Plan and agents configured with `omitClaudeMd` can omit it. Do not assume the parent conversation, project rules or approval details are present. Every delegation brief must:

- tell the subagent to read `agents.md` in full before starting the delegated task, including read-only work
- restate the approved scope, task mode (read-only technical planning by default, code edits only with explicit user permission), exact files it may touch, and that it must not edit other contributors' modules or the `llm/` engine
- restate the docs-upkeep rule (agents.md section 10) when it changes code, and the comment style (lowercase, minimal, no trailing full stop)
- tell it to stop and report if the work grows beyond that scope

Use Claude Code's supported tool restrictions and permission controls when enforcement is needed. Check the effective parent/subagent permission mode; a requested mode may be overridden by the parent mode. A task brief does not enforce path restrictions or authorise broader work. Do not widen settings or bypass approval to complete a delegated task.

The main session stays responsible for reviewing every subagent result and permitted diff, and for accurate instructor-facing documentation within the user's approved scope.

See [official Claude Code subagent documentation](https://code.claude.com/docs/en/sub-agents) and [permissions documentation](https://code.claude.com/docs/en/permissions). These project rules may be stricter than the platform permits; they do not change its actual capabilities or configuration.

## Branches and merge conflicts

Work on your own branch cut from the latest `origin/main`. Before any merge or PR, fetch `origin/main` and check for conflicts. On a conflict, stop and tell the user to alert the team. Never resolve conflicts in files another contributor owns. Never commit, push or open a PR unless asked.
