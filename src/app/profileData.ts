export const PROFILE_NAME = "";
export const PROFILE_EMAIL = "";
export const PROFILE_PHONE = "";
export const REFERRAL_CODE = "GARUDA-PRIME";

export const profileInitials = (name?: string) => {
  const source = (name ?? "").trim();
  if (!source) return "U";
  return source.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "U";
};

/** @deprecated Legacy shared key, migrated to per-user storage on load */
export const PROFILE_PHOTO_STORAGE = "garuda_prime_profile_photo";

const profilePhotoKey = (uid: string) => `garuda_prime_profile_photo_${uid}`;

/** Load profile photo for a specific account (local cache). */
export const loadProfilePhoto = (uid: string | null | undefined): string | null => {
  if (typeof window === "undefined" || !uid) return null;
  const legacy = localStorage.getItem(PROFILE_PHOTO_STORAGE);
  if (legacy) localStorage.removeItem(PROFILE_PHOTO_STORAGE);
  return localStorage.getItem(profilePhotoKey(uid));
};

export const saveProfilePhoto = (uid: string, dataUrl: string) => {
  if (typeof window === "undefined" || !uid) return;
  localStorage.setItem(profilePhotoKey(uid), dataUrl);
};

export const removeProfilePhotoStorage = (uid: string) => {
  if (typeof window === "undefined" || !uid) return;
  localStorage.removeItem(profilePhotoKey(uid));
};
export const KYC_PROGRESS_STORAGE = "garuda_prime_kyc_progress";

export type KycProgress = {
  identity: boolean;
  face: boolean;
  address: boolean;
};

export const DEFAULT_KYC_PROGRESS: KycProgress = {
  identity: false,
  face: false,
  address: false,
};

export const loadKycProgress = (): KycProgress => {
  if (typeof window === "undefined") return DEFAULT_KYC_PROGRESS;
  try {
    const raw = localStorage.getItem(KYC_PROGRESS_STORAGE);
    if (!raw) return DEFAULT_KYC_PROGRESS;
    return { ...DEFAULT_KYC_PROGRESS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_KYC_PROGRESS;
  }
};

export const saveKycProgress = (progress: KycProgress) => {
  localStorage.setItem(KYC_PROGRESS_STORAGE, JSON.stringify(progress));
};
