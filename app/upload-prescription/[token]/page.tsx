"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type LinkState =
  | { status: "loading" }
  | { status: "invalid"; message: string }
  | { status: "ready"; uploadNeeded: boolean; priorMedStatus: string };

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

export default function UploadPrescriptionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [link, setLink] = useState<LinkState>({ status: "loading" });
  const [preview, setPreview] = useState<string>("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/prior-med/upload?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error ?? "This upload link is not valid.");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        setLink({
          status: "ready",
          uploadNeeded: Boolean(payload.uploadNeeded),
          priorMedStatus: String(payload.priorMedStatus ?? ""),
        });
      })
      .catch((err) => {
        if (!cancelled) setLink({ status: "invalid", message: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload a photo of your prescription (JPG or PNG).");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPreview(dataUrl);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSubmit = async () => {
    if (!preview) {
      setError("Please choose a photo of your previous prescription first.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/prior-med/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, imageData: preview }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Upload failed. Please try again.");
      router.push(`/upload-prescription/${encodeURIComponent(token)}/submitted`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-gray-900">Upload your previous prescription</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Because you ordered a dose above the starter dose, our provider needs
            to confirm you&apos;ve taken GLP-1 medication before. Please upload a
            clear photo of your previous prescription (label or paperwork). Your
            order will be reviewed and approved before it ships.
          </p>

          {link.status === "loading" && (
            <p className="mt-6 text-sm text-gray-500">Loading…</p>
          )}

          {link.status === "invalid" && (
            <div className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {link.message}
            </div>
          )}

          {link.status === "ready" && !link.uploadNeeded && (
            <div className="mt-6 rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">
              {link.priorMedStatus === "approved"
                ? "Your prescription has already been approved. No further action is needed."
                : "We already have your prescription and it's under review. No further action is needed."}
            </div>
          )}

          {link.status === "ready" && link.uploadNeeded && (
            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Prescription photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFile}
                  className="mt-2 block w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-forest-800 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-forest-900"
                />
              </label>

              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Prescription preview"
                  className="max-h-72 w-full rounded-lg border border-gray-200 object-contain"
                />
              )}

              {error && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !preview}
                className="w-full rounded-lg bg-forest-800 px-4 py-3 text-sm font-semibold text-white hover:bg-forest-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Uploading…" : "Submit prescription"}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
