/** Group activity rows (tx / notif) by calendar day. */
export type ActivityTimeGroup = "today" | "yesterday" | "earlier";

function parseActivityDate(raw?: string): Date | null {
  const text = raw?.trim() ?? "";
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function activityTimeGroup(raw?: string): ActivityTimeGroup {
  const date = parseActivityDate(raw);
  if (date) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    if (date >= startOfToday) return "today";
    if (date >= startOfYesterday) return "yesterday";
    return "earlier";
  }

  const text = raw?.trim() ?? "";
  if (/just now|baru saja|\d+\s*(m|menit|min|h|jam)\s*(ago|lalu)?/i.test(text)) return "today";
  if (/^1\s*d\s*ago|1\s*hari\s*lalu|yesterday|kemarin/i.test(text)) return "yesterday";
  return "earlier";
}

export const ACTIVITY_GROUP_ORDER: ActivityTimeGroup[] = ["today", "yesterday", "earlier"];
