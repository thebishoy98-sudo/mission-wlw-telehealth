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
        <div className="max-w-3xl mx-auto px-4 py-5">
          <div className="flex items-center gap-1.5">
            {steps.map((step, index) => {
              const isCompleted = index < currentStep;
              const isCurrent = index === currentStep;
              return (
                <div key={index} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={[
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all",
                        isCompleted
                          ? "bg-teal-600 text-white"
                          : isCurrent
                          ? "bg-teal-50 text-teal-700 border-2 border-teal-500"
                          : "bg-gray-100 text-gray-400",
                      ].join(" ")}
                    >
                      {isCompleted ? <Check className="w-4 h-4" /> : index + 1}
                    </div>
                    <span
                      className={[
                        "text-xs mt-1 font-medium hidden sm:block",
                        isCurrent ? "text-teal-700" : isCompleted ? "text-gray-600" : "text-gray-400",
                      ].join(" ")}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={[
                        "flex-1 h-0.5 mx-2 rounded-full mb-4",
                        isCompleted ? "bg-teal-400" : "bg-gray-200",
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
      <div className="max-w-2xl mx-auto px-4 py-10 pb-20">
        {children}
      </div>
    </div>
  );
}
