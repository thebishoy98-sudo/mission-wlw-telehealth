"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, Minus, Plus, X } from "lucide-react";
import * as Types from "@/types";
import { formatCurrency } from "@/lib/utils";
import { addToCart, getCart, getCartCount, removeFromCart, updateCartQuantity, type CartItem } from "@/lib/cart-store";
import { ShopTopBar } from "@/components/peptides/ShopTopBar";

const ALL_CATEGORY = "All Peptides";

export default function PeptideShop() {
  const [products, setProducts] = useState<Types.Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    setCart(getCart());
    fetch("/api/products", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        const peptides = ((payload.products ?? []) as Types.Product[]).filter((p) => !!p.category);
        setProducts(peptides);
      })
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[];
    return [ALL_CATEGORY, ...unique];
  }, [products]);

  const visibleProducts = useMemo(
    () => (activeCategory === ALL_CATEGORY ? products : products.filter((p) => p.category === activeCategory)),
    [products, activeCategory]
  );

  const cartLines = useMemo(() => {
    return cart.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      const dose = product?.doses.find((d) => d.id === item.doseId);
      return { ...item, product, dose };
    }).filter((line) => line.product && line.dose);
  }, [cart, products]);

  const cartTotal = cartLines.reduce((sum, line) => sum + (line.dose!.price * line.quantity), 0);
  const cartCount = getCartCount(cart);

  const handleAddToCart = (product: Types.Product) => {
    const dose = product.doses[0];
    if (!dose) return;
    setCart(addToCart(product.id, dose.id, 1));
    setCartOpen(true);
  };

  const handleQuantityChange = (productId: string, doseId: string, quantity: number) => {
    setCart(updateCartQuantity(productId, doseId, quantity));
  };

  const handleRemove = (productId: string, doseId: string) => {
    setCart(removeFromCart(productId, doseId));
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <ShopTopBar />

      {/* Header */}
      <div className="bg-forest-800 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 flex items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-rose-300 mb-2 block">
              Peptide Shop
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Shop Peptides</h1>
            <p className="text-white/60 text-sm sm:text-base mt-2 max-w-lg">
              Ships directly to your door — no medical questionnaire or provider review required.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative shrink-0 bg-white/10 hover:bg-white/20 rounded-full p-3.5 transition-colors"
            aria-label="Open cart"
          >
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-400 text-forest-900 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid md:grid-cols-[220px_1fr] gap-8">
        {/* Sidebar categories */}
        <aside className="md:sticky md:top-6 self-start">
          <div className="text-[11px] font-bold uppercase tracking-widest text-forest-700 mb-3">
            Categories
          </div>
          <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`shrink-0 text-left text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap ${
                  activeCategory === category
                    ? "bg-forest-800 text-white"
                    : "bg-white text-gray-600 hover:bg-forest-800/5 border border-gray-100"
                }`}
              >
                {category}
              </button>
            ))}
          </nav>
        </aside>

        {/* Product grid */}
        <div>
          {loading ? (
            <p className="text-gray-400 text-sm">Loading peptides...</p>
          ) : visibleProducts.length === 0 ? (
            <p className="text-gray-400 text-sm">No peptides in this category yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-5">
              {visibleProducts.map((product) => (
                <div key={product.id} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="shrink-0 bg-gray-50 rounded-xl p-1.5">
                      <Image
                        src={product.image}
                        alt={`${product.name} vial`}
                        width={36}
                        height={56}
                        className="object-contain"
                        style={{ maxHeight: "56px", width: "auto" }}
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-forest-700 bg-forest-800/10 px-2 py-0.5 rounded-full">
                        {product.category}
                      </span>
                      <h3 className="text-lg font-bold text-forest-800 mt-1">{product.name}</h3>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-4 flex-1">{product.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold text-forest-800">
                      {formatCurrency(product.startingPrice)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAddToCart(product)}
                      className="bg-forest-800 hover:bg-forest-700 text-white text-sm font-bold px-4 py-2.5 rounded-full transition-colors active:scale-[.98]"
                    >
                      Add to Cart
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-forest-800">Your Cart</h2>
              <button type="button" onClick={() => setCartOpen(false)} aria-label="Close cart">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {cartLines.length === 0 ? (
                <p className="text-sm text-gray-400">Your cart is empty.</p>
              ) : (
                cartLines.map((line) => (
                  <div key={`${line.productId}_${line.doseId}`} className="flex items-center gap-3">
                    <div className="shrink-0 bg-gray-50 rounded-lg p-1">
                      <Image
                        src={line.product!.image}
                        alt={line.product!.name}
                        width={28}
                        height={44}
                        className="object-contain"
                        style={{ maxHeight: "44px", width: "auto" }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">{line.product!.name}</div>
                      <div className="text-xs text-gray-400">{formatCurrency(line.dose!.price)} each</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(line.productId, line.doseId, line.quantity - 1)}
                        className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-semibold w-5 text-center">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(line.productId, line.doseId, line.quantity + 1)}
                        className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(line.productId, line.doseId)}
                      className="text-gray-300 hover:text-red-400"
                      aria-label="Remove item"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <span className="font-semibold text-gray-900">Subtotal</span>
                <span className="text-xl font-bold text-forest-800">{formatCurrency(cartTotal)}</span>
              </div>
              <Link
                href="/peptides/checkout"
                className={`block text-center font-bold py-3.5 rounded-full text-sm transition-all ${
                  cartLines.length === 0
                    ? "bg-gray-100 text-gray-400 pointer-events-none"
                    : "bg-forest-800 hover:bg-forest-700 text-white active:scale-[.98]"
                }`}
              >
                Checkout
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Sticky cart bar (mobile-friendly) */}
      {!cartOpen && cartLines.length > 0 && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-forest-800 text-white rounded-full shadow-xl px-5 py-3 flex items-center gap-3 text-sm font-semibold z-40"
        >
          <ShoppingCart className="w-4 h-4" />
          {cartCount} item{cartCount === 1 ? "" : "s"} · {formatCurrency(cartTotal)}
        </button>
      )}
    </div>
  );
}
