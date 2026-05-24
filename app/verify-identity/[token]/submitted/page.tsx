import { CheckCircle } from "lucide-react";

export default function IdentitySubmittedPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-10">
        <div className="w-full rounded-lg border border-gray-100 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-700">
            <CheckCircle className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Upload received</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Our team will review your identity verification before pharmacy dispatch.
          </p>
        </div>
      </div>
    </main>
  );
}
