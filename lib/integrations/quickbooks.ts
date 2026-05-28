/**
 * QuickBooks Payments Integration
 *
 * This file handles card collection and payment processing entirely through
 * QuickBooks Payments. When a charge succeeds, QuickBooks automatically
 * creates a paid invoice in QBO - no separate accounting call needed.
 *
 * PRODUCTION SETUP:
 * 1. Add the QB JS SDK to your page (see payment/page.tsx)
 *    <script src="https://js.intuit.com/v1/intuitpayments.min.js" />
 * 2. Set env variables (see .env.local):
 *    QUICKBOOKS_CLIENT_ID
 *    QUICKBOOKS_CLIENT_SECRET
 *    QUICKBOOKS_REALM_ID
 *    QUICKBOOKS_REFRESH_TOKEN   ← obtain via OAuth 2.0 flow once, then store
 * 3. OAuth access tokens expire every 1 hour - your server must auto-refresh
 *    using the refresh token before each API call.
 *
 * FLOW:
 *   Browser: QB JS SDK tokenizes card → returns a one-time token
 *   Server:  POST /api/payments/charge  { token, amount, orderId }
 *            → calls QB Payments API → charge succeeds
 *            → QB auto-creates paid invoice in QBO
 *            → update order paymentStatus = "completed"
 */

// ─── Step 1: Tokenize card in the browser ──────────────────────────────────
//
// In production, replace the card <input> fields with QB's hosted fields.
// The SDK never exposes raw card data to your JavaScript.
//
// Example (client-side, inside payment/page.tsx):
//
//   const payments = window.IntuitPayments.create({ environment: "sandbox" });
//   const card = payments.hostedFields(); // renders QB's secure card fields
//   const { token } = await card.submit(); // returns a one-time-use token
//   // send `token` + `amount` to your API route

// ─── Step 2: Charge the card (server-side API route) ───────────────────────
//
// Create: app/api/payments/charge/route.ts
//
// export async function POST(req: Request) {
//   const { token, amount, orderId, patientEmail, patientName } = await req.json();
//
//   const accessToken = await getQBAccessToken(); // refresh OAuth token
//
//   const res = await fetch(
//     `https://sandbox.api.intuit.com/quickbooks/v4/payments/charges`,
//     {
//       method: "POST",
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//         "Content-Type": "application/json",
//         "Request-Id": crypto.randomUUID(), // required by QB - must be unique per request
//       },
//       body: JSON.stringify({
//         amount: (amount / 100).toFixed(2),   // QB expects dollars, not cents
//         currency: "USD",
//         token,                               // one-time token from QB JS SDK
//         capture: true,                       // charge immediately (no auth-then-capture)
//         context: {
//           mobile: false,
//           isEcommerce: true,
//         },
//       }),
//     }
//   );
//
//   if (!res.ok) {
//     const err = await res.json();
//     return Response.json({ error: err }, { status: 400 });
//   }
//
//   const charge = await res.json();
//   // charge.id       → QB transaction ID
//   // charge.status   → "CAPTURED" on success
//   // QB automatically creates a paid invoice in QBO at this point
//
//   return Response.json({ transactionId: charge.id, status: charge.status });
// }

// ─── Step 3: OAuth token refresh (server-side helper) ──────────────────────
//
// async function getQBAccessToken(): Promise<string> {
//   const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/x-www-form-urlencoded",
//       Authorization: `Basic ${Buffer.from(
//         `${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`
//       ).toString("base64")}`,
//     },
//     body: new URLSearchParams({
//       grant_type: "refresh_token",
//       refresh_token: process.env.QUICKBOOKS_REFRESH_TOKEN!,
//     }),
//   });
//   const { access_token, refresh_token } = await res.json();
//   // Persist the new refresh_token - it rotates on every use
//   await updateStoredRefreshToken(refresh_token);
//   return access_token;
// }

// ─── Environment variables needed ──────────────────────────────────────────
//
// # .env.local
// QUICKBOOKS_CLIENT_ID=
// QUICKBOOKS_CLIENT_SECRET=
// QUICKBOOKS_REALM_ID=
// QUICKBOOKS_REFRESH_TOKEN=
//
// Sandbox base URL:    https://sandbox.api.intuit.com
// Production base URL: https://api.intuit.com
