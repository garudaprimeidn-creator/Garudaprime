import {
  GoogleAuthProvider,
  signInWithCredential,
  type Auth,
  type UserCredential,
} from "firebase/auth";
import { isOAuthRedirectRisky } from "../auth/oauthEnvironment";

declare global {
  interface Window {
    google?: {
      accounts: {
        id?: {
          cancel?: () => void;
        };
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              error?: string;
              error_description?: string;
            }) => void;
          }) => {
            requestAccessToken: (overrides?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";
export const GOOGLE_ACCOUNT_PICKER_REQUIRED = "auth/google-account-picker-required";

let gsiLoadPromise: Promise<void> | null = null;
let googleSignInInFlight = false;

const loadGoogleGsi = (): Promise<void> => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Sign-In requires a browser"));
  }
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gsiLoadPromise) return gsiLoadPromise;

  gsiLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("GSI load failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("GSI load failed"));
    document.head.appendChild(script);
  });

  return gsiLoadPromise;
};

export const getGoogleOAuthClientId = (): string | undefined => {
  const fromEnv = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (fromEnv) return fromEnv;
  return undefined;
};

/** Warm Google SDK while user is on login, keeps first tap on the account picker. */
export const preloadGoogleSignIn = (): void => {
  if (!getGoogleOAuthClientId()) return;
  void loadGoogleGsi().catch(() => {});
};

const isGoogleAuthCancelled = (err: unknown) => {
  const code = err && typeof err === "object" && "code" in err
    ? String((err as { code: string }).code)
    : "";
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return code === "auth/popup-closed-by-user"
    || code === "auth/cancelled-popup-request"
    || code === "auth/google-signin-in-progress"
    || msg.includes("popup_closed")
    || msg.includes("access_denied");
};

const signInGoogleWithTokenClient = async (
  auth: Auth,
  prompt: "" | "select_account",
): Promise<UserCredential> => {
  const clientId = getGoogleOAuthClientId();
  if (!clientId) {
    throw Object.assign(
      new Error("Google OAuth client ID not configured"),
      { code: "auth/google-client-id-missing" },
    );
  }

  await loadGoogleGsi();

  try {
    window.google?.accounts?.id?.cancel?.();
  } catch {
    /* optional */
  }

  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw Object.assign(new Error("Google Sign-In unavailable"), { code: "auth/google-gsi-unavailable" });
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      fn();
    };

    const timeoutId = window.setTimeout(() => {
      finish(() => reject(Object.assign(new Error("Google Sign-In timed out"), { code: "auth/google-signin-timeout" })));
    }, 120_000);

    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: "openid email profile",
      callback: async (response) => {
        if (response.error) {
          const cancelled = response.error === "popup_closed_by_user"
            || response.error === "access_denied";
          finish(() => reject(Object.assign(
            new Error(response.error_description ?? response.error),
            { code: cancelled ? "auth/popup-closed-by-user" : "auth/google-token-failed" },
          )));
          return;
        }
        if (!response.access_token) {
          finish(() => reject(Object.assign(
            new Error("Google account picker required"),
            { code: GOOGLE_ACCOUNT_PICKER_REQUIRED },
          )));
          return;
        }
        try {
          const credential = GoogleAuthProvider.credential(null, response.access_token);
          const cred = await signInWithCredential(auth, credential);
          finish(() => resolve(cred));
        } catch (err) {
          finish(() => reject(err));
        }
      },
    });

    client.requestAccessToken({ prompt });
  });
};

/** Desktop only, optional silent refresh (never call on explicit user tap). */
export const trySilentGoogleSignIn = async (auth: Auth): Promise<UserCredential | null> => {
  if (isOAuthRedirectRisky()) return null;

  const clientId = getGoogleOAuthClientId();
  if (!clientId) return null;

  try {
    return await signInGoogleWithTokenClient(auth, "");
  } catch {
    return null;
  }
};

/**
 * Single account-picker flow on user tap, no silent attempt first (avoids double picker).
 */
export const signInGoogleInPage = async (auth: Auth): Promise<UserCredential> => {
  if (googleSignInInFlight) {
    throw Object.assign(new Error("Google sign-in already in progress"), { code: "auth/google-signin-in-progress" });
  }

  googleSignInInFlight = true;
  try {
    return await signInGoogleWithTokenClient(auth, "select_account");
  } catch (err) {
    if (isGoogleAuthCancelled(err)) throw err;
    throw err;
  } finally {
    googleSignInInFlight = false;
  }
};

/** @deprecated use signInGoogleInPage */
export const signInGoogleOnMobile = signInGoogleInPage;

/** @deprecated hidden-button flow removed, use signInGoogleInPage */
export const signInGoogleWithIdCredential = signInGoogleInPage;
