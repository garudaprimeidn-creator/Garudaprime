/** Map Firebase auth error codes to i18n toast keys */
import { walletErrorKey } from "../web3/walletErrors";

export const firebaseAuthErrorKey = (err: unknown): string => {
  const code = err && typeof err === "object" && "code" in err
    ? String((err as { code: string }).code)
    : "";

  switch (code) {
    case "auth/invalid-email":
      return "invalidEmailAddr";
    case "auth/user-disabled":
      return "authUserDisabled";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "authInvalidCredential";
    case "auth/email-already-in-use":
      return "authEmailInUse";
    case "auth/weak-password":
      return "passwordMin8";
    case "auth/too-many-requests":
      return "authTooManyRequests";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/google-signin-in-progress":
      return "authPopupClosed";
    case "auth/operation-not-allowed":
      return "authProviderNotEnabled";
    case "auth/unauthorized-domain":
      return "authUnauthorizedDomain";
    case "auth/invalid-oauth-client-id":
    case "auth/invalid-oauth-provider":
      return "authAppleNotConfigured";
    case "auth/account-exists-with-different-credential":
      return "authEmailInUse";
    case "auth/apple-localhost-unsupported":
      return "authAppleLocalhost";
    case "auth/invalid-verification-code":
      return "authInvalidOtp";
    case "auth/code-expired":
      return "authOtpExpired";
    case "auth/invalid-phone-number":
      return "invalidPhone";
    case "auth/captcha-check-failed":
      return "authCaptchaFailed";
    case "auth/quota-exceeded":
      return "authTooManyRequests";
    case "auth/billing-not-enabled":
      return "authPhoneBilling";
    case "auth/not-signed-in":
      return "authSessionRequired";
    case "auth/missing-email":
      return "authEmailResendUnavailable";
    case "embedded/wallet-pending":
      return "embeddedWalletPending";
    case "embedded/invalid-address":
      return "walletInvalidAddress";
    case "embedded/not-ready":
      return "embeddedWalletNotReady";
    case "embedded/auth-required":
      return "authSessionRequired";
    case "garuda/otp-invalid":
      return "authInvalidOtp";
    case "auth/network-request-failed":
      return "authNetworkFailed";
    case "auth/oauth-redirect-state-lost":
      return "authOAuthRedirectLost";
    case "auth/pwa-oauth-unavailable":
      return "authPwaOAuthUnavailable";
    case "auth/google-client-id-missing":
    case "auth/google-gsi-unavailable":
    case "auth/google-token-failed":
      return "authGooglePwaFailed";
    case "garuda/create-failed":
      return "garudaWalletCreateFailed";
    case "garuda/otp-failed":
      return "garudaWalletOtpFailed";
    case "garuda/kyc-required":
      return "kycRequired";
    case "garuda/otp-required":
      return "garudaWalletOtpRequired";
    case "embedded/sdk-not-integrated":
      return "embeddedWalletNotReady";
    default:
      if (code === "permission-denied") return "authFirestoreDenied";
      if (code.startsWith("kycport/")) {
        if (code.includes("login-opened")) return "kycportSessionStarted";
        if (code.includes("invalid-email")) return "invalidEmailAddr";
        if (code.includes("access_denied")) return "authPopupClosed";
        if (code.includes("invalid-state")) return "kycportInvalidState";
        if (code.includes("pending")) return "kycportLoginPending";
        if (code.includes("unavailable")) return "kycportUnavailable";
        if (code.includes("exchange-failed")) return "kycportExchangeFailed";
        if (code.includes("tenant-inactive")) return "kycportTenantInactive";
        if (code.includes("redirect-mismatch")) return "kycportRedirectMismatch";
        if (code.includes("api-down")) return "kycportApiDegraded";
        if (code.includes("auth-failed")) return "kycportAuthFailed";
        return "kycportAuthFailed";
      }
      return "authFailed";
  }
};

export type ToastEntry = string | ((host: string) => string);

/** Resolve Firebase auth toast message (handles dynamic unauthorized-domain copy). */
export const resolveFirebaseAuthToast = (
  err: unknown,
  toast: Record<string, ToastEntry>,
): string => {
  const errCode = err && typeof err === "object" && "code" in err
    ? String((err as { code: string }).code)
    : "";
  if (errCode.startsWith("wallet/")) {
    const walletKey = walletErrorKey(err);
    const walletEntry = toast[walletKey];
    if (typeof walletEntry === "string") return walletEntry;
  }

  const key = firebaseAuthErrorKey(err);
  const message = err instanceof Error
    ? err.message.trim()
    : typeof err === "string"
      ? err.trim()
      : err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message ?? "").trim()
        : "";

  const entry = toast[key];
  if (key === "authUnauthorizedDomain" && typeof entry === "function") {
    const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
    return entry(host);
  }

  // Prefer API/server detail over generic toast copy.
  const preferMessageKeys = new Set([
    "authFailed",
    "authInvalidOtp",
    "garudaWalletCreateFailed",
    "garudaWalletOtpFailed",
    "garudaWalletOtpRequired",
    "kycRequired",
    "authSessionRequired",
    "authFirestoreDenied",
    "embeddedWalletNotReady",
    "walletInvalidAddress",
  ]);
  if (message && preferMessageKeys.has(key)) return message;

  if (typeof entry === "string") return entry;
  if (message) return message;

  return typeof toast.authFailed === "string" ? toast.authFailed : "Authentication failed";
};
