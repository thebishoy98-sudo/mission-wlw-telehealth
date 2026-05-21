# AI Identity Verification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Charge patients even when uploads are skipped, but block LifeFile pharmacy dispatch until AI identity verification passes or provider/admin manually approves.

**Architecture:** Add server-side identity verification state, upload persistence, and dispatch gating. Payment completion creates a blocked review order when uploads are missing, Spruce sends a reminder link, upload completion triggers AI verification, and provider/admin can manually approve and dispatch.

**Tech Stack:** Next.js App Router, TypeScript, Vercel Postgres/local fallback DB, existing service modules, Anthropic/OpenAI-compatible vision call if configured, Spruce API/env, Jest.

---

### Task 1: Extend Types for Identity Verification

**Files:**
- Modify: `types/index.ts`
- Test: `__tests__/types/identity-verification.test.ts`

**Step 1: Write the failing test**

Create `__tests__/types/identity-verification.test.ts`:

```ts
import type { Order, ProviderReview } from "@/types";

describe("identity verification types", () => {
  it("allows orders to track identity state", () => {
    const order: Order = {
      id: "o1",
      patientId: "p1",
      productId: "prod",
      doseId: "dose",
      status: "pending_review",
      paymentStatus: "completed",
      pharmacyStatus: "draft",
      practiceQStatus: "pending",
      quickbooksStatus: "pending",
      identityStatus: "needs_review",
      identityReason: "missing_uploads",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(order.identityStatus).toBe("needs_review");
  });

  it("allows provider review to carry identity flags", () => {
    const review: ProviderReview = {
      id: "r1",
      orderId: "o1",
      patientId: "p1",
      status: "needs_more_info",
      identityAiResult: {
        status: "needs_review",
        confidence: 0.42,
        summary: "Face match uncertain",
        flags: ["low_confidence"],
      },
    };
    expect(review.identityAiResult?.flags).toContain("low_confidence");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest __tests__/types/identity-verification.test.ts --runInBand`

Expected: TypeScript compile failure for missing `identityStatus` / `identityAiResult`.

**Step 3: Update types**

In `types/index.ts` add:

```ts
export type IdentityStatus =
  | "missing"
  | "pending"
  | "verified"
  | "needs_review"
  | "rejected"
  | "manual_approved";

export interface IdentityAiResult {
  status: IdentityStatus;
  confidence: number;
  summary: string;
  flags: string[];
  checkedAt?: string;
}
```

Add optional fields to `Order`:

```ts
identityStatus?: IdentityStatus;
identityReason?: string;
identityReviewedAt?: string;
identityReviewedBy?: string;
identityAiResult?: IdentityAiResult;
identityUploadToken?: string;
```

Add optional fields to `ProviderReview`:

```ts
identityAiResult?: IdentityAiResult;
identityReviewRequired?: boolean;
```

**Step 4: Run test to verify it passes**

Run: `npx jest __tests__/types/identity-verification.test.ts --runInBand`

Expected: PASS.

**Step 5: Commit**

```bash
git add types/index.ts __tests__/types/identity-verification.test.ts
git commit -m "Add identity verification types"
```

---

### Task 2: Persist Identity Fields in DB Layers

**Files:**
- Modify: `lib/db.ts`
- Modify: `lib/db.server.ts`
- Modify: `lib/schema.sql`
- Test: `__tests__/lib/identity-db.test.ts`

**Step 1: Write failing local DB test**

Create `__tests__/lib/identity-db.test.ts`:

```ts
import * as db from "@/lib/db";

describe("identity fields in local order db", () => {
  it("preserves identity status updates", () => {
    db.orderDb.create({
      id: "identity-order",
      patientId: "p1",
      productId: "prod",
      doseId: "dose",
      status: "pending_review",
      paymentStatus: "completed",
      pharmacyStatus: "draft",
      practiceQStatus: "pending",
      quickbooksStatus: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.orderDb.update("identity-order", {
      identityStatus: "missing",
      identityReason: "missing_uploads",
    });

    const order = db.orderDb.getById("identity-order");
    expect(order?.identityStatus).toBe("missing");
    expect(order?.identityReason).toBe("missing_uploads");
  });
});
```

**Step 2: Run test**

Run: `npx jest __tests__/lib/identity-db.test.ts --runInBand`

Expected: compile failure until types/db update is complete.

**Step 3: Update local DB**

`lib/db.ts` stores arbitrary object spreads, but ensure no explicit type narrowing blocks identity fields. No extra implementation may be needed after Task 1.

**Step 4: Update server schema**

In `lib/schema.sql`, add nullable columns to `orders`:

```sql
identity_status TEXT,
identity_reason TEXT,
identity_reviewed_at TIMESTAMPTZ,
identity_reviewed_by TEXT,
identity_ai_result JSONB,
identity_upload_token TEXT
```

Also add an index:

```sql
CREATE INDEX IF NOT EXISTS idx_orders_identity_status ON orders(identity_status);
CREATE INDEX IF NOT EXISTS idx_orders_identity_upload_token ON orders(identity_upload_token);
```

**Step 5: Update server mapper and update query**

In `lib/db.server.ts`:
- Include identity columns in `orderDb.create`.
- Include identity columns in `orderDb.update`.
- Map identity columns in `rowToOrder`.

**Step 6: Run tests**

Run: `npx jest __tests__/lib/identity-db.test.ts --runInBand`

Expected: PASS.

**Step 7: Commit**

```bash
git add lib/db.ts lib/db.server.ts lib/schema.sql __tests__/lib/identity-db.test.ts
git commit -m "Persist identity verification state"
```

---

### Task 3: Add Upload Token and Reminder Link Utilities

**Files:**
- Create: `lib/identity.ts`
- Test: `__tests__/lib/identity.test.ts`

**Step 1: Write failing tests**

Create `__tests__/lib/identity.test.ts`:

```ts
import { createIdentityUploadToken, buildIdentityUploadUrl, getIdentityGate } from "@/lib/identity";
import type { Order } from "@/types";

const baseOrder: Order = {
  id: "o1",
  patientId: "p1",
  productId: "prod",
  doseId: "dose",
  status: "pending_review",
  paymentStatus: "completed",
  pharmacyStatus: "draft",
  practiceQStatus: "pending",
  quickbooksStatus: "pending",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("identity helpers", () => {
  it("creates opaque upload tokens", () => {
    expect(createIdentityUploadToken("o1")).toMatch(/^idv_/);
  });

  it("builds upload URL", () => {
    expect(buildIdentityUploadUrl("https://example.com", "idv_123"))
      .toBe("https://example.com/verify-identity/idv_123");
  });

  it("blocks pharmacy when identity is missing", () => {
    expect(getIdentityGate({ ...baseOrder, identityStatus: "missing" }).canDispatch).toBe(false);
  });

  it("allows pharmacy when identity is verified", () => {
    expect(getIdentityGate({ ...baseOrder, identityStatus: "verified" }).canDispatch).toBe(true);
  });
});
```

**Step 2: Run test**

Run: `npx jest __tests__/lib/identity.test.ts --runInBand`

Expected: FAIL module not found.

**Step 3: Implement helpers**

Create `lib/identity.ts`:

```ts
import crypto from "crypto";
import type { Order } from "@/types";

export function createIdentityUploadToken(orderId: string) {
  const random = crypto.randomBytes(18).toString("base64url");
  return `idv_${orderId}_${random}`;
}

export function buildIdentityUploadUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/verify-identity/${token}`;
}

export function getIdentityGate(order: Pick<Order, "identityStatus">) {
  const canDispatch =
    order.identityStatus === "verified" ||
    order.identityStatus === "manual_approved";
  return {
    canDispatch,
    blockedReason: canDispatch ? undefined : "identity_not_verified",
  };
}
```

**Step 4: Run test**

Run: `npx jest __tests__/lib/identity.test.ts --runInBand`

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/identity.ts __tests__/lib/identity.test.ts
git commit -m "Add identity verification helpers"
```

---

### Task 4: Gate Payment Route Pharmacy Dispatch

**Files:**
- Modify: `app/api/payments/charge/route.ts`
- Test: `__tests__/api/payment-identity-gate.test.ts`

**Step 1: Write failing test**

Because direct route testing has existing setup cost, write a focused helper-level test first by extracting the dispatch decision into `lib/identity.ts` if not already covered:

Add to `__tests__/lib/identity.test.ts`:

```ts
it("treats missing uploads as payment complete but dispatch blocked", () => {
  const gate = getIdentityGate({ identityStatus: "missing" });
  expect(gate.canDispatch).toBe(false);
  expect(gate.blockedReason).toBe("identity_not_verified");
});
```

**Step 2: Run test**

Run: `npx jest __tests__/lib/identity.test.ts --runInBand`

Expected: PASS if Task 3 done.

**Step 3: Modify payment route**

In `app/api/payments/charge/route.ts`:

- After payment and QuickBooks accounting, determine whether uploads are present.
- For first implementation, use `body.identityUploadsComplete === true` or persisted uploads if available.
- If missing:
  - Set order status to `pending_review`.
  - Set `pharmacyStatus` to `draft`.
  - Set `identityStatus` to `missing`.
  - Generate `identityUploadToken`.
  - Do not call `lifefile.createPharmacyOrder`.
  - Send Spruce `identity_upload_reminder`.
- If verified/manual-approved:
  - Allow LifeFile dispatch.

Pseudo-code:

```ts
const identityUploadsComplete = body.identityUploadsComplete === true;
const identityUploadToken = createIdentityUploadToken(orderId);

if (!identityUploadsComplete) {
  const uploadUrl = buildIdentityUploadUrl(req.nextUrl.origin, identityUploadToken);
  await dbServer.orderDb.update(orderId, {
    status: "pending_review",
    pharmacyStatus: "draft",
    identityStatus: "missing",
    identityReason: "missing_uploads",
    identityUploadToken,
  }).catch(() => {});

  await spruce.sendMessage(patient.id, "identity_upload_reminder", { orderId, uploadUrl }, patient);
  skipLifeFile = true;
}
```

**Step 4: Run relevant tests**

Run:

```bash
npx jest __tests__/lib/identity.test.ts __tests__/services/lifefile.test.ts --runInBand
npx tsc --noEmit
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/api/payments/charge/route.ts lib/identity.ts __tests__/lib/identity.test.ts
git commit -m "Gate pharmacy dispatch on identity verification"
```

---

### Task 5: Implement Real Spruce Send Path

**Files:**
- Modify: `services/spruce.ts`
- Modify: `lib/service-config.ts`
- Test: `__tests__/services/spruce.test.ts`

**Step 1: Write failing test**

Add to `__tests__/services/spruce.test.ts`:

```ts
it("has an identity upload reminder fallback template", () => {
  const message = spruce.sendMessage("p1", "identity_upload_reminder", {
    orderId: "o1",
    uploadUrl: "https://example.com/verify-identity/token",
  }, seededPatient);
  expect(message.messageText).toContain("identity");
  expect(message.messageText).toContain("https://example.com/verify-identity/token");
});
```

**Step 2: Run test**

Run: `npx jest __tests__/services/spruce.test.ts --runInBand`

Expected: FAIL missing template unless already added.

**Step 3: Add Spruce config**

In `lib/service-config.ts`, add:

```ts
accessId: process.env.SPRUCE_ACCESS_ID ?? "",
apiKey: process.env.SPRUCE_API_KEY ?? "",
baseUrl: process.env.SPRUCE_BASE_URL ?? "https://api.sprucehealth.com/v1",
```

**Step 4: Update Spruce templates**

In `services/spruce.ts`, add fallback:

```ts
identity_upload_reminder:
  "Your payment was received. Please complete identity verification before pharmacy processing can continue: {{uploadUrl}}",
```

Then implement real send only when `serviceConfig.spruce.useMock` is false. If the exact Spruce endpoint is not confirmed, keep mock behavior and log that real Spruce is not implemented yet.

**Step 5: Run tests**

Run: `npx jest __tests__/services/spruce.test.ts --runInBand`

Expected: PASS.

**Step 6: Commit**

```bash
git add services/spruce.ts lib/service-config.ts __tests__/services/spruce.test.ts
git commit -m "Add identity reminder Spruce template"
```

---

### Task 6: Add Verify Identity Upload Page

**Files:**
- Create: `app/verify-identity/[token]/page.tsx`
- Create: `app/api/identity/upload/route.ts`
- Modify: `lib/db.server.ts`
- Test: `__tests__/api/identity-upload.test.ts`

**Step 1: Write API test**

Create a focused test for upload route behavior if route testing infrastructure exists. If not, test the server helper extracted to `lib/identity-upload.ts`.

Expected behavior:

- Invalid token returns 404.
- Missing files returns 400.
- Valid token stores both uploads and sets `identityStatus=pending`.

**Step 2: Implement page**

Page requirements:

- Accept token from URL.
- Show ID upload and selfie video upload controls.
- Submit to `/api/identity/upload`.
- Show success message after submission.

**Step 3: Implement upload API**

`app/api/identity/upload/route.ts`:

- Parse multipart form data.
- Resolve order by `identityUploadToken`.
- Store uploads server-side.
- Set `identityStatus=pending`.
- Trigger AI verification helper.

**Step 4: Run tests**

Run:

```bash
npx jest __tests__/api/identity-upload.test.ts --runInBand
npx tsc --noEmit
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/verify-identity app/api/identity/upload lib/db.server.ts __tests__/api/identity-upload.test.ts
git commit -m "Add identity upload recovery page"
```

---

### Task 7: Add AI Verification Service

**Files:**
- Create: `services/identity-ai.ts`
- Modify: `app/api/identity/upload/route.ts`
- Test: `__tests__/services/identity-ai.test.ts`

**Step 1: Write tests**

Create tests for deterministic mock outcomes:

```ts
import { verifyIdentity } from "@/services/identity-ai";

it("returns needs_review when AI key is absent", async () => {
  const result = await verifyIdentity({ idImageBase64: "id", selfieFrameBase64: "selfie" });
  expect(result.status).toBe("needs_review");
});
```

**Step 2: Implement service**

`services/identity-ai.ts`:

- If no AI key, return `needs_review` with flag `ai_not_configured`.
- If configured, send ID image + selfie frame to vision model.
- Parse structured response into `IdentityAiResult`.

**Step 3: Integrate in upload route**

- On pass: `identityStatus=verified`.
- On fail/uncertain: `identityStatus=needs_review` or `rejected`.
- Never auto-dispatch until this status update completes.

**Step 4: Run tests**

Run:

```bash
npx jest __tests__/services/identity-ai.test.ts --runInBand
npx tsc --noEmit
```

Expected: PASS.

**Step 5: Commit**

```bash
git add services/identity-ai.ts app/api/identity/upload/route.ts __tests__/services/identity-ai.test.ts
git commit -m "Add AI identity verification service"
```

---

### Task 8: Provider/Admin Review and Manual Approval

**Files:**
- Modify: `app/provider/page.tsx`
- Modify: `app/admin/orders/page.tsx`
- Create: `app/api/provider/identity-review/route.ts`
- Test: `__tests__/api/identity-review.test.ts`

**Step 1: Write API test**

Test manual approval:

- Given order `identityStatus=needs_review`, POST approve.
- Order becomes `identityStatus=manual_approved`.
- Pharmacy dispatch becomes allowed.

**Step 2: Implement API**

`app/api/provider/identity-review/route.ts`:

- Accept `{ orderId, action, notes }`.
- For `approve`, set `identityStatus=manual_approved`, `identityReviewedAt`, `identityReviewedBy`.
- For `reject`, set `identityStatus=rejected`, keep pharmacy draft.

**Step 3: Update UI**

Provider/admin pages show:

- Identity badge.
- Missing upload reason.
- AI summary/flags.
- Manual approve/reject buttons.
- Send to pharmacy only when `identityStatus` is `verified` or `manual_approved`.

**Step 4: Run tests**

Run:

```bash
npx jest __tests__/api/identity-review.test.ts --runInBand
npx tsc --noEmit
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/provider/page.tsx app/admin/orders/page.tsx app/api/provider/identity-review/route.ts __tests__/api/identity-review.test.ts
git commit -m "Add identity review controls"
```

---

### Task 9: End-to-End Verification

**Files:**
- Create or modify: `scripts/test-identity-gated-order.ts`

**Step 1: Add script**

Script should:

- Submit payment with `identityUploadsComplete=false`.
- Assert response success.
- Assert no LifeFile warning and no LifeFile dispatch for missing uploads.
- Confirm order status is `pending_review` if DB is available.

**Step 2: Run local tests**

Run:

```bash
npx jest __tests__/lib/identity.test.ts __tests__/services/spruce.test.ts __tests__/services/identity-ai.test.ts --runInBand
npx tsc --noEmit
```

Expected: PASS.

**Step 3: Deploy dev**

Run:

```bash
git push origin dev
npx vercel deploy --prod --force --yes --scope thebishoy98-9846s-projects --cwd <clean mission-wlw-dev-linked checkout>
```

Expected: `mission-wlw-dev.vercel.app` aliases to a ready deployment.

**Step 4: Manual QA**

Run these scenarios:

- Skip uploads, pay: QuickBooks charges, LifeFile does not receive order, Spruce reminder logs/sends.
- Upload ID/video through reminder link: AI runs.
- AI pass: LifeFile dispatch happens.
- AI needs review: provider/admin sees blocked order.
- Manual approve: LifeFile dispatch happens.

**Step 5: Commit final QA artifacts if appropriate**

Do not commit screenshots unless requested.
