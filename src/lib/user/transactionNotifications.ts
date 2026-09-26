import type { Tx } from "../../app/appTypes";
import {
  dedupeNotifications,
  filterNotificationsForCompletedTx,
  formatNotifTime,
  hasRecentDuplicateNotification,
  nextNotificationId,
  type AppNotification,
} from "../notifications/notificationService";
import { notificationEvents } from "../notifications/notificationEvents";

export function notificationFromTx(
  row: Tx,
  locale: "id" | "en" = "id",
): Omit<AppNotification, "id" | "read"> | null {
  const payload = notificationEvents.fromTransaction(row, locale);
  if (!payload) return null;
  const createdAt = new Date().toISOString();
  return {
    ...payload,
    createdAt,
    time: formatNotifTime(createdAt, locale),
    read: false,
  };
}

/** Replace pending tx notification with success / update row. */
export function mergeTxNotification(
  prev: AppNotification[],
  row: Tx,
  locale: "id" | "en" = "id",
): AppNotification[] {
  const draft = notificationFromTx(row, locale);
  if (!draft) {
    return filterNotificationsForCompletedTx(prev, row.id);
  }
  const filtered = filterNotificationsForCompletedTx(prev, row.id);
  if (hasRecentDuplicateNotification(filtered, draft)) return filtered;
  const entry: AppNotification = {
    ...draft,
    id: nextNotificationId(filtered),
  };
  return dedupeNotifications([entry, ...filtered]).slice(0, 50);
}

export function isTxConfirmedStatus(status?: string): boolean {
  const s = (status ?? "").toLowerCase();
  return s.includes("terkonfirmasi") || s.includes("confirmed") || s.includes("sukses");
}
