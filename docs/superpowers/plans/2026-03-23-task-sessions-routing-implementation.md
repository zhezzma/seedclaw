# Task Sessions Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old cron/message-list semantics with explicit task-session routes, task-session state, and `sessionCategory` naming across seedclaw and seedagent.

**Architecture:** Reuse `HomeView.vue` for both `chat` and `tasks` routes, and route by `route.name` instead of query flags. Keep the backend filtering logic the same, but rename the public API and payload field from cron/sessionType terms to task/sessionCategory terms.

**Tech Stack:** Vue 3, Vue Router, TypeScript, node:test, Hono

---

### Task 1: Update pure routing helpers and tests

**Files:**
- Modify: `seedclaw/src/utils/notification-routing.ts`
- Modify: `seedclaw/tests/notification-routing.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests that assert:
- task session routes build with `name: 'tasks'`
- default session routes build with `name: 'chat'`
- no helper output contains `type=cron`
- notification fallback routes target task-session list semantics

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /root/.seedagent/agents/coder/workspace/seedclaw && node --experimental-strip-types --test tests/notification-routing.test.ts`
Expected: FAIL because helpers still use cron/message-list naming.

- [ ] **Step 3: Write minimal implementation**

Update helper types and route builders so they use:
- `sessionCategory: 'default' | 'task'`
- `chat` route for default sessions
- `tasks` route for task sessions and fallback list routing

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /root/.seedagent/agents/coder/workspace/seedclaw && node --experimental-strip-types --test tests/notification-routing.test.ts`
Expected: PASS

### Task 2: Rename frontend session state and loader semantics

**Files:**
- Modify: `seedclaw/src/composables/useSessionsState.ts`
- Modify: `seedclaw/tests/notification-routing.test.ts`

- [ ] **Step 1: Write the failing test**

Extend the routing test file with assertions that unknown categories do not route to `tasks`, and update any hard-coded cron expectations to task expectations.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /root/.seedagent/agents/coder/workspace/seedclaw && node --experimental-strip-types --test tests/notification-routing.test.ts`
Expected: FAIL until state/helper naming is updated consistently.

- [ ] **Step 3: Write minimal implementation**

Rename and update:
- `sessionType` -> `sessionCategory`
- `cronSessionsResult` -> `taskSessionsResult`
- `loadCronSessions()` -> `loadTaskSessions()`
- `resolveNotificationSessionType` -> `resolveNotificationSessionCategory`
- `/api/sessions/crons` -> `/api/sessions/tasks`

- [ ] **Step 4: Run focused verification**

Run: `cd /root/.seedagent/agents/coder/workspace/seedclaw && node --experimental-strip-types --test tests/notification-routing.test.ts`
Expected: PASS

### Task 3: Replace router/query-driven UI mode with explicit `tasks` route

**Files:**
- Modify: `seedclaw/src/router/index.ts`
- Modify: `seedclaw/src/config/navigation.ts`
- Modify: `seedclaw/src/views/HomeView.vue`
- Modify: `seedclaw/src/composables/useNavActive.ts`

- [ ] **Step 1: Write the failing test**

Add or update a small route-focused test file if needed under `seedclaw/tests/` that encodes:
- task-session route name is `tasks`
- `HomeView` mode derives from route name instead of query.type

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /root/.seedagent/agents/coder/workspace/seedclaw && node --experimental-strip-types --test tests/*.test.ts`
Expected: FAIL until router/navigation logic is switched.

- [ ] **Step 3: Write minimal implementation**

Change routing and UI state to:
- add `/tasks/:sessionkey?` named `tasks`
- remove `query: { type: 'cron' }` navigation entry
- add `sidebar.taskSessions`
- make `HomeView` load `taskSessionsResult` when `route.name === 'tasks'`
- make delete/back/select flows stay inside `/tasks`
- simplify nav-active logic to route-name checks

- [ ] **Step 4: Run focused verification**

Run: `cd /root/.seedagent/agents/coder/workspace/seedclaw && npm run tcs`
Expected: PASS

### Task 4: Update notification entry points and copy

**Files:**
- Modify: `seedclaw/src/App.vue`
- Modify: `seedclaw/src/composables/useNotify.ts`
- Modify: `seedclaw/src/i18n/zh.ts`
- Modify: `seedclaw/src/i18n/en.ts`

- [ ] **Step 1: Write the failing test**

Update `seedclaw/tests/notification-routing.test.ts` so every fallback expectation now targets the `tasks` route and task-session copy rather than message-list/cron copy.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /root/.seedagent/agents/coder/workspace/seedclaw && node --experimental-strip-types --test tests/notification-routing.test.ts`
Expected: FAIL until notification routing is updated.

- [ ] **Step 3: Write minimal implementation**

Update notification code so:
- exact task sessions route to `tasks/:sessionkey`
- fallback list route goes to `/tasks`
- toast copy says task-session list
- logs use `sessionCategory`

- [ ] **Step 4: Run focused verification**

Run: `cd /root/.seedagent/agents/coder/workspace/seedclaw && node --experimental-strip-types --test tests/notification-routing.test.ts && npm run tcs`
Expected: PASS

### Task 5: Rename backend API and payload field

**Files:**
- Modify: `seedagent/src/server/routes/sessions.ts`

- [ ] **Step 1: Write the failing verification target**

Identify the exact assertions implied by the frontend integration:
- session detail payload exposes `sessionCategory`
- task-session list lives at `/api/sessions/tasks`
- no `/crons` public route remains in the route source

- [ ] **Step 2: Run typecheck to establish current baseline**

Run: `cd /root/.seedagent/agents/coder/workspace/seedagent && npm run typecheck`
Expected: PASS before changes; this is the baseline verification command for the server task.

- [ ] **Step 3: Write minimal implementation**

Change backend route and payload naming:
- `sessionType` -> `sessionCategory`
- `'cron'` category value -> `'task'`
- `app.get('/crons', ...)` -> `app.get('/tasks', ...)`

- [ ] **Step 4: Run server verification**

Run: `cd /root/.seedagent/agents/coder/workspace/seedagent && npm run typecheck`
Expected: PASS

### Task 6: Full verification

**Files:**
- Verify only

- [ ] **Step 1: Run seedclaw tests**

Run: `cd /root/.seedagent/agents/coder/workspace/seedclaw && node --experimental-strip-types --test tests/*.test.ts`
Expected: PASS

- [ ] **Step 2: Run seedclaw typecheck**

Run: `cd /root/.seedagent/agents/coder/workspace/seedclaw && npm run tcs`
Expected: PASS

- [ ] **Step 3: Run seedagent typecheck**

Run: `cd /root/.seedagent/agents/coder/workspace/seedagent && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Manual routing checklist**

Verify if possible:
- navigation shows Chat and Task Sessions as peer entries
- `/chat/:sessionkey` stays in chat domain
- `/tasks/:sessionkey` stays in task-session domain
- Android notification fallback opens `/tasks`
