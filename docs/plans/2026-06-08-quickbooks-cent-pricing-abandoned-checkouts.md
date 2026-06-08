# QuickBooks One-Cent Pricing and Abandoned Checkouts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable production QuickBooks one-cent checkout testing while preserving original product pricing and adding admin visibility into incomplete checkouts.

**Architecture:** Product prices will be changed at the canonical product data layer so the customer sees and pays `$0.01`. Original prices will be preserved in a Markdown reference. Abandoned checkout tracking will extend the existing `partial_intakes` table and endpoint, then expose the data through a new admin API/page.

**Tech Stack:** Next.js App Router, TypeScript, React, PostgreSQL via `@vercel/postgres`, existing admin components, Jest for focused utility/API tests where practical.

---

Implementation tasks:

1. Preserve original product pricing in `docs/original-product-pricing.md`.
2. Add a focused Jest test proving all canonical prices are one cent.
3. Update `data/products.ts` prices to `0.01`.
4. Extend `partial_intakes` schema and `/api/intake/save-partial`.
5. Add checkout activity pings on info and payment pages.
6. Add admin API and page for abandoned checkouts.
7. Add production QuickBooks one-cent testing notes.
8. Run focused Jest test and TypeScript verification.

