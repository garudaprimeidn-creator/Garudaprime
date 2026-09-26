import { getAddress, isAddress } from "viem";
import type { ConnectedWalletDoc } from "../firebase/firestoreService";
import {
  getProviderLabel,
  getWalletTypeLabel,
  isGarudaNativeWalletType,
  isGarudaPremiumWalletType,
  isNativeWalletProvider,
  isPhraseWalletProvider,
  type ConnectOption,
  type ConnectedWallet,
  type WalletProvider,
  resolveWalletSession,
} from "./walletService";
import {
  loadPrimaryWalletLock,
  primaryWalletLockForRow,
  resolveAddressLockedProvider,
  saveAddressProviderLock,
  savePrimaryWalletLock,
} from "./primaryWalletLock";
import { unlinkGarudaNativeAlias } from "./garudaWalletBridge";
import { isPhraseWalletAddress } from "./phraseWalletBridge";
import { getCachedGarudaServerAddress } from "./garudaNativeSession";
import { getWalletConnectPeerName, syncWalletConnectPeerName } from "./walletConnectProvider";
import { resolveWalletAppProvider } from "./walletAppRouting";
import { resolvePayHubTreasuryAddress } from "../payhub/payLedgerService";

/** Protocol treasury / Pay Hub backing, bukan dompet pengguna. */
export const isProtocolTreasuryWalletAddress = (address?: string | null): boolean => {
  const key = address?.trim().toLowerCase() ?? "";
  if (!/^0x/i.test(key)) return false;
  const treasury = resolvePayHubTreasuryAddress(null)?.trim().toLowerCase();
  return Boolean(treasury && treasury === key);
};

/**
 * SDA on Garuda native / treasury rows is gas sponsorship, hide on Dompet Terhubung.
 */
export const shouldHideConnectedWalletSdaBalance = (
  address: string,
  walletType?: string | null,
): boolean => {
  if (isProtocolTreasuryWalletAddress(address)) return true;
  if (isGarudaPrimePersistedWalletType(walletType)) return true;
  const server = resolveGarudaServerSignerAddress()?.toLowerCase();
  return Boolean(server && address.trim().toLowerCase() === server);
};

export const isUserFacingConnectedWalletRow = (row: ConnectedWalletDoc): boolean =>
  !isProtocolTreasuryWalletAddress(row.walletAddress);

export const normalizeWalletAddress = (address: string): string => {
  const trimmed = address.trim();
  if (!trimmed) return "";
  try {
    if (!isAddress(trimmed, { strict: false })) return trimmed.toLowerCase();
    return getAddress(trimmed);
  } catch {
    return trimmed.toLowerCase();
  }
};

const timestampMs = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value && typeof value === "object" && "seconds" in value) {
    return Number((value as { seconds: number }).seconds) * 1000;
  }
  return 0;
};

const lastUsedMs = (doc: ConnectedWalletDoc) => timestampMs(doc.lastUsed);

/** First link wins, `walletType` tidak berubah meski `lastUsed` / dompet utama berganti. */
const walletTypeLockMs = (doc: ConnectedWalletDoc) => {
  const connected = timestampMs(doc.connectedAt);
  if (connected > 0) return connected;
  const used = timestampMs(doc.lastUsed);
  return used > 0 ? used : Number.MAX_SAFE_INTEGER;
};

/** Map Firestore `walletType` → provider sesi (kunci per alamat). */
export const storedWalletTypeToProvider = (walletType?: string | null): WalletProvider => {
  const t = walletType?.trim().toLowerCase() ?? "";
  if (t.includes("embedded:phrase") || t === "embedded:phrase") {
    return "embedded:phrase";
  }
  if (t.includes("embedded:garuda") || t.includes("embedded:privy") || t === "embedded") {
    return "embedded:garuda";
  }
  if (t.includes("embedded:external")) return "embedded:external";
  if (t.includes("metamask")) return "metamask";
  if (t.includes("trust")) return "trustwallet";
  return "walletconnect";
};

const isValidWalletDocAddress = (address: unknown): address is string =>
  typeof address === "string" && /^0x/i.test(address.trim());

/** Satu baris per alamat, aktivitas terbaru, tipe dompet dari penghubungan pertama. */
export const dedupeConnectedWalletDocs = (docs: ConnectedWalletDoc[]): ConnectedWalletDoc[] => {
  const byAddress = new Map<string, ConnectedWalletDoc>();

  for (const doc of docs) {
    if (!isValidWalletDocAddress(doc.walletAddress)) continue;
    const key = doc.walletAddress.toLowerCase();
    const existing = byAddress.get(key);
    if (!existing) {
      byAddress.set(key, {
        ...doc,
        walletAddress: normalizeWalletAddress(doc.walletAddress),
        walletType: doc.walletType?.trim() || "walletconnect",
        id: doc.id || key,
      });
      continue;
    }

    const activitySource = lastUsedMs(doc) >= lastUsedMs(existing) ? doc : existing;
    const typeSource = walletTypeLockMs(doc) <= walletTypeLockMs(existing) ? doc : existing;
    byAddress.set(key, {
      ...activitySource,
      walletAddress: normalizeWalletAddress(existing.walletAddress),
      walletType: typeSource.walletType?.trim() || activitySource.walletType?.trim() || "walletconnect",
      id: activitySource.id || typeSource.id || key,
    });
  }

  return Array.from(byAddress.values()).sort(
    (a, b) => lastUsedMs(b) - lastUsedMs(a),
  );
};

/** Alamat server Garuda native kanonik (penandatangan), null jika belum di-cache. */
export const resolveGarudaServerSignerAddress = (): string | null => {
  const cached = getCachedGarudaServerAddress()?.trim();
  if (!cached) return null;
  try {
    return normalizeWalletAddress(cached);
  } catch {
    return cached;
  }
};

/** Satu alamat untuk saldo, tampilan, kirim, dan tukar, selalu dompet utama (profil). */
export const resolveBalanceWalletAddress = (
  profileAddress?: string | null,
  connectedWallet?: ConnectedWallet | null,
): string => resolveDisplayWalletAddress(profileAddress, connectedWallet);

/** Alamat kanonik signer Garuda Prime sudah terdaftar / dikunci. */
export const isGarudaPrimeSpendAddress = (address: string): boolean => {
  const key = address.trim().toLowerCase();
  if (!key.startsWith("0x")) return false;

  const server = resolveGarudaServerSignerAddress()?.toLowerCase();
  if (server && key === server) return true;

  const lock = loadPrimaryWalletLock();
  if (!lock) return false;
  const lockIsGaruda = lock.provider === "embedded:garuda"
    || isGarudaNativeWalletType(lock.walletType);
  if (!lockIsGaruda) return false;
  return lock.address.trim().toLowerCase() === key || Boolean(server && key === server);
};

/** Alamat untuk query saldo on-chain, prioritaskan dompet terhubung (frasa self-custody). */
export const resolveOnChainBalanceAddress = (options: {
  profileAddress?: string | null;
  connectedWallet?: ConnectedWallet | null;
  fallbackAddress?: string | null;
}): string => {
  const lock = loadPrimaryWalletLock();

  // Dompet utama Garuda Prime, abaikan sesi WalletConnect/MetaMask lama
  if (lock && isGarudaLockedProvider(lock.provider, lock.walletType)) {
    return resolveWalletMoneyAddress(options);
  }

  const profileKey = options.profileAddress?.trim().toLowerCase();
  const server = resolveGarudaServerSignerAddress()?.toLowerCase();
  if (server && profileKey === server) {
    return resolveGarudaServerSignerAddress()!;
  }

  const connected = options.connectedWallet?.address?.trim();
  const provider = options.connectedWallet?.provider ?? options.connectedWallet?.walletType;

  if (connected?.startsWith("0x")) {
    let connectedNorm = connected;
    try {
      connectedNorm = normalizeWalletAddress(connected);
    } catch {
      /* keep raw */
    }

    if (isGarudaNativeWalletType(provider)) {
      const serverAddr = resolveGarudaServerSignerAddress();
      if (!serverAddr || serverAddr.toLowerCase() !== connectedNorm.toLowerCase()) {
        return connectedNorm;
      }
    } else if (!isGarudaPrimeSpendAddress(connectedNorm)) {
      return connectedNorm;
    }
  }

  return resolveWalletMoneyAddress(options);
};

export const resolveWalletMoneyAddress = (options: {
  profileAddress?: string | null;
  connectedWallet?: ConnectedWallet | null;
  fallbackAddress?: string | null;
}): string => {
  const lock = loadPrimaryWalletLock();

  if (isPhraseWalletProvider(lock?.provider) || isPhraseWalletProvider(lock?.walletType)) {
    try {
      return normalizeWalletAddress(lock!.address);
    } catch {
      return lock!.address.trim();
    }
  }

  const connected = options.connectedWallet;
  if (connected?.address?.startsWith("0x")) {
    const provider = connected.provider ?? connected.walletType;
    if (isPhraseWalletProvider(provider) || isPhraseWalletAddress(connected.address)) {
      try {
        return normalizeWalletAddress(connected.address);
      } catch {
        return connected.address.trim();
      }
    }
  }

  const garudaPrimary = lock?.provider === "embedded:garuda"
    || isGarudaNativeWalletType(lock?.walletType)
    || isGarudaNativeWalletType(options.connectedWallet?.walletType);

  if (garudaPrimary) {
    const server = resolveGarudaServerSignerAddress();
    if (server) return server;
  }

  const resolved = resolveBalanceWalletAddress(options.profileAddress, options.connectedWallet)
    || options.fallbackAddress?.trim()
    || "";
  if (!resolved) return "";
  try {
    return normalizeWalletAddress(resolved);
  } catch {
    return resolved;
  }
};

export const resolveSpendWalletAddress = resolveWalletMoneyAddress;
export const resolveActiveTransactionAddress = resolveWalletMoneyAddress;

export const resolvePrimaryWalletAddress = (
  profileAddress?: string | null,
  fallbackAddress?: string | null,
): string => {
  const lock = loadPrimaryWalletLock();
  const profileKey = profileAddress?.trim().toLowerCase() || "";
  const fallbackKey = fallbackAddress?.trim().toLowerCase() || "";
  const lockKey = lock?.address?.trim().toLowerCase() || "";

  // Kunci lokal = pilihan eksplisit pengguna; menang atas profil Firestore yang belum/sudah basi.
  if (lockKey) {
    try {
      return normalizeWalletAddress(lock.address).toLowerCase();
    } catch {
      return lockKey;
    }
  }

  const candidate = profileKey || fallbackKey;
  if (!candidate) return "";
  try {
    return normalizeWalletAddress(candidate).toLowerCase();
  } catch {
    return candidate.toLowerCase();
  }
};

/** Alamat dompet utama untuk tampilan UI, profil Firestore menjadi sumber kebenaran. */
export const resolveDisplayWalletAddress = (
  profileAddress?: string | null,
  connectedWallet?: ConnectedWallet | null,
): string => {
  const raw = resolvePrimaryWalletAddress(profileAddress, connectedWallet?.address);
  if (!raw) return "";
  try {
    return normalizeWalletAddress(raw);
  } catch {
    return raw;
  }
};

const NATIVE_WALLET_TYPES = new Set(["metamask", "trustwallet", "walletconnect"]);

/** Dompet dibuat / dihubungkan sebagai Garuda Prime, tipe tidak boleh diturunkan ke MetaMask. */
export const isGarudaPrimePersistedWalletType = (walletType?: string | null): boolean => {
  const t = walletType?.trim().toLowerCase() ?? "";
  return t === "embedded:garuda" || t === "embedded" || t.includes("embedded:privy");
};

/** Tipe yang disimpan ke Firestore, Garuda native vs eksternal. */
export const resolvePersistedWalletType = (
  address: string,
  requested: string,
  walletClientType?: string | null,
): string => {
  const client = (walletClientType ?? "").toLowerCase();
  if (client.includes("metamask")) return "metamask";
  if (client.includes("trust")) return "trustwallet";
  if (NATIVE_WALLET_TYPES.has(requested)) return requested;

  if (requested === "embedded:garuda" || requested === "embedded:privy" || requested === "embedded") {
    return "embedded:garuda";
  }

  if (requested === "embedded:external") {
    if (client.includes("metamask")) return "metamask";
    if (client.includes("trust")) return "trustwallet";
    return "embedded:external";
  }

  return requested?.trim() || "walletconnect";
};

/** Koreksi otomatis, Garuda Prime tidak pernah diturunkan ke MetaMask/Trust. */
export const shouldCorrectPersistedWalletType = (
  stored: string | undefined | null,
  resolved: string,
  address?: string,
): boolean => {
  const prev = stored?.trim() ?? "";
  if (!prev || prev === resolved) return false;
  if (isGarudaPrimePersistedWalletType(prev)) return false;
  if (NATIVE_WALLET_TYPES.has(resolved) && prev === "embedded:external") return true;
  if (resolved === "embedded:garuda" && prev !== "embedded:garuda" && address) {
    const server = resolveGarudaServerSignerAddress()?.toLowerCase();
    if (server && address.trim().toLowerCase() === server) return true;
  }
  return false;
};

export const formatWalletAddressShort = (address: string) => {
  const normalized = address.trim();
  if (normalized.length <= 18) return normalized;
  return `${normalized.slice(0, 10)}…${normalized.slice(-8)}`;
};

const EXPLICIT_WALLET_TYPES = new Set([
  "metamask",
  "trustwallet",
  "walletconnect",
  "embedded:external",
  "embedded:garuda",
  "embedded:phrase",
  "embedded",
]);

const isExplicitWalletType = (walletType?: string | null): boolean => {
  const t = walletType?.trim().toLowerCase() ?? "";
  if (!t) return false;
  if (EXPLICIT_WALLET_TYPES.has(t)) return true;
  return t.includes("embedded:privy") || t.includes("trust");
};

/**
 * Provider dari Firestore saja, tidak membaca kunci lokal (sumber kebenaran per alamat).
 */
export const resolveFirestoreWalletProvider = (row: ConnectedWalletDoc): WalletProvider => {
  const storedRaw = row.walletType?.trim().toLowerCase() ?? "";

  if (storedRaw === "metamask") return "metamask";
  if (storedRaw === "trustwallet" || storedRaw.includes("trust")) return "trustwallet";
  if (storedRaw === "walletconnect") {
    syncWalletConnectPeerName();
    return resolveWalletAppProvider("walletconnect", getWalletConnectPeerName());
  }
  if (storedRaw === "embedded:external") return "embedded:external";
  if (storedRaw === "embedded:phrase" || storedRaw.includes("embedded:phrase")) {
    return "embedded:phrase";
  }
  if (storedRaw === "embedded:garuda" || storedRaw === "embedded" || storedRaw.includes("embedded:privy")) {
    return "embedded:garuda";
  }

  return resolveStoredWalletProvider(row);
};

/**
 * Provider terkunci per baris, Firestore dulu, kunci lokal hanya untuk baris tanpa tipe eksplisit.
 */
export const resolveLockedWalletProvider = (row: ConnectedWalletDoc): WalletProvider => {
  if (isExplicitWalletType(row.walletType)) {
    return resolveFirestoreWalletProvider(row);
  }

  const addrLock = resolveAddressLockedProvider(row.walletAddress);
  if (addrLock) return addrLock;

  return resolveFirestoreWalletProvider(row);
};

/** Alamat server Garuda kanonik, hanya cache server atau baris Firestore bertipe Garuda. */
export const resolveCanonicalGarudaAddressFromRows = (
  rows: ConnectedWalletDoc[],
): string | null => {
  const server = resolveGarudaServerSignerAddress();
  if (server) return server;

  const garudaRow = rows.find((row) => {
    const t = row.walletType?.trim().toLowerCase() ?? "";
    return t === "embedded:garuda" || t === "embedded" || t.includes("embedded:privy");
  });
  return garudaRow?.walletAddress ?? null;
};

/**
 * Koreksi baris yang salah bertipe `embedded:garuda` (bug sinkron alias).
 * Hanya alamat server Garuda kanonik yang tetap Garuda Prime.
 */
export const reconcileWalletRowTypes = (
  rows: ConnectedWalletDoc[],
  canonicalGarudaAddress?: string | null,
): ConnectedWalletDoc[] => {
  const serverKey = canonicalGarudaAddress?.trim().toLowerCase() ?? null;

  return rows.map((row) => {
    const key = row.walletAddress.toLowerCase();
    const stored = row.walletType?.trim().toLowerCase() ?? "";

    if (stored === "metamask" || stored === "trustwallet" || stored === "walletconnect" || stored === "embedded:external") {
      return row;
    }

    if (stored === "embedded:garuda" || stored === "embedded" || stored.includes("embedded:privy")) {
      if (serverKey && key === serverKey) return row;

      const firestoreProvider = resolveFirestoreWalletProvider(row);
      if (firestoreProvider === "metamask") return { ...row, walletType: "metamask" };
      if (firestoreProvider === "trustwallet") return { ...row, walletType: "trustwallet" };
      if (firestoreProvider === "embedded:external") return { ...row, walletType: "embedded:external" };

      const addrLock = resolveAddressLockedProvider(row.walletAddress);
      if (addrLock === "metamask") return { ...row, walletType: "metamask" };
      if (addrLock === "trustwallet") return { ...row, walletType: "trustwallet" };
      if (addrLock === "walletconnect" || addrLock === "embedded:external") {
        return { ...row, walletType: addrLock === "embedded:external" ? "embedded:external" : "walletconnect" };
      }

      return { ...row, walletType: "walletconnect" };
    }

    return row;
  });
};

/** Provider sebenarnya untuk transaksi, mengikuti Firestore + kunci, bukan heuristik dompet utama. */
export const resolveEffectiveWalletProvider = (
  row: ConnectedWalletDoc,
  sessionWallet?: ConnectedWallet | null,
): WalletProvider => {
  const locked = resolveLockedWalletProvider(row);
  const addr = row.walletAddress.toLowerCase();
  if (sessionWallet?.address?.toLowerCase() === addr) {
    const sp = sessionWallet.provider;
    if (isNativeWalletProvider(sp) && locked === sp) return sp;
  }
  return locked;
};

/** Sinkronkan kunci lokal dari Firestore, perbaiki label/provider yang tertimpa reconcile. */
export const syncWalletProviderLocksFromFirestore = (docs: ConnectedWalletDoc[]): void => {
  const rows = dedupeConnectedWalletDocs(docs);
  for (const row of rows) {
    const provider = resolveFirestoreWalletProvider(row);
    saveAddressProviderLock(
      row.walletAddress,
      provider,
      row.walletType?.trim() || provider,
      { force: true },
    );
  }

  const primaryLock = loadPrimaryWalletLock();
  if (!primaryLock) return;
  const match = rows.find((r) => r.walletAddress.toLowerCase() === primaryLock.address.toLowerCase());
  if (!match) return;
  const provider = resolveFirestoreWalletProvider(match);
  const walletType = match.walletType?.trim() || provider;
  if (provider !== "embedded:garuda") {
    unlinkGarudaNativeAlias(match.walletAddress);
  }
  if (primaryLock.provider !== provider || primaryLock.walletType !== walletType) {
    savePrimaryWalletLock(primaryWalletLockForRow(match, provider));
  }
};

/** Infer wallet type when Firestore row is missing, dompet utama dulu, lalu kunci per-alamat. */
const inferWalletTypeForAddress = (address: string): string => {
  const key = address.trim().toLowerCase();

  const primaryLock = loadPrimaryWalletLock();
  if (primaryLock?.address.toLowerCase() === key) {
    const wt = primaryLock.walletType?.trim();
    if (wt) return wt;
    return primaryLock.provider;
  }

  const addrLock = resolveAddressLockedProvider(address);
  if (addrLock === "metamask") return "metamask";
  if (addrLock === "trustwallet") return "trustwallet";
  if (addrLock === "embedded:external") return "embedded:external";
  if (addrLock === "embedded:garuda") return "embedded:garuda";

  const server = resolveGarudaServerSignerAddress()?.toLowerCase();
  if (server && key === server) return "embedded:garuda";
  return "walletconnect";
};

export type ExtraConnectedWalletRow = {
  address: string;
  walletType: string;
  id?: string;
  network?: string;
};

/** Firestore rows + alamat profil / Garuda server yang belum tersinkron, label tidak mengikuti sesi aktif. */
export const mergeConnectedWalletRowsForDisplay = (
  docs: ConnectedWalletDoc[],
  options?: {
    uid?: string;
    profileAddress?: string | null;
    network?: string | null;
    extraWallets?: ExtraConnectedWalletRow[];
  },
): ConnectedWalletDoc[] => {
  const network = options?.network?.trim() || "SDA Sidra Network";
  const rows = dedupeConnectedWalletDocs(docs);
  const known = new Set(rows.map((w) => w.walletAddress.toLowerCase()));

  const pushIfMissing = (
    address: string | undefined | null,
    id: string,
    walletType?: string,
    rowNetwork?: string,
  ) => {
    const trimmed = address?.trim();
    if (!trimmed) return;
    let normalized: string;
    try {
      normalized = normalizeWalletAddress(trimmed);
    } catch {
      return;
    }
    const key = normalized.toLowerCase();
    if (known.has(key)) return;
    known.add(key);
    rows.push({
      id,
      uid: options?.uid ?? "",
      walletAddress: normalized,
      walletType: walletType?.trim() || inferWalletTypeForAddress(normalized),
      network: rowNetwork?.trim() || network,
    });
  };

  pushIfMissing(options?.profileAddress, "profile_wallet");

  for (const extra of options?.extraWallets ?? []) {
    pushIfMissing(extra.address, extra.id ?? `extra_${extra.walletType}`, extra.walletType, extra.network);
  }

  return rows
    .filter(isUserFacingConnectedWalletRow)
    .sort((a, b) => lastUsedMs(b) - lastUsedMs(a));
};

/** Sesi dompet yang cocok dengan alamat transaksi (stored session atau connected). */
export const resolveWalletSessionForAddress = (
  address: string,
  connectedWallet?: ConnectedWallet | null,
): ConnectedWallet | null => {
  const normalized = address.trim().toLowerCase();
  if (!normalized) return null;
  const stored = resolveWalletSession(address);
  if (stored?.address?.toLowerCase() === normalized) return stored;
  if (connectedWallet?.address?.toLowerCase() === normalized) return connectedWallet;
  return stored ?? connectedWallet ?? null;
};

/**
 * Provider untuk menandatangani transaksi on-chain.
 * MetaMask/Trust/WC → popup dompet; Garuda Prime embedded → Garuda Wallet Service.
 */
const isGarudaLockedProvider = (provider: WalletProvider, walletType?: string): boolean =>
  provider === "embedded:garuda"
  || isGarudaNativeWalletType(provider)
  || isGarudaNativeWalletType(walletType ?? "");

export const resolveTransactionWalletProvider = (
  address: string,
  connectedWallet?: ConnectedWallet | null,
  row?: ConnectedWalletDoc | null,
): WalletProvider => {
  const addrLower = address.trim().toLowerCase();
  if (!addrLower.startsWith("0x")) return "walletconnect";

  if (row) {
    return resolveEffectiveWalletProvider(row, connectedWallet);
  }

  const primaryLock = loadPrimaryWalletLock();
  if (primaryLock?.address.toLowerCase() === addrLower) {
    if (isPhraseWalletProvider(primaryLock.provider) || isPhraseWalletProvider(primaryLock.walletType)) {
      return "embedded:phrase";
    }
    if (isGarudaLockedProvider(primaryLock.provider, primaryLock.walletType)) {
      return "embedded:garuda";
    }
    if (isNativeWalletProvider(primaryLock.provider)) return primaryLock.provider;
  }

  const addrLock = resolveAddressLockedProvider(address);
  if (addrLock === "embedded:garuda") return "embedded:garuda";
  if (addrLock) return addrLock;

  if (isPhraseWalletAddress(address)) return "embedded:phrase";

  const server = resolveGarudaServerSignerAddress()?.toLowerCase();
  if (server && addrLower === server) return "embedded:garuda";

  if (primaryLock && isGarudaLockedProvider(primaryLock.provider, primaryLock.walletType)) {
    return "embedded:garuda";
  }

  const session = resolveWalletSessionForAddress(address, connectedWallet);
  if (session?.address?.toLowerCase() === addrLower && session.provider) {
    if (isPhraseWalletProvider(session.provider)) return "embedded:phrase";
    if (isGarudaLockedProvider(session.provider)) return "embedded:garuda";
    if (isNativeWalletProvider(session.provider)) return session.provider;
  }

  return "walletconnect";
};

/** Label dompet utama aktif, selalu dari Firestore, tidak dari alias signer. */
export const resolvePrimaryWalletRowDisplay = (
  docs: ConnectedWalletDoc[],
  profileAddress?: string | null,
  lang: "id" | "en" = "id",
): WalletRowDisplay | null => {
  const primaryKey = resolvePrimaryWalletAddress(profileAddress);
  if (!primaryKey) return null;
  const rows = dedupeConnectedWalletDocs(docs);
  const match = rows.find((r) => r.walletAddress.toLowerCase() === primaryKey);
  if (!match) return null;
  return resolveWalletRowDisplay(match, lang);
};

/** Provider yang tersimpan di Firestore, satu sumber kebenaran per alamat (terkunci). */
export const resolveStoredWalletProvider = (row: ConnectedWalletDoc): WalletProvider =>
  storedWalletTypeToProvider(row.walletType);

/**
 * Label satu baris di Dompet Terhubung, memakai provider efektif (Garuda + Firestore).
 * Untuk routing transaksi tetap pakai `resolveEffectiveWalletProvider`.
 */
export const resolveWalletDisplayLabel = (
  row: ConnectedWalletDoc,
  _sessionWallet?: ConnectedWallet | null,
): string => {
  const effective = resolveFirestoreWalletProvider(row);
  const typed = getWalletTypeLabel(effective);
  if (typed) return typed;
  if (effective === "metamask" || effective === "trustwallet" || effective === "walletconnect") {
    return getProviderLabel(effective as ConnectOption);
  }
  return effective;
};

export type WalletRowDisplay = {
  kindLabel: string;
  detailLabel: string;
  signHint: string;
  badge?: string;
};

/** Human-readable wallet type for Dompet Terhubung (no misleading MetaMask label). */
export const resolveWalletRowDisplay = (
  row: ConnectedWalletDoc,
  lang: "id" | "en" = "id",
  _sessionWallet?: ConnectedWallet | null,
): WalletRowDisplay => {
  const primary = resolveFirestoreWalletProvider(row);
  const id = lang === "id";

  if (primary === "embedded:garuda") {
    return {
      kindLabel: "Garuda Prime",
      detailLabel: id ? "Dompet bawaan Garuda Prime" : "Built-in Garuda Prime wallet",
      signHint: primary === "embedded:garuda"
        ? (id ? "Tanda tangan via Garuda Wallet Service (tanpa popup)" : "Sign via Garuda Wallet Service (no popup)")
        : (id ? "Tanda tangan via panel Garuda Premium (bukan popup MetaMask)" : "Sign via Garuda Premium panel (not MetaMask popup)"),
      badge: id ? "Resmi" : "Official",
    };
  }
  if (primary === "embedded:external") {
    return {
      kindLabel: id ? "Dompet Eksternal" : "External Wallet",
      detailLabel: id ? "Trust / MetaMask via Garuda Premium" : "Trust / MetaMask via Garuda Premium",
      signHint: id ? "Tanda tangan via panel Garuda Premium" : "Sign via Garuda Premium panel",
      badge: id ? "Eksternal" : "External",
    };
  }
  if (primary === "metamask") {
    return {
      kindLabel: "MetaMask",
      detailLabel: id ? "Ekstensi browser / WalletConnect" : "Browser extension / WalletConnect",
      signHint: id ? "Popup MetaMask atau aplikasi MetaMask" : "MetaMask extension or mobile app",
      badge: id ? "Eksternal" : "External",
    };
  }
  if (primary === "trustwallet") {
    return {
      kindLabel: "Trust Wallet",
      detailLabel: "WalletConnect",
      signHint: id ? "Popup Trust Wallet" : "Trust Wallet app prompt",
      badge: id ? "Eksternal" : "External",
    };
  }
  return {
    kindLabel: id ? "Dompet Web3" : "Web3 Wallet",
    detailLabel: "WalletConnect",
    signHint: id ? "Aplikasi dompet terhubung" : "Connected wallet app",
    badge: id ? "Eksternal" : "External",
  };
};
