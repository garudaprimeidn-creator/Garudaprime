/** Parse OAuth callback query + hash (some IdPs return tokens in #fragment). */

export const KYCPORT_CALLBACK_PATH = "/auth/kycport/callback";

export const isKycPortCallbackPath = () =>
  typeof window !== "undefined" && window.location.pathname === KYCPORT_CALLBACK_PATH;

export const getKycPortOAuthCallbackParams = (): URLSearchParams => {
  const merged = new URLSearchParams(window.location.search);
  const hash = window.location.hash.replace(/^#/, "");
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    hashParams.forEach((value, key) => {
      if (!merged.has(key)) merged.set(key, value);
    });
  }
  return merged;
};

export const hasKycPortOAuthCallbackParams = () => {
  if (!isKycPortCallbackPath()) return false;
  const p = getKycPortOAuthCallbackParams();
  return Boolean(
    p.get("code")
    || p.get("access_token")
    || p.get("token")
    || p.get("error"),
  );
};

/** Snapshot callback params before boot scripts run (survives SPA re-init). */
const CALLBACK_SNAPSHOT_KEY = "gp_kycport_callback_snapshot";

export const preserveKycPortCallbackSnapshot = () => {
  if (!isKycPortCallbackPath() || !hasKycPortOAuthCallbackParams()) return;
  const params = getKycPortOAuthCallbackParams();
  sessionStorage.setItem(
    CALLBACK_SNAPSHOT_KEY,
    JSON.stringify({
      code: params.get("code"),
      state: params.get("state"),
      access_token: params.get("access_token") || params.get("token"),
      error: params.get("error"),
      error_description: params.get("error_description"),
      savedAt: Date.now(),
    }),
  );
};

export const loadKycPortCallbackSnapshot = (): URLSearchParams | null => {
  try {
    const raw = sessionStorage.getItem(CALLBACK_SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as Record<string, string | null>;
    if (Date.now() - Number(snap.savedAt ?? 0) > 30 * 60 * 1000) {
      sessionStorage.removeItem(CALLBACK_SNAPSHOT_KEY);
      return null;
    }
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(snap)) {
      if (v && k !== "savedAt") params.set(k, v);
    }
    return params;
  } catch {
    return null;
  }
};

export const clearKycPortCallbackSnapshot = () => {
  sessionStorage.removeItem(CALLBACK_SNAPSHOT_KEY);
};
