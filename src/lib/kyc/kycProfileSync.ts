/** Cross-tree signal after KYC Port / Firestore profile KYC fields change. */

export const KYC_PROFILE_SYNC_EVENT = "garuda:kyc-profile-sync";

type KycProfileSyncDetail = { uid?: string };

export const notifyKycProfileSync = (detail?: KycProfileSyncDetail) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(KYC_PROFILE_SYNC_EVENT, { detail }));
};

export const subscribeKycProfileSync = (handler: (detail?: KycProfileSyncDetail) => void) => {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    handler((e as CustomEvent<KycProfileSyncDetail>).detail);
  };
  window.addEventListener(KYC_PROFILE_SYNC_EVENT, listener);
  return () => window.removeEventListener(KYC_PROFILE_SYNC_EVENT, listener);
};
