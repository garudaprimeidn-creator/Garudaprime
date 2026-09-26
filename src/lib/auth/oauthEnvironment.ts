/** Installed PWA / home-screen app, OAuth redirect loses sessionStorage state. */
export const isStandalonePwa = (): boolean => {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: minimal-ui)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
};

export const isMobileUserAgent = (): boolean => {
  if (typeof window === "undefined") return false;
  return /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

/** Environments where signInWithRedirect commonly fails (storage-partitioned). */
export const isOAuthRedirectRisky = (): boolean => {
  if (typeof window === "undefined") return false;
  return isStandalonePwa() || isMobileUserAgent();
};

/**
 * Redirect OAuth only on desktop Safari where popups are unreliable.
 * Mobile / PWA must use popup or in-page Google token flow.
 */
export const shouldUseOAuthRedirect = (): boolean => {
  if (typeof window === "undefined") return false;
  if (isOAuthRedirectRisky()) return false;

  const ua = navigator.userAgent;
  const safari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox/i.test(ua);
  return safari && window.innerWidth >= 768;
};
