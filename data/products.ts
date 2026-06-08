import type { Product } from "@/types";

const createdAt = "2026-05-25T00:00:00.000Z";

export const tirzepatideProduct: Product = {
  id: "product_tirzepatide",
  name: "Tirzepatide",
  slug: "tirzepatide",
  description: "8-week compounded Tirzepatide prescription with supplies included.",
  longDescription:
    "A provider-reviewed 8-week compounded Tirzepatide prescription. Choose the dose that matches your prescribed weekly amount.",
  startingPrice: 0.01,
  image: "/tirzepatide-vial.jpg",
  doses: [
    {
      id: "tirzepatide_20mg_8_week",
      label: "Tirzepatide 20mg",
      strength: "20mg vial",
      quantity: 1,
      price: 0.01,
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
      price: 0.01,
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
      price: 0.01,
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

export const retatrutideProduct: Product = {
  id: "product_retatrutide",
  name: "Retatrutide",
  slug: "retatrutide",
  description: "8-week compounded Retatrutide prescription with supplies included.",
  longDescription:
    "A provider-reviewed 8-week compounded Retatrutide prescription. A next-generation GLP-1/GIP/glucagon triple agonist for enhanced weight loss.",
  startingPrice: 0.01,
  image: "/retatrutide-vial.jpg",
  doses: [
    {
      id: "retatrutide_16mg_8_week",
      label: "Retatrutide 16mg",
      strength: "16mg vial",
      quantity: 1,
      price: 0.01,
      durationWeeks: 8,
      patientDescription: "8-Week Prescription",
    },
    {
      id: "retatrutide_32mg_8_week",
      label: "Retatrutide 32mg",
      strength: "32mg vial",
      quantity: 1,
      price: 0.01,
      durationWeeks: 8,
      patientDescription: "8-Week Prescription",
    },
    {
      id: "retatrutide_48mg_8_week",
      label: "Retatrutide 48mg",
      strength: "48mg vial",
      quantity: 1,
      price: 0.01,
      durationWeeks: 8,
      patientDescription: "8-Week Prescription",
    },
  ],
  eligibilityNote:
    "Final dose and eligibility are determined by a licensed provider after review.",
  isActive: true,
  faqs: [],
  createdAt,
};

export const semaglutideProduct: Product = {
  id: "product_semaglutide",
  name: "Semaglutide",
  slug: "semaglutide",
  description: "8-week compounded Semaglutide prescription with supplies included.",
  longDescription:
    "A provider-reviewed 8-week compounded Semaglutide prescription. A well-established GLP-1 receptor agonist for effective weight management.",
  startingPrice: 0.01,
  image: "/semaglutide-vial.jpg",
  doses: [
    {
      id: "semaglutide_2mg_8_week",
      label: "Semaglutide 2mg",
      strength: "2mg vial",
      quantity: 1,
      price: 0.01,
      durationWeeks: 8,
      patientDescription: "8-Week Prescription",
    },
    {
      id: "semaglutide_4mg_8_week",
      label: "Semaglutide 4mg",
      strength: "4mg vial",
      quantity: 1,
      price: 0.01,
      durationWeeks: 8,
      patientDescription: "8-Week Prescription",
    },
    {
      id: "semaglutide_6mg_8_week",
      label: "Semaglutide 6mg",
      strength: "6mg vial",
      quantity: 1,
      price: 0.01,
      durationWeeks: 8,
      patientDescription: "8-Week Prescription",
    },
  ],
  eligibilityNote:
    "Final dose and eligibility are determined by a licensed provider after review.",
  isActive: true,
  faqs: [],
  createdAt,
};

export const canonicalProducts: Product[] = [tirzepatideProduct, retatrutideProduct, semaglutideProduct];

const CANONICAL_BY_SLUG: Record<string, Product> = {
  tirzepatide: tirzepatideProduct,
  retatrutide: retatrutideProduct,
  semaglutide: semaglutideProduct,
};

export function normalizeProduct(product: Product): Product {
  const slug = product.slug?.toLowerCase();
  const canonical = slug ? CANONICAL_BY_SLUG[slug] : undefined;
  if (!canonical) return product;
  return {
    ...product,
    name: canonical.name,
    slug: canonical.slug,
    description: canonical.description,
    longDescription: canonical.longDescription,
    startingPrice: canonical.startingPrice,
    image: canonical.image,
    doses: canonical.doses,
    eligibilityNote: canonical.eligibilityNote,
    faqs: canonical.faqs,
  };
}

export function normalizeProducts(products: Product[]): Product[] {
  if (!products.length) return canonicalProducts;
  const normalized = products.map(normalizeProduct);
  const slugs = new Set(normalized.map((p) => p.slug));
  const missing = canonicalProducts.filter((p) => !slugs.has(p.slug));
  return [...missing, ...normalized];
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
    const isCanonical = Object.values(CANONICAL_BY_SLUG).some((c) => c.id === product.id);
    if (!existing || isCanonical) {
      bySlug.set(key, product);
    }
  }

  const deduped = Array.from(bySlug.values());
  return deduped.length ? deduped : canonicalProducts;
}
