"use client";

import { usePathname } from "next/navigation";
import { Check } from "lucide-react";

const steps = [
  { label: "Info", path: "/start/info" },
  { label: "Health", path: "/start/questionnaire" },
  { label: "Consent", path: "/start/consent" },
  { label: "ID Upload", path: "/start/uploads" },
  { label: "Payment", path: "/start/payment" },
  { label: "Done", path: "/start/confirmation" },
];

export default function StartLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentStep = steps.findIndex((s) => s.path === pathname);

  return (
    <div className="min-h-screen bg-gray-50/60">
      {/* Progress header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-3 py-4 sm:px-4 sm:py-5">
          <div className="flex items-start gap-1 sm:items-center sm:gap-1.5">
            {steps.map((step, index) => {
              const isCompleted = index < currentStep;
              const isCurrent = index === currentStep;
              return (
                <div key={index} className="flex min-w-0 flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={[
                        "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all sm:h-8 sm:w-8",
                        isCompleted
                          ? "bg-forest-800 text-white"
                          : isCurrent
                          ? "bg-forest-50 text-forest-800 border-2 border-forest-800"
                          : "bg-gray-100 text-gray-400",
                      ].join(" ")}
                    >
                      {isCompleted ? <Check className="w-4 h-4" /> : index + 1}
                    </div>
                    <span
                      className={[
                        "mt-1 hidden text-xs font-medium sm:block",
                        isCurrent ? "text-forest-800" : isCompleted ? "text-gray-600" : "text-gray-400",
                      ].join(" ")}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={[
                        "mx-1 mb-4 h-0.5 flex-1 rounded-full sm:mx-2",
                        isCompleted ? "bg-forest-700" : "bg-gray-200",
                      ].join(" ")}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6 pb-16 sm:py-10 sm:pb-20">
        {children}
      </div>
    </div>
  );
}
