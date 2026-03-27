# Weixin Login UI and Session Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a SeedClaw sidebar Weixin login entry with a fullscreen QR modal, and change SeedAgent `/api/weixin-bridge/login/wait` into a local session-state polling endpoint that reports whether the background login flow has completed.

**Architecture:** Keep the Tencent/Weixin polling entirely inside SeedAgent `startLogin()`. Introduce an explicit in-memory login-session state machine keyed by `sessionKey`, expose it via `waitLogin()`, and let SeedClaw poll that local state after showing the QR code. On the client, isolate API/state logic in a composable and keep the sidebar/modal UI lightweight.

**Tech Stack:** SeedAgent (TypeScript, Hono, Vitest), SeedClaw (Vue 3, TypeScript, Pinia-style composables, node:test, Heroicons)

---

## File Structure

### SeedAgent
- Modify: `/root/.seedagent/agents/coder/workspace/seedagent/src/extensions/weixin-bridge/login-qr.ts` — replace promise-only pending-login cache with explicit session state storage/read helpers.
- Modify: `/root/.seedagent/agents/coder/workspace/seedagent/src/extensions/weixin-bridge/runtime.ts` — write pending/connected/expired/failed session states during background settlement and make `waitLogin()` read local state only.
- Modify: `/root/.seedagent/agents/coder/workspace/seedagent/src/extensions/weixin-bridge/types.ts` — add explicit login session status/result types shared by runtime/routes/tests.
- Modify: `/root/.seedagent/agents/coder/workspace/seedagent/src/server/routes/weixin-bridge.ts` — keep route surface, but return the new local polling payload.
- Test: `/root/.seedagent/agents/coder/workspace/seedagent/tests/unit/weixin-bridge-runtime.test.ts`
- Test: `/root/.seedagent/agents/coder/workspace/seedagent/tests/unit/weixin-bridge-routes.test.ts`

### SeedClaw
- Create: `/root/.seedagent/agents/coder/workspace/seedclaw/src/composables/useWeixinLogin.ts` — client API wrapper + modal/login state machine.
- Modify: `/root/.seedagent/agents/coder/workspace/seedclaw/src/components/AppSidebar.vue` — add login button, fullscreen modal, QR/status rendering, and wire composable state.
- Modify: `/root/.seedagent/agents/coder/workspace/seedclaw/src/i18n/zh.ts` — add sidebar/modal copy.
- Modify: `/root/.seedagent/agents/coder/workspace/seedclaw/src/i18n/en.ts` — add sidebar/modal copy.
- Test: `/root/.seedagent/agents/coder/workspace/seedclaw/tests/weixin-login.test.ts`

---

### Task 1: SeedAgent login session state model

**Files:**
- Modify: `/root/.seedagent/agents/coder/workspace/seedagent/src/extensions/weixin-bridge/types.ts`
- Modify: `/root/.seedagent/agents/coder/workspace/seedagent/src/extensions/weixin-bridge/login-qr.ts`
- Test: `/root/.seedagent/agents/coder/workspace/seedagent/tests/unit/weixin-bridge-runtime.test.ts`

- [ ] **Step 1: Write the failing runtime tests for local session polling states**

Add assertions for:
- fresh `startLogin()` session returns `pending`
- settled background login returns `connected`
- QR expiration becomes `expired`
- failed settlement becomes `failed`

- [ ] **Step 2: Run the focused runtime test file to verify it fails**

Run: `cd /root/.seedagent/agents/coder/workspace/seedagent && npx vitest run tests/unit/weixin-bridge-runtime.test.ts`
Expected: FAIL because the current `waitLogin()` only resolves settled success and cannot report pending/expired/failed local states.

- [ ] **Step 3: Add explicit login session state types**

Introduce a discriminated union similar to:

```ts
export type WeixinBridgeLoginSessionStatus = 'pending' | 'connected' | 'expired' | 'failed'

export type WeixinBridgeLoginSessionState =
  | { status: 'pending'; connected: false; authExpired: false; sessionKey: string; startedAt: number; qrcodeUrl: string }
  | { status: 'connected'; connected: true; authExpired: false; sessionKey: string; accountId: string }
  | { status: 'expired'; connected: false; authExpired: true; sessionKey: string; error: string }
  | { status: 'failed'; connected: false; authExpired: false; sessionKey: string; error: string }
```

- [ ] **Step 4: Replace promise-only pending-login storage with session-state storage**

Keep the background settle hook, but add helpers to:
- save active pending session state on `start()`
- update state on successful settlement
- update state on expired/failed settlement
- read current state synchronously for polling

- [ ] **Step 5: Run the focused runtime test file to verify it passes**

Run: `cd /root/.seedagent/agents/coder/workspace/seedagent && npx vitest run tests/unit/weixin-bridge-runtime.test.ts`
Expected: PASS

### Task 2: SeedAgent runtime/route wiring for local `/login/wait`

**Files:**
- Modify: `/root/.seedagent/agents/coder/workspace/seedagent/src/extensions/weixin-bridge/runtime.ts`
- Modify: `/root/.seedagent/agents/coder/workspace/seedagent/src/server/routes/weixin-bridge.ts`
- Test: `/root/.seedagent/agents/coder/workspace/seedagent/tests/unit/weixin-bridge-routes.test.ts`
- Test: `/root/.seedagent/agents/coder/workspace/seedagent/tests/unit/weixin-bridge-runtime.test.ts`

- [ ] **Step 1: Write/update failing tests for `waitLogin()` and route payloads**

Cover:
- `waitLogin(sessionKey)` returns `pending` immediately after `startLogin()`
- route returns the same local state payload
- route/runtime never call Tencent polling from `waitLogin()`

- [ ] **Step 2: Run the route + runtime tests to verify they fail**

Run: `cd /root/.seedagent/agents/coder/workspace/seedagent && npx vitest run tests/unit/weixin-bridge-runtime.test.ts tests/unit/weixin-bridge-routes.test.ts`
Expected: FAIL before implementation.

- [ ] **Step 3: Update runtime `startLogin()` and `waitLogin()`**

Implementation requirements:
- `startLogin()` stores a `pending` local session state before launching background settlement
- success path writes `connected`
- QR expiration writes `expired`
- other thrown errors write `failed`
- `waitLogin()` validates `sessionKey` and returns the current local state immediately
- `waitLogin()` must not call `pollQrStatus()` or await Tencent state directly

- [ ] **Step 4: Keep route compatibility but return the new polling payload**

`POST /api/weixin-bridge/login/wait` remains the endpoint, but simply returns `reply(c, await runtime.waitLogin(...))` with the local state union.

- [ ] **Step 5: Run route + runtime tests to verify they pass**

Run: `cd /root/.seedagent/agents/coder/workspace/seedagent && npx vitest run tests/unit/weixin-bridge-runtime.test.ts tests/unit/weixin-bridge-routes.test.ts`
Expected: PASS

### Task 3: SeedClaw Weixin login composable and UI

**Files:**
- Create: `/root/.seedagent/agents/coder/workspace/seedclaw/src/composables/useWeixinLogin.ts`
- Modify: `/root/.seedagent/agents/coder/workspace/seedclaw/src/components/AppSidebar.vue`
- Modify: `/root/.seedagent/agents/coder/workspace/seedclaw/src/i18n/zh.ts`
- Modify: `/root/.seedagent/agents/coder/workspace/seedclaw/src/i18n/en.ts`
- Test: `/root/.seedagent/agents/coder/workspace/seedclaw/tests/weixin-login.test.ts`

- [ ] **Step 1: Write the failing client tests**

Cover:
- composable starts login, stores QR, and polls local `/api/weixin-bridge/login/wait`
- polling stops after `connected`
- sidebar exposes a login button and modal-state-driven text helpers

Use real exported functions/composable logic where possible; mock `fetch` only at HTTP boundary.

- [ ] **Step 2: Run the client test file to verify it fails**

Run: `cd /root/.seedagent/agents/coder/workspace/seedclaw && node --experimental-strip-types --test tests/weixin-login.test.ts`
Expected: FAIL because the composable/UI does not exist yet.

- [ ] **Step 3: Implement `useWeixinLogin.ts`**

State requirements:
- `isModalOpen`
- `isStarting`
- `sessionKey`
- `qrCodeUrl`
- `status: 'idle' | 'pending' | 'connected' | 'expired' | 'failed'`
- `errorMessage`

Behavior requirements:
- `openModal()` just opens
- `startLogin()` calls `/api/weixin-bridge/login/start`, stores QR/session info, sets `pending`, and starts interval polling of `/api/weixin-bridge/login/wait`
- polling interval should stop on `connected`, `expired`, `failed`, modal close, or composable disposal
- closing the modal must clear timers but keep the current visible success state in memory for the next open within the same app session

- [ ] **Step 4: Implement sidebar button + fullscreen modal**

UI requirements:
- add a login button to the header actions, left of the settings button
- clicking the button opens a fullscreen overlay/modal
- modal top-right has a close button
- modal center shows QR image when available
- modal status text shows loading / waiting for scan / login success / expired / failed
- success state remains visible until the user closes the modal manually
- if modal opens from idle, automatically call `startLogin()` once

- [ ] **Step 5: Add i18n copy**

Add only the needed strings for button label and modal statuses in both `zh.ts` and `en.ts`.

- [ ] **Step 6: Run the client test file to verify it passes**

Run: `cd /root/.seedagent/agents/coder/workspace/seedclaw && node --experimental-strip-types --test tests/weixin-login.test.ts`
Expected: PASS

### Task 4: Verification

**Files:**
- No code changes expected unless verification exposes issues.

- [ ] **Step 1: Run SeedAgent focused verification**

Run: `cd /root/.seedagent/agents/coder/workspace/seedagent && npx vitest run tests/unit/weixin-bridge-runtime.test.ts tests/unit/weixin-bridge-routes.test.ts`
Expected: PASS

- [ ] **Step 2: Run SeedClaw focused verification**

Run: `cd /root/.seedagent/agents/coder/workspace/seedclaw && node --experimental-strip-types --test tests/weixin-login.test.ts`
Expected: PASS

- [ ] **Step 3: Run SeedClaw typecheck-safe verification**

Run: `cd /root/.seedagent/agents/coder/workspace/seedclaw && npm run tcs`
Expected: PASS

- [ ] **Step 4: Report actual results with evidence**

Include exact commands run and whether each passed.
