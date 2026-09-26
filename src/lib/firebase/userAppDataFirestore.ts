import {
  collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where, limit, orderBy,
  type Unsubscribe,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./config";
import type { MarketOrder } from "../merchant/orderService";
import type { PortfolioState } from "../invest/investPortfolio";
import type { AppNotification } from "../notifications/notificationService";
import { loadMarketOrders, saveMarketOrders } from "../merchant/orderService";
import { loadPortfolio, savePortfolio } from "../invest/investPortfolio";
import { loadNotifications, saveNotifications, normalizeNotificationRecord } from "../notifications/notificationService";
import { loadTransactions, mergeTransactions, saveTransactions, type StoredTx } from "../user/transactionStore";
import { sortTransactionsByTimeDesc } from "../user/transactionDedup";
import { normalizeTx } from "../user/transactionSanitizer";
import { mergeNotifications } from "../notifications/notificationService";
import type { Tx } from "../../app/appTypes";
import { MERCHANT_ID, fetchMerchantIdsForOwner, personalMerchantIdFromUid } from "../merchant/merchantService";

const ORDERS_COL = "market_orders";
const PORTFOLIO_COL = "user_portfolios";
const INBOX_COL = "user_inbox";
const TRANSACTIONS_COL = "user_transactions";
const BROADCAST_COL = "notifications";
const SEEN_BROADCASTS_KEY = "garuda_seen_broadcasts";

export type MarketOrderDoc = MarketOrder & { buyerUid: string };

const canUseFirestore = () => isFirebaseConfigured && Boolean(db);

function mergeOrders(a: MarketOrderDoc[], b: MarketOrderDoc[]): MarketOrderDoc[] {
  const map = new Map<string, MarketOrderDoc>();
  for (const o of [...a, ...b]) map.set(o.id, o);
  return [...map.values()].sort(
    (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime(),
  );
}

export async function syncLocalOrdersToFirestore(uid: string): Promise<number> {
  if (!canUseFirestore() || !uid) return 0;
  const local = loadMarketOrders();
  let synced = 0;
  for (const order of local) {
    const ref = doc(db!, ORDERS_COL, order.id);
    const snap = await getDoc(ref);
    if (snap.exists()) continue;
    await setDoc(ref, { ...order, buyerUid: uid }, { merge: true });
    synced += 1;
  }
  return synced;
}

export async function upsertMarketOrder(uid: string, order: MarketOrder): Promise<void> {
  if (!canUseFirestore() || !uid) {
    saveMarketOrders([order, ...loadMarketOrders().filter((o) => o.id !== order.id)]);
    return;
  }
  await setDoc(doc(db!, ORDERS_COL, order.id), { ...order, buyerUid: uid }, { merge: true });
  const local = loadMarketOrders();
  const next = [order, ...local.filter((o) => o.id !== order.id)];
  saveMarketOrders(next);
}

export async function saveMarketOrdersRemote(uid: string, orders: MarketOrder[]): Promise<void> {
  saveMarketOrders(orders);
  if (!canUseFirestore() || !uid) return;
  await Promise.all(
    orders.map((order) =>
      setDoc(doc(db!, ORDERS_COL, order.id), { ...order, buyerUid: uid }, { merge: true }),
    ),
  );
}

export function subscribeUserOrders(
  uid: string,
  onData: (orders: MarketOrder[]) => void,
  onError?: (err: Error) => void,
  merchantIds: string[] = [MERCHANT_ID],
): Unsubscribe | null {
  if (!canUseFirestore() || !uid) return null;

  let buyerRows: MarketOrderDoc[] = [];
  const merchantRowsById = new Map<string, MarketOrderDoc[]>();
  const uniqueMerchantIds = [...new Set(merchantIds.filter(Boolean))];

  const emit = () => {
    const merchantRows = uniqueMerchantIds.flatMap((id) => merchantRowsById.get(id) ?? []);
    onData(mergeOrders(buyerRows, merchantRows));
  };

  const buyerUnsub = onSnapshot(
    query(collection(db!, ORDERS_COL), where("buyerUid", "==", uid), limit(100)),
    (snap) => {
      buyerRows = snap.docs.map((d) => d.data() as MarketOrderDoc);
      emit();
    },
    (err) => onError?.(err),
  );

  const merchantUnsubs = uniqueMerchantIds.map((merchantId) =>
    onSnapshot(
      query(collection(db!, ORDERS_COL), where("merchantId", "==", merchantId), limit(100)),
      (snap) => {
        merchantRowsById.set(merchantId, snap.docs.map((d) => d.data() as MarketOrderDoc));
        emit();
      },
      (err) => onError?.(err),
    ),
  );

  return () => {
    buyerUnsub();
    merchantUnsubs.forEach((unsub) => unsub());
  };
}

export async function fetchUserOrders(uid: string, merchantIds: string[] = [MERCHANT_ID]): Promise<MarketOrder[]> {
  if (!canUseFirestore() || !uid) return loadMarketOrders();
  try {
    const uniqueMerchantIds = [...new Set(merchantIds.filter(Boolean))];
    const [buyerSnap, ...merchantSnaps] = await Promise.all([
      getDocs(query(collection(db!, ORDERS_COL), where("buyerUid", "==", uid), limit(100))),
      ...uniqueMerchantIds.map((merchantId) =>
        getDocs(query(collection(db!, ORDERS_COL), where("merchantId", "==", merchantId), limit(100))),
      ),
    ]);
    const orders = mergeOrders(
      buyerSnap.docs.map((d) => d.data() as MarketOrderDoc),
      merchantSnaps.flatMap((snap) => snap.docs.map((d) => d.data() as MarketOrderDoc)),
    );
    saveMarketOrders(orders);
    return orders;
  } catch {
    return loadMarketOrders();
  }
}

export async function resolveMerchantIdsForUser(uid: string): Promise<string[]> {
  if (!uid) return [MERCHANT_ID];
  const ids = await fetchMerchantIdsForOwner(uid);
  return ids.length ? ids : [personalMerchantIdFromUid(uid)];
}

export async function fetchUserPortfolio(uid: string): Promise<PortfolioState> {
  if (!canUseFirestore() || !uid) return loadPortfolio();
  try {
    const snap = await getDoc(doc(db!, PORTFOLIO_COL, uid));
    const state: PortfolioState = snap.exists()
      ? (snap.data() as PortfolioState)
      : { investments: [], staking: [] };
    savePortfolio(state);
    return state;
  } catch {
    return loadPortfolio();
  }
}

export async function fetchUserNotifications(uid: string): Promise<AppNotification[]> {
  if (!canUseFirestore() || !uid) return loadNotifications();
  try {
    const snap = await getDocs(
      query(collection(db!, INBOX_COL), where("uid", "==", uid), limit(50)),
    );
    const remote = snap.docs
      .map((d) => normalizeNotificationRecord(d.data()))
      .filter((n): n is AppNotification => n != null)
      .sort((a, b) => b.id - a.id);
    const items = mergeNotifications(loadNotifications(uid), remote);
    saveNotifications(items, uid);
    return items;
  } catch {
    return loadNotifications(uid);
  }
}

export async function fetchUserTransactions(uid: string): Promise<Tx[]> {
  if (!canUseFirestore() || !uid) return loadTransactions(uid);
  try {
    let snap;
    try {
      snap = await getDocs(
        query(
          collection(db!, TRANSACTIONS_COL),
          where("uid", "==", uid),
          orderBy("id", "desc"),
          limit(100),
        ),
      );
    } catch {
      snap = await getDocs(
        query(collection(db!, TRANSACTIONS_COL), where("uid", "==", uid), limit(100)),
      );
    }
    const remote = snap.docs
      .map((d) => fromStoredTx(d.data() as StoredTx))
      .sort((a, b) => b.id - a.id);
    const items = mergeTransactions(loadTransactions(uid), remote);
    saveTransactions(uid, items);
    return items;
  } catch {
    return loadTransactions(uid);
  }
}

export async function syncLocalPortfolioToFirestore(uid: string): Promise<void> {
  if (!canUseFirestore() || !uid) return;
  const ref = doc(db!, PORTFOLIO_COL, uid);
  const snap = await getDoc(ref);
  const local = loadPortfolio();
  if (snap.exists()) return;
  if (local.investments.length === 0 && local.staking.length === 0) return;
  await setDoc(ref, { ...local, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function savePortfolioRemote(uid: string, state: PortfolioState): Promise<void> {
  savePortfolio(state);
  if (!canUseFirestore() || !uid) return;
  await setDoc(
    doc(db!, PORTFOLIO_COL, uid),
    { ...state, updatedAt: new Date().toISOString() },
    { merge: true },
  );
}

export function subscribeUserPortfolio(
  uid: string,
  onData: (state: PortfolioState) => void,
  onError?: (err: Error) => void,
): Unsubscribe | null {
  if (!canUseFirestore() || !uid) return null;
  return onSnapshot(
    doc(db!, PORTFOLIO_COL, uid),
    (snap) => {
      const state = snap.exists()
        ? (snap.data() as PortfolioState)
        : { investments: [], staking: [] };
      savePortfolio(state);
      onData(state);
    },
    (err) => onError?.(err),
  );
}

export async function syncLocalNotificationsToFirestore(uid: string): Promise<number> {
  if (!canUseFirestore() || !uid) return 0;
  const local = loadNotifications(uid);
  let synced = 0;
  for (const n of local) {
    const ref = doc(db!, INBOX_COL, `${uid}_${n.id}`);
    const snap = await getDoc(ref);
    if (snap.exists()) continue;
    await setDoc(ref, { ...n, uid }, { merge: true });
    synced += 1;
  }
  return synced;
}

export async function saveNotificationsRemote(uid: string, items: AppNotification[]): Promise<void> {
  saveNotifications(items, uid);
  if (!canUseFirestore() || !uid) return;
  await Promise.all(
    items.map((n) =>
      setDoc(doc(db!, INBOX_COL, `${uid}_${n.id}`), { ...n, uid }, { merge: true }),
    ),
  );
}

export function subscribeUserNotifications(
  uid: string,
  onData: (items: AppNotification[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe | null {
  if (!canUseFirestore() || !uid) return null;
  return onSnapshot(
    query(collection(db!, INBOX_COL), where("uid", "==", uid), limit(50)),
    (snap) => {
    const remote = snap.docs
      .map((d) => normalizeNotificationRecord(d.data()))
      .filter((n): n is AppNotification => n != null)
      .sort((a, b) => b.id - a.id);
      const items = mergeNotifications(loadNotifications(uid), remote);
      saveNotifications(items, uid);
      onData(items);
    },
    (err) => onError?.(err),
  );
}

export type PlatformBroadcast = {
  id: string;
  title: string;
  message: string;
  channel: string;
  sentAt: string;
};

function loadSeenBroadcasts(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SEEN_BROADCASTS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeenBroadcasts(seen: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SEEN_BROADCASTS_KEY, JSON.stringify([...seen].slice(-100)));
}

/** Realtime platform announcements from admin → user notification center */
export function subscribePlatformBroadcasts(
  uid: string,
  onBroadcast: (payload: PlatformBroadcast) => void,
  onError?: (err: Error) => void,
): Unsubscribe | null {
  if (!canUseFirestore() || !uid) return null;
  const seen = loadSeenBroadcasts();

  return onSnapshot(
    query(collection(db!, BROADCAST_COL), orderBy("sentAt", "desc"), limit(30)),
    (snap) => {
      snap.docs.forEach((d) => {
        if (seen.has(d.id)) return;
        const data = d.data() as {
          title?: string;
          message?: string;
          channel?: string;
          sentAt?: string;
          targetUids?: string[];
        };
        const targets = data.targetUids ?? ["all"];
        if (!targets.includes("all") && !targets.includes(uid)) return;
        seen.add(d.id);
        saveSeenBroadcasts(seen);
        onBroadcast({
          id: d.id,
          title: data.title ?? "Garuda Prime",
          message: data.message ?? "",
          channel: data.channel ?? "push",
          sentAt: data.sentAt ?? new Date().toISOString(),
        });
      });
    },
    (err) => onError?.(err),
  );
}

export async function bootstrapUserAppData(uid: string): Promise<void> {
  if (!canUseFirestore() || !uid) return;
  await Promise.all([
    syncLocalOrdersToFirestore(uid),
    syncLocalPortfolioToFirestore(uid),
    syncLocalNotificationsToFirestore(uid),
    syncLocalTransactionsToFirestore(uid),
  ]);
}

function txDocId(uid: string, id: number): string {
  return `${uid}_${id}`;
}

function toStoredTx(uid: string, tx: Tx): StoredTx {
  return {
    ...tx,
    uid,
    createdAt: new Date().toISOString(),
  };
}

function fromStoredTx(data: StoredTx): Tx {
  const { uid: _uid, createdAt: _createdAt, ...tx } = data;
  return normalizeTx(tx) ?? {
    id: Number(tx.id) || 0,
    type: "send",
    amount: ", ",
    addr: ", ",
    time: ", ",
    usd: ", ",
    status: "Confirmed",
  };
}

export async function syncLocalTransactionsToFirestore(uid: string): Promise<number> {
  if (!canUseFirestore() || !uid) return 0;
  const local = loadTransactions(uid);
  let synced = 0;
  for (const tx of local) {
    const ref = doc(db!, TRANSACTIONS_COL, txDocId(uid, tx.id));
    const snap = await getDoc(ref);
    if (snap.exists()) continue;
    await setDoc(ref, toStoredTx(uid, tx), { merge: true });
    synced += 1;
  }
  return synced;
}

export async function upsertUserTransaction(uid: string, tx: Tx): Promise<void> {
  const local = loadTransactions(uid);
  const next = [tx, ...local.filter((row) => row.id !== tx.id)].slice(0, 100);
  saveTransactions(uid, next);
  if (!canUseFirestore() || !uid) return;
  await setDoc(doc(db!, TRANSACTIONS_COL, txDocId(uid, tx.id)), toStoredTx(uid, tx), { merge: true });
}

export async function cancelUserTransaction(uid: string, tx: Tx): Promise<void> {
  const cancelled: Tx = { ...tx, status: "Dibatalkan" };
  await upsertUserTransaction(uid, cancelled);
}

export function subscribeUserTransactions(
  uid: string,
  onData: (items: Tx[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe | null {
  if (!canUseFirestore() || !uid) return null;
  return onSnapshot(
    query(
      collection(db!, TRANSACTIONS_COL),
      where("uid", "==", uid),
      orderBy("id", "desc"),
      limit(100),
    ),
    (snap) => {
    const remote = sortTransactionsByTimeDesc(
      snap.docs.map((d) => fromStoredTx(d.data() as StoredTx)),
    );
      const items = mergeTransactions(loadTransactions(uid), remote);
      saveTransactions(uid, items);
      onData(items);
    },
    (err) => onError?.(err),
  );
}
