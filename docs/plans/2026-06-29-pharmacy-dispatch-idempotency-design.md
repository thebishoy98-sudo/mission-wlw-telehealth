# Pharmacy Dispatch Idempotency and One-Vial Design

## Problem

One paid order can currently reach LifeFile more than once. Payment may dispatch
the order, then a PracticeQ approval resets the order to `approved` /
`pharmacyStatus: draft`. The admin UI exposes "Send to Pharmacy" again, and the
manual dispatch endpoint does not reject an existing pharmacy order.

The LifeFile tirzepatide payload also hard-codes a 2 mL vial. A 60 mg package is
therefore submitted as one 2 mL vial at 20 mg/mL (40 mg), rather than the
requested one 3 mL vial (60 mg).

## Approved Medication Mapping

Patients always receive exactly one medication vial.

| Medication | Package | Vial |
| --- | ---: | ---: |
| Tirzepatide | 20 mg | one 1 mL vial at 20 mg/mL |
| Tirzepatide | 40 mg | one 2 mL vial at 20 mg/mL |
| Tirzepatide | 60 mg | one 3 mL vial at 20 mg/mL |
| Retatrutide | 16 mg | one 1 mL vial at 16 mg/mL |
| Retatrutide | 32 mg | one 2 mL vial at 16 mg/mL |
| Retatrutide | 48 mg | one 3 mL vial at 16 mg/mL |

The LifeFile medication quantity is always `1`. Directions and eight-week days
supply remain unchanged.

## Dispatch Design

Add a database-backed dispatch claim before the shared pharmacy adapter performs
an external submission. The claim succeeds only for a completed payment whose
pharmacy status is `draft` or `error`, and only when no non-error pharmacy order
already exists. The atomic update changes the status to `processing`, preventing
concurrent dispatch paths from both reaching the pharmacy.

If a completed pharmacy order already exists, the adapter returns that record
without making another external call. If a claimed external submission fails,
the claim is released by setting `pharmacyStatus` to `error`.

The manual dispatch endpoint performs an explicit existing-order check and
returns HTTP 409. PracticeQ approval updates clinical and identity state but does
not reset pharmacy state for an already-dispatched order.

## Verification

Tests cover:

- One-vial LifeFile and AppSheet payloads for every tirzepatide package.
- One-vial LifeFile payloads for every retatrutide package.
- Atomic claim success, duplicate rejection, and retry after an error.
- Shared adapter behavior when an order already exists.
- Manual endpoint duplicate rejection.
- PracticeQ approval preserving dispatched state.

