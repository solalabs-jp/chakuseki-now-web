export const STATUS_LABELS: Record<string, string> = {
  present: "出席",
  late: "遅刻",
  absent: "欠席",
  excused: "公欠",
  early_leave: "早退",
  mid_absence: "中抜け",
};

export const ATTENDED_STATUSES = new Set(["present", "late", "early_leave", "mid_absence"]);

export function mapStatus(status: string): string {
  return STATUS_LABELS[status] ?? "–";
}
