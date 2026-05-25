import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function ReorderPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="patient" />
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <Card>
          <CardContent className="p-8">
            <h1 className="mb-3 text-2xl font-bold text-gray-900">Refill Requests</h1>
            <p className="mb-6 text-sm leading-6 text-gray-600">
              Online refills and dose increases are not enabled yet. For now, our care team reviews refills directly so no fake payment or pharmacy request is created from this page.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <a href="mailto:service@missionwlw.com">
                <Button>Contact Support</Button>
              </a>
              <Link href="/patient">
                <Button variant="outline">Back to My Orders</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
