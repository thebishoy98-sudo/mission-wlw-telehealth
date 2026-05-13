"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { generateId, formatCurrency } from "@/lib/utils";
import { Toast } from "@/components/ui/Toast";

export default function ProductsManagement() {
  const [products, setProducts] = useState<Types.Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string>("");
  const [formError, setFormError] = useState<string>("");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    startingPrice: 0,
    eligibilityNote: "",
  });

  useEffect(() => {
    setProducts(db.productDb.getAll());
  }, []);

  const handleSave = () => {
    if (!formData.name) {
      setFormError("Please enter a product name.");
      return;
    }
    setFormError("");

    if (editingId) {
      db.productDb.update(editingId, {
        name: formData.name,
        description: formData.description,
        startingPrice: formData.startingPrice,
        eligibilityNote: formData.eligibilityNote,
      });
    } else {
      db.productDb.create({
        id: generateId(),
        name: formData.name,
        slug: formData.name.toLowerCase().replace(/\s+/g, "-"),
        description: formData.description,
        startingPrice: formData.startingPrice,
        image: "/product-placeholder.svg",
        doses: [
          {
            id: generateId(),
            label: "Standard",
            strength: "1x",
            quantity: 4,
            price: formData.startingPrice,
          },
        ],
        eligibilityNote: formData.eligibilityNote,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
    }

    setProducts(db.productDb.getAll());
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: "", description: "", startingPrice: 0, eligibilityNote: "" });
    setToast(editingId ? "Product updated." : "Product created.");
  };

  const handleEdit = (product: Types.Product) => {
    setFormData({
      name: product.name,
      description: product.description,
      startingPrice: product.startingPrice,
      eligibilityNote: product.eligibilityNote,
    });
    setEditingId(product.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    db.productDb.delete(id);
    setProducts(db.productDb.getAll());
    setToast("Product deleted.");
  };

  return (
    <>
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="admin" />
      <div className="container-max py-12">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Products</h1>
          {!showForm && (
            <Button onClick={() => setShowForm(true)}>
              + Add Product
            </Button>
          )}
        </div>

        {showForm && (
          <Card className="mb-8">
            <CardContent className="p-6 space-y-4">
              <h3 className="font-bold text-gray-900">
                {editingId ? "Edit Product" : "New Product"}
              </h3>
              <Input
                label="Product Name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
              />
              <Textarea
                label="Description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
              <Input
                label="Starting Price"
                type="number"
                value={formData.startingPrice}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    startingPrice: parseInt(e.target.value) || 0,
                  }))
                }
              />
              <Textarea
                label="Eligibility Note"
                value={formData.eligibilityNote}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    eligibilityNote: e.target.value,
                  }))
                }
              />
              {formError && <p className="text-sm text-red-500">{formError}</p>}
              <div className="flex gap-3">
                <Button fullWidth onClick={handleSave}>
                  Save
                </Button>
                <Button
                  fullWidth
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setFormData({
                      name: "",
                      description: "",
                      startingPrice: 0,
                      eligibilityNote: "",
                    });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {products.map((product) => (
            <Card key={product.id}>
              <CardContent className="p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {product.name}
                </h3>
                <p className="text-teal-600 font-bold mb-3">
                  {formatCurrency(product.startingPrice)}
                </p>
                <p className="text-gray-600 text-sm mb-4">
                  {product.description}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(product)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(product.id)}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
    {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
    </>
  );
}
