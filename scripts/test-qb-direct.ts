// Direct test of QuickBooks accounting integration
// Run with: npx ts-node scripts/test-qb-direct.ts

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Set env so service-config picks up real QB
process.env.USE_REAL_QUICKBOOKS = "true";

async function testQB() {
  // Dynamically import after env is set
  const { createCustomerAndInvoice } = await import("../services/quickbooks");

  console.log("🔍 Testing QuickBooks integration...\n");

  const testOrder = {
    id: `test_order_${Date.now()}`,
    patientId: "test_patient_001",
    productId: "prod_test",
    doseId: "dose_test",
    status: "approved" as const,
    paymentStatus: "completed" as const,
    pharmacyStatus: "draft" as const,
    practiceQStatus: "submitted" as const,
    quickbooksStatus: "pending" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const testPatient = {
    id: "test_patient_001",
    firstName: "John",
    lastName: "TestPatient",
    dateOfBirth: "1985-06-15",
    gender: "male" as const,
    phone: "5551234567",
    email: "john.testpatient@example.com",
    address: { street1: "123 Main St", city: "Austin", state: "TX", zipCode: "78701", country: "US" },
    shippingAddress: { street1: "123 Main St", city: "Austin", state: "TX", zipCode: "78701", country: "US" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const testPayment = {
    id: `payment_${Date.now()}`,
    orderId: testOrder.id,
    patientId: "test_patient_001",
    amount: 299,
    currency: "USD" as const,
    status: "completed" as const,
    paymentMethod: "credit_card" as const,
    cardLast4: "1111",
    cardBrand: "Visa",
    transactionId: `txn_test_${Date.now()}`,
    createdAt: new Date().toISOString(),
  };

  try {
    console.log("Creating QB customer + invoice for John TestPatient ($299)...");
    const result = await createCustomerAndInvoice(testOrder, testPatient, testPayment);
    console.log("\n✅ SUCCESS! QB record created:");
    console.log(JSON.stringify(result, null, 2));
    console.log("\n👆 Check QuickBooks sandbox for this invoice!");
  } catch (err: any) {
    console.error("\n❌ FAILED:", err.message ?? err);
  }
}

testQB();
