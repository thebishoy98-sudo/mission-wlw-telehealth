// Direct QuickBooks test via API call (no TypeScript compilation needed)
// Tests the real QB sandbox by calling the service through a fake HTTP request

const BASE = "https://mission-wlw-dev.vercel.app";

// We'll POST a test order directly to a simple test endpoint
// Instead, let's call QB API directly using the env vars from Vercel

async function getQBToken() {
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  const refreshToken = process.env.QB_REFRESH_TOKEN;
  
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing QB env vars - make sure .env.local is set");
  }

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${creds}`,
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function testQB() {
  console.log("🔍 Testing QuickBooks sandbox connection...\n");

  // Load .env.local
  const { readFileSync } = await import("fs");
  try {
    const env = readFileSync(".env.local", "utf8");
    for (const line of env.split("\n")) {
      const [k, ...v] = line.split("=");
      if (k && v.length) process.env[k.trim()] = v.join("=").trim();
    }
  } catch {
    console.log("No .env.local found, using existing env vars");
  }

  const realmId = process.env.QB_REALM_ID;
  if (!realmId) throw new Error("QB_REALM_ID not set");

  console.log("Getting access token...");
  const token = await getQBToken();
  console.log("✅ Token obtained\n");

  // Create a test customer in QB
  console.log("Creating test customer in QuickBooks sandbox...");
  const customerRes = await fetch(
    `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}/customer`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        DisplayName: `Test Patient ${Date.now()}`,
        PrimaryEmailAddr: { Address: "test@example.com" },
        PrimaryPhone: { FreeFormNumber: "555-123-4567" },
        BillAddr: { Line1: "123 Main St", City: "Austin", CountrySubDivisionCode: "TX", PostalCode: "78701" },
      }),
    }
  );

  const customerData = await customerRes.json();
  if (!customerRes.ok) {
    console.error("❌ Customer creation failed:", JSON.stringify(customerData, null, 2));
    return;
  }

  const customerId = customerData.Customer.Id;
  console.log(`✅ Customer created! ID: ${customerId}, Name: ${customerData.Customer.DisplayName}`);

  // Create an invoice
  console.log("\nCreating test invoice ($299)...");
  const invoiceRes = await fetch(
    `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}/invoice`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        CustomerRef: { value: customerId },
        Line: [{
          Amount: 299,
          DetailType: "SalesItemLineDetail",
          SalesItemLineDetail: {
            ItemRef: { value: "1", name: "Services" },
            UnitPrice: 299,
            Qty: 1,
          },
        }],
      }),
    }
  );

  const invoiceData = await invoiceRes.json();
  if (!invoiceRes.ok) {
    console.error("❌ Invoice creation failed:", JSON.stringify(invoiceData, null, 2));
    return;
  }

  const invoiceId = invoiceData.Invoice.Id;
  const invoiceNum = invoiceData.Invoice.DocNumber;
  console.log(`✅ Invoice created! ID: ${invoiceId}, Number: ${invoiceNum}, Amount: $${invoiceData.Invoice.TotalAmt}`);

  console.log("\n🎉 QuickBooks sandbox is fully connected!");
  console.log(`Check sandbox → Sales → Invoices for Invoice #${invoiceNum}`);
}

testQB().catch(console.error);
