# Spruce Claude Hybrid Replies Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add hybrid Claude replies for inbound Spruce patient messages.

**Architecture:** Add a server-side AI reply helper that classifies inbound SMS messages and returns a send decision. Wire it into the existing Spruce webhook after opt-out detection and use the existing Spruce outbound sender for safe automatic replies or escalation acknowledgements.

**Tech Stack:** Next.js App Router, TypeScript, Anthropic SDK, Jest, existing Spruce server service.

---

### Task 1: Add AI Reply Helper Tests

**Files:**
- Create: `__tests__/services/spruce-ai-replies.test.ts`

**Step 1:** Write tests for clinical keyword fallback, Claude JSON parsing, disabled config, and reply text limits.

**Step 2:** Run `npx jest __tests__/services/spruce-ai-replies.test.ts --runInBand`.

**Expected:** FAIL because the helper does not exist.

### Task 2: Implement AI Reply Helper

**Files:**
- Create: `services/spruce-ai-replies.ts`

**Step 1:** Export `classifySpruceReply` and related types.

**Step 2:** Add deterministic pre-checks for opt-out, empty text, emergency and clinical keywords.

**Step 3:** Call Claude only when `SPRUCE_AI_REPLIES=true` and `ANTHROPIC_API_KEY` exists.

**Step 4:** Parse Claude JSON defensively and clamp reply text.

**Step 5:** Run `npx jest __tests__/services/spruce-ai-replies.test.ts --runInBand`.

**Expected:** PASS.

### Task 3: Add Webhook Contract Tests

**Files:**
- Create: `__tests__/app/spruce-ai-webhook-contract.test.ts`

**Step 1:** Assert the Spruce webhook imports the AI helper and `sendTextToPhone`.

**Step 2:** Assert opt-out handling remains before AI handling.

**Step 3:** Run `npx jest __tests__/app/spruce-ai-webhook-contract.test.ts --runInBand`.

**Expected:** FAIL until the webhook is wired.

### Task 4: Wire Spruce Webhook

**Files:**
- Modify: `app/api/webhooks/spruce/route.ts`

**Step 1:** Resolve patient and order context from message or phone.

**Step 2:** Call `classifySpruceReply` after opt-out handling.

**Step 3:** Send auto replies when allowed.

**Step 4:** Send escalation acknowledgement when configured.

**Step 5:** Log decisions and send failures.

**Step 6:** Run the focused tests.

**Expected:** PASS.

### Task 5: Verify and Publish

**Files:**
- Verify all changed files.

**Step 1:** Run `npx jest __tests__/services/spruce-ai-replies.test.ts __tests__/app/spruce-ai-webhook-contract.test.ts __tests__/services/spruce-server.test.ts --runInBand`.

**Step 2:** Run `npm run build`.

**Step 3:** Stage only intended files.

**Step 4:** Commit with `feat: add hybrid Claude replies for Spruce`.

**Step 5:** Push the branch.
