import { findEstablishedOrder } from "@/lib/established-patient";
import type { Order } from "@/types";
const current = { id: "new", patientId: "patient", createdAt: "2026-09-25" } as Order;
const previous = { id: "prior", patientId: "patient", createdAt: "2026-08-01", status: "delivered", pharmacyStatus: "delivered", paymentStatus: "completed" } as Order;
test("recognizes a paid pharmacy order for the same patient", () => {
  expect(findEstablishedOrder(current, [previous])).toBe(previous);
});
test.each([
  { patientId: "someone_else" }, { id: "new" }, { paymentStatus: "failed" },
  { status: "cancelled" }, { status: "refunded" },
  { pharmacyStatus: "draft", status: "processing" }, { createdAt: "2026-10-01" },
])("does not treat an unrelated or unfulfilled order as established care", patch => {
  expect(findEstablishedOrder(current, [{ ...previous, ...patch } as Order])).toBeUndefined();
});
