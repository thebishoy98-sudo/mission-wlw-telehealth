/**
 * Peptide shop cart state — sessionStorage only (cleared when the tab closes).
 */

export interface CartItem {
  productId: string;
  doseId: string;
  quantity: number;
}

const STORAGE_KEY = "tele_peptide_cart";

export const getCart = (): CartItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveCart = (items: CartItem[]): void => {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

export const addToCart = (productId: string, doseId: string, quantity = 1): CartItem[] => {
  const items = getCart();
  const existing = items.find((i) => i.productId === productId && i.doseId === doseId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    items.push({ productId, doseId, quantity });
  }
  saveCart(items);
  return items;
};

export const updateCartQuantity = (productId: string, doseId: string, quantity: number): CartItem[] => {
  const items = getCart();
  const filtered = quantity <= 0
    ? items.filter((i) => !(i.productId === productId && i.doseId === doseId))
    : items.map((i) => (i.productId === productId && i.doseId === doseId ? { ...i, quantity } : i));
  saveCart(filtered);
  return filtered;
};

export const removeFromCart = (productId: string, doseId: string): CartItem[] => {
  const items = getCart().filter((i) => !(i.productId === productId && i.doseId === doseId));
  saveCart(items);
  return items;
};

export const clearCart = (): void => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
};

export const getCartCount = (items: CartItem[]): number =>
  items.reduce((sum, i) => sum + i.quantity, 0);
