"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import * as Types from "@/types";
import { formatCurrency } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";

export default function ProductDetail() {
  const params = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<Types.Product | null>(null);

  const productId = Array.isArray(params.id) ? params.id[0] : params.id;

  useEffect(() => {
    if (productId) {
      fetch("/api/products", { cache: "no-store" })
        .then((response) => response.json())
        .then((payload) => {
          const found = (payload.products ?? []).find((item: Types.Product) =>
            item.id === productId || item.slug === productId
          );
          setProduct(found ?? null);
        })
        .catch(() => setProduct(null));
    }
  }, [productId]);

  if (!product) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-gray-600 mb-4">Product not found</p>
          <Link href="/products">
            <Button>Back to Products</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar variant="customer" />
      <div className="container-max py-8 sm:py-12">
        <button
          onClick={() => router.back()}
          className="flex items-center text-forest-800 hover:text-forest-800 mb-8"
        >
          <ChevronLeft size={20} />
          Back
        </button>

        <div className="grid md:grid-cols-2 gap-12">
          <div>
            <div className="relative aspect-square bg-white rounded-lg overflow-hidden border border-gray-100">
              <Image
                src={product.image}
                alt={product.name}
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-contain p-6"
                onError={(e) => {
                  e.currentTarget.src =
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Crect fill='%23E5E7EB' width='600' height='600'/%3E%3C/svg%3E";
                }}
              />
            </div>
          </div>

          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              {product.name}
            </h1>
            <p className="text-3xl font-bold text-forest-800 mb-6">
              Starting at {formatCurrency(product.startingPrice)}
            </p>

            <p className="text-lg text-gray-600 mb-8">
              {product.longDescription || product.description}
            </p>

            <Card className="mb-8">
              <CardContent className="p-6">
                <h3 className="font-semibold text-gray-900 mb-4">
                  Available Dose Options
                </h3>
                <div className="space-y-3">
                  {product.doses.map((dose) => (
                    <div
                      key={dose.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-forest-800"
                    >
                      <div>
                        <p className="font-semibold text-gray-900">
                          {dose.label}
                        </p>
                        <p className="text-sm text-gray-600">
                          {dose.patientDescription ?? `${dose.quantity} units`}
                        </p>
                      </div>
                      <p className="text-lg font-bold text-forest-800">
                        {formatCurrency(dose.price)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="bg-green-50 border border-green-100 rounded-lg p-6 mb-8">
              <p className="text-sm text-gray-700">
                <strong>Important:</strong> {product.eligibilityNote}
              </p>
            </div>

            <Link href="/start/info">
              <Button size="lg" fullWidth>
                Get Started
              </Button>
            </Link>
          </div>
        </div>

        {product.faqs && product.faqs.length > 0 && (
          <div className="mt-16 pt-12 border-t">
            <h2 className="text-2xl font-bold text-gray-900 mb-8">
              Product FAQ
            </h2>
            <div className="space-y-6">
              {product.faqs.map((faq) => (
                <Card key={faq.id}>
                  <CardContent className="p-6">
                    <h4 className="font-semibold text-gray-900 mb-2">
                      {faq.question}
                    </h4>
                    <p className="text-gray-600">{faq.answer}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
