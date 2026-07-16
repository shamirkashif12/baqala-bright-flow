const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  near_expiry: "bg-yellow-100 text-yellow-700",
  expired: "bg-red-100 text-red-700",
  consumed: "bg-gray-100 text-gray-600",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  near_expiry: "Near Expiry",
  expired: "Expired",
  consumed: "Consumed",
};

const DOT_STYLES: Record<string, string> = {
  active: "bg-green-500",
  near_expiry: "bg-yellow-500",
  expired: "bg-red-500",
  consumed: "bg-gray-400",
};

export function BatchStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_STYLES[status] ?? "bg-gray-400"}`} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
