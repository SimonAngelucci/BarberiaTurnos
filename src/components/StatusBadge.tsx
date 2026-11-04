import type { SubscriptionStatus } from "@prisma/client";
import { STATUS_LABEL } from "@/lib/billing";

const TONE: Record<SubscriptionStatus, string> = {
  TRIAL: "bg-sky-100 text-sky-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAST_DUE: "bg-red-100 text-red-800",
  CANCELED: "bg-amber-100 text-amber-800",
  EXPIRED: "bg-neutral-200 text-neutral-700",
};

export function StatusBadge({ status, exempt, none }: { status?: SubscriptionStatus; exempt?: boolean; none?: boolean }) {
  const [label, tone] = exempt ? ["Exenta", "bg-violet-100 text-violet-800"] : none || !status ? ["Sin iniciar", "bg-neutral-100 text-neutral-500"] : [STATUS_LABEL[status], TONE[status]];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>;
}
