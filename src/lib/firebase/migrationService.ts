import {
  addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query,
  serverTimestamp, type Timestamp, type Unsubscribe,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./config";

export type MigrationStatus = "queued" | "processing" | "completed" | "failed";

export type MigrationRequestDoc = {
  uid: string;
  walletAddress: string;
  amountGat: string;
  status: MigrationStatus;
  createdAt?: Timestamp;
  note?: string | null;
};

const QUEUE = "migration_queue";

export const subscribeMigrationQueue = (
  onData: (rows: ({ id: string } & MigrationRequestDoc)[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe => {
  if (!isFirebaseConfigured || !db) {
    onData([]);
    return () => {};
  }
  const q = query(collection(db, QUEUE), orderBy("createdAt", "desc"), limit(40));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as MigrationRequestDoc) }))),
    (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
  );
};

export const fetchUserMigrations = async (uid: string): Promise<({ id: string } & MigrationRequestDoc)[]> => {
  if (!isFirebaseConfigured || !db) return [];
  const snap = await getDocs(
    query(collection(db, QUEUE), orderBy("createdAt", "desc"), limit(20)),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as MigrationRequestDoc) }))
    .filter((r) => r.uid === uid);
};

export const submitMigrationRequest = async (
  uid: string,
  walletAddress: string,
  amountGat: string,
): Promise<string> => {
  if (!isFirebaseConfigured || !db) throw new Error("Firebase not configured");
  const ref = await addDoc(collection(db, QUEUE), {
    uid,
    walletAddress,
    amountGat,
    status: "queued",
    note: null,
    createdAt: serverTimestamp(),
  } satisfies MigrationRequestDoc);
  return ref.id;
};

export const getMigrationStats = (rows: MigrationRequestDoc[]) => {
  const totalQueued = rows.filter((r) => r.status === "queued" || r.status === "processing").length;
  const totalCompleted = rows.filter((r) => r.status === "completed").length;
  const volumeGat = rows.reduce((s, r) => s + (parseFloat(r.amountGat) || 0), 0);
  return { totalQueued, totalCompleted, volumeGat };
};
