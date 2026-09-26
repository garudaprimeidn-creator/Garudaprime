import { getDeviceInfo } from "./deviceInfo";
import type { UserDeviceDoc } from "../firebase/firestoreService";

export const deviceSessionKey = (row: Pick<UserDeviceDoc, "device" | "browser">) =>
  `${row.device}::${row.browser}`;

export const buildDeviceId = (device: string, browser: string): string =>
  `${device}_${browser}`.toLowerCase().replace(/[^a-z0-9]+/g, "_");

export const isCurrentDeviceSession = (row: Pick<UserDeviceDoc, "device" | "browser">): boolean => {
  const current = getDeviceInfo();
  return row.device === current.device && row.browser === current.browser;
};

/** Ensure the active browser/device appears in the list even before Firestore sync */
export const mergeWithCurrentDevice = (rows: UserDeviceDoc[], uid: string): UserDeviceDoc[] => {
  const sorted = [...rows].sort((a, b) => activityTime(b) - activityTime(a));
  if (sorted.some(isCurrentDeviceSession)) return sorted;
  return [currentDeviceFallback(uid), ...sorted];
};

const activityTime = (row: UserDeviceDoc): number => {
  const ts = row.lastSeen ?? row.firstSeen;
  if (typeof ts === "number") return ts;
  if (typeof ts === "object" && ts && "toDate" in ts && typeof (ts as { toDate: () => Date }).toDate === "function") {
    return (ts as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
};

export const formatActivityTimestamp = (ts: unknown, locale = "id-ID"): string => {
  if (!ts) return "";
  if (typeof ts === "number") return new Date(ts).toLocaleString(locale);
  if (typeof ts === "object" && ts && "toDate" in ts && typeof (ts as { toDate: () => Date }).toDate === "function") {
    return (ts as { toDate: () => Date }).toDate().toLocaleString(locale);
  }
  return "";
};

export const currentDeviceFallback = (uid = ""): UserDeviceDoc => {
  const { device, browser, userAgent } = getDeviceInfo();
  return {
    id: buildDeviceId(device, browser),
    uid,
    loginMethod: "session",
    device,
    browser,
    ipAddress: "",
    location: "",
    userAgent,
    lastSeen: Date.now(),
    firstSeen: Date.now(),
  };
};
