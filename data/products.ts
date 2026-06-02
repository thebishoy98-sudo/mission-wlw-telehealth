import type { Product } from "@/types";

const createdAt = "2026-05-25T00:00:00.000Z";

export const tirzepatideProduct: Product = {
  id: "product_tirzepatide",
  name: "Tirzepatide",
  slug: "tirzepatide",
  description: "8-week compounded Tirzepatide prescription with supplies included.",
  longDescription:
    "A provider-reviewed 8-week compounded Tirzepatide prescription. Choose the dose that matches your prescribed weekly amount.",
  startingPrice: 349,
  image: "/tirzepatide-vial.jpg",
  doses: [
    {
      id: "tirzepatide_20mg_8_week",
      label: "Tirzepatide 20mg",
      strength: "20mg vial",
      quantity: 1,
      price: 349,
      durationWeeks: 8,
      weeklyDoseMg: 2.5,
      injectionUnits: 12.5,
      prescriptionLabel: "Inject 12.5 units (2.5mg) SbQ weekly.",
      patientDescription: "8-Week Prescription",
    },
    {
      id: "tirzepatide_40mg_8_week",
      label: "Tirzepatide 40mg",
      strength: "40mg vial",
      quantity: 1,
      price: 479,
      durationWeeks: 8,
      weeklyDoseMg: 5,
      injectionUnits: 25,
      prescriptionLabel: "Inject 25.0 units (5mg) SbQ weekly.",
      patientDescription: "8-Week Prescription",
    },
    {
      id: "tirzepatide_60mg_8_week",
      label: "Tirzepatide 60mg",
      strength: "60mg vial",
      quantity: 1,
      price: 799,
      durationWeeks: 8,
      weeklyDoseMg: 7.5,
      injectionUnits: 37.5,
      prescriptionLabel: "Inject 37.5 units (7.5mg) SbQ weekly.",
      patientDescription: "8-Week Prescription",
    },
  ],
  eligibilityNote:
    "Final dose and eligibility are determined by a licensed provider after review.",
  isActive: true,
  faqs: [
    {
      id: "tirzepatide_faq_frequency",
      question: "How often do I inject?",
      answer: "Once per week, on the same day each week, following the instructions on your prescription label.",
    },
    {
      id: "tirzepatide_faq_supplies",
      question: "Are supplies included?",
      answer: "Yes. The order includes the medication, syringes, alcohol swabs, cold-pack packaging, and overnight shipping.",
    },
    {
      id: "tirzepatide_faq_dose",
      question: "How do I know which dose to choose?",
      answer: "Choose the dose your provider directed. If you are not sure, select the starter option and the provider will review before anything is sent to the pharmacy.",
    },
  ],
  createdAt,
};

export const canonicalProducts: Product[] = [tirzepatideProduct];

export function normalizeProduct(product: Product): Product {
  const isTirzepatide =
    product.slug?.toLowerCase().includes("tirzepatide") ||
    product.name.toLowerCase().includes("tirzepatide");

  if (!isTirzepatide) return product;

  return {
    ...product,
    name: tirzepatideProduct.name,
    slug: tirzepatideProduct.slug,
    description: tirzepatideProduct.description,
    longDescription: tirzepatideProduct.longDescription,
    startingPrice: tirzepatideProduct.startingPrice,
    image: tirzepatideProduct.image,
    doses: tirzepatideProduct.doses,
    eligibilityNote: tirzepatideProduct.eligibilityNote,
    faqs: tirzepatideProduct.faqs,
  };
}

export function normalizeProducts(products: Product[]): Product[] {
  if (!products.length) return canonicalProducts;
  const normalized = products.map(normalizeProduct);
  const hasTirzepatide = normalized.some((product) => product.slug === "tirzepatide");
  return hasTirzepatide ? normalized : [tirzepatideProduct, ...normalized];
}

function isCustomerVisibleProduct(product: Product): boolean {
  const text = `${product.name} ${product.slug}`.toLowerCase();
  if (/\b(demo|test|prod|sample|placeholder)\b/.test(text)) return false;
  return product.isActive !== false;
}

export function normalizeCustomerProducts(products: Product[]): Product[] {
  const visible = normalizeProducts(products).filter(isCustomerVisibleProduct);
  const bySlug = new Map<string, Product>();

  for (const product of visible) {
    const key = product.slug || product.name.toLowerCase().trim();
    const existing = bySlug.get(key);
    if (!existing || product.id === tirzepatideProduct.id) {
      bySlug.set(key, product);
    }
  }

  const deduped = Array.from(bySlug.values());
  return deduped.length ? deduped : canonicalProducts;
}
