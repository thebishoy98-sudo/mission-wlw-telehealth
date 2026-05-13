import { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
  error?: string;
}

export function Select({
  label,
  options,
  error,
  className,
  disabled,
  ...props
}: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-900 mb-1.5">
          {label}
        </label>
      )}
      <select
        {...props}
        disabled={disabled}
        className={cn(
          "w-full px-4 py-3 border border-gray-200 rounded-xl bg-white text-gray-900",
          "focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent",
          "disabled:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-500",
          "transition-shadow duration-150",
          error && "border-red-400 focus:ring-red-400",
          className
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
