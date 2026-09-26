import type { KycAddress } from "../merchant/kycAddress";
import { getPostalPrefixHint } from "./indonesiaRegions";
import type { KtpOcrExtract } from "./ktpAddressOcr";
import {
  isPostalRegionMatch,
  isPostalValid,
  isRegionValid,
  normalizeRegionForCompare,
} from "./kycWorkflow";

export type GeoCapture = {
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: string;
};

export type AddressVerificationResult = {
  postalValid: boolean;
  provinceValid: boolean;
  postalProvinceMatch: boolean;
  ktpOcrMatchScore: number;
  ktpExtracted: KtpOcrExtract | null;
  geo: GeoCapture | null;
  strengthScore: number;
  flags: string[];
};

function tokenSimilarity(a: string, b: string): number {
  const na = a.toUpperCase().replace(/[^A-Z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2);
  const nb = b.toUpperCase().replace(/[^A-Z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2);
  if (!na.length || !nb.length) return 0;
  const setB = new Set(nb);
  const overlap = na.filter((t) => setB.has(t) || [...setB].some((x) => x.includes(t) || t.includes(x))).length;
  return Math.round((overlap / Math.max(na.length, nb.length)) * 100);
}

export function compareKtpToForm(domicile: KycAddress, ktp: KtpOcrExtract | null): number {
  if (!ktp) return 0;
  const scores: number[] = [];
  const country = domicile.country || "ID";

  if (ktp.province && domicile.province) {
    const pNorm = normalizeRegionForCompare(country, domicile.province);
    const kNorm = normalizeRegionForCompare(country, ktp.province);
    scores.push(pNorm === kNorm ? 100 : tokenSimilarity(pNorm, kNorm));
  }
  if (ktp.city && domicile.city) {
    scores.push(tokenSimilarity(domicile.city, ktp.city));
  }
  if (ktp.addressLine1 && domicile.addressLine1) {
    scores.push(tokenSimilarity(domicile.addressLine1, ktp.addressLine1));
  }

  if (!scores.length) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function buildAddressVerification(
  domicile: KycAddress,
  ktpExtracted: KtpOcrExtract | null,
  geo: GeoCapture | null,
): AddressVerificationResult {
  const country = domicile.country?.trim() || "US";
  const postalValid = isPostalValid(country, domicile.postalCode);
  const provinceValid = isRegionValid(country, domicile.province);
  const postalProvinceMatch = postalValid && provinceValid
    ? isPostalRegionMatch(country, domicile.postalCode, domicile.province)
    : false;

  const ktpOcrMatchScore = compareKtpToForm(domicile, ktpExtracted);

  const flags: string[] = [];
  if (!postalValid) flags.push("invalid_postal_format");
  if (!provinceValid) flags.push("unknown_region");
  if (postalValid && provinceValid && !postalProvinceMatch) {
    if (country === "ID") {
      const hint = getPostalPrefixHint(domicile.postalCode);
      flags.push(`postal_mismatch:${hint.join("|") || "unknown"}`);
    } else {
      flags.push("postal_region_mismatch");
    }
  }
  if (ktpExtracted && ktpOcrMatchScore < 50) flags.push("id_address_mismatch");
  if (!geo) flags.push("no_gps");

  let strengthScore = 0;
  if (postalValid) strengthScore += 20;
  if (provinceValid) strengthScore += 20;
  if (postalProvinceMatch) strengthScore += 15;
  strengthScore += Math.round(ktpOcrMatchScore * 0.25);
  if (geo) strengthScore += 25;
  else strengthScore = Math.min(strengthScore, country === "ID" ? 60 : 75);
  strengthScore = Math.min(100, strengthScore);

  return {
    postalValid,
    provinceValid,
    postalProvinceMatch,
    ktpOcrMatchScore,
    ktpExtracted: ktpExtracted
      ? {
        addressLine1: ktpExtracted.addressLine1,
        city: ktpExtracted.city,
        province: ktpExtracted.province,
        rawText: ktpExtracted.rawText?.slice(0, 500),
      }
      : null,
    geo,
    strengthScore,
    flags,
  };
}

export { isDomicileAddressValid } from "./kycWorkflow";

export type GeoCaptureErrorCode =
  | "unsupported"
  | "permission_denied"
  | "position_unavailable"
  | "timeout"
  | "blocked";

export class GeoCaptureError extends Error {
  readonly code: GeoCaptureErrorCode;

  constructor(code: GeoCaptureErrorCode, message?: string) {
    super(message ?? code);
    this.name = "GeoCaptureError";
    this.code = code;
  }
}

function mapGeolocationError(err: GeolocationPositionError): GeoCaptureError {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return new GeoCaptureError("permission_denied", err.message);
    case err.POSITION_UNAVAILABLE:
      return new GeoCaptureError("position_unavailable", err.message);
    case err.TIMEOUT:
      return new GeoCaptureError("timeout", err.message);
    default:
      return new GeoCaptureError("position_unavailable", err.message);
  }
}

function requestPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/** Fallback for iOS PWA / Android WebView where getCurrentPosition stalls. */
function requestPositionWatch(timeoutMs: number): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      reject(new GeoCaptureError("timeout"));
    }, timeoutMs);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        navigator.geolocation.clearWatch(watchId);
        resolve(pos);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        navigator.geolocation.clearWatch(watchId);
        reject(mapGeolocationError(err));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
  });
}

export function captureGeoLocation(): Promise<GeoCapture> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new GeoCaptureError("unsupported"));
      return;
    }

    const finish = (pos: GeolocationPosition) => {
      resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        capturedAt: new Date().toISOString(),
      });
    };

    const run = async () => {
      try {
        if (navigator.permissions?.query) {
          try {
            const status = await navigator.permissions.query({ name: "geolocation" });
            if (status.state === "denied") {
              throw new GeoCaptureError("permission_denied");
            }
          } catch (permErr) {
            if (permErr instanceof GeoCaptureError) throw permErr;
            /* Permissions API unavailable, continue to getCurrentPosition */
          }
        }

        try {
          finish(await requestPosition({
            enableHighAccuracy: true,
            timeout: 25000,
            maximumAge: 0,
          }));
        } catch (highErr) {
          if (!(highErr instanceof GeolocationPositionError)) throw highErr;
          if (highErr.code === highErr.PERMISSION_DENIED) throw mapGeolocationError(highErr);
          try {
            /* Retry without high accuracy, faster on some Android devices */
            finish(await requestPosition({
              enableHighAccuracy: false,
              timeout: 30000,
              maximumAge: 60000,
            }));
          } catch (lowErr) {
            if (!(lowErr instanceof GeolocationPositionError)) throw lowErr;
            if (lowErr.code === lowErr.PERMISSION_DENIED) throw mapGeolocationError(lowErr);
            /* watchPosition, works better in iOS/Android standalone PWA */
            finish(await requestPositionWatch(35000));
          }
        }
      } catch (err) {
        if (err instanceof GeoCaptureError) {
          reject(err);
        } else if (err instanceof GeolocationPositionError) {
          reject(mapGeolocationError(err));
        } else {
          reject(new GeoCaptureError("position_unavailable"));
        }
      }
    };

    void run();
  });
}
