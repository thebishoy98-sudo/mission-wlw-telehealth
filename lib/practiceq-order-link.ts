import type { Order, PracticeQFormSummary } from "@/types";

export function findPracticeQOrderMatch(
  form: Pick<PracticeQFormSummary, "externalClientId" | "clientId">,
  orders: Pick<Order, "id" | "patientId" | "practiceqClientId">[]
) {
  const externalClientId = form.externalClientId?.trim();
  if (externalClientId) {
    const order = orders.find((candidate) => candidate.id === externalClientId);
    if (order) return order;
  }

  const clientId = form.clientId?.trim();
  if (clientId) {
    const order = orders.find((candidate) => candidate.practiceqClientId === clientId);
    if (order) return order;
  }

  return null;
}
