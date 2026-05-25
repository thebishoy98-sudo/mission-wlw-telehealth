"use client";

import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

export default function CMSEditorDisabled() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="admin" />
      <div className="container-max py-8 sm:py-12 max-w-2xl">
        <Card>
          <CardContent className="p-6 sm:p-8 space-y-5">
            <div>
              <p className="text-sm font-semibold text-teal-700 mb-2">Admin content</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Website content editing is not enabled
              </h1>
            </div>
            <p className="text-gray-600 leading-relaxed">
              This screen was previously a browser-only editor. It has been disabled until
              landing-page content is backed by the production database and rendered by the
              public site.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={() => router.push("/admin")}>Back to Admin</Button>
              <Button variant="outline" onClick={() => router.push("/")}>
                View Site
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
