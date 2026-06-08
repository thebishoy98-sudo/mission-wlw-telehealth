import { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helpText?: string;
}

export function Input({
  label,
  error,
  helpText,
  className,
  disabled,
  ...props
}: InputProps) {
  return (
    <div className="w-full min-w-0">
      {label && (
        <label className="block text-sm font-medium text-gray-900 mb-1.5">
          {label}
        </label>
      )}
      <input
        {...props}
        disabled={disabled}
        className={cn(
          "w-full min-w-0 px-4 py-3 border border-gray-200 rounded-xl bg-white",
          "focus:outline-none focus:ring-2 focus:ring-forest-800 focus:border-transparent",
          "placeholder:text-gray-400 text-gray-900 text-base sm:text-sm",
          "disabled:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-500",
          "transition-shadow duration-150",
          error && "border-red-400 focus:ring-red-400",
          className
        )}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {helpText && <p className="mt-1 text-sm text-gray-500">{helpText}</p>}
    </div>
  );
}
