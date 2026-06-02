import { cn } from "@/lib/utils";

interface ProgressBarProps {
  steps: string[];
  currentStep: number;
  className?: string;
}

export function ProgressBar({
  steps,
  currentStep,
  className,
}: ProgressBarProps) {
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-8">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <div key={index} className="flex-1 flex items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm",
                  isCompleted && "bg-forest-800 text-white",
                  isCurrent && "bg-green-50 text-forest-800 border-2 border-forest-800",
                  !isCompleted && !isCurrent && "bg-gray-200 text-gray-600"
                )}
              >
                {isCompleted ? "✓" : index + 1}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-1 mx-2",
                    isCompleted ? "bg-forest-800" : "bg-gray-300"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-600">
        {steps.map((step) => (
          <div key={step} className="flex-1">
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}
