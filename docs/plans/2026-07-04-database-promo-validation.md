# Database Promo Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every valid Admin-created promo code automatically usable at checkout without hardcoded code lists.

**Architecture:** A shared server validator owns promo lookup and discount math. A narrow public endpoint supports checkout display, while the charge route independently revalidates and records usage only after capture.

**Tech Stack:** Next.js, TypeScript, PostgreSQL, Jest.

---

### Task 1: Shared promo validation

Create `lib/promo-code.server.ts` and focused tests for case-insensitive lookup,
active/expiration/max-use rules, flat/percent math, and atomic usage increment.
Run the tests red, implement minimally, then run green.

### Task 2: Public validation endpoint and checkout

Create `app/api/promo-codes/validate/route.ts`. Replace the hardcoded
`PROMO_CODES` map in `app/start/payment/page.tsx` with a POST request. Keep the
undiscounted `baseTotal` in the payment request. Add route and source contract
tests.

### Task 3: Server charge validation and usage

Replace `DISCOUNT_CODES` in `app/api/payments/charge/route.ts` with the shared
validator. Apply the returned discount once and increment usage only after the
payment record is successfully persisted. Add regression tests.

### Task 4: Verify and release

Run focused promo/payment tests, the full Jest suite, lint, and production
build. Merge to `main`, push, and confirm the remote commit.
