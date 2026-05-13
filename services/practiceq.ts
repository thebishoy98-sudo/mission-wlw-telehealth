/**
 * Mock PracticeQ Integration Service
 *
 * In production, replace API_BASE_URL with actual PracticeQ endpoint:
 * const API_BASE_URL = "https://api.practiceq.com/v2"
 * And add actual credentials for authentication
 */

import * as Types from "@/types";
import * as db from "@/lib/db";
import { generateId } from "@/lib/utils";

const API_BASE_URL = "https://mock.practiceq.api/v2"; // Placeholder - replace in production
const API_KEY = "sk_live_mock_key_12345"; // Placeholder - replace with real key

export const submitIntakePacket = (order: Types.Order): Types.PracticeQPacket => {
  // Gather order data
  const patient = db.patientDb.getById(order.patientId);
  const product = db.productDb.getById(order.productId);
  const answers = db.answerDb.getByOrder(order.id);
  const consent = db.consentDb.getByOrder(order.id);
  const uploads = db.uploadDb.getByOrder(order.id);

  if (!patient || !product) {
    throw new Error("Patient or product not found");
  }

  // Create PracticeQ packet
  const packet: Types.PracticeQPacket = {
    id: generateId(),
    orderId: order.id,
    patientId: order.patientId,
    submittedAt: new Date().toISOString(),
    status: "submitted",
    lastSyncAt: new Date().toISOString(),
    packetData: {
      patientInfo: patient,
      questionnaireAnswers: answers,
      consentRecord: consent || {},
      uploads: uploads,
      productRequested: product.name,
      doseSelected:
        product.doses.find((d) => d.id === order.doseId)?.label ||
        "Unknown",
    },
  };

  // Save packet
  const saved = db.practiceqDb.create(packet);

  // Log the action
  db.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "practiceq",
    action: "Intake packet submitted",
    orderId: order.id,
    patientId: order.patientId,
    status: "success",
    details: {
      packetId: saved.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      productName: product.name,
      // In production, would include real API request details:
      // apiEndpoint: `${API_BASE_URL}/intake/submit`,
      // requestId: "req_mock_12345"
    },
  });

  return saved;
};

export const getPacketStatus = (
  orderId: string
): { status: string; lastSync: string; errors?: string } => {
  const packet = db.practiceqDb.getByOrder(orderId);

  if (!packet) {
    return {
      status: "not_found",
      lastSync: new Date().toISOString(),
      errors: "Packet not found",
    };
  }

  // Simulate API call to check status
  // In production: const response = await fetch(`${API_BASE_URL}/intake/${packet.id}`, {...})
  // Mock scenario: sometimes mark as completed after a few seconds
  if (packet.status === "submitted") {
    // Auto-complete after a delay (simulating provider review)
    setTimeout(() => {
      db.practiceqDb.update(packet.id, { status: "completed" });
    }, 3000);
  }

  return {
    status: packet.status,
    lastSync: packet.lastSyncAt || new Date().toISOString(),
  };
};

export const simulateProviderReview = (orderId: string): void => {
  const packet = db.practiceqDb.getByOrder(orderId);
  if (packet) {
    db.practiceqDb.update(packet.id, {
      status: "completed",
      lastSyncAt: new Date().toISOString(),
    });
  }
};

/**
 * PRODUCTION NOTES:
 *
 * Replace with actual implementation:
 *
 * export const submitIntakePacket = async (order: Types.Order) => {
 *   const payload = {
 *     patient: { ... },
 *     intake: { ... },
 *     consent: { ... },
 *   };
 *
 *   const response = await fetch(`${API_BASE_URL}/intake/submit`, {
 *     method: "POST",
 *     headers: {
 *       "Authorization": `Bearer ${API_KEY}`,
 *       "Content-Type": "application/json",
 *     },
 *     body: JSON.stringify(payload),
 *   });
 *
 *   if (!response.ok) {
 *     throw new Error(`PracticeQ API error: ${response.statusText}`);
 *   }
 *
 *   const result = await response.json();
 *   // Save result to database...
 *   return result;
 * };
 */
