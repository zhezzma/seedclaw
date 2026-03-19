# SeedClaw Cloudflare Workers Web Deploy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Actions based automatic and manual deployment of the SeedClaw web build to Cloudflare Workers static assets, targeting the `seedagent` branch and binding the custom domain `seedclaw.godgodgame.com`.

**Architecture:** Use a root `wrangler.jsonc` to describe a Workers static-assets deployment backed by the Vite `dist/` directory in SPA mode. Add a GitHub Actions workflow that runs on pushes to `seedagent` and on manual dispatch, installs dependencies, type-checks, builds, and executes `wrangler deploy` through the official Cloudflare action.

**Tech Stack:** Vite, Vue 3, TypeScript, Cloudflare Workers static assets, Wrangler, GitHub Actions.

---

## Chunk 1: Config and CI wiring

### Task 1: Add Wrangler config

**Files:**
- Create: `wrangler.jsonc`

- [ ] **Step 1: Write the deployment config**
- [ ] **Step 2: Set `assets.directory` to `./dist`**
- [ ] **Step 3: Set SPA fallback via `not_found_handling`**
- [ ] **Step 4: Add route for `seedclaw.godgodgame.com/*`**
- [ ] **Step 5: Save file**

### Task 2: Add GitHub Actions workflow

**Files:**
- Create: `.github/workflows/deploy-web.yml`

- [ ] **Step 1: Add push trigger for `seedagent`**
- [ ] **Step 2: Add `workflow_dispatch` manual trigger**
- [ ] **Step 3: Install Node 20 and dependencies with `npm ci`**
- [ ] **Step 4: Run `npm run tcs` and `npm run build`**
- [ ] **Step 5: Deploy with `cloudflare/wrangler-action@v3` using repo secrets**

## Chunk 2: Verification

### Task 3: Verify local project state

**Files:**
- Modify: none

- [ ] **Step 1: Run `npm run tcs`**
- [ ] **Step 2: Run `npx wrangler deploy --dry-run` or config validation equivalent if possible**
- [ ] **Step 3: Review workflow YAML for trigger and secret correctness**
- [ ] **Step 4: Report required GitHub secrets and Cloudflare DNS/domain prerequisites**
