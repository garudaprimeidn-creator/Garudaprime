import { detectDefaultCountryCode } from "../kyc/countries";

export type KycAddress = {
  country: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
};

const STORAGE_KEY = "garuda_kyc_address";

export const emptyKycAddress = (country?: string): KycAddress => ({
  country: country ?? "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  province: "",
  postalCode: "",
});

export const DEFAULT_KYC_ADDRESS: KycAddress = {
  country: "ID",
  addressLine1: "Jl. Sudirman No. 45",
  addressLine2: "Apartemen Garuda Tower, Unit 12A",
  city: "Jakarta Selatan",
  province: "DKI Jakarta",
  postalCode: "12190",
};

const normalizeLoadedAddress = (raw: Partial<KycAddress>): KycAddress => ({
  country: raw.country?.trim() || detectDefaultCountryCode(),
  addressLine1: raw.addressLine1 ?? "",
  addressLine2: raw.addressLine2 ?? "",
  city: raw.city ?? "",
  province: raw.province ?? "",
  postalCode: raw.postalCode ?? "",
});

export const loadKycAddress = (): KycAddress | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeLoadedAddress(JSON.parse(raw) as Partial<KycAddress>);
  } catch {
    return null;
  }
};

export const saveKycAddress = (addr: KycAddress) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(addr));
};

export const isKycAddressComplete = (addr: KycAddress) =>
  Boolean(
    addr.country?.trim()
    && addr.addressLine1.trim()
    && addr.city.trim()
    && addr.province.trim()
    && addr.postalCode.trim(),
  );

export const formatKycAddress = (addr: KycAddress) => {
  const parts = [
    addr.addressLine1.trim(),
    addr.addressLine2.trim(),
    `${addr.city.trim()}, ${addr.province.trim()} ${addr.postalCode.trim()}`,
    addr.country.trim(),
  ].filter(Boolean);
  return parts.join(", ");
};
