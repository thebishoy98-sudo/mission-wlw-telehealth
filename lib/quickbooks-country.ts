export function normalizeQuickBooksPaymentsCountry(country?: string | null) {
  const value = String(country ?? "").trim().toUpperCase();
  if (!value || value === "USA" || value === "UNITED STATES" || value === "UNITED STATES OF AMERICA") {
    return "US";
  }
  return value;
}
