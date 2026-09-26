export type NotifType =
  | "receive"
  | "invest"
  | "kyc"
  | "alert"
  | "community"
  | "order"
  | "market"
  | "staking"
  | "wallet"
  | "referral"
  | "governance"
  | "system";

export type NotifAction =
  | { type: "screen"; screen: "home" | "wallet" | "invest" | "market" | "community" }
  | { type: "overlay"; overlay: "receive" | "send" | "invest" | "profile" | "wallet" }
  | { type: "profileSection"; section: "main" | "kyc" | "kyc-flow" | "shipping" }
  | { type: "buyerOrders" }
  | { type: "investTab"; tab: "portfolio" | "opportunities" }
  | { type: "transaction"; txId: number };

export type AppNotification = {
  id: number;
  type: NotifType;
  title: string;
  body: string;
  time: string;
  createdAt: string;
  read: boolean;
  action?: NotifAction;
};

const STORAGE_PREFIX = "garuda_notifications";
const DEMO_STORAGE_UID = "demo";

function storageKey(uid?: string): string {
  if (uid === DEMO_STORAGE_UID) return `${STORAGE_PREFIX}_demo`;
  return uid ? `${STORAGE_PREFIX}_${uid}` : STORAGE_PREFIX;
}

export function resolveNotifStorageScope(userId?: string | null, isDemoUser?: boolean): string | undefined {
  if (isDemoUser) return DEMO_STORAGE_UID;
  return userId ?? undefined;
}

export const DEFAULT_NOTIFICATIONS: AppNotification[] = [];

export function loadNotifications(uid?: string): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map(normalizeNotificationRecord)
      .filter((n): n is AppNotification => n != null);
    return dedupeNotifications(normalized);
  } catch {
    return [];
  }
}

export function normalizeNotificationRecord(raw: unknown): AppNotification | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<AppNotification> & { createdAt?: unknown };
  const id = Number(row.id);
  if (!Number.isFinite(id)) return null;
  const type = typeof row.type === "string" ? row.type : "system";
  const title = typeof row.title === "string" ? row.title : "Garuda Prime";
  const body = typeof row.body === "string" ? row.body : "";
  const createdAt = coerceIsoDate(row.createdAt) ?? new Date().toISOString();
  const time = typeof row.time === "string" ? row.time : createdAt;
  return {
    id,
    type: type as NotifType,
    title,
    body,
    time,
    createdAt,
    read: Boolean(row.read),
    action: row.action,
  };
}

function coerceIsoDate(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (value && typeof value === "object" && "seconds" in value) {
    const seconds = Number((value as { seconds: number }).seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }
  return null;
}

export function saveNotifications(items: AppNotification[], uid?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(uid), JSON.stringify(items));
}

/** Move legacy unscoped cache into per-user storage on login. */
export function migrateLegacyNotifications(uid: string): AppNotification[] {
  const legacy = loadNotifications();
  const scoped = loadNotifications(uid);
  if (!legacy.length) return scoped;
  const merged = mergeNotifications(scoped, legacy);
  saveNotifications(merged, uid);
  if (typeof window !== "undefined") {
    localStorage.removeItem(storageKey());
  }
  return merged;
}

export function nextNotificationId(items: AppNotification[]): number {
  return items.reduce((max, n) => Math.max(max, n.id), 0) + 1;
}

export function mergeNotifications(local: AppNotification[], remote: AppNotification[]): AppNotification[] {
  const map = new Map<number, AppNotification>();
  for (const n of [...local, ...remote]) map.set(n.id, n);
  return dedupeNotifications([...map.values()].sort((a, b) => b.id - a.id)).slice(0, 50);
}

const WALLET_CONNECTED_TITLES = new Set(["Dompet Terhubung", "Wallet Connected"]);

const WALLET_PENDING_TITLES = new Set([
  "Pengiriman Diproses",
  "Send Pending",
  "Swap Diproses",
  "Swap Pending",
  "Deposit Diproses",
  "Deposit Pending",
  "Pembayaran Diproses",
  "Payment Pending",
  "Penerimaan Diproses",
  "Receive Pending",
]);

function walletConnectedDedupeKey(n: AppNotification): string | null {
  if (n.type !== "wallet" || !WALLET_CONNECTED_TITLES.has(n.title)) return null;
  return `${n.title}:${n.body}`;
}

function notificationSemanticKey(n: AppNotification): string | null {
  if (n.action?.type === "transaction") {
    return `tx:${n.action.txId}:${n.type}:${n.title.trim().toLowerCase()}`;
  }
  if (n.type === "receive") {
    return `receive:${n.body.trim().toLowerCase()}`;
  }
  if (n.type === "wallet") {
    return `wallet:${n.title.trim().toLowerCase()}:${n.body.trim().toLowerCase()}`;
  }
  return null;
}

/** Keep one "wallet connected" row per address/message when loading or merging. */
export function dedupeNotifications(items: AppNotification[]): AppNotification[] {
  const seenWalletConnected = new Set<string>();
  const seenSemantic = new Set<string>();
  const out: AppNotification[] = [];
  for (const n of items) {
    const walletKey = walletConnectedDedupeKey(n);
    if (walletKey) {
      if (seenWalletConnected.has(walletKey)) continue;
      seenWalletConnected.add(walletKey);
    }
    const semanticKey = notificationSemanticKey(n);
    if (semanticKey) {
      if (seenSemantic.has(semanticKey)) continue;
      seenSemantic.add(semanticKey);
    }
    out.push(n);
  }
  return out;
}

export function filterNotificationsForCompletedTx(
  items: AppNotification[],
  txId: number,
): AppNotification[] {
  return items.filter((n) => {
    if (n.action?.type !== "transaction" || n.action.txId !== txId) return true;
    return !WALLET_PENDING_TITLES.has(n.title);
  });
}

export function hasRecentDuplicateNotification(
  items: AppNotification[],
  input: Pick<AppNotification, "type" | "title" | "body" | "action">,
  windowMs = 120_000,
): boolean {
  const txId = input.action?.type === "transaction" ? input.action.txId : null;
  if (txId != null) {
    return items.some(
      (n) => n.action?.type === "transaction" && n.action.txId === txId,
    );
  }
  const key = `${input.type}:${input.title}:${input.body}`.trim().toLowerCase();
  const now = Date.now();
  return items.some((n) => {
    if (`${n.type}:${n.title}:${n.body}`.trim().toLowerCase() !== key) return false;
    const age = now - new Date(n.createdAt).getTime();
    return age >= 0 && age <= windowMs;
  });
}

export function hasWalletConnectedNotification(
  items: AppNotification[],
  body: string,
): boolean {
  return items.some(
    (n) => n.type === "wallet" && WALLET_CONNECTED_TITLES.has(n.title) && n.body === body,
  );
}

function walletConnectedSessionKey(uid: string, address: string): string {
  return `gp_wallet_conn_notif_${uid}_${address.trim().toLowerCase()}`;
}

/** At most one wallet-connected toast per user + address per browser session. */
export function shouldEmitWalletConnectedNotif(
  uid: string | null | undefined,
  address: string,
  existing: AppNotification[],
): boolean {
  const normalized = address.trim();
  if (!normalized || !uid) return false;
  const bodyId = notificationBodyForWalletConnected(normalized);
  if (hasWalletConnectedNotification(existing, bodyId)) return false;
  if (typeof window === "undefined") return true;
  const key = walletConnectedSessionKey(uid, normalized);
  if (sessionStorage.getItem(key) === "1") return false;
  sessionStorage.setItem(key, "1");
  return true;
}

export function notificationBodyForWalletConnected(address: string, locale = "id"): string {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return locale === "id"
    ? `Dompet ${short} aktif di Sidra Mainnet.`
    : `Wallet ${short} connected on Sidra Mainnet.`;
}

export function clearWalletConnectedNotifSession(uid?: string | null): void {
  if (typeof window === "undefined" || !uid) return;
  const prefix = `gp_wallet_conn_notif_${uid}_`;
  for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
  }
}

const KYC_NOTIF_SEEN_PREFIX = "gp_kyc_notif_seen_";

export type KycNotifSeen = {
  status: string;
  reason: string;
  tier: number;
};

export function loadKycNotifSeen(uid: string): KycNotifSeen | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${KYC_NOTIF_SEEN_PREFIX}${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KycNotifSeen;
    if (!parsed?.status) return null;
    return {
      status: String(parsed.status),
      reason: String(parsed.reason ?? ""),
      tier: Number(parsed.tier) || 0,
    };
  } catch {
    return null;
  }
}

export function saveKycNotifSeen(uid: string, seen: KycNotifSeen): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${KYC_NOTIF_SEEN_PREFIX}${uid}`, JSON.stringify(seen));
}

export function kycNotifFingerprint(
  status: string,
  reason?: string | null,
  tier?: number,
): string {
  return `${status}|${(reason ?? "").trim()}|${tier ?? 0}`;
}

export function hasKycNotification(items: AppNotification[], title: string, body: string): boolean {
  return items.some((n) => n.type === "kyc" && n.title === title && n.body === body);
}

export function formatNotifTime(iso: string, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return locale.startsWith("id") ? "Baru saja" : "Just now";
  if (minutes < 60) return locale.startsWith("id") ? `${minutes} menit lalu` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale.startsWith("id") ? `${hours} jam lalu` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return locale.startsWith("id") ? `${days} hari lalu` : `${days}d ago`;
  return new Date(iso).toLocaleDateString(locale.startsWith("id") ? "id-ID" : "en-US", {
    day: "numeric",
    month: "short",
  });
}
