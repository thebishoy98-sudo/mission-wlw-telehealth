import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TableProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full", className)}>
        {children}
      </table>
    </div>
  );
}

interface TableHeadProps {
  children: ReactNode;
}

export function TableHead({ children }: TableHeadProps) {
  return (
    <thead className="bg-gray-50 border-b-2 border-gray-200">
      {children}
    </thead>
  );
}

interface TableBodyProps {
  children: ReactNode;
}

export function TableBody({ children }: TableBodyProps) {
  return <tbody>{children}</tbody>;
}

interface TableRowProps {
  children: ReactNode;
  clickable?: boolean;
  onClick?: () => void;
}

export function TableRow({ children, clickable, onClick }: TableRowProps) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-gray-200 hover:bg-gray-50",
        clickable && "cursor-pointer"
      )}
    >
      {children}
    </tr>
  );
}

interface TableCellProps {
  children: ReactNode;
  className?: string;
  header?: boolean;
}

export function TableCell({
  children,
  className,
  header = false,
}: TableCellProps) {
  return (
    <td
      className={cn(
        "px-6 py-3",
        header && "font-semibold text-gray-900 text-sm",
        !header && "text-sm text-gray-700",
        className
      )}
    >
      {children}
    </td>
  );
}
