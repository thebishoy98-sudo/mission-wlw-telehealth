import type { Order } from "@/types";

export const generateId = (): string => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

export const formatCurrency = (amount: number | string | null | undefined): string => {
  const numericAmount = Number(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(numericAmount) ? numericAmount : 0);
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

export const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const formatPhone = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `(${cleaned.substring(0, 3)}) ${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
  }
  return phone;
};

export const getStatusColor = (status: string): string => {
  const statusMap: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    pending: "bg-yellow-100 text-yellow-800",
    pending_review: "bg-blue-100 text-blue-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    sent_to_pharmacy: "bg-blue-100 text-blue-800",
    processing: "bg-purple-100 text-purple-800",
    fulfilled: "bg-green-100 text-green-800",
    shipped: "bg-green-100 text-green-800",
    delivered: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    completed: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
    created: "bg-blue-100 text-blue-800",
    skipped: "bg-gray-100 text-gray-800",
    paid: "bg-green-100 text-green-800",
  };
  return statusMap[status] || "bg-gray-100 text-gray-800";
};

export const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    draft: "Draft",
    pending: "Pending",
    pending_review: "Awaiting Provider Review",
    approved: "Approved",
    rejected: "Rejected",
    sent_to_pharmacy: "Sent to Pharmacy",
    processing: "Processing",
    fulfilled: "Fulfilled",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled",
    completed: "Completed",
    error: "Error",
    created: "Created",
    skipped: "Skipped",
    paid: "Paid",
  };
  return labels[status] || status;
};

export const getOrderStatusLabel = (order: Pick<Order, "status" | "paymentStatus">): string => {
  if (order.status === "cancelled" && order.paymentStatus === "failed") {
    return "Payment Declined";
  }
  return getStatusLabel(order.status);
};

export const calculateDaysAgo = (dateString: string): number => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

export const formatRelativeTime = (dateString: string): string => {
  const daysAgo = calculateDaysAgo(dateString);

  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo < 7) return `${daysAgo} days ago`;
  if (daysAgo < 30) return `${Math.floor(daysAgo / 7)} weeks ago`;
  if (daysAgo < 365) return `${Math.floor(daysAgo / 30)} months ago`;
  return `${Math.floor(daysAgo / 365)} years ago`;
};

export const exportToCSV = (
  data: Record<string, any>[],
  filename: string
): void => {
  if (data.length === 0) {
    alert("No data to export");
    return;
  }

  // Get headers
  const headers = Object.keys(data[0]);

  // Create CSV content
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((header) => {
        const value = row[header];
        if (typeof value === "string" && value.includes(",")) {
          return `"${value}"`;
        }
        return value;
      }).join(",")
    ),
  ].join("\n");

  // Create blob and download
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const getInitials = (firstName: string, lastName: string): string => {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
};

export const cn = (...classes: (string | undefined | false)[]): string => {
  return classes.filter(Boolean).join(" ");
};
