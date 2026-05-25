"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import * as Types from "@/types";
import { formatCurrency } from "@/lib/utils";

export default function Products() {
  const [products, setProducts] = useState<Types.Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProducts() {
      try {
        const response = await fetch("/api/products", { cache: "no-store" });
        const payload = await response.json();
        setProducts(payload.products ?? []);
      } finally {
        setLoading(false);
      }
    }
    void loadProducts();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navbar variant="customer" />
      <div className="container-max py-16">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
          Treatment Options
        </h1>
        <p className="text-xl text-gray-600 mb-12">
          Explore our available treatment plans, all reviewed and approved by
          licensed providers.
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map((product) => (
            <Card key={product.id} clickable className="hover:shadow-lg">
              <CardContent className="p-0">
                <div className="aspect-video bg-gray-200 rounded-t-lg flex items-center justify-center">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover rounded-t-lg"
                    onError={(e) => {
                      e.currentTarget.src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23E5E7EB' width='400' height='300'/%3E%3C/svg%3E";
                    }}
                  />
                </div>
                <div className="p-6">
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                    {product.name}
                  </h2>
                  <p className="text-teal-600 font-bold text-lg mb-4">
                    Starting at {formatCurrency(product.startingPrice)}
                  </p>
                  <p className="text-gray-600 mb-4">{product.description}</p>

                  {product.doses.length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-gray-900 mb-2">
                        Available Doses
                      </h4>
                      <ul className="space-y-1 text-sm text-gray-600">
                        {product.doses.map((dose) => (
                          <li key={dose.id}>
                            • {dose.label} - {formatCurrency(dose.price)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-gray-500 mb-6 italic border-t pt-4">
                    {product.eligibilityNote}
                  </p>

                  <Link href={`/products/${product.id}`}>
                    <Button fullWidth variant="primary" className="mb-2">
                      View Details
                    </Button>
                  </Link>
                  <Link href="/start/info">
                    <Button fullWidth variant="outline">
                      Get Started
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {!loading && products.length === 0 && (
          <div className="text-center py-12">
            <p className="text-lg text-gray-600">
              No products available at this time.
            </p>
          </div>
        )}
        {loading && (
          <div className="text-center py-12 text-gray-500">Loading treatments...</div>
        )}
      </div>
    </div>
  );
}
