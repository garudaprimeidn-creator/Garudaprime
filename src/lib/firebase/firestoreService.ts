import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, collection, addDoc, query, where, getDocs,
  orderBy, limit, serverTimestamp, onSnapshot, type Unsubscribe,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./config";
import { buildDeviceId } from "../auth/deviceSessions";
import { getDeviceInfo, fetchGeoHint } from "../auth/deviceInfo";
import { isWalletDisplayName } from "../web3/walletService";
import {
  dedupeConnectedWalletDocs,
  isGarudaPrimePersistedWalletType,
  normalizeWalletAddress,
} from "../web3/connectedWalletUtils";

export type UserRole = "user" | "admin" | "premium";
export type UserStatus = "active" | "suspended" | "pending";
export type KycStatus = "none" | "pending" | "verified" | "rejected";

/** users/{uid} */
export type UserProfile = {
  uid?: string;
  fullName: string;
  email: string;
  phone: string;
  avatar?: string | null;
  provider: string;
  walletAddress?: string | null;
  kycStatus: KycStatus;
  kycTier?: number;
  kycRejectionReason?: string | null;
  kycResubmitRequired?: boolean;
  biometricEnabled?: boolean;
  twoFactorEnabled?: boolean;
  securityStrictMode?: boolean;
  createdAt?: unknown;
  lastLogin?: unknown;
  role: UserRole;
  status: UserStatus;
  /** @deprecated use provider */
  authMethod?: string;
  loginProvider?: string;
  kycportUserId?: string | null;
  kycportVerifiedAt?: string | null;
  /** Garuda Prime KYCPORT partner, not Sidra */
  kycPartnerId?: string | null;
  kycAppName?: string | null;
  updatedAt?: unknown;
};

/** connected_wallets */
export type ConnectedWalletRecord = {
  uid: string;
  walletAddress: string;
  walletType: string;
  network: string;
  connectedAt?: unknown;
  lastUsed?: unknown;
  isPrimary?: boolean;
};

/** login_activity */
export type LoginActivityRecord = {
  uid: string;
  loginMethod: string;
  device: string;
  browser: string;
  ipAddress: string;
  location: string;
  timestamp?: unknown;
  success?: boolean;
  userAgent?: string;
};

export type LoginActivityDoc = LoginActivityRecord & { id: string };

export type ConnectedWalletDoc = ConnectedWalletRecord & { id: string };

/** users/{uid}/devices/{deviceId}, one row per device+browser */
export type UserDeviceRecord = {
  uid: string;
  device: string;
  browser: string;
  userAgent?: string;
  ipAddress: string;
  location: string;
  loginMethod: string;
  lastSeen?: unknown;
  firstSeen?: unknown;
};

export type UserDeviceDoc = UserDeviceRecord & { id: string };

const demoUsers: Record<string, UserProfile> = {};
const demoWalletEntries: ConnectedWalletDoc[] = [];
const demoActivityEntries: LoginActivityDoc[] = [];
const demoDeviceEntries: UserDeviceDoc[] = [];

const defaultUserFields = (profile: Partial<UserProfile>): UserProfile => ({
  fullName: profile.fullName ?? "Garuda User",
  email: profile.email ?? "",
  phone: profile.phone ?? "",
  avatar: profile.avatar ?? null,
  provider: profile.provider ?? profile.authMethod ?? "email",
  walletAddress: profile.walletAddress ?? null,
  kycStatus: profile.kycStatus ?? "none",
  kycTier: profile.kycTier ?? 0,
  biometricEnabled: profile.biometricEnabled ?? false,
  twoFactorEnabled: profile.twoFactorEnabled ?? false,
  securityStrictMode: profile.securityStrictMode ?? true,
  role: profile.role ?? "user",
  status: profile.status ?? "active",
  authMethod: profile.authMethod ?? profile.provider,
  loginProvider: profile.loginProvider ?? profile.provider,
});

export const createUserProfile = async (uid: string, profile: Partial<UserProfile>) => {
  const data = defaultUserFields(profile);
  if (!isFirebaseConfigured || !db) {
    demoUsers[uid] = { ...data, uid, createdAt: Date.now(), lastLogin: Date.now() };
    return;
  }
  await setDoc(doc(db, "users", uid), {
    ...data,
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateUserProfile = async (uid: string, patch: Partial<UserProfile>) => {
  if (!isFirebaseConfigured || !db) {
    if (demoUsers[uid]) demoUsers[uid] = { ...demoUsers[uid], ...patch, updatedAt: Date.now() };
    return;
  }
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      ...defaultUserFields(patch),
      ...patch,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
};

export const touchLastLogin = async (uid: string) => {
  if (!isFirebaseConfigured || !db) {
    if (demoUsers[uid]) demoUsers[uid].lastLogin = Date.now();
    return;
  }
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, { lastLogin: serverTimestamp(), updatedAt: serverTimestamp() });
};

export const upsertOAuthProfile = async (
  uid: string,
  profile: Pick<UserProfile, "fullName" | "email" | "phone" | "avatar"> & {
    authMethod?: string;
    loginProvider?: string;
    provider?: string;
  },
): Promise<{ profile: UserProfile | null; isNew: boolean }> => {
  try {
    const existing = await getUserProfile(uid);
    if (existing) {
      const patch: Partial<UserProfile> = {};
      if (profile.fullName && profile.fullName !== existing.fullName) {
        const incomingIsWallet = isWalletDisplayName(profile.fullName);
        const existingIsWallet = isWalletDisplayName(existing.fullName);
        if (!(incomingIsWallet && !existingIsWallet)) {
          patch.fullName = profile.fullName;
        }
      }
      if (profile.email && profile.email !== existing.email) patch.email = profile.email;
      if (profile.phone && profile.phone !== existing.phone) patch.phone = profile.phone;
      if (profile.avatar && profile.avatar !== existing.avatar) patch.avatar = profile.avatar;
      if (Object.keys(patch).length) {
        await updateUserProfile(uid, patch);
      }
      try { await touchLastLogin(uid); } catch { /* optional */ }
      return { profile: await getUserProfile(uid), isNew: false };
    }
    const provider = profile.provider ?? profile.authMethod ?? "oauth";
    await createUserProfile(uid, {
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone ?? "",
      avatar: profile.avatar ?? null,
      provider,
      authMethod: provider,
      loginProvider: profile.loginProvider ?? provider,
    });
    return { profile: await getUserProfile(uid), isNew: true };
  } catch {
    return { profile: null, isNew: false };
  }
};

const normalizeKycStatusField = (status: string): KycStatus => {
  const s = status.toLowerCase();
  if (s === "verified" || s === "approved") return "verified";
  if (s === "rejected") return "rejected";
  if (s === "pending" || s === "processing") return "pending";
  return "none";
};

/** Merge KYCPORT profile on every login, stable uid, always sync KYC fields. */
export const upsertKycPortProfile = async (
  uid: string,
  profile: {
    fullName: string;
    email: string;
    phone: string;
    kycportUserId: string;
    kycStatus: string;
    kycTier: number;
    kycportVerifiedAt?: string | null;
    kycPartnerId?: string;
    kycAppName?: string;
  },
): Promise<{ profile: UserProfile | null; isNew: boolean }> => {
  try {
    const existing = await getUserProfile(uid);
    const kycStatus = normalizeKycStatusField(profile.kycStatus);
    const patch: Partial<UserProfile> = {
      fullName: profile.fullName || existing?.fullName || "KYCPort User",
      email: profile.email || existing?.email || "",
      phone: profile.phone || existing?.phone || "",
      provider: "garuda_prime",
      authMethod: "kycport",
      loginProvider: "KYCPORT",
      kycStatus,
      kycTier: profile.kycTier,
      kycportUserId: profile.kycportUserId,
      kycPartnerId: profile.kycPartnerId ?? "garudaprime",
      kycAppName: profile.kycAppName ?? "Garuda Prime",
      ...(profile.kycportVerifiedAt ? { kycportVerifiedAt: profile.kycportVerifiedAt } : {}),
    };

    if (existing) {
      await updateUserProfile(uid, patch);
      try { await touchLastLogin(uid); } catch { /* optional */ }
      return { profile: await getUserProfile(uid), isNew: false };
    }

    await createUserProfile(uid, patch);
    return { profile: await getUserProfile(uid), isNew: true };
  } catch {
    return { profile: null, isNew: false };
  }
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  if (!isFirebaseConfigured || !db) return demoUsers[uid] ?? null;
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { uid, ...(snap.data() as UserProfile) };
};

export const saveWalletRecord = async (
  uid: string,
  wallet: { address: string; provider: string; network: string },
) => {
  if (!isFirebaseConfigured || !db) return;
  await addDoc(collection(db, "wallets"), { uid, ...wallet, createdAt: serverTimestamp() });
};

const FIRESTORE_OP_TIMEOUT_MS = 12_000;

/** Batasi tunggu Firestore, cegah UI macet saat jaringan/quota lambat. */
export const withFirestoreTimeout = async <T>(
  label: string,
  promise: Promise<T>,
  ms = FIRESTORE_OP_TIMEOUT_MS,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error(`${label} timeout`), { code: "firestore/timeout" }));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const findConnectedWalletDocRef = async (uid: string, address: string) => {
  if (!isFirebaseConfigured || !db) return null;
  const normalized = address.toLowerCase();
  const q = query(collection(db, "connected_wallets"), where("uid", "==", uid));
  const snap = await getDocs(q);
  const match = snap.docs.find(
    (d) => String((d.data() as ConnectedWalletRecord).walletAddress ?? "").toLowerCase() === normalized,
  );
  return match ?? null;
};

export const saveConnectedWallet = async (
  uid: string,
  wallet: { address: string; provider: string; network?: string },
  options?: { makePrimary?: boolean; allowTypeCorrection?: boolean },
) => {
  const walletAddress = normalizeWalletAddress(wallet.address);
  const normalized = walletAddress.toLowerCase();
  const record: ConnectedWalletRecord = {
    uid,
    walletAddress,
    walletType: wallet.provider,
    network: wallet.network ?? "SDA Sidra Network",
    connectedAt: Date.now(),
    lastUsed: Date.now(),
  };

  if (!isFirebaseConfigured || !db) {
    const existingIdx = demoWalletEntries.findIndex(
      (w) => w.uid === uid && w.walletAddress.toLowerCase() === normalized,
    );
    const dedupedCount = dedupeConnectedWalletDocs(demoWalletEntries.filter((w) => w.uid === uid)).length;
    const makePrimary = options?.makePrimary ?? dedupedCount === 0;
    if (existingIdx >= 0) {
      const prev = demoWalletEntries[existingIdx];
      const prevType = prev.walletType?.trim();
      demoWalletEntries[existingIdx] = {
        ...prev,
        ...record,
        walletType: isGarudaPrimePersistedWalletType(prevType)
          ? prevType!
          : (prevType || record.walletType),
        id: prev.id,
        isPrimary: makePrimary || prev.isPrimary,
      };
    } else {
      demoWalletEntries.push({
        ...record,
        isPrimary: makePrimary,
        id: `demo_w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      });
    }
    if (makePrimary) {
      demoWalletEntries.forEach((w) => {
        if (w.uid === uid) w.isPrimary = w.walletAddress.toLowerCase() === normalized;
      });
      await updateUserProfile(uid, { walletAddress });
    }
    return;
  }

  const existingRef = await findConnectedWalletDocRef(uid, walletAddress);
  const existingDocs = dedupeConnectedWalletDocs(
    (await getDocs(query(collection(db, "connected_wallets"), where("uid", "==", uid)))).docs.map(
      (d) => ({ id: d.id, ...(d.data() as ConnectedWalletRecord) }),
    ),
  );
  const makePrimary = options?.makePrimary ?? existingDocs.length === 0;

  if (existingRef) {
    const prev = existingRef.data() as ConnectedWalletRecord;
    const lockedType = prev.walletType?.trim();
    const incoming = wallet.provider.trim();
    let nextType = lockedType || incoming;
    if (!lockedType) {
      nextType = incoming;
    } else if (isGarudaPrimePersistedWalletType(lockedType)) {
      nextType = lockedType;
    } else if (options?.allowTypeCorrection && incoming !== lockedType) {
      nextType = incoming;
    }
    await updateDoc(existingRef.ref, {
      walletType: nextType,
      network: record.network,
      walletAddress,
      lastUsed: serverTimestamp(),
      ...(makePrimary ? { isPrimary: true } : {}),
    });
  } else {
    await addDoc(collection(db, "connected_wallets"), {
      ...record,
      isPrimary: makePrimary,
      connectedAt: serverTimestamp(),
      lastUsed: serverTimestamp(),
    });
  }

  if (makePrimary) {
    await setPrimaryWalletAddress(uid, walletAddress);
  }
};

const syncConnectedWalletPrimaryFlags = async (uid: string, normalized: string) => {
  if (!isFirebaseConfigured || !db) {
    demoWalletEntries.forEach((w) => {
      if (w.uid === uid) w.isPrimary = w.walletAddress.toLowerCase() === normalized.toLowerCase();
    });
    return;
  }

  const q = query(collection(db, "connected_wallets"), where("uid", "==", uid));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map(async (docSnap) => {
    const data = docSnap.data() as ConnectedWalletRecord;
    const isPrimary = data.walletAddress.toLowerCase() === normalized.toLowerCase();
    await updateDoc(docSnap.ref, {
      isPrimary,
      ...(isPrimary ? { lastUsed: serverTimestamp() } : {}),
    });
  }));
};

/** Set dompet utama, profil + dokumen target dulu, flag lainnya di background. */
export const setPrimaryWalletAddress = async (
  uid: string,
  walletAddress: string,
  options?: { docId?: string | null },
) => {
  const normalized = normalizeWalletAddress(walletAddress);
  const key = normalized.toLowerCase();
  const docId = options?.docId?.trim();

  if (!isFirebaseConfigured || !db) {
    if (demoUsers[uid]) {
      demoUsers[uid] = { ...demoUsers[uid], walletAddress: normalized, updatedAt: Date.now() };
    }
    await syncConnectedWalletPrimaryFlags(uid, key);
    return;
  }

  await withFirestoreTimeout("updateUserProfile", updateUserProfile(uid, { walletAddress: normalized }));

  if (docId) {
    await withFirestoreTimeout(
      "markPrimaryWallet",
      updateDoc(doc(db, "connected_wallets", docId), {
        isPrimary: true,
        lastUsed: serverTimestamp(),
      }),
    );
  } else {
    const primaryRef = await withFirestoreTimeout(
      "findConnectedWallet",
      findConnectedWalletDocRef(uid, normalized),
    );
    if (primaryRef) {
      await withFirestoreTimeout(
        "markPrimaryWallet",
        updateDoc(primaryRef.ref, {
          isPrimary: true,
          lastUsed: serverTimestamp(),
        }),
      );
    }
  }
  void syncConnectedWalletPrimaryFlags(uid, key);
};

export const touchConnectedWallet = async (uid: string, walletAddress: string) => {
  if (!isFirebaseConfigured || !db) return;
  const ref = await findConnectedWalletDocRef(uid, walletAddress);
  if (ref) await updateDoc(ref.ref, { lastUsed: serverTimestamp() });
};

export const getConnectedWallets = async (uid: string): Promise<ConnectedWalletRecord[]> => {
  const docs = await getConnectedWalletDocs(uid);
  return docs.map(({ id: _id, ...rest }) => rest);
};

export const getConnectedWalletDocs = async (uid: string): Promise<ConnectedWalletDoc[]> => {
  if (!isFirebaseConfigured || !db) {
    return dedupeConnectedWalletDocs(demoWalletEntries.filter((w) => w.uid === uid));
  }
  const mapDocs = (snap: Awaited<ReturnType<typeof getDocs>>) =>
    snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as ConnectedWalletRecord) }))
      .filter((row) => typeof row.walletAddress === "string" && /^0x/i.test(row.walletAddress.trim()));

  let rows: ConnectedWalletDoc[] = [];
  try {
    const q = query(collection(db, "connected_wallets"), where("uid", "==", uid), orderBy("lastUsed", "desc"));
    rows = mapDocs(await getDocs(q));
  } catch {
    const q = query(collection(db, "connected_wallets"), where("uid", "==", uid));
    rows = mapDocs(await getDocs(q));
    rows.sort((a, b) => {
      const ta = typeof a.lastUsed === "number" ? a.lastUsed : 0;
      const tb = typeof b.lastUsed === "number" ? b.lastUsed : 0;
      return tb - ta;
    });
  }
  return dedupeConnectedWalletDocs(rows);
};

const getNextWalletAddress = async (uid: string, excludeDocId: string): Promise<string | null> => {
  if (!isFirebaseConfigured || !db) {
    const next = demoWalletEntries.find((w) => w.uid === uid && w.id !== excludeDocId);
    return next?.walletAddress ?? null;
  }
  const q = query(collection(db, "connected_wallets"), where("uid", "==", uid));
  const snap = await getDocs(q);
  const rows = snap.docs
    .filter((d) => d.id !== excludeDocId)
    .map((d) => ({ id: d.id, ...(d.data() as ConnectedWalletRecord) }));
  rows.sort((a, b) => {
    const ta = typeof a.lastUsed === "number" ? a.lastUsed : 0;
    const tb = typeof b.lastUsed === "number" ? b.lastUsed : 0;
    return tb - ta;
  });
  return rows[0]?.walletAddress ?? null;
};

export const deleteConnectedWalletDoc = async (uid: string, docId: string): Promise<void> => {
  if (!isFirebaseConfigured || !db) {
    const idx = demoWalletEntries.findIndex((w) => w.id === docId && w.uid === uid);
    if (idx < 0) return;
    const removed = demoWalletEntries[idx];
    demoWalletEntries.splice(idx, 1);
    const profile = demoUsers[uid];
    if (profile?.walletAddress?.toLowerCase() === removed.walletAddress.toLowerCase()) {
      const next = demoWalletEntries.find((w) => w.uid === uid);
      profile.walletAddress = next?.walletAddress ?? null;
    }
    return;
  }

  const ref = doc(db, "connected_wallets", docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as ConnectedWalletRecord;
  if (data.uid !== uid) throw new Error("Forbidden");

  await deleteDoc(ref);

  try {
    const profile = await getUserProfile(uid);
    if (profile?.walletAddress?.toLowerCase() === data.walletAddress.toLowerCase()) {
      const nextAddress = await getNextWalletAddress(uid, docId);
      await updateUserProfile(uid, { walletAddress: nextAddress });
    }
  } catch {
    /* profile sync optional */
  }
};

export const saveKycVerification = async (
  uid: string,
  data: { status: string; tier: number; provider: string },
) => {
  const kycStatus: KycStatus = ["verified", "approved"].includes(data.status.toLowerCase())
    ? "verified"
    : data.status.toLowerCase() === "rejected"
      ? "rejected"
      : "pending";

  await updateUserProfile(uid, { kycStatus, kycTier: data.tier });

  if (!isFirebaseConfigured || !db) return;
  await addDoc(collection(db, "kyc_verifications"), { uid, ...data, submittedAt: serverTimestamp() });
};

export const logLoginActivity = async (
  uid: string,
  loginMethod: string,
  success = true,
) => {
  const { device, browser, userAgent } = getDeviceInfo();
  const geo = await fetchGeoHint();

  const record: LoginActivityRecord = {
    uid,
    loginMethod,
    device,
    browser,
    ipAddress: geo.ipAddress,
    location: geo.location,
    success,
  };

  if (!isFirebaseConfigured || !db) {
    demoActivityEntries.push({
      ...record,
      userAgent,
      id: `demo_a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    });
    return;
  }

  await addDoc(collection(db, "login_activity"), {
    ...record,
    userAgent,
    timestamp: serverTimestamp(),
  });
};

export const getRecentLoginActivity = async (uid: string, max = 10): Promise<LoginActivityRecord[]> => {
  const docs = await getLoginActivityDocs(uid, max);
  return docs.map(({ id: _id, ...rest }) => rest);
};

export const getLoginActivityDocs = async (uid: string, max = 20): Promise<LoginActivityDoc[]> => {
  if (!isFirebaseConfigured || !db) {
    return demoActivityEntries
      .filter((a) => a.uid === uid)
      .slice(-max)
      .reverse();
  }
  const q = query(
    collection(db, "login_activity"),
    where("uid", "==", uid),
    orderBy("timestamp", "desc"),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as LoginActivityRecord) }));
};

export const deleteLoginActivityDoc = async (uid: string, docId: string): Promise<void> => {
  if (!isFirebaseConfigured || !db) {
    const idx = demoActivityEntries.findIndex((a) => a.id === docId && a.uid === uid);
    if (idx >= 0) demoActivityEntries.splice(idx, 1);
    return;
  }
  const ref = doc(db, "login_activity", docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as LoginActivityRecord;
  if (data.uid !== uid) throw new Error("Forbidden");
  await deleteDoc(ref);
};

const compareDeviceActivity = (a: UserDeviceDoc, b: UserDeviceDoc): number => {
  const read = (row: UserDeviceDoc) => {
    const ts = row.lastSeen ?? row.firstSeen;
    if (typeof ts === "number") return ts;
    if (typeof ts === "object" && ts && "toDate" in ts && typeof (ts as { toDate: () => Date }).toDate === "function") {
      return (ts as { toDate: () => Date }).toDate().getTime();
    }
    return 0;
  };
  return read(b) - read(a);
};

/** Register or refresh the current device for device management */
export const upsertUserDevice = async (uid: string, loginMethod = "session"): Promise<string> => {
  const { device, browser, userAgent } = getDeviceInfo();
  const geo = await fetchGeoHint();
  const deviceId = buildDeviceId(device, browser);
  const payload: UserDeviceRecord = {
    uid,
    device,
    browser,
    userAgent,
    ipAddress: geo.ipAddress,
    location: geo.location,
    loginMethod,
  };

  if (!isFirebaseConfigured || !db) {
    const idx = demoDeviceEntries.findIndex((d) => d.id === deviceId && d.uid === uid);
    const now = Date.now();
    if (idx >= 0) {
      demoDeviceEntries[idx] = {
        ...demoDeviceEntries[idx],
        ...payload,
        lastSeen: now,
      };
    } else {
      demoDeviceEntries.push({
        id: deviceId,
        ...payload,
        firstSeen: now,
        lastSeen: now,
      });
    }
    return deviceId;
  }

  const ref = doc(db, "users", uid, "devices", deviceId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, {
      ...payload,
      lastSeen: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      ...payload,
      firstSeen: serverTimestamp(),
      lastSeen: serverTimestamp(),
    });
  }
  return deviceId;
};

export const registerUserDeviceSession = async (uid: string, loginMethod = "session"): Promise<void> => {
  try {
    await upsertUserDevice(uid, loginMethod);
  } catch {
    /* device registry optional, never block auth or UI */
  }
};

export const getUserDeviceDocs = async (uid: string): Promise<UserDeviceDoc[]> => {
  if (!isFirebaseConfigured || !db) {
    return demoDeviceEntries
      .filter((d) => d.uid === uid)
      .sort(compareDeviceActivity);
  }
  const snap = await getDocs(collection(db, "users", uid, "devices"));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as UserDeviceRecord) }))
    .sort(compareDeviceActivity);
};

export const deleteUserDeviceDoc = async (uid: string, deviceId: string): Promise<void> => {
  if (!isFirebaseConfigured || !db) {
    const idx = demoDeviceEntries.findIndex((d) => d.id === deviceId && d.uid === uid);
    if (idx >= 0) demoDeviceEntries.splice(idx, 1);
    return;
  }
  const ref = doc(db, "users", uid, "devices", deviceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as UserDeviceRecord;
  if (data.uid !== uid) throw new Error("Forbidden");
  await deleteDoc(ref);
};

/** Revoke all registered devices except the current browser session */
export const revokeOtherDeviceSessions = async (uid: string): Promise<number> => {
  const { getDeviceInfo } = await import("../auth/deviceInfo");
  const { buildDeviceId } = await import("../auth/deviceSessions");
  const { device, browser } = getDeviceInfo();
  const currentId = buildDeviceId(device, browser);
  const rows = await getUserDeviceDocs(uid);
  let removed = 0;
  for (const row of rows) {
    if (row.id === currentId) continue;
    await deleteUserDeviceDoc(uid, row.id);
    removed++;
  }
  return removed;
};

/** Live profile updates, e.g. admin KYC approve/reject */
export const subscribeUserProfile = (
  uid: string,
  callback: (profile: UserProfile | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe => {
  if (!isFirebaseConfigured || !db) {
    callback(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, "users", uid),
    (snap) => {
      callback(snap.exists() ? { uid, ...(snap.data() as UserProfile) } : null);
    },
    (err) => {
      console.warn("[Garuda Prime] profile subscription", err);
      onError?.(err);
    },
  );
};
