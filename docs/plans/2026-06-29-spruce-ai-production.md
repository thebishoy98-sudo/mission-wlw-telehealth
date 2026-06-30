# Spruce AI Production Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reliably answer safe inbound Spruce SMS messages with Claude in production.

**Architecture:** A pure webhook parser validates current Spruce event envelopes and signatures. The route acknowledges immediately, then processes patient resolution, opt-out, classification, sending, and audit logging in a Next.js `after` task.

**Tech Stack:** Next.js, TypeScript, Anthropic SDK, Spruce Public API, Jest

---

1. Add failing tests for Base64 signature verification and inbound
   `conversationItem.created` parsing.
2. Implement the pure parser and signature verifier.
3. Add the existing conservative Claude classifier with focused tests.
4. Add failing route contract tests for `after`, inbound filtering, opt-out
   ordering, idempotent sending, and audit logs.
5. Replace the legacy webhook handler with the current Spruce event flow.
6. Run focused tests, full tests, and production build.
7. Merge and push `main`, deploy Render, register the Spruce endpoint, set the
   returned secret and AI feature flags, then verify a signed production event.
