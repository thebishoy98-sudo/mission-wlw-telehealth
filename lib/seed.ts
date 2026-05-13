import * as db from "@/lib/db";
import {
  seedProducts,
  seedPatients,
  seedOrders,
  seedPayments,
  seedQuestions,
  seedMessageTemplates,
} from "@/data/seed-data";
import * as Types from "@/types";
import { generateId } from "@/lib/utils";

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

export const initializeDemo = (): void => {
  if (typeof window === "undefined") return;

  // Always ensure all SMS templates exist (additive — safe to run on every startup)
  const existingTemplateKeys = db.messageTemplateDb.getAll().map((t) => t.key);
  seedMessageTemplates
    .filter((t) => !existingTemplateKeys.includes(t.key))
    .forEach((t) => db.messageTemplateDb.create(t));

  // Check if already seeded
  const existing = db.productDb.getAll();
  if (existing.length > 0) return;

  console.log("Initializing demo data...");

  // Seed products
  seedProducts.forEach((p) => db.productDb.create(p));

  // Seed patients
  seedPatients.forEach((p) => db.patientDb.create(p));

  // Seed orders
  seedOrders.forEach((o) => db.orderDb.create(o));

  // Seed payments
  seedPayments.forEach((p) => db.paymentDb.create(p));

  // Seed questions
  seedQuestions.forEach((q) => db.questionDb.create(q));

  // Seed message templates (already handled above, skip duplicates)
  seedMessageTemplates.forEach((t) => {
    const keys = db.messageTemplateDb.getAll().map((x) => x.key);
    if (!keys.includes(t.key)) db.messageTemplateDb.create(t);
  });

  // Create provider reviews for some orders
  createProviderReviews();

  // Create QuickBooks records
  createQuickbooksRecords();

  // Create PracticeQ packets
  createPracticeQPackets();

  // Create pharmacy orders
  createPharmacyOrders();

  // Create uploads
  createUploads();

  // Create Spruce messages
  createSpruceMessages();

  // Create integration logs
  createIntegrationLogs();

  // Initialize CMS content
  db.cmsDb.updateContent(db.getDefaultCMSContent());

  console.log("Demo data initialized!");
};

const createProviderReviews = (): void => {
  const orders = db.orderDb.getAll();

  // Order 1 - Approved
  db.providerReviewDb.create({
    id: generateId(),
    orderId: "order_1",
    patientId: "patient_1",
    status: "approved",
    reviewedAt: daysAgo(28),
    reviewedBy: "Dr. Sarah Johnson",
    notes: "Patient is a good candidate. Approved at 5mg dose.",
    approvedDose: "5mg",
  });

  // Order 2 - Pending
  db.providerReviewDb.create({
    id: generateId(),
    orderId: "order_2",
    patientId: "patient_2",
    status: "pending",
  });

  // Order 3 - Approved
  db.providerReviewDb.create({
    id: generateId(),
    orderId: "order_3",
    patientId: "patient_3",
    status: "approved",
    reviewedAt: daysAgo(7),
    reviewedBy: "Dr. Michael Chen",
    notes: "Approved. Patient should start with 2.5mg for first month.",
    approvedDose: "5mg",
  });

  // Order 4 - Approved
  db.providerReviewDb.create({
    id: generateId(),
    orderId: "order_4",
    patientId: "patient_4",
    status: "approved",
    reviewedAt: daysAgo(2),
    reviewedBy: "Dr. Emily Rodriguez",
    notes: "Standard approval. No contraindications noted.",
    approvedDose: "2.5mg",
  });
};

const createQuickbooksRecords = (): void => {
  const payments = db.paymentDb.getAll();

  payments.forEach((payment) => {
    db.quickbooksDb.create({
      id: generateId(),
      orderId: payment.orderId,
      paymentId: payment.id,
      customerRefId: `QB_CUST_${payment.patientId.substring(0, 8)}`,
      invoiceId: generateId(),
      invoiceNumber: `INV-2024-${Math.floor(Math.random() * 10000)}`,
      amount: payment.amount,
      taxAmount: 0,
      status: "created",
      syncedAt: new Date().toISOString(),
    });
  });
};

const createPracticeQPackets = (): void => {
  const orders = db.orderDb.getAll().filter((o) => o.practiceQStatus !== "pending");

  orders.forEach((order) => {
    const patient = db.patientDb.getById(order.patientId);
    if (!patient) return;

    const answers = db.answerDb.getByOrder(order.id);
    const consent = db.consentDb.getByOrder(order.id);
    const uploads = db.uploadDb.getByOrder(order.id);
    const product = db.productDb.getById(order.productId);

    db.practiceqDb.create({
      id: generateId(),
      orderId: order.id,
      patientId: order.patientId,
      submittedAt: order.submittedAt || new Date().toISOString(),
      status: "completed",
      lastSyncAt: new Date().toISOString(),
      packetData: {
        patientInfo: patient,
        questionnaireAnswers: answers,
        consentRecord: consent || {},
        uploads: uploads,
        productRequested: product?.name || "Unknown",
        doseSelected: product?.doses.find((d) => d.id === order.doseId)?.label || "Unknown",
      },
    });
  });
};

const createPharmacyOrders = (): void => {
  const orders = db.orderDb.getAll().filter((o) => o.pharmacyStatus !== "draft");

  orders.forEach((order) => {
    const patient = db.patientDb.getById(order.patientId);
    const product = db.productDb.getById(order.productId);
    const dose = product?.doses.find((d) => d.id === order.doseId);

    if (!patient || !product || !dose) return;

    const pharmacyOrder: Types.PharmacyOrder = {
      id: generateId(),
      orderId: order.id,
      patientId: order.patientId,
      lifeFileOrderId: `LF_${generateId()}`,
      status: order.pharmacyStatus,
      trackingNumber:
        order.pharmacyStatus === "shipped" || order.pharmacyStatus === "delivered"
          ? `UPS${Math.floor(Math.random() * 1000000000)}`
          : undefined,
      shippedAt:
        order.pharmacyStatus === "shipped" || order.pharmacyStatus === "delivered"
          ? daysAgo(1)
          : undefined,
      deliveredAt: order.pharmacyStatus === "delivered" ? daysAgo(0) : undefined,
      submittedAt: daysAgo(2),
      payload: {
        message: {
          id: generateId(),
          sentTime: new Date().toISOString(),
        },
        order: {
          general: {
            referenceId: order.id,
            memo: `${product.name} - ${dose.label}`,
          },
          prescriber: {
            npi: "1234567890",
            name: "Dr. Sample Provider",
            phone: "555-0000",
          },
          practice: {
            npi: "0987654321",
            name: "Sample Medical Practice",
            phone: "555-0001",
          },
          patient: patient,
          shipping: patient.shippingAddress,
          billing: patient.address,
          rxs: [
            {
              drugName: product.name,
              drugStrength: dose.strength,
              quantity: dose.quantity,
              directions: "Inject once weekly",
              refills: 11,
              daysSupply: 84,
              dateWritten: new Date().toISOString(),
            },
          ],
        },
      },
    };

    db.pharmacyOrderDb.create(pharmacyOrder);
  });
};

const createUploads = (): void => {
  const orders = db
    .orderDb
    .getAll()
    .filter((o) => o.status !== "draft" && o.status !== "pending_review");

  orders.forEach((order) => {
    // Add driver's license upload
    db.uploadDb.create({
      id: generateId(),
      orderId: order.id,
      type: "driver_license",
      filename: "drivers-license.jpg",
      fileSize: 245000,
      mimeType: "image/jpeg",
      base64Data:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='250'%3E%3Crect fill='%23FFF5E1' width='400' height='250'/%3E%3Crect x='20' y='20' width='360' height='210' stroke='%23333' stroke-width='2' fill='none'/%3E%3Ctext x='200' y='60' text-anchor='middle' font-size='20' font-weight='bold'%3EDriver's License%3C/text%3E%3Ctext x='200' y='100' text-anchor='middle' font-size='12'%3E(Demo Placeholder)%3C/text%3E%3Ctext x='50' y='140' font-size='11'%3EName: Sample User%3C/text%3E%3Ctext x='50' y='165' font-size='11'%3EDOB: 01/01/1985%3C/text%3E%3C/svg%3E",
      uploadedAt: daysAgo(5),
      status: "verified",
    });

    // Add selfie/video upload
    db.uploadDb.create({
      id: generateId(),
      orderId: order.id,
      type: "selfie_video",
      filename: "selfie-verification.mp4",
      fileSize: 5120000,
      mimeType: "video/mp4",
      base64Data:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23F0F0F0' width='400' height='300'/%3E%3Ccircle cx='200' cy='120' r='40' fill='%23DDD'/%3E%3Crect x='100' y='180' width='200' height='60' fill='%23DDD'/%3E%3Ctext x='200' y='290' text-anchor='middle' font-size='12' fill='%23999'%3ESelfie Verification (Demo)%3C/text%3E%3C/svg%3E",
      uploadedAt: daysAgo(4),
      status: "verified",
    });
  });
};

const createSpruceMessages = (): void => {
  const orders = db.orderDb.getAll();

  orders.forEach((order) => {
    const patient = db.patientDb.getById(order.patientId);
    if (!patient) return;

    // Message 1: Intake received
    db.spruceDb.create({
      id: generateId(),
      orderId: order.id,
      patientId: order.patientId,
      templateKey: "intake_received",
      phoneNumber: patient.phone,
      messageText: `Hi ${patient.firstName}, we've received your intake. A provider will review it and get back to you shortly.`,
      status: "sent",
      sentAt: order.submittedAt || daysAgo(5),
      createdAt: order.submittedAt || daysAgo(5),
    });

    // Message 2: Payment received (if paid)
    if (order.paymentStatus === "completed") {
      const payment = db.paymentDb.getByOrder(order.id);
      db.spruceDb.create({
        id: generateId(),
        orderId: order.id,
        patientId: order.patientId,
        templateKey: "payment_received",
        phoneNumber: patient.phone,
        messageText: `Thank you, ${patient.firstName}. We've received your payment for $${payment?.amount || 0}. Order ID: ${order.id}`,
        status: "sent",
        sentAt: daysAgo(4),
        createdAt: daysAgo(4),
      });
    }

    // Message 3: Sent to pharmacy (if applicable)
    if (order.pharmacyStatus !== "draft") {
      db.spruceDb.create({
        id: generateId(),
        orderId: order.id,
        patientId: order.patientId,
        templateKey: "sent_to_pharmacy",
        phoneNumber: patient.phone,
        messageText:
          "Your order has been sent to our pharmacy partner. You'll receive tracking info shortly.",
        status: "sent",
        sentAt: daysAgo(2),
        createdAt: daysAgo(2),
      });
    }

    // Message 4: Fulfilled (if fulfilled)
    if (order.pharmacyStatus === "fulfilled" || order.pharmacyStatus === "shipped") {
      db.spruceDb.create({
        id: generateId(),
        orderId: order.id,
        patientId: order.patientId,
        templateKey: "fulfilled",
        phoneNumber: patient.phone,
        messageText:
          "Your order has been fulfilled. Tracking information will be sent to you shortly once provided.",
        status: "sent",
        sentAt: daysAgo(1),
        createdAt: daysAgo(1),
      });
    }

    // Message 5: Tracking (if shipped)
    if (order.pharmacyStatus === "shipped" || order.pharmacyStatus === "delivered") {
      const pharmacy = db.pharmacyOrderDb.getByOrder(order.id);
      db.spruceDb.create({
        id: generateId(),
        orderId: order.id,
        patientId: order.patientId,
        templateKey: "tracking",
        phoneNumber: patient.phone,
        messageText: `Your tracking information is now available: ${pharmacy?.trackingNumber || "UPS123456789"}. Please contact us if you have any questions.`,
        status: "sent",
        sentAt: daysAgo(0),
        createdAt: daysAgo(0),
      });
    }
  });
};

const createIntegrationLogs = (): void => {
  const orders = db.orderDb.getAll();

  orders.forEach((order) => {
    // Log intake submission
    if (order.submittedAt) {
      db.integrationLogDb.create({
        id: generateId(),
        timestamp: order.submittedAt,
        integrationName: "system",
        action: "Intake submitted",
        orderId: order.id,
        patientId: order.patientId,
        status: "success",
        details: { orderStatus: order.status },
      });
    }

    // Log PracticeQ submission
    if (order.practiceQStatus === "completed") {
      db.integrationLogDb.create({
        id: generateId(),
        timestamp: daysAgo(4),
        integrationName: "practiceq",
        action: "Intake packet submitted",
        orderId: order.id,
        patientId: order.patientId,
        status: "success",
        details: { packetId: generateId() },
      });
    }

    // Log payment
    if (order.paymentStatus === "completed") {
      const payment = db.paymentDb.getByOrder(order.id);
      db.integrationLogDb.create({
        id: generateId(),
        timestamp: payment?.processedAt || daysAgo(3),
        integrationName: "system",
        action: "Payment processed",
        orderId: order.id,
        patientId: order.patientId,
        status: "success",
        details: { amount: payment?.amount, transactionId: payment?.transactionId },
      });
    }

    // Log QuickBooks
    if (order.quickbooksStatus === "created") {
      db.integrationLogDb.create({
        id: generateId(),
        timestamp: daysAgo(3),
        integrationName: "quickbooks",
        action: "Invoice created",
        orderId: order.id,
        patientId: order.patientId,
        status: "success",
        details: { invoiceNumber: `INV-2024-${Math.random()}` },
      });
    }

    // Log pharmacy submission
    if (order.pharmacyStatus !== "draft") {
      db.integrationLogDb.create({
        id: generateId(),
        timestamp: daysAgo(2),
        integrationName: "lifefile",
        action: "Pharmacy order submitted",
        orderId: order.id,
        patientId: order.patientId,
        status: "success",
        details: { lifeFileOrderId: `LF_${generateId()}` },
      });
    }

    // Log pharmacy status updates
    if (order.pharmacyStatus === "processing" || order.pharmacyStatus === "fulfilled") {
      db.integrationLogDb.create({
        id: generateId(),
        timestamp: daysAgo(1),
        integrationName: "lifefile",
        action: "Pharmacy status updated",
        orderId: order.id,
        patientId: order.patientId,
        status: "success",
        details: { newStatus: order.pharmacyStatus },
      });
    }
  });
};
