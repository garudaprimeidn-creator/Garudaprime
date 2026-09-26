import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../../app/AppContext";
import { useAuth } from "../../contexts/AuthContext";
import { warmQrImageCache } from "../qr/qrImageCache";
import { getSessionUidAsync, getSessionUidSync } from "../security/sessionManager";
import { createMerchantInvoiceId, type MerchantInvoiceProfile } from "./merchantMdr";
import {
  canonicalMerchantIdForOwner,
  encodeMerchantReceiveQrPayload,
  fetchMerchantProfile,
  isValidMerchantId,
  MERCHANT_NAME,
  resolvePrimaryMerchantForOwner,
  syncOwnerMerchantSession,
} from "./merchantService";
import { readMerchantQrSnapshot, writeMerchantQrSnapshot } from "./merchantQrCache";
import {
  MERCHANT_PROFILE_SAVED_EVENT,
  type MerchantProfileSavedDetail,
} from "./merchantProfileEvents";

/** Resolve signed-in owner uid, AppContext can lag behind Auth/session on first paint. */
export const resolveOwnerUid = (
  appUserId?: string | null,
  authUid?: string | null,
  profileUid?: string | null,
  sessionUid?: string | null,
): string | null => {
  const uid = appUserId?.trim()
    || authUid?.trim()
    || profileUid?.trim()
    || sessionUid?.trim()
    || getSessionUidSync()?.trim();
  return uid || null;
};

const resolveDisplayName = (
  userProfile?: { fullName?: string | null; displayName?: string | null } | null,
  user?: { displayName?: string | null } | null,
): string =>
  userProfile?.fullName?.trim()
  || userProfile?.displayName?.trim()
  || user?.displayName?.trim()
  || MERCHANT_NAME;

const QR_SIZE = 176;

/** Merchant receive QR, instant canonical ID; background sync never blocks display. */
export function useOwnerMerchantQr() {
  const { userId: appUserId } = useApp();
  const { user, userProfile } = useAuth();
  const [sessionUid, setSessionUid] = useState<string | null>(() => getSessionUidSync()?.trim() || null);
  const [refreshKey, setRefreshKey] = useState(0);

  const ownerUid = resolveOwnerUid(appUserId, user?.uid, userProfile?.uid, sessionUid);
  const cachedSnapshot = ownerUid ? readMerchantQrSnapshot(ownerUid) : null;

  const [merchantName, setMerchantName] = useState(() =>
    cachedSnapshot?.merchantName || resolveDisplayName(userProfile, user),
  );
  const [enriching, setEnriching] = useState(false);
  const [requestAmount, setRequestAmount] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceNote, setInvoiceNote] = useState("");
  const [invoiceProfile, setInvoiceProfile] = useState<MerchantInvoiceProfile | null>(() => {
    if (!cachedSnapshot) return null;
    if (!cachedSnapshot.shopSymbol && !cachedSnapshot.shopLocation) return null;
    return {
      merchantId: cachedSnapshot.merchantId,
      shopSymbol: cachedSnapshot.shopSymbol,
      shopLocation: cachedSnapshot.shopLocation,
    };
  });

  const effectiveMerchantId = useMemo(() => {
    if (!ownerUid) return "";
    if (cachedSnapshot?.merchantId && isValidMerchantId(cachedSnapshot.merchantId)) {
      return cachedSnapshot.merchantId;
    }
    return canonicalMerchantIdForOwner(ownerUid);
  }, [ownerUid, cachedSnapshot?.merchantId]);

  const hasRequestAmount = useMemo(() => {
    const parsed = parseFloat(requestAmount.trim());
    return Number.isFinite(parsed) && parsed > 0;
  }, [requestAmount]);

  const qrPayload = useMemo(() => {
    if (!isValidMerchantId(effectiveMerchantId)) return "";
    return encodeMerchantReceiveQrPayload(
      effectiveMerchantId,
      merchantName,
      requestAmount,
      hasRequestAmount ? invoiceId : undefined,
      hasRequestAmount ? invoiceNote : undefined,
    );
  }, [effectiveMerchantId, merchantName, requestAmount, invoiceId, invoiceNote, hasRequestAmount]);

  useEffect(() => {
    if (!hasRequestAmount) {
      setInvoiceId("");
      return;
    }
    setInvoiceId(createMerchantInvoiceId(invoiceProfile ?? { merchantId: effectiveMerchantId }));
  }, [
    hasRequestAmount,
    effectiveMerchantId,
    invoiceProfile?.shopSymbol,
    invoiceProfile?.shopLocation,
    invoiceProfile?.invoicePrefix,
    invoiceProfile?.merchantId,
  ]);

  useEffect(() => {
    if (!ownerUid) return;
    let cancelled = false;
    void getSessionUidAsync().then((uid) => {
      if (!cancelled && uid?.trim()) setSessionUid(uid.trim());
    });
    return () => { cancelled = true; };
  }, [ownerUid]);

  useEffect(() => {
    if (!ownerUid) return;
    setMerchantName((prev) => {
      const next = resolveDisplayName(userProfile, user);
      return prev === MERCHANT_NAME ? next : prev || next;
    });
  }, [ownerUid, user?.displayName, userProfile?.displayName, userProfile?.fullName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onProfileSaved = (event: Event) => {
      const detail = (event as CustomEvent<MerchantProfileSavedDetail>).detail;
      if (!detail?.merchantId) return;
      if (detail.merchantId !== effectiveMerchantId) return;
      setInvoiceProfile({
        merchantId: detail.merchantId,
        shopSymbol: detail.shopSymbol,
        shopLocation: detail.shopLocation,
        invoicePrefix: detail.invoicePrefix,
      });
      if (detail.name?.trim()) setMerchantName(detail.name.trim());
      setRefreshKey((k) => k + 1);
    };
    window.addEventListener(MERCHANT_PROFILE_SAVED_EVENT, onProfileSaved);
    return () => window.removeEventListener(MERCHANT_PROFILE_SAVED_EVENT, onProfileSaved);
  }, [effectiveMerchantId]);

  useEffect(() => {
    const uid = resolveOwnerUid(appUserId, user?.uid, userProfile?.uid, sessionUid);
    if (!uid) return;

    let cancelled = false;
    setEnriching(true);

    void syncOwnerMerchantSession(resolveDisplayName(userProfile, user)).catch(() => undefined);

    void (async () => {
      try {
        const primary = await resolvePrimaryMerchantForOwner(uid, resolveDisplayName(userProfile, user));
        const profile = await fetchMerchantProfile(primary.merchantId);
        if (cancelled) return;

        const name = profile?.name?.trim() || primary.merchantName || resolveDisplayName(userProfile, user);
        const id = isValidMerchantId(primary.merchantId)
          ? primary.merchantId
          : canonicalMerchantIdForOwner(uid);

        setMerchantName(name);
        setInvoiceProfile({
          merchantId: id,
          shopSymbol: profile?.shopSymbol,
          shopLocation: profile?.shopLocation,
          invoicePrefix: profile?.invoicePrefix,
        });
        writeMerchantQrSnapshot({
          uid,
          merchantId: id,
          merchantName: name,
          shopSymbol: profile?.shopSymbol?.trim() || undefined,
          shopLocation: profile?.shopLocation?.trim() || undefined,
          savedAt: Date.now(),
        });
      } catch {
        /* keep canonical QR */
      } finally {
        if (!cancelled) setEnriching(false);
      }
    })();

    return () => { cancelled = true; };
  }, [
    appUserId,
    sessionUid,
    refreshKey,
    user?.uid,
    user?.displayName,
    userProfile?.uid,
    userProfile?.displayName,
    userProfile?.fullName,
  ]);

  useEffect(() => {
    if (!qrPayload) return;
    warmQrImageCache(qrPayload, QR_SIZE);
    if (ownerUid && effectiveMerchantId) {
      writeMerchantQrSnapshot({
        uid: ownerUid,
        merchantId: effectiveMerchantId,
        merchantName,
        shopSymbol: invoiceProfile?.shopSymbol?.trim() || cachedSnapshot?.shopSymbol,
        shopLocation: invoiceProfile?.shopLocation?.trim() || cachedSnapshot?.shopLocation,
        savedAt: Date.now(),
      });
    }
  }, [qrPayload, ownerUid, effectiveMerchantId, merchantName, invoiceProfile?.shopSymbol, invoiceProfile?.shopLocation, cachedSnapshot?.shopSymbol, cachedSnapshot?.shopLocation]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const clearRequestAmount = useCallback(() => setRequestAmount(""), []);

  const refreshInvoice = useCallback(() => {
    if (!effectiveMerchantId) return;
    setInvoiceId(createMerchantInvoiceId(invoiceProfile ?? { merchantId: effectiveMerchantId }));
  }, [effectiveMerchantId, invoiceProfile]);

  return {
    merchantId: effectiveMerchantId,
    merchantName,
    qrPayload,
    requestAmount,
    setRequestAmount,
    clearRequestAmount,
    hasRequestAmount,
    invoiceId,
    invoiceNote,
    setInvoiceNote,
    refreshInvoice,
    loading: enriching && !qrPayload,
    ready: Boolean(qrPayload),
    enriching,
    ownerUid,
    refresh,
  };
}
